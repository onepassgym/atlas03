'use strict';
const { Queue } = require('bullmq');
const Redis = require('ioredis');
const cfg      = require('../../config');
const logger   = require('../utils/logger');

const connection = {
  host:     cfg.redis.host,
  port:     cfg.redis.port,
  password: cfg.redis.password,
};

// Shared Redis client for cancellation flags
const redis = new Redis({
  host:     cfg.redis.host,
  port:     cfg.redis.port,
  password: cfg.redis.password || undefined,
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});
redis.connect().catch(() => {});

function makeQueue(name, jobOpts = {}) {
  const q = new Queue(name, {
    connection,
    defaultJobOptions: {
      attempts:         cfg.scraper.maxRetries,
      backoff:          { type: 'exponential', delay: 5000 },
      removeOnComplete: 50,
      removeOnFail:     30,
      ...jobOpts,
    },
  });
  q.on('error', err => logger.error(`[${name}] Queue error: ${err.message}`));
  return q;
}

const crawlQueue = makeQueue('atlas06-crawl');
const chainCrawlQueue = makeQueue('atlas06-chain-crawl');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function addCityJob(jobId, cityName, categories) {
  const job = await crawlQueue.add(
    'city-crawl',
    { type: 'city', jobId, input: { cityName, categories } },
    { jobId }
  );
  logger.info(`📥 Queued city: ${cityName} (BullMQ #${job.id})`);
  return job;
}

async function addGymNameJob(jobId, gymName) {
  const job = await crawlQueue.add(
    'gym-name-crawl',
    { type: 'gym_name', jobId, input: { gymName } },
    { jobId, priority: 1 }
  );
  logger.info(`📥 Queued gym name: ${gymName} (BullMQ #${job.id})`);
  return job;
}

async function getQueueStats() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    crawlQueue.getWaitingCount(),
    crawlQueue.getActiveCount(),
    crawlQueue.getCompletedCount(),
    crawlQueue.getFailedCount(),
    crawlQueue.getDelayedCount(),
  ]);
  return { waiting, active, completed, failed, delayed };
}

async function addChainJob(jobId, chainSlug, chainName, countries = []) {
  const job = await chainCrawlQueue.add(
    'chain-crawl',
    { type: 'chain', jobId, input: { chainSlug, chainName, countries } },
    { jobId, priority: 5 }
  );
  logger.info(`📥 Queued chain: ${chainName} [${chainSlug}] (BullMQ #${job.id})`);
  return job;
}

async function getChainQueueStats() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    chainCrawlQueue.getWaitingCount(),
    chainCrawlQueue.getActiveCount(),
    chainCrawlQueue.getCompletedCount(),
    chainCrawlQueue.getFailedCount(),
    chainCrawlQueue.getDelayedCount(),
  ]);
  return { waiting, active, completed, failed, delayed };
}

async function getQueueJobStatus(jobId) {
  try {
    const job = await crawlQueue.getJob(jobId);
    if (!job) return null;
    return { 
      id: job.id, 
      state: await job.getState(), 
      progress: job.progress, 
      failedReason: job.failedReason 
    };
  } catch (_) { return null; }
}

async function clearCrawlQueue() {
  await crawlQueue.pause();
  await crawlQueue.obliterate({ force: true });
}

// ── Cancellation system (Redis-backed for fast polling) ──────────────────────

/**
 * Set a cancellation flag in Redis. The worker polls this mid-crawl.
 * TTL of 1 hour prevents stale flags from accumulating.
 */
async function requestCancelJob(jobId) {
  await redis.set(`atlas06:cancel:${jobId}`, '1', 'EX', 3600);
  logger.info(`🛑 Cancel requested for job: ${jobId}`);
}

/**
 * Check if a job has been flagged for cancellation.
 * Called by the worker in its scraping loops.
 */
async function isJobCancelled(jobId) {
  try {
    const flag = await redis.get(`atlas06:cancel:${jobId}`);
    return flag === '1';
  } catch (_) {
    return false;
  }
}

/**
 * Clear the cancellation flag after the worker has handled it.
 */
async function clearCancelFlag(jobId) {
  await redis.del(`atlas06:cancel:${jobId}`);
}

/**
 * Remove a BullMQ job if it's still waiting in the queue.
 * Returns true if removed, false if it was already active/done.
 */
async function removeBullJob(jobId) {
  try {
    const job = await crawlQueue.getJob(jobId);
    if (!job) return false;
    const state = await job.getState();
    if (state === 'waiting' || state === 'delayed') {
      await job.remove();
      return true;
    }
    return false;
  } catch (_) { return false; }
}

module.exports = {
  crawlQueue,
  chainCrawlQueue,
  addCityJob,
  addGymNameJob,
  addChainJob,
  getQueueStats,
  getChainQueueStats,
  getQueueJobStatus,
  getBullJobStatus: getQueueJobStatus,
  clearCrawlQueue,
  requestCancelJob,
  isJobCancelled,
  clearCancelFlag,
  removeBullJob,
};
