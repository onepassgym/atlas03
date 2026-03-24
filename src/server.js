'use strict';
require('dotenv').config();

const express     = require('express');
const helmet      = require('helmet');
const cors        = require('cors');
const morgan      = require('morgan');
const compression = require('compression');
const rateLimit   = require('express-rate-limit');
const cron        = require('node-cron');
const path        = require('path');
const fs          = require('fs');
const { v4: uuidv4 } = require('uuid');

const { connectDB }   = require('./db/connection');
const crawlRoutes     = require('./api/crawlRoutes');
const gymRoutes       = require('./api/gymRoutes');
const systemRoutes    = require('./api/systemRoutes');
const { addCityJob }  = require('./queue/queues');
const CrawlJob        = require('./db/crawlJobModel');
const cfg             = require('../config');
const logger          = require('./utils/logger');
const { FITNESS_CATEGORIES } = require('./scraper/googleMapsScraper');

const app = express();
app.set('trust proxy', 1); // Enable trusting proxy headers for rate limiting


// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined', { stream: { write: m => logger.info(m.trim()) } }));

// ── Rate limit ────────────────────────────────────────────────────────────────
app.use('/api', rateLimit({
  windowMs: cfg.rateLimit.windowMs,
  max:      cfg.rateLimit.max,
  standardHeaders: true,
  legacyHeaders:   false,
}));

// ── Static media ──────────────────────────────────────────────────────────────
const mediaPath = path.resolve(cfg.media.basePath);
fs.mkdirSync(mediaPath, { recursive: true });
app.use('/media', express.static(mediaPath, { maxAge: '7d' }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/crawl',  crawlRoutes);
app.use('/api/gyms',   gymRoutes);
app.use('/api/system', systemRoutes);

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({
  status:  'ok',
  service: 'Atlas05 Scraper',
  version: '1.0.0',
  uptime:  process.uptime(),
  ts:      new Date(),
  port:    cfg.server.port,
}));

// ── Root docs ─────────────────────────────────────────────────────────────────
app.get('/', (_, res) => res.json({
  service: '🏋️ Atlas05 Scraper API',
  version: '1.0.0',
  port:    cfg.server.port,
  endpoints: {
    'POST /api/crawl/city':          'Start a city crawl',
    'POST /api/crawl/gym':           'Crawl by gym name',
    'POST /api/crawl/batch':         'Queue multiple cities',
    'GET  /api/crawl/status/:jobId': 'Job status',
    'GET  /api/crawl/jobs':          'All jobs',
    'GET  /api/crawl/queue/stats':   'Bull queue stats',
    'GET  /api/crawl/categories':    'Fitness categories',
    'GET  /api/gyms':                'List/filter gyms',
    'GET  /api/gyms/nearby':         'Gyms near lat/lng',
    'GET  /api/gyms/stats':          'DB statistics',
    'GET  /api/gyms/:id':            'Full gym detail',
    'PATCH /api/gyms/:id':           'Update platform fields',
    'GET  /api/system/logs':         'List/view all log files',
    'GET  /api/system/logs/latest':  'Tail latest app log'
  },
}));

// ── Error handlers ────────────────────────────────────────────────────────────
app.use((req, res) =>
  res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.path}` })
);
app.use((err, req, res, _next) => {
  logger.error('Unhandled:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ── NCR Scheduled Crawl ───────────────────────────────────────────────────────
// Cities: Delhi, Ghaziabad, Gurugram, Noida
// Schedule: every Sunday at 02:00 AM IST (20:30 UTC Saturday)
// Re-crawls all 4 cities weekly to catch new gyms + update existing data

const NCR_CITIES = [
  'Delhi, India',
  'Ghaziabad, Uttar Pradesh, India',
  'Gurugram, Haryana, India',
  'Noida, Uttar Pradesh, India',
];

async function scheduleNCRCrawl(reason = 'scheduled') {
  logger.info(`\n📅 NCR crawl triggered [${reason}] — queuing ${NCR_CITIES.length} cities`);
  for (const cityName of NCR_CITIES) {
    const jobId = uuidv4();
    try {
      await CrawlJob.create({
        jobId,
        type:   'city',
        input:  { cityName, categories: FITNESS_CATEGORIES },
        status: 'queued',
      });
      await addCityJob(jobId, cityName, FITNESS_CATEGORIES);
      logger.info(`  ✅ Queued: ${cityName} → jobId: ${jobId}`);
    } catch (err) {
      logger.error(`  ❌ Failed to queue ${cityName}: ${err.message}`);
    }
  }
  logger.info(`📅 NCR crawl batch queued.\n`);
}

function startScheduler() {
  // Every Sunday at 02:00 AM IST = 20:30 UTC on Saturday
  // Cron: 30 20 * * 6  (min hour day month weekday)
  cron.schedule('30 20 * * 6', async () => {
    await scheduleNCRCrawl('weekly-cron');
  }, {
    timezone: 'UTC',
  });

  logger.info('⏰ Scheduler started — NCR cities crawl: every Sunday 02:00 AM IST');
}

// ── Startup ───────────────────────────────────────────────────────────────────
(async () => {
  await connectDB();

  app.listen(cfg.server.port, async () => {
    logger.info(`\n${'─'.repeat(50)}`);
    logger.info(`🚀 Atlas05 API    →  http://localhost:${cfg.server.port}`);
    logger.info(`📦 Media files       →  http://localhost:${cfg.server.port}/media`);
    logger.info(`📋 API docs          →  http://localhost:${cfg.server.port}/`);
    logger.info(`${'─'.repeat(50)}\n`);

    // Start the weekly scheduler
    startScheduler();
  });
})();

module.exports = app;
