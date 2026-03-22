'use strict';
const slugify     = require('slugify');
const { downloadAllMedia } = require('../media/downloader');
const { upsertGym } = require('../db/upsertGym');
const logger      = require('../utils/logger');

const CATEGORY_MAP = {
  yoga:        'yoga_studio',
  crossfit:    'crossfit',
  pilates:     'pilates',
  martial:     'martial_arts',
  boxing:      'martial_arts',
  karate:      'martial_arts',
  dance:       'dance_studio',
  swim:        'swimming_club',
  'health club':'health_club',
  fitness:     'fitness_center',
  gym:         'gym',
  cycle:       'cycling_studio',
  spinning:    'cycling_studio',
  zumba:       'fitness_center',
  functional:  'fitness_center',
  strength:    'gym',
};

function mapCategory(raw = '') {
  const l = raw.toLowerCase();
  for (const [key, val] of Object.entries(CATEGORY_MAP)) {
    if (l.includes(key)) return val;
  }
  return 'fitness_venue';
}

function calcCompleteness(d) {
  const checks = [d.name, d.lat, d.lng, d.address, d.contact?.phone,
                  d.contact?.website, d.rating, d.totalReviews,
                  d.openingHours?.length, d.photos?.length, d.description, d.category];
  return Math.round(checks.filter(Boolean).length / checks.length * 100);
}

async function processGym(raw, areaName, jobId, downloadMedia = true) {
  const result = { action: null, gymId: null };

  try {
    const slug = slugify(`${raw.name || 'gym'} ${areaName || ''}`, { lower: true, strict: true });

    // ── Build structured document ─────────────────────────────────────────
    const doc = {
      placeId:       raw.placeId       || null,
      googleMapsUrl: raw.googleMapsUrl || null,
      name:          raw.name,
      slug,
      category:      mapCategory(raw.category || ''),
      categories:    [raw.category].filter(Boolean),
      primaryType:   raw.category || null,

      lat: raw.lat || null,
      lng: raw.lng || null,
      geoLocation: (raw.lat && raw.lng) ? { type: 'Point', coordinates: [raw.lng, raw.lat] } : undefined,

      address:  raw.address  || null,
      plusCode: raw.plusCode || null,

      contact: {
        phone:   raw.phone   || null,
        website: raw.website || null,
        email:   null,
      },

      rating:          raw.rating          || null,
      totalReviews:    raw.totalReviews    || 0,
      ratingBreakdown: raw.ratingBreakdown || {},

      reviews:        (raw.reviews || []).slice(0, 150),
      reviewsScraped: (raw.reviews || []).length,

      openingHours: raw.openingHours   || [],
      isOpenNow:    raw.isOpenNow      ?? null,

      description:    raw.description    || null,
      priceLevel:     raw.priceLevel     || null,
      amenities:      { raw: raw.amenities || [] },
      highlights:     raw.highlights     || [],
      serviceOptions: raw.serviceOptions || [],

      permanentlyClosed: raw.permanentlyClosed || false,

      areaName,
      crawlJobId: jobId,
      crawlMeta: {
        firstCrawledAt:  new Date(),
        lastCrawledAt:   new Date(),
        crawlStatus:     'completed',
        crawlVersion:    1,
        sourceUrl:       raw.googleMapsUrl,
        jobId,
      },
    };

    // ── Download media ─────────────────────────────────────────────────────
    if (downloadMedia && raw.photoUrls?.length) {
      logger.info(`  📷 Downloading ${raw.photoUrls.length} photos for: ${raw.name}`);
      const media    = await downloadAllMedia(raw.photoUrls, slug);
      doc.photos     = media;
      doc.totalPhotos= media.length;
      doc.coverPhoto = media.find(m => m.localPath) || null;
    }

    doc.crawlMeta.dataCompleteness = calcCompleteness(doc);

    // ── Upsert (dedup + insert-or-update) ─────────────────────────────────
    const upsertResult = await upsertGym(doc);

    // Map upsertGym actions → the action strings worker.js expects
    const ACTION_MAP = { inserted: 'created', updated: 'updated', skipped: 'skipped', error: 'error' };
    result.action = ACTION_MAP[upsertResult.action] || upsertResult.action;
    result.gymId  = upsertResult.gymId;
    if (upsertResult.error) result.error = upsertResult.error;

  } catch (err) {
    logger.error(`processGym error "${raw?.name}": ${err.message}`);
    result.action = 'error';
    result.error  = err.message;
  }

  return result;
}

module.exports = { processGym };
