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
    concurrency: parseInt(process.env.SCRAPER_CONCURRENCY || '3', 10),
    delayMin:    parseInt(process.env.SCRAPER_DELAY_MIN   || '300',  10),
    delayMax:    parseInt(process.env.SCRAPER_DELAY_MAX   || '800', 10),
    timeout:     parseInt(process.env.SCRAPER_TIMEOUT     || '30000', 10),
    maxRetries:  parseInt(process.env.SCRAPER_MAX_RETRIES || '3', 10),
    headless:    process.env.SCRAPER_HEADLESS !== 'false',
    // Phase 2: parallel browser pages for gym detail scraping
    pagePool:       parseInt(process.env.SCRAPER_PAGE_POOL        || '6', 10),
    // Phase 6: parallel pages for category search phase
    searchPool:     parseInt(process.env.SCRAPER_SEARCH_POOL      || '3', 10),
    // Phase 7: skip gyms crawled within N days (0 = disabled)
    skipRecentDays: parseInt(process.env.SCRAPER_SKIP_RECENT_DAYS || '7', 10),
    // Phase 9: URLs per batch-scrape job
    batchSize:      parseInt(process.env.SCRAPER_BATCH_SIZE       || '15', 10),
    // Phase 1c / Phase 4: depth caps per standard-mode scrape
    maxReviews:  parseInt(process.env.SCRAPER_MAX_REVIEWS || '30', 10),
    maxPhotos:   parseInt(process.env.SCRAPER_MAX_PHOTOS  || '20', 10),
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
