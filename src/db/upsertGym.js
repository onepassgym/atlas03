'use strict';
/**
 * upsertGym.js
 *
 * Exports:
 *   upsertGym(crawledData)       → { action, gymId, newReviews, changedFields }
 *   upsertManyGyms(gymsArray)    → summary stats object
 *
 * Lookup order for duplicates:
 *   1. slug  (if present)
 *   2. googleMapsUrl
 *   3. placeId
 *
 * On INSERT  — creates gym + inserts reviews into separate collection.
 * On UPDATE  — merges reviews, diffs tracked fields, overwrites safe fields,
 *              partially updates crawlMeta, never touches firstCrawledAt.
 * On SKIP    — nothing changed, nothing written.
 */

const Gym          = require('./gymModel');
const { Review, buildReviewDocs } = require('./reviewModel');
const GymChangeLog = require('./gymChangeLogModel');
const logger       = require('../utils/logger');

// ── Fields that we always overwrite with fresh crawl data ─────────────────────
const SAFE_OVERWRITE_FIELDS = [
  'rating', 'ratingBreakdown', 'openingHours', 'isOpenNow',
  'coverPhoto', 'photos', 'totalPhotos', 'description', 'priceLevel',
  'amenities', 'highlights', 'offerings', 'serviceOptions', 'accessibility',
  'permanentlyClosed', 'temporarilyClosed', 'claimedByOwner',
  'categories', 'primaryType', 'types', 'lat', 'lng',
];

// ── Fields we diff and log changes for ───────────────────────────────────────
const TRACKED_FIELDS = ['name', 'address'];
// contact is handled separately (sub-object)

// ── Deep equality check (good enough for our field types) ─────────────────────
function equal(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ── Build GeoJSON location from lat/lng ───────────────────────────────────────
function buildLocation(lat, lng) {
  if (lat != null && lng != null) {
    return { type: 'Point', coordinates: [lng, lat] };
  }
  return undefined;
}

// ── Find existing gym by slug → googleMapsUrl → placeId ──────────────────────
async function findExistingGym(crawledData) {
  const { slug, googleMapsUrl, placeId } = crawledData;

  if (slug) {
    const found = await Gym.findOne({ slug }).lean();
    if (found) return found;
  }

  if (googleMapsUrl) {
    const found = await Gym.findOne({ googleMapsUrl }).lean();
    if (found) return found;
  }

  if (placeId) {
    const found = await Gym.findOne({ placeId }).lean();
    if (found) return found;
  }

  return null;
}

// ── Insert reviews (separate collection) for a gym ───────────────────────────
async function insertReviews(gymId, rawReviews = []) {
  if (!rawReviews.length) return 0;

  const docs = buildReviewDocs(gymId, rawReviews);
  if (!docs.length) return 0;

  try {
    const res = await Review.insertMany(docs, { ordered: false });
    return res.length;
  } catch (err) {
    // ordered:false → some succeeded despite duplicate key errors
    if (err.code === 11000 || err.name === 'BulkWriteError') {
      return err.result?.nInserted || 0;
    }
    throw err;
  }
}

// ── Merge new reviews into existing gym (dedup by reviewId) ──────────────────
async function mergeReviews(gymId, rawReviews = []) {
  if (!rawReviews.length) return 0;

  // Fetch ids we already have
  const existing = await Review.find({ gymId }, { reviewId: 1, _id: 0 }).lean();
  const existingIds = new Set(existing.map((r) => r.reviewId));

  const fresh = rawReviews.filter((r) => {
    const id = r.reviewId || r.id;
    return id && !existingIds.has(id);
  });

  if (!fresh.length) return 0;

  const docs = buildReviewDocs(gymId, fresh);
  try {
    const res = await Review.insertMany(docs, { ordered: false });
    return res.length;
  } catch (err) {
    if (err.code === 11000 || err.name === 'BulkWriteError') {
      return err.result?.nInserted || 0;
    }
    throw err;
  }
}

// ── Write changelog entries for changed fields ────────────────────────────────
async function writeChangeLogs(gymId, diffs, now) {
  if (!diffs.length) return;
  const entries = diffs.map(({ field, oldValue, newValue }) => ({
    gymId,
    field,
    oldValue,
    newValue,
    changedAt: now,
    source: 'crawler',
  }));
  await GymChangeLog.insertMany(entries, { ordered: false });
}

// ── Diff tracked fields ───────────────────────────────────────────────────────
function diffTrackedFields(existing, incoming) {
  const diffs = [];

  // Simple top-level fields
  for (const field of TRACKED_FIELDS) {
    const oldVal = existing[field];
    const newVal = incoming[field];
    if (newVal !== undefined && newVal !== null && !equal(oldVal, newVal)) {
      diffs.push({ field, oldValue: oldVal, newValue: newVal });
    }
  }

  // contact sub-fields: phone, email, website
  const contactFields = ['phone', 'email', 'website'];
  for (const cf of contactFields) {
    const oldVal = existing.contact?.[cf];
    const newVal = incoming.contact?.[cf];
    if (newVal !== undefined && newVal !== null && !equal(oldVal, newVal)) {
      diffs.push({ field: `contact.${cf}`, oldValue: oldVal, newValue: newVal });
    }
  }

  return diffs;
}

// ─────────────────────────────────────────────────────────────────────────────
//  PRIMARY EXPORT: upsertGym
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {Object} crawledData  — the structured gym object from gymProcessor
 * @returns {{ action: string, gymId: ObjectId, newReviews: number, changedFields: string[] }}
 */
async function upsertGym(crawledData) {
  const result = {
    action: null,
    gymId: null,
    newReviews: 0,
    changedFields: [],
  };

  try {
    const existing = await findExistingGym(crawledData);
    const now = new Date();

    // ── INSERT path ──────────────────────────────────────────────────────────
    if (!existing) {
      // Add GeoJSON location field if coords available
      if (crawledData.lat != null && crawledData.lng != null) {
        crawledData.location = buildLocation(crawledData.lat, crawledData.lng);
      }

      const gym = await Gym.create(crawledData);
      const newReviewCount = await insertReviews(gym._id, crawledData.reviews);

      logger.info(`[INSERT] "${crawledData.name}" → new gym added`);
      result.action = 'inserted';
      result.gymId = gym._id;
      result.newReviews = newReviewCount;
      return result;
    }

    // ── UPDATE path ──────────────────────────────────────────────────────────
    const gymId = existing._id;
    const $set  = {};

    // 1. Diff tracked fields and write change logs
    const diffs = diffTrackedFields(existing, crawledData);
    if (diffs.length) {
      await writeChangeLogs(gymId, diffs, now);
      diffs.forEach((d) => result.changedFields.push(d.field));
    }

    // 2. Merge reviews (separate collection, no overwrite)
    const newReviewCount = await mergeReviews(gymId, crawledData.reviews);
    result.newReviews = newReviewCount;

    // Recount and update totalReviews on gym doc
    if (newReviewCount > 0) {
      const total = await Review.countDocuments({ gymId });
      $set.totalReviews = total;
    }

    // 3. Safe-overwrite fields — always set from fresh crawl
    for (const field of SAFE_OVERWRITE_FIELDS) {
      const val = crawledData[field];
      if (val !== undefined) {
        $set[field] = val;
      }
    }

    // 4. Also rebuild GeoJSON location from fresh lat/lng
    const location = buildLocation(crawledData.lat, crawledData.lng);
    if (location) $set.location = location;

    // 5. crawlMeta — partial update, NEVER touch firstCrawledAt
    $set['crawlMeta.lastCrawledAt']   = now;
    $set['crawlMeta.crawlStatus']     = crawledData.crawlMeta?.crawlStatus     || 'completed';
    $set['crawlMeta.crawlVersion']    = (existing.crawlMeta?.crawlVersion || 1) + 1;
    $set['crawlMeta.dataCompleteness']= crawledData.crawlMeta?.dataCompleteness
      ?? existing.crawlMeta?.dataCompleteness
      ?? 0;

    // 6. Always set updatedAt
    $set.updatedAt = now;

    // 7. Determine if anything actually changed
    const somethingChanged = diffs.length > 0 || newReviewCount > 0;

    // We always write the safe-overwrite $set (rating, hours, etc. may differ)
    await Gym.findByIdAndUpdate(gymId, { $set }, { new: false });

    if (somethingChanged) {
      logger.info(
        `[UPDATE] "${crawledData.name}" → ${diffs.length} field(s) changed, ${newReviewCount} new review(s) added`
      );
      result.action = 'updated';
    } else {
      logger.info(`[SKIP]   "${crawledData.name}" → already up to date, nothing changed`);
      result.action = 'skipped';
    }

    result.gymId = gymId;
    return result;

  } catch (err) {
    logger.error(`upsertGym error "${crawledData?.name}": ${err.message}`);
    result.action = 'error';
    result.error  = err.message;
    return result;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  BATCH EXPORT: upsertManyGyms
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {Array} gymsArray  — array of structured gym objects
 * @returns {{ inserted, updated, skipped, reviewsAdded, errors }}
 */
async function upsertManyGyms(gymsArray = []) {
  const stats = {
    inserted: 0,
    updated:  0,
    skipped:  0,
    reviewsAdded: 0,
    errors:   0,
  };

  for (const gym of gymsArray) {
    const res = await upsertGym(gym);
    if (res.action === 'inserted') stats.inserted++;
    else if (res.action === 'updated')  stats.updated++;
    else if (res.action === 'skipped')  stats.skipped++;
    else                                stats.errors++;
    stats.reviewsAdded += res.newReviews || 0;
  }

  // End-of-batch summary
  logger.info([
    '\n─── Upsert Summary ───────────────────────────────',
    `  Inserted : ${stats.inserted}`,
    `  Updated  : ${stats.updated}`,
    `  Skipped  : ${stats.skipped}`,
    `  Reviews+ : ${stats.reviewsAdded}`,
    `  Errors   : ${stats.errors}`,
    '──────────────────────────────────────────────────',
  ].join('\n'));

  return stats;
}

module.exports = { upsertGym, upsertManyGyms };
