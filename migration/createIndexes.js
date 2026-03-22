'use strict';
const { connectDB, disconnectDB } = require('../src/db/connection');
const mongoose = require('mongoose');

async function createIndexes() {
  await connectDB();
  const db = mongoose.connection.db;
  console.log('Creating migration indexes...');

  await db.collection('gym_reviews').createIndex({ gymId: 1 });
  await db.collection('gym_reviews').createIndex({ reviewId: 1 }, { unique: true });
  
  await db.collection('gym_photos').createIndex({ gymId: 1 });
  await db.collection('gym_photos').createIndex({ publicUrl: 1 }, { unique: true });
  
  await db.collection('gym_crawl_meta').createIndex({ gymId: 1 }, { unique: true });
  await db.collection('gym_crawl_meta').createIndex({ jobId: 1 });
  
  await db.collection('gym_categories').createIndex({ slug: 1 }, { unique: true });
  await db.collection('gym_place_types').createIndex({ slug: 1 }, { unique: true });
  await db.collection('gym_amenities').createIndex({ slug: 1 }, { unique: true });
  
  await db.collection('gyms').createIndex({ parsed: 1 });
  await db.collection('gyms').createIndex({ slug: 1 }, { unique: true });

  console.log('Indexes created successfully.');
  await disconnectDB();
}

if (require.main === module) {
  createIndexes().catch(console.error).finally(() => process.exit(0));
}

module.exports = createIndexes;
