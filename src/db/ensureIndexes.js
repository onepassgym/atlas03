'use strict';
/**
 * ensureIndexes.js
 *
 * Consolidates ALL index creation across every collection.
 * Called once after MongoDB connects.
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
  // Dedup tier 5: phone lookup — avoids COLLSCAN on regex phone match
  await gyms.createIndex({ 'contact.phone': 1 }, { sparse: true, name: 'contact_phone_sparse' });
  // Suggestions / filter indexes — avoids COLLSCAN on areaName and chainName
  await gyms.createIndex({ areaName: 1 },        { name: 'areaName_1' });
  await gyms.createIndex({ chainName: 1 },       { sparse: true, name: 'chainName_sparse' });

  // ── reviews ───────────────────────────────────────────────────────────────
  const reviews = db.collection('gym_reviews');
  await reviews.createIndex({ gymId: 1 },    { name: 'reviews_gymId' });
  await reviews.createIndex({ reviewId: 1 }, { unique: true, name: 'reviewId_unique' });

  // ── gymChangeLogs ─────────────────────────────────────────────────────────
  const logs = db.collection('gymChangeLogs');
  await logs.createIndex({ gymId: 1 },    { name: 'changeLogs_gymId' });
  await logs.createIndex({ changedAt: -1 }, { name: 'changeLogs_changedAt' });

  // ── gym_photos ────────────────────────────────────────────────────────────
  const photos = db.collection('gym_photos');
  await photos.createIndex({ gymId: 1 },           { name: 'photos_gymId' });
  await photos.createIndex({ publicUrl: 1 },       { unique: true, sparse: true, name: 'photos_publicUrl_unique' });
  await photos.createIndex({ gymId: 1, type: 1 },  { name: 'photos_gymId_type' });
  await photos.createIndex({ gymId: 1, createdAt: -1 }, { name: 'photos_gymId_createdAt' });
  await photos.createIndex({ type: 1, createdAt: -1 },  { name: 'photos_type_createdAt' });
  await photos.createIndex({ createdAt: -1 },       { name: 'photos_createdAt' });
  await photos.createIndex({ sizeBytes: -1 },       { name: 'photos_sizeBytes' });
  await photos.createIndex({ appealScore: -1 },     { name: 'photos_appealScore' });
  await photos.createIndex({ folder: 1 },           { name: 'photos_folder' });
  await photos.createIndex({ fsExists: 1 },         { name: 'photos_fsExists' });
  await photos.createIndex({ tags: 1 },             { name: 'photos_tags' });
  // Missing indexes identified in audit:
  await photos.createIndex({ isOrphaned: 1 },       { name: 'photos_isOrphaned' });
  await photos.createIndex({ fsExists: 1, gymId: 1 }, { name: 'photos_fsExists_gymId' });
  await photos.createIndex({ gymId: 1 }, { name: 'photos_unlinked_partial', partialFilterExpression: { gymId: null } });

  // ── gym_crawl_meta ────────────────────────────────────────────────────────
  const crawlMeta = db.collection('gym_crawl_meta');
  await crawlMeta.createIndex({ gymId: 1 },  { unique: true, name: 'crawlMeta_gymId_unique' });
  await crawlMeta.createIndex({ jobId: 1 },  { name: 'crawlMeta_jobId' });

  // ── gym_categories ────────────────────────────────────────────────────────
  const categories = db.collection('gym_categories');
  await categories.createIndex({ slug: 1 },  { unique: true, name: 'categories_slug_unique' });

  // ── gym_amenities ─────────────────────────────────────────────────────────
  const amenities = db.collection('gym_amenities');
  await amenities.createIndex({ slug: 1 },   { unique: true, name: 'amenities_slug_unique' });

  // ── gym_place_types ───────────────────────────────────────────────────────
  const placeTypes = db.collection('gym_place_types');
  await placeTypes.createIndex({ slug: 1 },  { unique: true, name: 'placeTypes_slug_unique' });

  // ── photo_sync_state ──────────────────────────────────────────────────────
  const syncState = db.collection('photo_sync_state');
  await syncState.createIndex({ key: 1 },    { unique: true, name: 'syncState_key_unique' });

  // ── system_states ─────────────────────────────────────────────────────────
  const systemStates = db.collection('system_states');
  await systemStates.createIndex({ key: 1 }, { unique: true, name: 'systemStates_key_unique' });

  logger.info('✅ DB indexes verified/created (all collections)');
}

module.exports = { ensureIndexes };
