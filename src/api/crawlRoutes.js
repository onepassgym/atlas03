'use strict';
const express  = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const router   = express.Router();

const { addCityJob, addGymNameJob, getQueueStats, getQueueJobStatus, clearCrawlQueue, requestCancelJob, removeBullJob } = require('../queue/queues');
const { FITNESS_CATEGORIES } = require('../scraper/googleMapsScraper');
const CrawlJob = require('../db/crawlJobModel');
const Gym      = require('../db/gymModel');
const logger   = require('../utils/logger');

const { ok, err, validate } = require('../utils/apiUtils');
const bus = require('../services/eventBus');

// ── Job dedup helper — prevent duplicate city jobs ────────────────────────────
async function hasActiveJob(cityName) {
  const existing = await CrawlJob.findOne({
    'input.cityName': { $regex: new RegExp(`^${cityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    status: { $in: ['queued', 'running'] },
  }).lean();
  return existing;
}

/**
 * @swagger
 * tags:
 *   name: Crawl
 *   description: Gym and city crawling management
 */

/**
 * @swagger
 * /api/crawl/city:
 *   post:
 *     summary: Queue a city-wide crawl
 *     tags: [Crawl]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cityName]
 *             properties:
 *               cityName:
 *                 type: string
 *                 example: "Mumbai, Maharashtra, India"
 *               categories:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["gym", "fitness center"]
 *               force:
 *                 type: boolean
 *                 description: Bypass active job guard
 *                 example: false
 *     responses:
 *       202:
 *         description: Crawl queued successfully
 *       409:
 *         description: City already has an active job
 */
// POST /api/crawl/city
router.post('/city',
  body('cityName').notEmpty().trim(),
  body('categories').optional().isArray(),
  body('force').optional().isBoolean(),
  async (req, res) => {
    if (validate(req, res)) return;
    const { cityName, categories = FITNESS_CATEGORIES, force = false } = req.body;

    try {
      // Job dedup guard
      if (!force) {
        const active = await hasActiveJob(cityName);
        if (active) {
          return ok(res, {
            message: `City "${cityName}" already has an active job (${active.status}). Use force:true to override.`,
            existingJobId: active.jobId,
            trackAt: `/api/crawl/status/${active.jobId}`,
          }, 409);
        }
      }

      const jobId = uuidv4();
      await CrawlJob.create({ jobId, type: 'city', input: { cityName, categories }, status: 'queued' });
      await addCityJob(jobId, cityName, categories);
      bus.publish('job:queued', { jobId, type: 'city', cityName, categoryCount: categories.length });
      ok(res, { message: `City crawl queued for "${cityName}"`, jobId, categoryCount: categories.length, trackAt: `/api/crawl/status/${jobId}` }, 202);
    } catch (e) { logger.error(e.message); err(res, e.message); }
  }
);

/**
 * @swagger
 * /api/crawl/gym:
 *   post:
 *     summary: Queue a crawl for a specific gym name
 *     tags: [Crawl]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [gymName]
 *             properties:
 *               gymName:
 *                 type: string
 *                 example: "Gold's Gym Andheri Mumbai"
 *     responses:
 *       202:
 *         description: Gym crawl queued successfully
 */
// POST /api/crawl/gym
router.post('/gym',
  body('gymName').notEmpty().trim(),
  async (req, res) => {
    if (validate(req, res)) return;
    const { gymName } = req.body;
    const jobId = uuidv4();
    try {
      await CrawlJob.create({ jobId, type: 'gym_name', input: { gymName }, status: 'queued' });
      await addGymNameJob(jobId, gymName);
      bus.publish('job:queued', { jobId, type: 'gym_name', gymName });
      ok(res, { message: `Gym crawl queued for "${gymName}"`, jobId, trackAt: `/api/crawl/status/${jobId}` }, 202);
    } catch (e) { logger.error(e.message); err(res, e.message); }
  }
);

/**
 * @swagger
 * /api/crawl/batch:
 *   post:
 *     summary: Queue crawls for multiple cities
 *     tags: [Crawl]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cities]
 *             properties:
 *               cities:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Mumbai", "Delhi"]
 *               categories:
 *                 type: array
 *                 items:
 *                   type: string
 *               force:
 *                 type: boolean
 *     responses:
 *       202:
 *         description: Batch queued successfully
 */
// POST /api/crawl/batch
router.post('/batch',
  body('cities').isArray({ min: 1 }),
  body('cities.*').isString().notEmpty(),
  body('force').optional().isBoolean(),
  async (req, res) => {
    if (validate(req, res)) return;
    const { cities, categories = FITNESS_CATEGORIES, force = false } = req.body;
    const jobs = [];
    const skipped = [];
    try {
      for (const cityName of cities) {
        // Job dedup guard
        if (!force) {
          const active = await hasActiveJob(cityName);
          if (active) {
            skipped.push({ cityName, existingJobId: active.jobId, status: active.status });
            continue;
          }
        }
        const jobId = uuidv4();
        await CrawlJob.create({ jobId, type: 'city', input: { cityName, categories }, status: 'queued' });
        await addCityJob(jobId, cityName, categories);
        jobs.push({ cityName, jobId });
      }
      ok(res, { message: `${jobs.length} cities queued, ${skipped.length} skipped (already active)`, jobs, skipped }, 202);
    } catch (e) { logger.error(e.message); err(res, e.message); }
  }
);

/**
 * @swagger
 * /api/crawl/status/{jobId}:
 *   get:
 *     summary: Get status and progress of a crawl job
 *     tags: [Crawl]
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Job details
 *       404:
 *         description: Job not found
 */
// GET /api/crawl/status/:jobId
router.get('/status/:jobId', async (req, res) => {
  try {
    const db   = await CrawlJob.findOne({ jobId: req.params.jobId }).lean();
    if (!db) return err(res, 'Job not found', 404);
    const queueJob = await getQueueJobStatus(req.params.jobId);
    ok(res, { job: { ...db, queueJob } });
  } catch (e) { err(res, e.message); }
});

/**
 * @swagger
 * /api/crawl/jobs:
 *   get:
 *     summary: List all crawl jobs
 *     tags: [Crawl]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [queued, running, completed, failed, partial, cancelled]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *     responses:
 *       200:
 *         description: List of jobs
 */
// GET /api/crawl/jobs
router.get('/jobs',
  query('status').optional().isIn(['queued','running','completed','failed','partial','cancelled']),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('page').optional().isInt({ min: 1 }),
  async (req, res) => {
    if (validate(req, res)) return;
    const { status, limit = 20, page = 1 } = req.query;
    const filter = status ? { status } : {};
    try {
      const [jobs, total] = await Promise.all([
        CrawlJob.find(filter).sort({ createdAt: -1 }).limit(+limit).skip((+page - 1) * +limit).lean(),
        CrawlJob.countDocuments(filter),
      ]);
      ok(res, { total, page: +page, limit: +limit, jobs });
    } catch (e) { err(res, e.message); }
  }
);

/**
 * @swagger
 * /api/crawl/queue/stats:
 *   get:
 *     summary: Get BullMQ queue statistics
 *     tags: [Crawl]
 *     responses:
 *       200:
 *         description: Queue counts (waiting, active, completed, etc.)
 */
// GET /api/crawl/queue/stats
router.get('/queue/stats', async (req, res) => {
  try { ok(res, { queue: await getQueueStats() }); }
  catch (e) { err(res, e.message); }
});

/**
 * @swagger
 * /api/crawl/cancel/{jobId}:
 *   post:
 *     summary: Request cancellation of a specific job
 *     description: Instantly cancels queued jobs. Signifies running jobs to stop after current item.
 *     tags: [Crawl]
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Cancel request processed
 *       404:
 *         description: Job not found
 */
// POST /api/crawl/cancel/:jobId — cancel a specific job
router.post('/cancel/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const dbJob = await CrawlJob.findOne({ jobId }).lean();
    if (!dbJob) return err(res, 'Job not found', 404);

    if (dbJob.status === 'completed' || dbJob.status === 'cancelled') {
      return ok(res, { message: `Job is already ${dbJob.status}`, jobId, status: dbJob.status });
    }

    if (dbJob.status === 'queued') {
      // Remove from BullMQ queue if still waiting
      const removed = await removeBullJob(jobId);
      await CrawlJob.findOneAndUpdate({ jobId }, { status: 'cancelled', completedAt: new Date() });
      return ok(res, { message: `Queued job cancelled${removed ? ' and removed from queue' : ''}`, jobId, status: 'cancelled' });
    }

    if (dbJob.status === 'running') {
      // Set Redis cancel flag — worker checks this every URL iteration
      await requestCancelJob(jobId);
      return ok(res, {
        message: 'Cancel signal sent to running job. It will stop after the current gym finishes processing.',
        jobId,
        status: 'cancelling',
        note: 'Check /api/crawl/status/' + jobId + ' — status will change to "cancelled" shortly.',
      });
    }

    // failed/partial — just mark as cancelled
    await CrawlJob.findOneAndUpdate({ jobId }, { status: 'cancelled', completedAt: new Date() });
    ok(res, { message: 'Job marked as cancelled', jobId, status: 'cancelled' });

  } catch (e) { err(res, e.message); }
});

/**
 * @swagger
 * /api/crawl/queue/clear:
 *   post:
 *     summary: Obliterate all jobs in the queue
 *     tags: [Crawl]
 *     responses:
 *       200:
 *         description: Queue cleared and active jobs marked cancelled
 */
// POST /api/crawl/queue/clear
router.post('/queue/clear', async (req, res) => {
  try {
    await clearCrawlQueue();
    // Also reset any 'queued' or 'running' jobs in the DB
    const result = await CrawlJob.updateMany(
      { status: { $in: ['queued', 'running'] } },
      { status: 'cancelled', completedAt: new Date() }
    );
    ok(res, { message: `Queue obliterated. ${result.modifiedCount} job(s) cancelled.` });
  } catch (e) { err(res, e.message); }
});

/**
 * @swagger
 * /api/crawl/retry/failed:
 *   post:
 *     summary: Re-queue all failed/partial city jobs
 *     tags: [Crawl]
 *     responses:
 *       200:
 *         description: Retry jobs queued
 */
// POST /api/crawl/retry/failed
router.post('/retry/failed', async (req, res) => {
  try {
    const failed = await CrawlJob.find({ status: { $in: ['failed','partial'] }, type: 'city' }).lean();
    if (!failed.length) return ok(res, { message: 'No failed or partial jobs found' });
    
    const jobs = [];
    for (const j of failed) {
      const jobId = uuidv4();
      await CrawlJob.create({ jobId, type: 'city', input: j.input, status: 'queued' });
      await addCityJob(jobId, j.input.cityName, j.input.categories || []);
      jobs.push({ cityName: j.input.cityName, jobId });
    }
    logger.info(`Re-queued ${failed.length} failed jobs via API`);
    ok(res, { message: `Re-queued ${failed.length} failed jobs`, jobs });
  } catch (e) { err(res, e.message); }
});

// POST /api/crawl/retry/incomplete
router.post('/retry/incomplete',
  body('threshold').optional().isInt({ min: 1, max: 99 }),
  async (req, res) => {
    if (validate(req, res)) return;
    const threshold = req.body.threshold || 50;
    try {
      const gyms = await Gym.find({ 'crawlMeta.dataCompleteness': { $lt: threshold } }).select('name areaName').limit(200).lean();
      if (!gyms.length) return ok(res, { message: `No gyms found with completeness < ${threshold}%` });

      const jobs = [];
      for (const g of gyms) {
        const jobId = uuidv4();
        const gymName = `${g.name} ${g.areaName || ''}`.trim();
        await CrawlJob.create({ jobId, type: 'gym_name', input: { gymName }, status: 'queued' });
        await addGymNameJob(jobId, gymName);
        jobs.push({ gymName, jobId });
      }
      logger.info(`Re-queued ${gyms.length} incomplete gyms via API`);
      ok(res, { message: `Re-queued ${gyms.length} incomplete gyms`, jobs });
    } catch (e) { err(res, e.message); }
});

// GET /api/crawl/categories
router.get('/categories', (_, res) => ok(res, { categories: FITNESS_CATEGORIES }));

// DELETE /api/crawl/jobs/:jobId
router.delete('/jobs/:jobId', async (req, res) => {
  try {
    await CrawlJob.findOneAndDelete({ jobId: req.params.jobId });
    ok(res, { message: 'Job deleted' });
  } catch (e) { err(res, e.message); }
});

module.exports = router;
