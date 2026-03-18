'use strict';
/**
 * Usage:
 *   node scripts/queueCities.js --file scripts/cities-india.json
 *   node scripts/queueCities.js --cities "Mumbai,Delhi,Bangalore"
 */
require('dotenv').config();
const fs     = require('fs');
const { v4: uuidv4 } = require('uuid');
const { connectDB, disconnectDB } = require('../src/db/connection');
const { addCityJob } = require('../src/queue/queues');
const CrawlJob = require('../src/db/crawlJobModel');
const { FITNESS_CATEGORIES } = require('../src/scraper/googleMapsScraper');
const logger = require('../src/utils/logger');

async function main() {
  await connectDB();

  const args = process.argv.slice(2);
  let list   = [];

  const fi = args.indexOf('--file');
  const ci = args.indexOf('--cities');

  if (fi !== -1 && args[fi + 1]) {
    list = JSON.parse(fs.readFileSync(args[fi + 1], 'utf-8'));
  } else if (ci !== -1 && args[ci + 1]) {
    list = args[ci + 1].split(',').map(c => ({ city: c.trim() }));
  } else {
    console.error('Usage:');
    console.error('  node scripts/queueCities.js --file scripts/cities-india.json');
    console.error('  node scripts/queueCities.js --cities "Mumbai,Delhi,Bangalore"');
    process.exit(1);
  }

  logger.info(`Queuing ${list.length} cities...`);

  for (const item of list) {
    const cityName   = typeof item === 'string' ? item : item.city;
    const categories = item.categories || FITNESS_CATEGORIES;
    const jobId      = uuidv4();

    await CrawlJob.create({ jobId, type: 'city', input: { cityName, categories }, status: 'queued' });
    await addCityJob(jobId, cityName, categories);
    logger.info(`  ✅ Queued: ${cityName} (${categories.length} categories)`);
  }

  logger.info(`\nAll ${list.length} cities queued.`);
  await disconnectDB();
  setTimeout(() => process.exit(0), 500);
}

main().catch(e => { console.error(e); process.exit(1); });
