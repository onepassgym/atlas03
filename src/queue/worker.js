'use strict';
require('dotenv').config();

const { Worker } = require('bullmq');
const { connectDB }   = require('../db/connection');
const { BrowserManager, searchGymsInCity, scrapeGymDetail, FITNESS_CATEGORIES } = require('../scraper/googleMapsScraper');
const { processGym }  = require('../scraper/gymProcessor');
const CrawlJob        = require('../db/crawlJobModel');
const { isJobCancelled, clearCancelFlag } = require('./queues');
const cfg             = require('../../config');
const logger          = require('../utils/logger');
const bus             = require('../services/eventBus');

const connection = {
  host:     cfg.redis.host,
  port:     cfg.redis.port,
  password: cfg.redis.password || undefined,
};

const CONCURRENCY = cfg.scraper.concurrency;
const DELAY_MIN   = cfg.scraper.delayMin;
const DELAY_MAX   = cfg.scraper.delayMax;
const MAX_RETRIES = cfg.scraper.maxRetries;

// ── Graceful shutdown state ──────────────────────────────────────────────────
let isShuttingDown = false;

function sleep(min, max) {
  return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
}

async function updateJob(jobId, update) {
  try { await CrawlJob.findOneAndUpdate({ jobId }, update); } catch (_) {}
}

/**
 * Check if this job should stop — either due to worker shutdown or API cancellation.
 */
async function shouldStop(jobId) {
  if (isShuttingDown) return 'shutdown';
  try {
    if (await isJobCancelled(jobId)) return 'cancelled';
  } catch (_) {}
  return false;
}

async function processCityJob(job) {
  const { jobId, input } = job.data;
  const { cityName, categories = FITNESS_CATEGORIES } = input;
  const startTime = Date.now();

  await connectDB();
  await updateJob(jobId, { status: 'running', startedAt: new Date(), bullJobId: String(job.id) });
    bus.publish('job:started', { jobId, type: 'city', cityName, categories: categories.length });

  const browser = new BrowserManager();
  const stats   = { created: 0, updated: 0, skipped: 0, failed: 0 };
  let stopReason = false;

  try {
    await browser.launch();
    const page = await browser.newPage();
    logger.info(`\n🏙  Starting city: ${cityName} (${categories.length} categories)`);
    const allUrls = new Set();

    for (let ci = 0; ci < categories.length; ci++) {
      stopReason = await shouldStop(jobId);
      if (stopReason) {
        logger.info(`⏸  ${stopReason === 'cancelled' ? 'Job cancelled by user' : 'Graceful shutdown'} — stopping category search`);
        break;
      }
      try {
        const urls = await searchGymsInCity(page, cityName, categories[ci]);
        urls.forEach(u => allUrls.add(u));
        await job.updateProgress(Math.floor(((ci + 1) / categories.length) * 25));
        await sleep(DELAY_MIN, DELAY_MAX);
      } catch (err) {
        logger.warn(`Category "${categories[ci]}" failed: ${err.message}`);
        await updateJob(jobId, {
          $push: { jobErrors: { message: err.message, url: `category:${categories[ci]}`, at: new Date() } },
          $inc: { errorCount: 1 },
        });
      }
    }

    const total = allUrls.size;
    logger.info(`\n📋 Total unique URLs for ${cityName}: ${total}`);
    await updateJob(jobId, { 'progress.total': total });

    let i = 0;
    for (const url of allUrls) {
      // Check cancellation every URL (fast Redis GET — ~0.1ms)
      stopReason = await shouldStop(jobId);
      if (stopReason) {
        logger.info(`⏸  ${stopReason === 'cancelled' ? 'Job cancelled by user' : 'Graceful shutdown'} — stopping at URL ${i}/${total}`);
        break;
      }

      i++;
      await job.updateProgress(25 + Math.floor((i / total) * 75));

      let scraped = null;
      let lastError = null;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try { scraped = await scrapeGymDetail(page, url); break; }
        catch (err) {
          lastError = err;
          logger.warn(`  ⚠  Attempt ${attempt}/${MAX_RETRIES}: ${err.message}`);
          if (attempt < MAX_RETRIES) await sleep(3000 * attempt, 5000 * attempt);
        }
      }

      if (!scraped?.name) {
        stats.failed++;
        await updateJob(jobId, {
          $inc: { 'progress.failed': 1, errorCount: 1 },
          $push: { jobErrors: { message: lastError?.message || 'Could not extract gym data', url, at: new Date() } },
        });
        continue;
      }

      const res = await processGym(scraped, cityName, jobId, true);
      if (res.action === 'created') {
        stats.created++;
        await updateJob(jobId, { $inc: { 'progress.newGyms': 1, 'progress.scraped': 1 }, $push: { gymIds: res.gymId } });
        bus.publish('gym:created', { name: scraped.name, area: cityName, gymId: String(res.gymId) });
      }
      if (res.action === 'updated') {
        stats.updated++;
        await updateJob(jobId, { $inc: { 'progress.updatedGyms': 1, 'progress.scraped': 1 }, $push: { gymIds: res.gymId } });
        bus.publish('gym:updated', { name: scraped.name, area: cityName, gymId: String(res.gymId), changes: 1 });
      }
      if (res.action === 'skipped') { stats.skipped++; await updateJob(jobId, { $inc: { 'progress.skipped': 1 } }); }
      if (res.action === 'error')   {
        stats.failed++;
        await updateJob(jobId, {
          $inc: { 'progress.failed': 1, errorCount: 1 },
          $push: { jobErrors: { message: res.error || 'processGym error', url, at: new Date() } },
        });
      }

      await sleep(DELAY_MIN, DELAY_MAX);
    }

    await browser.close();

    const durationMs = Date.now() - startTime;
    let finalStatus;
    if (stopReason === 'cancelled') {
      finalStatus = 'cancelled';
      await clearCancelFlag(jobId);
    } else if (stopReason === 'shutdown') {
      finalStatus = 'partial';
    } else {
      finalStatus = (stats.failed > 0 && stats.created === 0) ? 'partial' : 'completed';
    }

    await updateJob(jobId, { status: finalStatus, completedAt: new Date(), durationMs });

    // Publish completion event
    const eventType = finalStatus === 'cancelled' ? 'job:cancelled' : finalStatus === 'failed' ? 'job:failed' : 'job:completed';
    bus.publish(eventType, { jobId, cityName, status: finalStatus, created: stats.created, updated: stats.updated, failed: stats.failed, skipped: stats.skipped, durationMs });
    logger.info(`\n${finalStatus === 'cancelled' ? '🛑' : '✅'} Done: ${cityName} — status:${finalStatus} created:${stats.created} updated:${stats.updated} skipped:${stats.skipped} failed:${stats.failed} (${(durationMs / 1000).toFixed(1)}s)`);
    return { summary: stats, jobId, durationMs, status: finalStatus };

  } catch (err) {
    await browser.close();
    const durationMs = Date.now() - startTime;
    await updateJob(jobId, { status: 'failed', completedAt: new Date(), durationMs });
    bus.publish('job:failed', { jobId, cityName, error: err.message, durationMs });
    logger.error(`💥 City job FAILED [${cityName}]: ${err.message}`);
    throw err;
  }
}

async function processGymNameJob(job) {
  const { jobId, input } = job.data;
  const { gymName } = input;
  const startTime = Date.now();

  await connectDB();
  await updateJob(jobId, { status: 'running', startedAt: new Date(), bullJobId: String(job.id) });
    bus.publish('job:started', { jobId, type: 'gym_name', gymName });

  const browser = new BrowserManager();
  const stats   = { created: 0, updated: 0, failed: 0 };
  let stopReason = false;

  try {
    await browser.launch();
    const page = await browser.newPage();
    await job.updateProgress(10);
    const urls = await searchGymsInCity(page, gymName, '');
    await job.updateProgress(40);
    await updateJob(jobId, { 'progress.total': urls.length });

    let i = 0;
    for (const url of urls.slice(0, 15)) {
      stopReason = await shouldStop(jobId);
      if (stopReason) break;

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
        await updateJob(jobId, {
          $inc: { errorCount: 1 },
          $push: { jobErrors: { message: err.message, url, at: new Date() } },
        });
      }
      await sleep(DELAY_MIN, DELAY_MAX);
    }

    await browser.close();
    const durationMs = Date.now() - startTime;

    let finalStatus;
    if (stopReason === 'cancelled') {
      finalStatus = 'cancelled';
      await clearCancelFlag(jobId);
    } else if (stopReason === 'shutdown') {
      finalStatus = 'partial';
    } else {
      finalStatus = 'completed';
    }

    await updateJob(jobId, { status: finalStatus, completedAt: new Date(), durationMs });
    return { summary: stats, jobId, durationMs, status: finalStatus };

  } catch (err) {
    await browser.close();
    const durationMs = Date.now() - startTime;
    await updateJob(jobId, { status: 'failed', completedAt: new Date(), durationMs });
    throw err;
  }
}

async function start() {
  await connectDB();

  const worker = new Worker('atlas06-crawl', async (job) => {
    logger.info(`⚙️  Processing job: ${job.name} [${job.id}]`);
    if (job.name === 'city-crawl')     return processCityJob(job);
    if (job.name === 'gym-name-crawl') return processGymNameJob(job);
    throw new Error(`Unknown job name: ${job.name}`);
  }, {
    connection,
    concurrency: CONCURRENCY,
    lockDuration: 3_600_000,
  });

  worker.on('completed', (job) => logger.info(`✅ Job completed: ${job.id}`));
  worker.on('failed',    (job, err) => logger.error(`❌ Job failed: ${job?.id} — ${err.message}`));
  worker.on('error',     (err) => logger.error(`Worker error: ${err.message}`));

  logger.info(`\n🚀 Atlas06 Worker started  [concurrency: ${CONCURRENCY}, lockDuration: 3600s]`);

  // ── Graceful shutdown ────────────────────────────────────────────────────
  const shutdown = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`\n⏳ Received ${signal} — finishing current gym(s) and shutting down...`);

    try {
      await worker.close();
    } catch (_) {}

    logger.info('👋 Worker shut down gracefully.');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

start().catch(err => { console.error('Worker startup error:', err); process.exit(1); });
