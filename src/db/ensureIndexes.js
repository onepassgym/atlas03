'use strict';
/**
 * ensureIndexes.js
 *
 * Creates all required indexes across the `gyms`, `reviews`, and
 * `gymChangeLogs` collections.  Called once after MongoDB connects.
 * Uses the native MongoDB driver (mongoose.connection.db) so that we can
 * pass the full options object without Mongoose interfering.
 */
const mongoose = require('mongoose');
const logger   = require('../utils/logger');

async function ensureIndexes() {
  const db = mongoose.connection.db;

  // ── gyms ──────────────────────────────────────────────────────────────────
  const gyms = db.collection('gyms');
  await gyms.createIndex({ slug: 1 },           { unique: true, sparse: true, name: 'slug_unique' });
  await gyms.createIndex({ googleMapsUrl: 1 },  { name: 'googleMapsUrl_1' });
  await gyms.createIndex({ placeId: 1 },        { sparse: true, name: 'placeId_sparse' });
  await gyms.createIndex({ location: '2dsphere' }, { sparse: true, name: 'location_2dsphere' });

  // ── reviews ───────────────────────────────────────────────────────────────
  const reviews = db.collection('reviews');
  await reviews.createIndex({ gymId: 1 },    { name: 'reviews_gymId' });
  await reviews.createIndex({ reviewId: 1 }, { unique: true, name: 'reviewId_unique' });

  // ── gymChangeLogs ─────────────────────────────────────────────────────────
  const logs = db.collection('gymChangeLogs');
  await logs.createIndex({ gymId: 1 },    { name: 'changeLogs_gymId' });
  await logs.createIndex({ changedAt: -1 }, { name: 'changeLogs_changedAt' });

  logger.info('✅ DB indexes verified/created (gyms, reviews, gymChangeLogs)');
}

module.exports = { ensureIndexes };
