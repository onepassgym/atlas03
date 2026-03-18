'use strict';
const Bull   = require('bull');
const cfg    = require('../../config');
const logger = require('../utils/logger');

const redisOpts = {
  host:                 cfg.redis.host,
  port:                 cfg.redis.port,
  password:             cfg.redis.password,
  maxRetriesPerRequest: null,
  enableReadyCheck:     false,
  lazyConnect:          true,
};

function makeQueue(name, jobOpts = {}) {
  const q = new Bull(name, {
    redis: redisOpts,
    defaultJobOptions: {
      attempts:         cfg.scraper.maxRetries,
      backoff:          { type: 'exponential', delay: 5000 },
      removeOnComplete: 50,
      removeOnFail:     30,
      timeout:          600_000, // 10 min
      ...jobOpts,
    },
  });
  q.on('error', err => logger.error(`[${name}] Queue error: ${err.message}`));
  q.on('failed', (job, err) => logger.error(`[${name}] Job ${job.id} failed: ${err.message}`));
  q.on('stalled', job => logger.warn(`[${name}] Job ${job.id} stalled`));
  return q;
}

const crawlQueue = makeQueue('atlas05:crawl');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function addCityJob(jobId, cityName, categories) {
  const job = await crawlQueue.add(
    'city-crawl',
    { type: 'city', jobId, input: { cityName, categories } },
    { jobId }
  );
  logger.info(`📥 Queued city: ${cityName} (Bull #${job.id})`);
  return job;
}

async function addGymNameJob(jobId, gymName) {
  const job = await crawlQueue.add(
    'gym-name-crawl',
    { type: 'gym_name', jobId, input: { gymName } },
    { jobId, priority: 1 }
  );
  logger.info(`📥 Queued gym name: ${gymName} (Bull #${job.id})`);
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

async function getBullJobStatus(jobId) {
  try {
    const job = await crawlQueue.getJob(jobId);
    if (!job) return null;
    return { id: job.id, state: await job.getState(), progress: job.progress(), failedReason: job.failedReason };
  } catch (_) { return null; }
}

module.exports = { crawlQueue, addCityJob, addGymNameJob, getQueueStats, getBullJobStatus };
