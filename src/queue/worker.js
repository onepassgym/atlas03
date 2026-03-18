'use strict';
require('dotenv').config();

const { Worker }      = require('bullmq');
const { connectDB }   = require('../db/connection');
const { BrowserManager, searchGymsInCity, scrapeGymDetail, FITNESS_CATEGORIES } = require('../scraper/googleMapsScraper');
const { processGym }  = require('../scraper/gymProcessor');
const CrawlJob        = require('../db/crawlJobModel');
const cfg             = require('../../config');
const logger          = require('../utils/logger');

const CONCURRENCY = cfg.scraper.concurrency;
const DELAY_MIN   = cfg.scraper.delayMin;
const DELAY_MAX   = cfg.scraper.delayMax;
const MAX_RETRIES = cfg.scraper.maxRetries;

const connection = {
  host:     cfg.redis.host,
  port:     cfg.redis.port,
  password: cfg.redis.password,
};

function sleep(min, max) {
  return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
}

async function updateJob(jobId, update) {
  try { await CrawlJob.findOneAndUpdate({ jobId }, update); } catch (_) {}
}

const workerProcessor = async (job) => {
  if (job.name === 'city-crawl') {
    return await cityCrawlProcessor(job);
  } else if (job.name === 'gym-name-crawl') {
    return await gymNameCrawlProcessor(job);
  }
};

const browserPool = require('../scraper/browserPool');
const pLimit      = require('p-limit');
const Redis       = require('ioredis');

// Direct Redis client for checkpointing
const redisClient = new Redis(connection);

async function cityCrawlProcessor(job) {
  const { jobId, input } = job.data;
  const { cityName, categories = FITNESS_CATEGORIES } = input;

  await connectDB();
  await updateJob(jobId, { status: 'running', startedAt: new Date(), queueJobId: String(job.id) });

  const stats    = { created: 0, updated: 0, skipped: 0, failed: 0 };
  const jobErrs  = [];
  const chkKey   = `atlas05:checkpoint:${jobId}`;

  try {
    // ── Phase 1: Collect all unique place URLs across all categories ──────
    logger.info(`\n🏙  Starting city: ${cityName} (${categories.length} categories)`);
    const allUrls = new Set();
    
    // We only need one page for the search phase, acquire and release
    let searchBrowser = null;
    try {
      searchBrowser = await browserPool.acquire();
      const page = await searchBrowser.ctx.newPage();

      for (let ci = 0; ci < categories.length; ci++) {
        try {
          const urls = await searchGymsInCity(page, cityName, categories[ci]);
          urls.forEach(u => allUrls.add(u));
          await job.updateProgress(Math.floor(((ci + 1) / categories.length) * 25)); // 0–25% = discovery
          await sleep(DELAY_MIN, DELAY_MAX);
        } catch (err) {
          logger.warn(`Category "${categories[ci]}" failed: ${err.message}`);
          jobErrs.push({ message: err.message, url: `search:${categories[ci]}`, at: new Date() });
        }
      }
      await page.close();
    } finally {
      if (searchBrowser) await browserPool.release(searchBrowser);
    }

    const total = allUrls.size;
    logger.info(`\n📋 Total unique URLs for ${cityName}: ${total}`);
    await updateJob(jobId, { 'progress.total': total });

    // ── Phase 2: Scrape each gym detail page (Batched) ────────────────────────
    const urlsArray = Array.from(allUrls);
    const limit = pLimit(3); // 3 concurrent scrapes per job
    let i = 0;

    const scrapeTasks = urlsArray.map(url => limit(async () => {
      // 1. Checkpoint Check
      const isDone = await redisClient.sismember(chkKey, url);
      if (isDone) {
        i++;
        await job.updateProgress(25 + Math.floor((i / total) * 75));
        return; // Skip already processed URL
      }

      let instance = null;
      let page = null;
      try {
        instance = await browserPool.acquire();
        page = await instance.ctx.newPage();
        
        let scraped = null;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            scraped = await scrapeGymDetail(page, url);
            break;
          } catch (err) {
            logger.warn(`  ⚠  Attempt ${attempt}/${MAX_RETRIES}: ${url.slice(-60)} → ${err.message}`);
            if (attempt < MAX_RETRIES) await sleep(2000 * attempt, 4000 * attempt);
          }
        }

        if (!scraped?.name) {
          stats.failed++;
          jobErrs.push({ message: !scraped ? 'Max retries exceeded' : 'No name found', url, at: new Date() });
          await updateJob(jobId, { $inc: { 'progress.failed': 1 }, $push: { jobErrors: { message: 'Scrape failed', url, at: new Date() } } });
        } else {
          const res = await processGym(scraped, cityName, jobId, true);
          
          if (res.action === 'created')  { stats.created++;  await updateJob(jobId, { $inc: { 'progress.newGyms': 1,    'progress.scraped': 1 }, $push: { gymIds: res.gymId } }); }
          if (res.action === 'updated')  { stats.updated++;  await updateJob(jobId, { $inc: { 'progress.updatedGyms': 1,'progress.scraped': 1 }, $push: { gymIds: res.gymId } }); }
          if (res.action === 'skipped')  { stats.skipped++;  await updateJob(jobId, { $inc: { 'progress.skipped': 1 } }); }
          if (res.action === 'error')    { stats.failed++;   await updateJob(jobId, { $inc: { 'progress.failed': 1 },  $push: { jobErrors: { message: res.error, url, at: new Date() } } }); }
        }

        // 2. Mark Checkpoint Success
        await redisClient.sadd(chkKey, url);
      } finally {
        if (page) await page.close().catch(() => {});
        if (instance) await browserPool.release(instance);
        i++;
        await job.updateProgress(25 + Math.floor((i / total) * 75));
        await sleep(DELAY_MIN, DELAY_MAX); // Gentle delay between tasks to avoid hammering
      }
    }));

    await Promise.allSettled(scrapeTasks);

    // Cleanup Checkpoints (Expire after 7 days)
    await redisClient.expire(chkKey, 604800);

    const status = stats.failed > 0 && stats.created === 0 && stats.updated === 0 ? 'partial' : 'completed';
    await updateJob(jobId, { status, completedAt: new Date(), errorCount: jobErrs.length });
    logger.info(`\n✅ Done: ${cityName} — created:${stats.created} updated:${stats.updated} skipped:${stats.skipped} failed:${stats.failed}`);
    return { summary: stats, jobId };

  } catch (err) {
    await updateJob(jobId, { status: 'failed', completedAt: new Date(), $push: { jobErrors: { message: err.message, at: new Date() } } });
    logger.error(`💥 City job FAILED [${cityName}]: ${err.message}`);
    throw err;
  }
}

async function gymNameCrawlProcessor(job) {
  const { jobId, input } = job.data;
  const { gymName } = input;

  await connectDB();
  await updateJob(jobId, { status: 'running', startedAt: new Date(), queueJobId: String(job.id) });

  const stats   = { created: 0, updated: 0, failed: 0 };
  
  // ── Phase 1: Search for the gym ──────
  let searchBrowser = null;
  let urls = [];
  try {
    searchBrowser = await browserPool.acquire();
    const page = await searchBrowser.ctx.newPage();
    await job.updateProgress(10);
    urls = await searchGymsInCity(page, gymName, '');
    await page.close();
  } catch (err) {
    logger.warn(`Gym search failed: ${err.message}`);
  } finally {
    if (searchBrowser) await browserPool.release(searchBrowser);
  }

  await job.updateProgress(40);
  await updateJob(jobId, { 'progress.total': urls.length });

  // ── Phase 2: Scrape top results (Batched) ──────
  const urlsArray = urls.slice(0, 15);
  const limit = pLimit(3);
  let i = 0;

  const scrapeTasks = urlsArray.map(url => limit(async () => {
    let instance = null;
    let page = null;
    try {
      instance = await browserPool.acquire();
      page = await instance.ctx.newPage();
      
      const scraped = await scrapeGymDetail(page, url);
      if (!scraped?.name) return; // Skip if no name

      const res = await processGym(scraped, gymName, jobId, true);
      
      if (res.action === 'created') { stats.created++; await updateJob(jobId, { $inc: { 'progress.newGyms': 1, 'progress.scraped': 1 }, $push: { gymIds: res.gymId } }); }
      if (res.action === 'updated') { stats.updated++; await updateJob(jobId, { $inc: { 'progress.updatedGyms': 1, 'progress.scraped': 1 }, $push: { gymIds: res.gymId } }); }
    } catch (err) {
      stats.failed++;
      logger.warn(`gym-name job err: ${err.message}`);
    } finally {
      if (page) await page.close().catch(() => {});
      if (instance) await browserPool.release(instance);
      i++;
      await job.updateProgress(40 + Math.floor((i / Math.min(urls.length, 15)) * 60));
      await sleep(DELAY_MIN, DELAY_MAX);
    }
  }));

  await Promise.allSettled(scrapeTasks);

  await updateJob(jobId, { status: 'completed', completedAt: new Date() });
  return { summary: stats, jobId };
}

const worker = new Worker('atlas05-crawl', workerProcessor, {
  connection,
  concurrency: CONCURRENCY,
});

worker.on('failed', (job, err) => logger.error(`[atlas05-crawl] Job ${job.id} failed: ${err.message}`));
worker.on('error', err => logger.error(`[atlas05-crawl] Worker error: ${err.message}`));

logger.info(`\n🚀 Atlas05 Worker started  [concurrency: ${CONCURRENCY}]`);
