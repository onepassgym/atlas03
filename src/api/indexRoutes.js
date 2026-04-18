'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const cfg = require('../../config');

// Base properties to avoid reading config again if not needed
const SERVER_PORT = cfg.server?.port || process.env.PORT || 3000;

// Root documentation
router.get('/', (_, res) => {
  let lastUpdate;
  try {
    const serverPath = path.resolve(__dirname, '../server.js');
    lastUpdate = fs.statSync(serverPath).mtime;
  } catch (e) {
    lastUpdate = new Date();
  }
  const formattedUpdate = lastUpdate.toISOString().replace('T', ' ').split('.')[0];

  return res.json({
    service: '🏋️ Atlas05 Scraper API',
    version: '1.0.0',
    port: SERVER_PORT,
    lastCodeUpdate: formattedUpdate,
    endpoints: {
      'POST /api/crawl/city':          'Start a city crawl',
      'POST /api/crawl/gym':           'Crawl by gym name',
      'POST /api/crawl/batch':         'Queue multiple cities',
      'POST /api/crawl/retry/failed':  'Re-queue failed/partial jobs',
      'POST /api/crawl/retry/incomplete': 'Re-queue gyms below completeness threshold',
      'GET  /api/crawl/status/:jobId': 'Job status',
      'GET  /api/crawl/jobs':          'All jobs',
      'GET  /api/crawl/queue/stats':   'Bull queue stats',
      'GET  /api/crawl/categories':    'Fitness categories',
      'GET  /api/gyms':                'List/filter gyms',
      'GET  /api/gyms/nearby':         'Gyms near lat/lng',
      'GET  /api/gyms/stats':          'DB statistics',
      'GET  /api/gyms/export':         'Export all gyms as JSON',
      'GET  /api/gyms/:id':            'Full gym detail',
      'PATCH /api/gyms/:id':           'Update platform fields',
      'GET  /api/system/schedule':     'View scheduled run cities',
      'POST /api/system/schedule':     'Update scheduled run cities',
      'GET  /api/system/logs':         'List/view all log files',
      'GET  /api/system/logs/latest':  'Tail latest app log',
    },
  });
});

// Health check
router.get('/health', (_, res) => res.json({
  status:  'ok',
  service: 'Atlas05 Scraper',
  version: '1.0.0',
  uptime:  process.uptime(),
  ts:      new Date(),
  port:    SERVER_PORT,
}));

module.exports = router;
