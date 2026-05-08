'use strict';
const mongoose = require('mongoose');
const { connectDB } = require('../src/db/connection');
const Gym = require('../src/db/gymModel');
const { Review } = require('../src/db/reviewModel');
const Photo = require('../src/db/photoModel');
const CrawlMeta = require('../src/db/crawlMetaModel');
const GymChangeLog = require('../src/db/gymChangeLogModel');
const CrawlJob = require('../src/db/crawlJobModel');
const { generateUniqueOpgId } = require('../src/utils/opgId');
const logger = require('../src/utils/logger');

async function run() {
  await connectDB();
  const total = await Gym.countDocuments({ opgId: { $exists: false } });
  logger.info('OPG ID Migration started. Pending: ' + total);
  if (total === 0) {
    logger.info('All gyms already have opgId. Nothing to do.');
    await mongoose.disconnect();
    process.exit(0);
  }
  const cursor = Gym
    .find({ opgId: { $exists: false } })
    .select('_id name')
    .lean()
    .cursor();
  let processed = 0, assigned = 0, errors = 0;
  const errorLog = [];
  for await (const gym of cursor) {
    try {
      const opgId = await generateUniqueOpgId(Gym);
      await Promise.all([
        Gym.updateOne({ _id: gym._id }, { $set: { opgId } }),
        Review.updateMany({ gymId: gym._id }, { $set: { opgId } }),
        Photo.updateMany({ gymId: gym._id }, { $set: { opgId } }),
        CrawlMeta.updateOne({ gymId: gym._id }, { $set: { opgId } }),
        GymChangeLog.updateMany({ gymId: gym._id }, { $set: { opgId } }),
        CrawlJob.updateMany({ gymIds: gym._id }, { $set: { opgId } })
      ]);
      assigned++;
    } catch (e) {
      const msg = '[' + gym._id + '] ' + gym.name + ': ' + e.message;
      logger.error(msg);
      errorLog.push(msg);
      errors++;
    }
    processed++;
    if (processed % 50 === 0) {
      logger.info('Progress: ' + processed + '/' + total + ' (' + Math.round(processed/total*100) + '%)');
    }
  }
  logger.info('Total: ' + total + ' | Assigned: ' + assigned + ' | Errors: ' + errors);
  if (errorLog.length) errorLog.forEach(e => logger.error(e));
  await mongoose.disconnect();
  process.exit(errors > 0 ? 1 : 0);
}

run().catch(e => {
  logger.error('Migration failed: ' + e.message);
  process.exit(1);
});
