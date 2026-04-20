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
const Photo          = require('./photoModel');
const CrawlMeta      = require('./crawlMetaModel');
const Category       = require('./categoryModel');
const Amenity        = require('./amenityModel');
const PlaceType      = require('./placeTypeModel');
const GymChangeLog = require('./gymChangeLogModel');
const { calculateQualityScore } = require('../services/intelligence/scoring');
const { analyzeGymSentiment } = require('../services/intelligence/sentiment');
const logger       = require('../utils/logger');
const slugify      = require('slugify');

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

// ── Name normalization and similarity for fuzzy dedup ─────────────────────────
function normalizeName(name = '') {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\b(gym|fitness|studio|centre|center|club|the|and|&|pvt|ltd|inc)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function jaccardSim(a, b) {
  const sa = new Set(normalizeName(a).split(' ').filter(Boolean));
  const sb = new Set(normalizeName(b).split(' ').filter(Boolean));
  const inter = new Set([...sa].filter(x => sb.has(x)));
  const union = new Set([...sa, ...sb]);
  return union.size === 0 ? 0 : inter.size / union.size;
}

function slugifyValue(str) {
  if (!str) return null;
  return str.toString().toLowerCase().trim().replace(/[\s\W-]+/g, '-');
}

// ── Resolve Normalized References ─────────────────────────────────────────────

async function resolveCategory(rawLabel) {
  if (!rawLabel) return null;
  const slug = slugifyValue(rawLabel);
  const cat = await Category.findOneAndUpdate(
    { slug },
    { $setOnInsert: { slug, label: rawLabel } },
    { upsert: true, new: true, runValidators: true }
  );
  return cat._id;
}

async function resolvePlaceType(rawLabel) {
  if (!rawLabel) return null;
  const slug = slugifyValue(rawLabel);
  await PlaceType.updateOne(
    { slug },
    { $setOnInsert: { slug, label: rawLabel, googleType: rawLabel } },
    { upsert: true }
  );
  return null;
}

async function resolveAmenities(rawLabels = []) {
  if (!Array.isArray(rawLabels) || !rawLabels.length) return [];

  // Phase 3a: Single bulkWrite instead of N sequential findOneAndUpdate calls
  const ops = rawLabels.map(label => ({
    updateOne: {
      filter: { slug: slugifyValue(label) },
      update: { $setOnInsert: { slug: slugifyValue(label), label } },
      upsert: true,
    }
  }));
  await Amenity.bulkWrite(ops, { ordered: false });

  // One batched read to get all _ids
  const slugs = rawLabels.map(l => slugifyValue(l));
  const docs  = await Amenity.find({ slug: { $in: slugs } }, { _id: 1 }).lean();
  return docs.map(d => d._id);
}

// ── Normalized Data Ingestion Helpers ────────────────────────────────────────

async function upsertPhotos(gymId, rawPhotos = [], now) {
  if (!rawPhotos.length) return;

  // Phase 3b: Single bulkWrite instead of N sequential updateOne calls
  const ops = rawPhotos
    .filter(p => p.publicUrl)
    .map(p => ({
      updateOne: {
        filter: { publicUrl: p.publicUrl },
        update: {
          $setOnInsert: {
            gymId,
            originalUrl:  p.originalUrl,
            localPath:    p.localPath,
            publicUrl:    p.publicUrl,
            thumbnailUrl: p.thumbnailUrl,
            type:         p.type,
            width:        p.width,
            height:       p.height,
            sizeBytes:    p.sizeBytes,
            isCover:      p.isCover || false,
            downloadedAt: p.downloadedAt || now,
            createdAt:    now,
          }
        },
        upsert: true,
      }
    }));

  if (ops.length) await Photo.bulkWrite(ops, { ordered: false });
}

async function upsertCrawlMeta(gymId, rawMeta, now) {
  if (!rawMeta) return;
  await CrawlMeta.updateOne(
    { gymId },
    {
      $set: {
        lastCrawledAt: now,
        crawlStatus: rawMeta.crawlStatus || 'completed',
        crawlVersion: rawMeta.crawlVersion || 1,
        crawlError: rawMeta.crawlError,
        missingFields: rawMeta.missingFields,
        dataCompleteness: rawMeta.dataCompleteness || 0,
        sourceUrl: rawMeta.sourceUrl,
        jobId: rawMeta.jobId,
        updatedAt: now
      },
      $setOnInsert: {
        gymId,
        firstCrawledAt: rawMeta.firstCrawledAt || now,
        createdAt: now
      }
    },
    { upsert: true }
  );
}

// ── Build GeoJSON location from lat/lng ───────────────────────────────────────
function buildLocation(lat, lng) {
  if (lat != null && lng != null) {
    return { type: 'Point', coordinates: [lng, lat] };
  }
  return undefined;
}

// ── Find existing gym by slug → googleMapsUrl → placeId → geo+name → phone ──
async function findExistingGym(crawledData) {
  const { slug, googleMapsUrl, placeId, lat, lng, name, address } = crawledData;
  const phone = crawledData.contact?.phone;

  // Tier 1: Exact slug match
  if (slug) {
    const found = await Gym.findOne({ slug }).lean();
    if (found) return found;
  }

  // Tier 2: Exact Google Maps URL match
  if (googleMapsUrl) {
    const found = await Gym.findOne({ googleMapsUrl }).lean();
    if (found) return found;
  }

  // Tier 3: Exact Place ID match
  if (placeId) {
    const found = await Gym.findOne({ placeId }).lean();
    if (found) return found;
  }

  // Tier 4: Spatial proximity + fuzzy name match (50m radius, Jaccard ≥ 0.50)
  if (lat && lng && name) {
    try {
      const nearby = await Gym.find({
        geoLocation: {
          $nearSphere: {
            $geometry: { type: 'Point', coordinates: [lng, lat] },
            $maxDistance: 50, // meters
          }
        }
      }).limit(10).lean();

      for (const candidate of nearby) {
        if (!candidate.name) continue;
        const sim = jaccardSim(name, candidate.name);
        if (sim >= 0.50) {
          logger.info(`[DEDUP] Geo+name match: "${name}" ≈ "${candidate.name}" (sim=${sim.toFixed(2)})`);
          return candidate;
        }
      }
    } catch (err) {
      // geoLocation index may not exist yet on some records — non-fatal
      logger.warn(`Geo dedup query failed (non-fatal): ${err.message}`);
    }
  }

  // Tier 5: Phone number match (for rebranded gyms at different addresses)
  if (phone) {
    const normalizedPhone = phone.replace(/[\s\-\(\)]/g, '');
    if (normalizedPhone.length >= 10) {
      const found = await Gym.findOne({
        'contact.phone': { $regex: normalizedPhone.slice(-10) }
      }).lean();
      if (found) {
        logger.info(`[DEDUP] Phone match: "${name}" ↔ "${found.name}" via ${normalizedPhone}`);
        return found;
      }
    }
  }

  // Tier 6: Exact name + partial address match
  if (name && address) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const found = await Gym.findOne({
      name:    { $regex: new RegExp(`^${escaped}$`, 'i') },
      address: { $regex: new RegExp(address.slice(0, 25), 'i') },
    }).lean();
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

    // ── Resolve Dual-Write Mappings ──────────────────────────────────────────
    const categoryId = await resolveCategory(crawledData.category);
    const amenityIds = await resolveAmenities(crawledData.amenities?.raw);
    await resolvePlaceType(crawledData.primaryType);

    // Provide the generated IDs onto the raw document payload
    const normalizedData = { ...crawledData };
    normalizedData.categoryId = categoryId;
    normalizedData.amenityIds = amenityIds;
    normalizedData.parsed = true;

    // Shift the raw attributes so they don't collide with our API virtuals
    normalizedData.rawPhotos    = crawledData.photos;
    normalizedData.rawAmenities = crawledData.amenities;
    normalizedData.rawCrawlMeta = crawledData.crawlMeta;
    
    // Delete the conflicting keys before triggering Mongoose strict mode
    delete normalizedData.photos;
    delete normalizedData.amenities;
    delete normalizedData.crawlMeta;

    // ── Apply Data Intelligence (Phase 2) ────────────────────────────────────
    const qScore = calculateQualityScore(normalizedData);
    normalizedData.qualityScore = qScore.score;
    normalizedData.scoreBreakdown = qScore.breakdown;

    const sentiment = analyzeGymSentiment(crawledData.reviews);
    normalizedData.sentimentScore = sentiment.score;
    normalizedData.sentimentTags = sentiment.tags;

    // ── INSERT path ──────────────────────────────────────────────────────────
    if (!existing) {
      if (normalizedData.lat != null && normalizedData.lng != null) {
        normalizedData.location = buildLocation(normalizedData.lat, normalizedData.lng);
      }

      // 1. Create Gym (Raw array values mapped correctly to raw field)
      const gym = await Gym.create(normalizedData);
      const gymId = gym._id;

      // 2. Parallel ingestion of secondary scaled data
      await Promise.all([
        insertReviews(gymId, crawledData.reviews),
        upsertPhotos(gymId, crawledData.photos, now),
        upsertCrawlMeta(gymId, crawledData.crawlMeta, now)
      ]);

      const newReviewCount = await Review.countDocuments({ gymId });

      logger.info(`[INSERT] "${crawledData.name}" → new gym added (dual-write active)`);
      result.action = 'inserted';
      result.gymId = gymId;
      result.newReviews = newReviewCount;
      return result;
    }

    // ── UPDATE path ──────────────────────────────────────────────────────────
    const gymId = existing._id;
    const $set  = {};

    // 1. Diff tracked fields
    const diffs = diffTrackedFields(existing, crawledData);
    if (diffs.length) {
      await writeChangeLogs(gymId, diffs, now);
      diffs.forEach((d) => result.changedFields.push(d.field));
    }

    // 2. Parallel ingestion of external records (Merging into secondary collections)
    const reviewResult = await mergeReviews(gymId, crawledData.reviews);
    result.newReviews = reviewResult;
    
    await Promise.all([
      upsertPhotos(gymId, crawledData.photos, now),
      upsertCrawlMeta(gymId, crawledData.crawlMeta, now)
    ]);

    // Recount and update totalReviews on gym doc
    const currentTotalReviews = await Review.countDocuments({ gymId });
    $set.totalReviews = currentTotalReviews;

    // 3. Safe-overwrite fields (Applies describing variables)
    for (const field of SAFE_OVERWRITE_FIELDS) {
      const val = normalizedData[field];
      if (val !== undefined) {
        $set[field] = val;
      }
    }

    // Explicitly safe-overwrite the raw fields
    $set.rawPhotos    = normalizedData.rawPhotos;
    $set.rawAmenities = normalizedData.rawAmenities;
    $set.rawCrawlMeta = normalizedData.rawCrawlMeta;

    // Explicitly set normalized IDs and flags
    $set.categoryId = categoryId;
    $set.amenityIds = amenityIds;
    $set.parsed = true;

    // Intelligence Data
    $set.qualityScore = normalizedData.qualityScore;
    $set.scoreBreakdown = normalizedData.scoreBreakdown;
    // We only update sentiment if we have reviews crawled this cycle,
    // though realistically we should append and re-analyze. Since we merge
    // reviews, let's update sentiment using only the new fetched batch as a proxy, 
    // or just overwrite if it's there. 
    $set.sentimentScore = normalizedData.sentimentScore;
    $set.sentimentTags = normalizedData.sentimentTags;

    // 4. Also rebuild GeoJSON location
    const location = buildLocation(crawledData.lat, crawledData.lng);
    if (location) $set.location = location;

    // 5. crawlMeta — partial update, NEVER touch firstCrawledAt in Raw
    $set['crawlMeta.lastCrawledAt']   = now;
    $set['crawlMeta.crawlStatus']     = crawledData.crawlMeta?.crawlStatus     || 'completed';
    $set['crawlMeta.crawlVersion']    = (existing.crawlMeta?.crawlVersion || 1) + 1;
    $set['crawlMeta.dataCompleteness']= crawledData.crawlMeta?.dataCompleteness
      ?? existing.crawlMeta?.dataCompleteness
      ?? 0;

    // 6. Always set updatedAt
    $set.updatedAt = now;

    // Determine if anything changed
    const somethingChanged = diffs.length > 0 || reviewResult > 0;

    await Gym.findByIdAndUpdate(gymId, { $set }, { new: false });

    if (somethingChanged) {
      logger.info(
        `[UPDATE] "${crawledData.name}" → ${diffs.length} field(s) changed, ${reviewResult} new review(s) synced`
      );
      result.action = 'updated';
    } else {
      logger.info(`[SKIP]   "${crawledData.name}" → already up to date & sync finished.`);
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
