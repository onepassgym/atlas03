'use strict';
const { Queue } = require('bullmq');
const cfg      = require('../../config');
const logger   = require('../utils/logger');

const connection = {
  host:     cfg.redis.host,
  port:     cfg.redis.port,
  password: cfg.redis.password,
};

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

const crawlQueue = makeQueue('atlas05-crawl');

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

async function getQueueJobStatus(jobId) {
  try {
    const job = await crawlQueue.getJob(jobId);
    if (!job) return null;
    return { 
      id: job.id, 
      state: await job.getState(), 
      progress: job.progress, // In BullMQ, progress is a property or value, not necessarily a function return? Actually, it's just job.progress in BullMQ
      failedReason: job.failedReason 
    };
  } catch (_) { return null; }
}

module.exports = { crawlQueue, addCityJob, addGymNameJob, getQueueStats, getQueueJobStatus, getBullJobStatus: getQueueJobStatus };
