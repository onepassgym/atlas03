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
  // Task 7: enrichment-specific indexes
  await photos.createIndex({ gymId: 1, sourceType: 1 }, { name: 'photos_gymId_sourceType' });
  await photos.createIndex({ downloaded: 1, gymId: 1 }, { name: 'photos_downloaded_gymId' });
  // Supports upsertCapturedPhotoUrls filter: { originalUrl, gymId }
  await photos.createIndex({ originalUrl: 1, gymId: 1 }, { sparse: true, name: 'photos_originalUrl_gymId' });

  // ── gym_crawl_meta ────────────────────────────────────────────────────────
  const crawlMeta = db.collection('gym_crawl_meta');
  await crawlMeta.createIndex({ gymId: 1 },  { unique: true, name: 'crawlMeta_gymId_unique' });
  await crawlMeta.createIndex({ jobId: 1 },  { name: 'crawlMeta_jobId' });

  // ── gym_crawl_jobs ────────────────────────────────────────────────────────
  // TD-08 fix: this was the only modelled collection missing from ensureIndexes.
  const crawlJobs = db.collection('gym_crawl_jobs');
  await crawlJobs.createIndex({ jobId: 1 },              { unique: true,  name: 'crawlJobs_jobId_unique' });
  await crawlJobs.createIndex({ status: 1, createdAt: -1 }, { name: 'crawlJobs_status_createdAt' });
  await crawlJobs.createIndex({ createdAt: -1 },         { name: 'crawlJobs_createdAt' });
  // Supports hasActiveJob() dedup query: filter by cityName + status in ['queued','running']
  await crawlJobs.createIndex({ 'input.cityName': 1, status: 1 }, { name: 'crawlJobs_cityName_status' });

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

  // ── enrichment-specific gyms indexes (Task 7) ────────────────────────────
  // Supports dashboard query: list gyms by city that need re-enrichment
  await gyms.createIndex(
    { 'atlas06.city': 1, 'operationalData.lastHoursVerifiedAt': 1 },
    { sparse: true, name: 'gyms_city_lastHoursVerifiedAt' }
  );
  // Supports enrichment targeting by areaName + enrichment status
  await gyms.createIndex(
    { areaName: 1, 'enrichmentMeta.status': 1 },
    { name: 'gyms_areaName_enrichmentStatus' }
  );

  // ── opgId indexes (Task 3) ────────────────────────────────────────────────
  // gyms: unique+sparse allows safe backfill without blocking existing docs
  await db.collection('gyms').createIndex(
    { opgId: 1 }, { unique: true, sparse: true, name: 'opgId_unique' }
  );
  await db.collection('gym_reviews').createIndex(
    { opgId: 1 }, { name: 'opgId_idx' }
  );
  await db.collection('gym_photos').createIndex(
    { opgId: 1 }, { name: 'opgId_idx' }
  );
  await db.collection('gym_crawl_meta').createIndex(
    { opgId: 1 }, { name: 'opgId_idx' }
  );
  await db.collection('gymChangeLogs').createIndex(
    { opgId: 1 }, { name: 'opgId_idx' }
  );
  await db.collection('gym_crawl_jobs').createIndex(
    { opgId: 1 }, { name: 'opgId_idx' }
  );

  logger.info('✅ DB indexes verified/created (all collections)');
}

module.exports = { ensureIndexes };
