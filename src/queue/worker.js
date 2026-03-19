'use strict';
require('dotenv').config();

const { Worker } = require('bullmq');
const { connectDB }   = require('../db/connection');
const { BrowserManager, searchGymsInCity, scrapeGymDetail, FITNESS_CATEGORIES } = require('../scraper/googleMapsScraper');
const { processGym }  = require('../scraper/gymProcessor');
const CrawlJob        = require('../db/crawlJobModel');
const cfg             = require('../../config');
const logger          = require('../utils/logger');

const connection = {
  host:     cfg.redis.host,
  port:     cfg.redis.port,
  password: cfg.redis.password || undefined,
};

const CONCURRENCY = cfg.scraper.concurrency;
const DELAY_MIN   = cfg.scraper.delayMin;
const DELAY_MAX   = cfg.scraper.delayMax;
const MAX_RETRIES = cfg.scraper.maxRetries;

function sleep(min, max) {
  return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
}

async function updateJob(jobId, update) {
  try { await CrawlJob.findOneAndUpdate({ jobId }, update); } catch (_) {}
}

async function processCityJob(job) {
  const { jobId, input } = job.data;
  const { cityName, categories = FITNESS_CATEGORIES } = input;

  await connectDB();
  await updateJob(jobId, { status: 'running', startedAt: new Date(), bullJobId: String(job.id) });

  const browser = new BrowserManager();
  const stats   = { created: 0, updated: 0, skipped: 0, failed: 0 };

  try {
    await browser.launch();
    const page = await browser.newPage();
    logger.info(`\n🏙  Starting city: ${cityName} (${categories.length} categories)`);
    const allUrls = new Set();

    for (let ci = 0; ci < categories.length; ci++) {
      try {
        const urls = await searchGymsInCity(page, cityName, categories[ci]);
        urls.forEach(u => allUrls.add(u));
        await job.updateProgress(Math.floor(((ci + 1) / categories.length) * 25));
        await sleep(DELAY_MIN, DELAY_MAX);
      } catch (err) {
        logger.warn(`Category "${categories[ci]}" failed: ${err.message}`);
      }
    }

    const total = allUrls.size;
    logger.info(`\n📋 Total unique URLs for ${cityName}: ${total}`);
    await updateJob(jobId, { 'progress.total': total });

    let i = 0;
    for (const url of allUrls) {
      i++;
      await job.updateProgress(25 + Math.floor((i / total) * 75));

      let scraped = null;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try { scraped = await scrapeGymDetail(page, url); break; }
        catch (err) {
          logger.warn(`  ⚠  Attempt ${attempt}/${MAX_RETRIES}: ${err.message}`);
          if (attempt < MAX_RETRIES) await sleep(3000 * attempt, 5000 * attempt);
        }
      }

      if (!scraped?.name) {
        stats.failed++;
        await updateJob(jobId, { $inc: { 'progress.failed': 1 } });
        continue;
      }

      const res = await processGym(scraped, cityName, jobId, true);
      if (res.action === 'created') { stats.created++; await updateJob(jobId, { $inc: { 'progress.newGyms': 1, 'progress.scraped': 1 }, $push: { gymIds: res.gymId } }); }
      if (res.action === 'updated') { stats.updated++; await updateJob(jobId, { $inc: { 'progress.updatedGyms': 1, 'progress.scraped': 1 }, $push: { gymIds: res.gymId } }); }
      if (res.action === 'skipped') { stats.skipped++; await updateJob(jobId, { $inc: { 'progress.skipped': 1 } }); }
      if (res.action === 'error')   { stats.failed++;  await updateJob(jobId, { $inc: { 'progress.failed': 1 } }); }

      await sleep(DELAY_MIN, DELAY_MAX);
    }

    await browser.close();
    await updateJob(jobId, { status: stats.failed > 0 && stats.created === 0 ? 'partial' : 'completed', completedAt: new Date() });
    logger.info(`\n✅ Done: ${cityName} — created:${stats.created} updated:${stats.updated} skipped:${stats.skipped} failed:${stats.failed}`);
    return { summary: stats, jobId };

  } catch (err) {
    await browser.close();
    await updateJob(jobId, { status: 'failed', completedAt: new Date() });
    logger.error(`💥 City job FAILED [${cityName}]: ${err.message}`);
    throw err;
  }
}

async function processGymNameJob(job) {
  const { jobId, input } = job.data;
  const { gymName } = input;

  await connectDB();
  await updateJob(jobId, { status: 'running', startedAt: new Date(), bullJobId: String(job.id) });

  const browser = new BrowserManager();
  const stats   = { created: 0, updated: 0, failed: 0 };

  try {
    await browser.launch();
    const page = await browser.newPage();
    await job.updateProgress(10);
    const urls = await searchGymsInCity(page, gymName, '');
    await job.updateProgress(40);
    await updateJob(jobId, { 'progress.total': urls.length });

    let i = 0;
    for (const url of urls.slice(0, 15)) {
      i++;
      await job.updateProgress(40 + Math.floor((i / Math.min(urls.length, 15)) * 60));
      try {
        const scraped = await scrapeGymDetail(page, url);
        if (!scraped?.name) continue;
        const res = await processGym(scraped, gymName, jobId, true);
        if (res.action === 'created') { stats.created++; await updateJob(jobId, { $inc: { 'progress.newGyms': 1, 'progress.scraped': 1 }, $push: { gymIds: res.gymId } }); }
        if (res.action === 'updated') { stats.updated++; await updateJob(jobId, { $inc: { 'progress.updatedGyms': 1, 'progress.scraped': 1 }, $push: { gymIds: res.gymId } }); }
      } catch (err) {
        stats.failed++;
        logger.warn(`gym-name job err: ${err.message}`);
      }
      await sleep(DELAY_MIN, DELAY_MAX);
    }

    await browser.close();
    await updateJob(jobId, { status: 'completed', completedAt: new Date() });
    return { summary: stats, jobId };

  } catch (err) {
    await browser.close();
    await updateJob(jobId, { status: 'failed', completedAt: new Date() });
    throw err;
  }
}

async function start() {
  await connectDB();

  const worker = new Worker('atlas05-crawl', async (job) => {
    logger.info(`⚙️  Processing job: ${job.name} [${job.id}]`);
    if (job.name === 'city-crawl')     return processCityJob(job);
    if (job.name === 'gym-name-crawl') return processGymNameJob(job);
    throw new Error(`Unknown job name: ${job.name}`);
  }, {
    connection,
    concurrency: CONCURRENCY,
    lockDuration: 600_000,
  });

  worker.on('completed', (job) => logger.info(`✅ Job completed: ${job.id}`));
  worker.on('failed',    (job, err) => logger.error(`❌ Job failed: ${job?.id} — ${err.message}`));
  worker.on('error',     (err) => logger.error(`Worker error: ${err.message}`));

  logger.info(`\n🚀 Atlas05 Worker started  [concurrency: ${CONCURRENCY}]`);
}

start().catch(err => { console.error('Worker startup error:', err); process.exit(1); });
