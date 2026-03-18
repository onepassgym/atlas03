'use strict';
require('dotenv').config();

const { crawlQueue }  = require('./queues');
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

function sleep(min, max) {
  return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
}

async function updateJob(jobId, update) {
  try { await CrawlJob.findOneAndUpdate({ jobId }, update); } catch (_) {}
}

// ── City Crawl Worker ─────────────────────────────────────────────────────────

crawlQueue.process('city-crawl', CONCURRENCY, async (job) => {
  const { jobId, input } = job.data;
  const { cityName, categories = FITNESS_CATEGORIES } = input;

  await connectDB();
  await updateJob(jobId, { status: 'running', startedAt: new Date(), bullJobId: String(job.id) });

  const browser  = new BrowserManager();
  const stats    = { created: 0, updated: 0, skipped: 0, failed: 0 };
  const jobErrs  = [];

  try {
    await browser.launch();
    const page = await browser.newPage();

    // ── Phase 1: Collect all unique place URLs across all categories ──────
    logger.info(`\n🏙  Starting city: ${cityName} (${categories.length} categories)`);
    const allUrls = new Set();

    for (let ci = 0; ci < categories.length; ci++) {
      try {
        const urls = await searchGymsInCity(page, cityName, categories[ci]);
        urls.forEach(u => allUrls.add(u));
        job.progress(Math.floor(((ci + 1) / categories.length) * 25)); // 0–25% = discovery
        await sleep(DELAY_MIN, DELAY_MAX);
      } catch (err) {
        logger.warn(`Category "${categories[ci]}" failed: ${err.message}`);
        jobErrs.push({ message: err.message, url: `search:${categories[ci]}`, at: new Date() });
      }
    }

    const total = allUrls.size;
    logger.info(`\n📋 Total unique URLs for ${cityName}: ${total}`);
    await updateJob(jobId, { 'progress.total': total });

    // ── Phase 2: Scrape each gym detail page ──────────────────────────────
    let i = 0;
    for (const url of allUrls) {
      i++;
      job.progress(25 + Math.floor((i / total) * 75)); // 25–100%

      let scraped = null;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          scraped = await scrapeGymDetail(page, url);
          break;
        } catch (err) {
          logger.warn(`  ⚠  Attempt ${attempt}/${MAX_RETRIES}: ${url.slice(-60)} → ${err.message}`);
          if (attempt < MAX_RETRIES) await sleep(3000 * attempt, 5000 * attempt);
        }
      }

      if (!scraped?.name) {
        stats.failed++;
        jobErrs.push({ message: !scraped ? 'Max retries exceeded' : 'No name found', url, at: new Date() });
        await updateJob(jobId, { $inc: { 'progress.failed': 1 }, $push: { jobErrors: { message: 'Scrape failed', url, at: new Date() } } });
        continue;
      }

      const res = await processGym(scraped, cityName, jobId, true);

      if (res.action === 'created')  { stats.created++;  await updateJob(jobId, { $inc: { 'progress.newGyms': 1,    'progress.scraped': 1 }, $push: { gymIds: res.gymId } }); }
      if (res.action === 'updated')  { stats.updated++;  await updateJob(jobId, { $inc: { 'progress.updatedGyms': 1,'progress.scraped': 1 }, $push: { gymIds: res.gymId } }); }
      if (res.action === 'skipped')  { stats.skipped++;  await updateJob(jobId, { $inc: { 'progress.skipped': 1 } }); }
      if (res.action === 'error')    { stats.failed++;   await updateJob(jobId, { $inc: { 'progress.failed': 1 },  $push: { jobErrors: { message: res.error, url, at: new Date() } } }); }

      await sleep(DELAY_MIN, DELAY_MAX);
    }

    await browser.close();

    const status = stats.failed > 0 && stats.created === 0 && stats.updated === 0 ? 'partial' : 'completed';
    await updateJob(jobId, { status, completedAt: new Date(), errorCount: jobErrs.length });
    logger.info(`\n✅ Done: ${cityName} — created:${stats.created} updated:${stats.updated} skipped:${stats.skipped} failed:${stats.failed}`);
    return { summary: stats, jobId };

  } catch (err) {
    await browser.close();
    await updateJob(jobId, { status: 'failed', completedAt: new Date(), $push: { jobErrors: { message: err.message, at: new Date() } } });
    logger.error(`💥 City job FAILED [${cityName}]: ${err.message}`);
    throw err;
  }
});

// ── Gym Name Crawl Worker ─────────────────────────────────────────────────────

crawlQueue.process('gym-name-crawl', CONCURRENCY, async (job) => {
  const { jobId, input } = job.data;
  const { gymName } = input;

  await connectDB();
  await updateJob(jobId, { status: 'running', startedAt: new Date(), bullJobId: String(job.id) });

  const browser = new BrowserManager();
  const stats   = { created: 0, updated: 0, failed: 0 };

  try {
    await browser.launch();
    const page = await browser.newPage();

    job.progress(10);
    const urls = await searchGymsInCity(page, gymName, '');
    job.progress(40);

    await updateJob(jobId, { 'progress.total': urls.length });

    let i = 0;
    for (const url of urls.slice(0, 15)) {
      i++;
      job.progress(40 + Math.floor((i / Math.min(urls.length, 15)) * 60));
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
});

logger.info(`\n🚀 Atlas05 Worker started  [concurrency: ${CONCURRENCY}]`);
