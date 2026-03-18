'use strict';
require('dotenv').config();

module.exports = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    env:  process.env.NODE_ENV || 'development',
  },
  mongo: {
    uri:    process.env.MONGODB_URI     || 'mongodb://127.0.0.1:27017/atlas05',
    dbName: process.env.MONGODB_DB_NAME || 'atlas05',
  },
  redis: {
    host:     process.env.REDIS_HOST     || '127.0.0.1',
    port:     parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  scraper: {
    concurrency: parseInt(process.env.SCRAPER_CONCURRENCY || '2', 10),
    delayMin:    parseInt(process.env.SCRAPER_DELAY_MIN   || '1500', 10),
    delayMax:    parseInt(process.env.SCRAPER_DELAY_MAX   || '4000', 10),
    timeout:     parseInt(process.env.SCRAPER_TIMEOUT     || '30000', 10),
    maxRetries:  parseInt(process.env.SCRAPER_MAX_RETRIES || '3', 10),
    headless:    process.env.SCRAPER_HEADLESS !== 'false',
    userAgent:   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  },
  media: {
    basePath: process.env.MEDIA_BASE_PATH || './media',
    baseUrl:  process.env.MEDIA_BASE_URL  || 'http://localhost:3000/media',
  },
  dedup: {
    radiusMeters: parseInt(process.env.DEDUP_RADIUS_METERS || '50', 10),
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    max:      parseInt(process.env.RATE_LIMIT_MAX        || '100', 10),
  },
  log: {
    level: process.env.LOG_LEVEL || 'info',
    dir:   process.env.LOG_DIR   || './logs',
  },
};
