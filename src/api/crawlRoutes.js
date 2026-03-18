'use strict';
const express  = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const router   = express.Router();

const { addCityJob, addGymNameJob, getQueueStats, getQueueJobStatus } = require('../queue/queues');
const { FITNESS_CATEGORIES } = require('../scraper/googleMapsScraper');
const CrawlJob = require('../db/crawlJobModel');
const logger   = require('../utils/logger');

function ok(res, data, status = 200) { res.status(status).json({ success: true, ...data }); }
function err(res, msg, status = 500) { res.status(status).json({ success: false, error: msg }); }

function validate(req, res) {
  const e = validationResult(req);
  if (!e.isEmpty()) { res.status(400).json({ success: false, errors: e.array() }); return true; }
  return false;
}

// POST /api/crawl/city
router.post('/city',
  body('cityName').notEmpty().trim(),
  body('categories').optional().isArray(),
  async (req, res) => {
    if (validate(req, res)) return;
    const { cityName, categories = FITNESS_CATEGORIES } = req.body;
    const jobId = uuidv4();
    try {
      await CrawlJob.create({ jobId, type: 'city', input: { cityName, categories }, status: 'queued' });
      await addCityJob(jobId, cityName, categories);
      ok(res, { message: `City crawl queued for "${cityName}"`, jobId, categoryCount: categories.length, trackAt: `/api/crawl/status/${jobId}` }, 202);
    } catch (e) { logger.error(e.message); err(res, e.message); }
  }
);

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
      ok(res, { message: `Gym crawl queued for "${gymName}"`, jobId, trackAt: `/api/crawl/status/${jobId}` }, 202);
    } catch (e) { logger.error(e.message); err(res, e.message); }
  }
);

// POST /api/crawl/batch
router.post('/batch',
  body('cities').isArray({ min: 1 }),
  body('cities.*').isString().notEmpty(),
  async (req, res) => {
    if (validate(req, res)) return;
    const { cities, categories = FITNESS_CATEGORIES } = req.body;
    const jobs = [];
    try {
      for (const cityName of cities) {
        const jobId = uuidv4();
        await CrawlJob.create({ jobId, type: 'city', input: { cityName, categories }, status: 'queued' });
        await addCityJob(jobId, cityName, categories);
        jobs.push({ cityName, jobId });
      }
      ok(res, { message: `${cities.length} cities queued`, jobs }, 202);
    } catch (e) { logger.error(e.message); err(res, e.message); }
  }
);

// GET /api/crawl/status/:jobId
router.get('/status/:jobId', async (req, res) => {
  try {
    const db   = await CrawlJob.findOne({ jobId: req.params.jobId }).lean();
    if (!db) return err(res, 'Job not found', 404);
    const queueJob = await getQueueJobStatus(req.params.jobId);
    ok(res, { job: { ...db, queueJob } });
  } catch (e) { err(res, e.message); }
});

// GET /api/crawl/jobs
router.get('/jobs',
  query('status').optional().isIn(['queued','running','completed','failed','partial']),
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

// GET /api/crawl/queue/stats
router.get('/queue/stats', async (req, res) => {
  try { ok(res, { queue: await getQueueStats() }); }
  catch (e) { err(res, e.message); }
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
