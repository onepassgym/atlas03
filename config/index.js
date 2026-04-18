'use strict';
require('dotenv').config();

const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production' || env === 'prod';

/**
 * Helper to pick env variable with fallback to DEV/PROD specific versions
 */
function getEnv(key, defaultValue) {
  const specificKey = isProd ? `PROD_${key}` : `DEV_${key}`;
  return process.env[key] || process.env[specificKey] || defaultValue;
}

module.exports = {
  server: {
    port: parseInt(process.env.PORT || '8747', 10),
    env:  env,
  },
  auth: {
    apiKeys: (process.env.API_KEYS || 'atlas_dev_secret').split(',').map(k => k.trim()).filter(Boolean),
  },
  mongo: {
    uri:    getEnv('MONGODB_URI', isProd ? 'mongodb://mongo:27017/atlas06' : 'mongodb://127.0.0.1:27328/atlas06'),
    dbName: process.env.MONGODB_DB_NAME || 'atlas06',
  },
  redis: {
    host:     getEnv('REDIS_HOST', isProd ? 'redis' : '127.0.0.1'),
    port:     parseInt(getEnv('REDIS_PORT', isProd ? '6379' : '6847'), 10),
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
    baseUrl:  getEnv('MEDIA_BASE_URL', isProd ? 'https://atlas.onepassgym.com/media' : `http://localhost:${process.env.PORT || '8747'}/media`),
  },
  dedup: {
    radiusMeters: parseInt(process.env.DEDUP_RADIUS_METERS || '50', 10),
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    max:      parseInt(process.env.RATE_LIMIT_MAX        || '100', 10),
  },
  log: {
    level: process.env.LOG_LEVEL || (isProd ? 'warn' : 'info'),
    dir:   process.env.LOG_DIR   || './logs',
  },
};
