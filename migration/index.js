'use strict';
const cron = require('node-cron');
const { connectDB, disconnectDB } = require('../src/db/connection');
const mongoose = require('mongoose');
const migrateGym = require('./migrateGym');

const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 2000;
const OP_DELAY_MS = 100;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runMigration() {
  console.log(`[${new Date().toISOString()}] Starting daily gym migration...`);
  await connectDB();
  const db = mongoose.connection.db;

  let skip = 0;
  let totalProcessed = 0;
  let succeeded = 0;
  let failed = 0;
  const startTime = Date.now();

  while (true) {
    try {
      const batch = await db.collection('gyms')
        .find({ parsed: { $ne: true } })
        .limit(BATCH_SIZE)
        .skip(skip)
        .toArray();

      if (batch.length === 0) break;

      console.log(`Processing batch of ${batch.length} gyms (skip: ${skip})...`);

      for (const gym of batch) {
        await migrateGym(gym);
        
        const log = await db.collection('gym_migration_logs').findOne({ gymId: gym._id }, { sort: { processedAt: -1 } });
        if (log && log.status === 'success') {
          succeeded++;
        } else {
          failed++;
        }
        totalProcessed++;

        await sleep(OP_DELAY_MS);
      }

      // Wait, since 'failed' is a running total of ALL failed records across all batches,
      // and those failed records remain parsed=false (at the front of the cursor),
      // we just need to skip exactly the number of currently failed records.
      skip = failed;
      
      await sleep(BATCH_DELAY_MS);
    } catch (err) {
      console.error('Batch error:', err);
      break;
    }
  }

  const durationStr = `${((Date.now() - startTime) / 1000).toFixed(2)}s`;
  console.log(`[${new Date().toISOString()}] Migration completed!`);
  console.log(`Summary: { totalProcessed: ${totalProcessed}, succeeded: ${succeeded}, failed: ${failed}, duration: ${durationStr} }`);
}

// Ensure the process stays alive and cron runs daily at 12:01 AM
if (require.main === module) {
  // Check if run directly with runNow() equivalent e.g., node -e "require('./migration/index.js').runNow()"
  // That is handled by exporting runNow and executing it.
  
  // If run via `node migration/index.js`, we start the cron job.
  cron.schedule('1 0 * * *', async () => {
    await runMigration();
  });
  console.log('⏰ Scheduled migration to run daily at 12:01 AM');
}

module.exports = {
  runNow: async () => {
    await runMigration();
    await disconnectDB();
  }
};
