'use strict';
require('dotenv').config();

const { Worker } = require('bullmq');
const { connectDB }   = require('../db/connection');
const { BrowserManager, searchGymsInCity, scrapeGymDetail, FITNESS_CATEGORIES } = require('../scraper/googleMapsScraper');
const { processGym }  = require('../scraper/gymProcessor');
const CrawlJob        = require('../db/crawlJobModel');
const Gym             = require('../db/gymModel');   // Phase 7: pre-filter known URLs
const { isJobCancelled, clearCancelFlag, addBatchScrapeJob } = require('./queues');
const cfg             = require('../../config');
const logger          = require('../utils/logger');
const bus             = require('../services/eventBus');

const connection = {
  host:     cfg.redis.host,
  port:     cfg.redis.port,
  password: cfg.redis.password || undefined,
};

const CONCURRENCY       = cfg.scraper.concurrency;
const DELAY_MIN         = cfg.scraper.delayMin;
const DELAY_MAX         = cfg.scraper.delayMax;
const MAX_RETRIES       = cfg.scraper.maxRetries;
// Phase 2: parallel browser pages within a single job (detail scraping)
const PAGE_POOL         = cfg.scraper.pagePool;
// Phase 6: parallel browser pages for category search
const SEARCH_POOL       = cfg.scraper.searchPool;
// Phase 7: skip URLs already crawled within this many days (0 = disabled)
const SKIP_RECENT_DAYS  = cfg.scraper.skipRecentDays;
// Phase 9: how many URLs per batch-scrape job
const BATCH_SIZE        = cfg.scraper.batchSize;

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

// ── Phase 2: Parallel page pool URL processor ────────────────────────────────
/**
 * Processes a list of URLs using a pool of N parallel browser pages.
 * Each page picks the next available URL from a shared index (work-stealing).
 *
 * @param {BrowserManager} browser  - Active BrowserManager instance
 * @param {string[]}       urls     - Full list of URLs to process
 * @param {string}         jobId    - For cancellation checks and DB updates
 * @param {string}         cityName - City label for processGym
 * @param {object}         stats    - Shared stats object (mutated in place)
 * @param {object}         bullJob  - BullMQ job for progress updates
 * @param {string}         mode     - Scrape mode: 'fast' | 'standard' | 'deep'
 */
async function processUrlsWithPool(browser, urls, jobId, cityName, stats, bullJob, mode = 'standard') {
  const total = urls.length;
  let urlIndex = 0;
  let stopReason = false;

  // Open N pages in parallel inside the shared browser context
  const poolSize = Math.min(PAGE_POOL, total);
  logger.info(`  🔀 Opening ${poolSize} parallel pages for ${total} URLs`);
  const pages = await Promise.all(
    Array.from({ length: poolSize }, () => browser.newPage())
  );

  /**
   * Worker function: each page keeps grabbing the next URL until exhausted
   * or a stop signal is received.
   */
  async function workerLoop(page) {
    while (true) {
      // Atomically claim the next URL index
      const idx = urlIndex++;
      if (idx >= total) break;

      const url = urls[idx];

      // Check cancellation before each URL
      const stop = await shouldStop(jobId);
      if (stop) { stopReason = stop; break; }

      await bullJob.updateProgress(25 + Math.floor((idx / total) * 75));

      let scraped = null;
      let lastError = null;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try { scraped = await scrapeGymDetail(page, url, mode); break; }
        catch (err) {
          lastError = err;
          logger.warn(`  ⚠  Attempt ${attempt}/${MAX_RETRIES} [${url.slice(-40)}]: ${err.message}`);
          if (attempt < MAX_RETRIES) await sleep(2000 * attempt, 3500 * attempt);
        }
      }

      if (!scraped?.name) {
        stats.failed++;
        await updateJob(jobId, {
          $inc: { 'progress.failed': 1, errorCount: 1 },
          $push: { jobErrors: { message: lastError?.message || 'Could not extract gym data', url, at: new Date() } },
        });
        // Short delay before next URL even on failure
        await sleep(DELAY_MIN, DELAY_MAX);
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

      // Inter-URL delay (shorter than before — Phase 1d)
      await sleep(DELAY_MIN, DELAY_MAX);
    }
  }

  // Run all page workers concurrently
  await Promise.all(pages.map(page => workerLoop(page)));

  // Close all pages
  await Promise.all(pages.map(async (page) => { try { await page.close(); } catch (_) {} }));

  return stopReason;
}

// ── Phase 6: Parallel category search ────────────────────────────────────────
/**
 * Opens SEARCH_POOL browser pages simultaneously and splits 'categories'
 * across them using work-stealing so all pages stay busy.
 * Returns a Set of unique gym URLs found across all categories.
 */
async function searchAllCategories(browser, cityName, categories, jobId, bullJob) {
  const cats    = Array.isArray(categories) ? categories : FITNESS_CATEGORIES;
  const allUrls = new Set();
  let catIndex  = 0;
  let stopReason = false;

  const poolSize = Math.min(SEARCH_POOL, cats.length);
  logger.info(`  🔍 Searching ${cats.length} categories with ${poolSize} parallel pages`);

  const pages = await Promise.all(
    Array.from({ length: poolSize }, () => browser.newPage())
  );

  async function searchLoop(page) {
    while (catIndex < cats.length) {
      const ci  = catIndex++;
      const cat = cats[ci];

      const stop = await shouldStop(jobId);
      if (stop) { stopReason = stop; break; }

      try {
        const urls = await searchGymsInCity(page, cityName, cat);
        urls.forEach(u => allUrls.add(u));
        await bullJob.updateProgress(Math.floor(((ci + 1) / categories.length) * 25));
      } catch (err) {
        logger.warn(`Category "${cat}" failed: ${err.message}`);
      }
      await sleep(DELAY_MIN, DELAY_MAX);
    }
  }

  await Promise.all(pages.map(p => searchLoop(p)));
  await Promise.all(pages.map(p => p.close().catch(() => {})));

  return { allUrls, stopReason };
}

// ── Phase 7: Pre-filter URLs already crawled recently ────────────────────────
/**
 * Loads googleMapsUrl values for gyms in this city that were crawled
 * within SKIP_RECENT_DAYS. Removes those from the URL list so we
 * don't waste scrape time on unchanged gyms.
 */
async function preFilterUrls(urls, cityName) {
  if (!SKIP_RECENT_DAYS || SKIP_RECENT_DAYS <= 0) return [...urls];

  try {
    const cutoff = new Date(Date.now() - SKIP_RECENT_DAYS * 86_400_000);

    const recentGyms = await Gym.find(
      {
        areaName: { $regex: new RegExp(cityName.split(',')[0].trim(), 'i') },
        'crawlMeta.lastCrawledAt': { $gte: cutoff },
        googleMapsUrl: { $exists: true, $ne: null },
      },
      { googleMapsUrl: 1, _id: 0 }
    ).lean();

    const knownUrls = new Set(
      recentGyms
        .map(g => g.googleMapsUrl)
        .filter(Boolean)
        .map(u => u.split('?')[0].split('/@')[0])
    );

    const fresh   = urls.filter(u => !knownUrls.has(u));
    const skipped = urls.length - fresh.length;

    if (skipped > 0) {
      logger.info(`  🔎 Pre-filter: skipping ${skipped}/${urls.length} recently-crawled URLs (within ${SKIP_RECENT_DAYS}d)`);
    }
    return fresh;
  } catch (err) {
    // Non-fatal — fall back to scraping all URLs
    logger.warn(`Pre-filter query failed (scraping all): ${err.message}`);
    return [...urls];
  }
}

// ── City crawl job handler (Phase 9: discovery-only → enqueue batches) ───────
//
// The city job no longer scrapes any gym details itself.
// It opens a browser, searches all categories (parallel), pre-filters URLs,
// splits them into BATCH_SIZE chunks, and enqueues each chunk as a separate
// 'batch-scrape' BullMQ job. Multiple worker replicas then pick up batches
// in parallel, giving true multi-container parallelism.

async function processCityJob(job) {
  const { jobId, input = {} } = job.data;
  const { cityName, mode = 'standard' } = input;
  // Ensure categories is an array. Default to export if missing or null.
  const categories = Array.isArray(input.categories) ? input.categories : FITNESS_CATEGORIES;
  const startTime = Date.now();

  await connectDB();
  await updateJob(jobId, { status: 'running', startedAt: new Date(), bullJobId: String(job.id) });
  bus.publish('job:started', { jobId, type: 'city', cityName, categories: categories.length, mode });

  const browser = new BrowserManager();
  let stopReason = false;

  try {
    await browser.launch();
    logger.info(`\n🏙  [DISCOVERY] ${cityName} — ${categories.length} categories, searchPool:${SEARCH_POOL}, batchSize:${BATCH_SIZE}`);

    // ── Phase 6: Parallel category search ─────────────────────────────────
    const { allUrls, stopReason: searchStop } = await searchAllCategories(
      browser, cityName, categories, jobId, job
    );
    if (searchStop) stopReason = searchStop;

    await browser.close();

    const discoveredTotal = allUrls.size;
    logger.info(`\n📋 Discovered ${discoveredTotal} unique URLs for ${cityName}`);

    // ── Phase 7: Pre-filter recently-crawled URLs ──────────────────────────
    const urlsToScrape = stopReason ? [] : await preFilterUrls([...allUrls], cityName);
    const total = urlsToScrape.length;

    await updateJob(jobId, { 'progress.total': discoveredTotal, 'progress.toScrape': total });

    if (total === 0 || stopReason) {
      const durationMs = Date.now() - startTime;
      const finalStatus = stopReason === 'cancelled' ? 'cancelled' : 'completed';
      if (stopReason === 'cancelled') await clearCancelFlag(jobId);
      await updateJob(jobId, { status: finalStatus, completedAt: new Date(), durationMs });
      bus.publish('job:completed', { jobId, cityName, status: finalStatus, batches: 0, durationMs });
      logger.info(`  ✅ Discovery done: ${total} URLs, 0 batches (${(durationMs/1000).toFixed(1)}s)`);
      return { jobId, discovered: discoveredTotal, toScrape: 0, batches: 0, status: finalStatus };
    }

    // ── Phase 9: Split into batches and enqueue ────────────────────────────
    const batches = [];
    for (let i = 0; i < urlsToScrape.length; i += BATCH_SIZE) {
      batches.push(urlsToScrape.slice(i, i + BATCH_SIZE));
    }

    logger.info(`  🔀 Splitting ${total} URLs into ${batches.length} batch jobs (${BATCH_SIZE} URLs each)`);

    for (let bi = 0; bi < batches.length; bi++) {
      await addBatchScrapeJob(jobId, cityName, batches[bi], bi, mode);
    }

    // Mark discovery phase as done — batch results update the job document
    await updateJob(jobId, { 'progress.batches': batches.length, 'progress.batchesDone': 0 });
    bus.publish('job:batches-queued', { jobId, cityName, batches: batches.length, totalUrls: total });

    const durationMs = Date.now() - startTime;
    logger.info(`  ✅ Discovery done: ${discoveredTotal} found, ${total} to scrape, ${batches.length} batches enqueued (${(durationMs/1000).toFixed(1)}s)`);

    return { jobId, discovered: discoveredTotal, toScrape: total, batches: batches.length, durationMs };

  } catch (err) {
    await browser.close();
    const durationMs = Date.now() - startTime;
    await updateJob(jobId, { status: 'failed', completedAt: new Date(), durationMs });
    bus.publish('job:failed', { jobId, cityName, error: err.message, durationMs });
    logger.error(`💥 Discovery FAILED [${cityName}]: ${err.message}`);
    throw err;
  }
}

// ── Phase 9: Batch scrape job handler ─────────────────────────────────────────
//
// Each batch job opens its OWN browser instance, spawns PAGE_POOL tabs,
// scrapes its batch of 15-20 URLs, closes the browser, and reports results
// back to the parent city-crawl job document.
//
// Because each batch is a separate BullMQ job, different worker containers
// (replicas) pick them up in parallel — this is where the real speedup is.

async function processBatchJob(job) {
  const { parentJobId, input } = job.data;
  const { cityName, urls, batchIndex, mode = 'standard' } = input;
  const startTime = Date.now();

  await connectDB();
  logger.info(`\n📦 [BATCH ${batchIndex}] ${cityName} — ${urls.length} URLs, pagePool:${PAGE_POOL}, mode:${mode}`);

  const browser = new BrowserManager();
  const stats   = { created: 0, updated: 0, skipped: 0, failed: 0 };
  let stopReason = false;

  try {
    await browser.launch();

    // ── Scrape all URLs using the parallel page pool ──────────────────────
    stopReason = await processUrlsWithPool(
      browser, urls, parentJobId, cityName, stats, job, mode
    );

    await browser.close();

    const durationMs = Date.now() - startTime;
    const batchStatus = stopReason ? (stopReason === 'cancelled' ? 'cancelled' : 'partial') : 'completed';

    // ── Report batch results to parent job ────────────────────────────────
    await updateJob(parentJobId, {
      $inc: { 'progress.batchesDone': 1 },
    });

    // Check if ALL batches are done → mark parent job completed
    try {
      const parentJob = await CrawlJob.findOne({ jobId: parentJobId }).lean();
      if (parentJob?.progress?.batchesDone >= parentJob?.progress?.batches) {
        const totalDuration = parentJob.startedAt ? (Date.now() - new Date(parentJob.startedAt).getTime()) : durationMs;
        await updateJob(parentJobId, {
          status: 'completed',
          completedAt: new Date(),
          durationMs: totalDuration,
        });
        bus.publish('job:completed', {
          jobId: parentJobId, cityName,
          status: 'completed',
          durationMs: totalDuration,
        });
        logger.info(`\n🏁 [CITY COMPLETE] ${cityName} — all ${parentJob.progress.batches} batches done (${(totalDuration/1000).toFixed(1)}s total)`);
      }
    } catch (_) {}

    logger.info(`  ✅ [BATCH ${batchIndex}] Done: created:${stats.created} updated:${stats.updated} failed:${stats.failed} (${(durationMs/1000).toFixed(1)}s)`);
    return { batchIndex, stats, durationMs, status: batchStatus };

  } catch (err) {
    await browser.close();
    const durationMs = Date.now() - startTime;
    logger.error(`  💥 [BATCH ${batchIndex}] FAILED: ${err.message}`);

    // Still increment batchesDone so parent doesn't hang forever
    await updateJob(parentJobId, {
      $inc: { 'progress.batchesDone': 1, 'progress.failed': urls.length, errorCount: 1 },
      $push: { jobErrors: { message: `Batch ${batchIndex} failed: ${err.message}`, at: new Date() } },
    });

    throw err;
  }
}

// ── Gym-name crawl job handler ───────────────────────────────────────────────

async function processGymNameJob(job) {
  const { jobId, input } = job.data;
  const { gymName, mode = 'standard' } = input;
  const startTime = Date.now();

  await connectDB();
  await updateJob(jobId, { status: 'running', startedAt: new Date(), bullJobId: String(job.id) });
  bus.publish('job:started', { jobId, type: 'gym_name', gymName, mode });

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
        const scraped = await scrapeGymDetail(page, url, mode);
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

// ── Worker startup ───────────────────────────────────────────────────────────

async function start() {
  await connectDB();

  const worker = new Worker('atlas06-crawl', async (job) => {
    logger.info(`⚙️  Processing job: ${job.name} [${job.id}]`);
    if (job.name === 'city-crawl')     return processCityJob(job);
    if (job.name === 'batch-scrape')   return processBatchJob(job);  // Phase 9
    if (job.name === 'gym-name-crawl') return processGymNameJob(job);
    throw new Error(`Unknown job name: ${job.name}`);
  }, {
    connection,
    concurrency: CONCURRENCY,
    lockDuration: 600_000,  // 10 min — batches are small, don't hold locks for 1h
  });

  worker.on('completed', (job) => logger.info(`✅ Job completed: ${job.id}`));
  worker.on('failed',    (job, err) => logger.error(`❌ Job failed: ${job?.id} — ${err.message}`));
  worker.on('error',     (err) => logger.error(`Worker error: ${err.message}`));

  logger.info(`\n🚀 Atlas06 Worker started  [concurrency: ${CONCURRENCY}, pagePool: ${PAGE_POOL}, lockDuration: 3600s]`);

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
