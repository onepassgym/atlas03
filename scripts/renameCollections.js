'use strict';
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../src/db/connection');

async function renameCollections() {
  await connectDB();
  const db = mongoose.connection.db;

  const mapping = {
    'categories': 'gym_categories',
    'amenities': 'gym_amenities',
    'place_types': 'gym_place_types',
    'migration_logs': 'gym_migration_logs',
    'crawl_jobs': 'gym_crawl_jobs',
    'reviews': 'gym_reviews'
  };

  const existingCollections = await db.listCollections().toArray();
  const existingNames = existingCollections.map(c => c.name);

  for (const [oldName, newName] of Object.entries(mapping)) {
    if (existingNames.includes(oldName)) {
      if (existingNames.includes(newName)) {
        console.log(`⚠️  Cannot rename '${oldName}' to '${newName}': Target already exists.`);
      } else {
        try {
          await db.collection(oldName).rename(newName);
          console.log(`✅ Renamed collection '${oldName}' -> '${newName}'`);
        } catch (err) {
          console.error(`❌ Failed to rename '${oldName}':`, err.message);
        }
      }
    } else {
      console.log(`ℹ️  Collection '${oldName}' does not exist, skipping.`);
    }
  }

  await disconnectDB();
}

if (require.main === module) {
  renameCollections().catch(console.error).finally(() => process.exit(0));
}

module.exports = renameCollections;
