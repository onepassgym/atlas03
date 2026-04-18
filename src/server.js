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
const indexRoutes     = require('./api/indexRoutes');
const crawlRoutes     = require('./api/crawlRoutes');
const gymRoutes       = require('./api/gymRoutes');
const systemRoutes    = require('./api/systemRoutes');
const { startScheduler } = require('./services/schedulerService');
const bus             = require('./services/eventBus');
const { startWebhookService } = require('./services/webhookService');
const cfg             = require('../config');
const logger          = require('./utils/logger');
const authMiddleware  = require('./middleware/auth');
const swaggerUi       = require('swagger-ui-express');
const swaggerSpec     = require('./config/swagger');

const app = express();
app.set('trust proxy', 1); // Enable trusting proxy headers for rate limiting


// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,  // Disabled: dashboard is a single-file internal tool
}));
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined', { 
  stream: { write: m => logger.info(m.trim()) },
  skip: (req) => req.path === '/api/events'
}));

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
app.use('/',           indexRoutes);
app.use('/api-docs',   swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Base API authentication
app.use('/api',        authMiddleware);

app.use('/api/crawl',  crawlRoutes);
app.use('/api/gyms',   gymRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/events', require('./api/eventRoutes'));

// ── Static files + Dashboard ──────────────────────────────────────────────────
app.use('/public', express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));
app.get('/dashboard', async (_, res) => {
  try {
    const htmlPath = path.join(__dirname, 'public', 'dashboard.html');
    let html = await fs.promises.readFile(htmlPath, 'utf8');
    html = html.replace('__SERVER_ENV__', cfg.server.env);
    res.send(html);
  } catch (err) {
    res.status(500).send('Error loading dashboard');
  }
});

// ── Error handlers ────────────────────────────────────────────────────────────
app.use((req, res) =>
  res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.path}` })
);
app.use((err, req, res, _next) => {
  logger.error('Unhandled:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ── Startup ───────────────────────────────────────────────────────────────────
(async () => {
  await connectDB();

  app.listen(cfg.server.port, async () => {
    logger.info(`\n${'─'.repeat(50)}`);
    logger.info(`🚀 Atlas05 API    →  http://localhost:${cfg.server.port}`);
    logger.info(`📦 Media files       →  http://localhost:${cfg.server.port}/media`);
    logger.info(`📋 API docs          →  http://localhost:${cfg.server.port}/api-docs`);
    logger.info(`📊 Dashboard         →  http://localhost:${cfg.server.port}/dashboard`);
    logger.info(`📡 SSE events        →  http://localhost:${cfg.server.port}/api/events`);
    logger.info(`${'─'.repeat(50)}\n`);

    // Start services
    startScheduler();
    startWebhookService();
    bus.publish('system:startup', { port: cfg.server.port, env: cfg.server.env });
  });
})();

module.exports = app;
