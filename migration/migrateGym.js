'use strict';
const mongoose = require('mongoose');
const { logMigration } = require('./logger');

function slugifyValue(str) {
  if (!str) return null;
  return str.toString().toLowerCase().trim().replace(/[\s\W-]+/g, '-');
}

/**
 * Migrates a single gym document.
 * @param {Object} gym
 */
async function migrateGym(gym) {
  const db = mongoose.connection.db;
  const startTs = Date.now();
  const gymId = gym._id;

  try {
    const now = new Date();
    
    // 1. Upsert category
    let categoryId = null;
    if (gym.category) {
      const slug = slugifyValue(gym.category);
      if (slug) {
        const catRes = await db.collection('gym_categories').findOneAndUpdate(
          { slug },
          { $setOnInsert: { slug, label: gym.category, createdAt: now } },
          { upsert: true, returnDocument: 'after' }
        );
        categoryId = catRes._id || catRes.value._id;
      }
    }

    // 2. Upsert place type
    if (gym.primaryType) {
      const slug = slugifyValue(gym.primaryType);
      if (slug) {
        await db.collection('gym_place_types').updateOne(
          { slug },
          { $setOnInsert: { slug, label: gym.primaryType, googleType: gym.primaryType, createdAt: now } },
          { upsert: true }
        );
      }
    }

    // 3. Upsert amenities
    const amenityIds = [];
    if (gym.amenities && Array.isArray(gym.amenities.raw)) {
      for (const am of gym.amenities.raw) {
        const slug = slugifyValue(am);
        if (slug) {
          const amRes = await db.collection('gym_amenities').findOneAndUpdate(
            { slug },
            { $setOnInsert: { slug, label: am, createdAt: now } },
            { upsert: true, returnDocument: 'after' }
          );
          const amId = amRes._id || amRes.value._id;
          if (amId && !amenityIds.some(id => id.equals(amId))) {
            amenityIds.push(amId);
          }
        }
      }
    }

    // 4. Insert reviews
    if (Array.isArray(gym.reviews)) {
      for (const r of gym.reviews) {
        if (r.reviewId) {
          const reviewDoc = {
            gymId,
            reviewId: r.reviewId,
            authorName: r.authorName,
            authorUrl: r.authorUrl,
            authorAvatar: r.authorAvatar,
            rating: r.rating,
            text: r.text,
            photos: r.photos || [],
            publishedAt: r.publishedAt,
            likes: r.likes,
            ownerReply: r.ownerReply,
            createdAt: now
          };
          await db.collection('gym_reviews').updateOne(
            { reviewId: r.reviewId },
            { $setOnInsert: reviewDoc },
            { upsert: true }
          );
        }
      }
    }

    // 5. Insert photos
    if (Array.isArray(gym.photos)) {
      for (const p of gym.photos) {
        if (p.publicUrl) {
          const photoDoc = {
            gymId,
            originalUrl: p.originalUrl,
            localPath: p.localPath,
            publicUrl: p.publicUrl,
            thumbnailUrl: p.thumbnailUrl,
            type: p.type,
            width: p.width,
            height: p.height,
            sizeBytes: p.sizeBytes,
            isCover: p.isCover || false,
            downloadedAt: p.downloadedAt,
            createdAt: now
          };
          await db.collection('gym_photos').updateOne(
            { publicUrl: p.publicUrl },
            { $setOnInsert: photoDoc },
            { upsert: true }
          );
        }
      }
    }

    // 6. Insert crawl meta
    if (gym.crawlMeta) {
      const metaDoc = {
        gymId,
        firstCrawledAt: gym.crawlMeta.firstCrawledAt,
        lastCrawledAt: gym.crawlMeta.lastCrawledAt,
        crawlStatus: gym.crawlMeta.crawlStatus,
        crawlVersion: gym.crawlMeta.crawlVersion,
        missingFields: gym.crawlMeta.missingFields,
        dataCompleteness: gym.crawlMeta.dataCompleteness,
        sourceUrl: gym.crawlMeta.sourceUrl,
        jobId: gym.crawlMeta.jobId,
        createdAt: now,
        updatedAt: now
      };
      await db.collection('gym_crawl_meta').updateOne(
        { gymId },
        { $setOnInsert: metaDoc },
        { upsert: true }
      );
    }

    // 7. Update gyms document
    const updatePayload = {
      $set: {
        parsed: true,
        updatedAt: now
      },
      $unset: {
        reviews: "",
        photos: "",
        crawlMeta: ""
      }
    };

    if (categoryId) {
      updatePayload.$set.categoryId = categoryId;
    }
    if (amenityIds.length > 0) {
      updatePayload.$set.amenityIds = amenityIds;
    }
    
    // We can also unset old amenity raw arrays if required, but user instructions say:
    // Remove: reviews, photos, crawlMeta.
    // It did not say delete amenities.raw, but it's good practice. I'll stick to the exact list:
    // "Remove: reviews, photos, crawlMeta (after confirming inserts)"

    await db.collection('gyms').updateOne(
      { _id: gymId },
      updatePayload
    );

    const durationMs = Date.now() - startTs;
    await logMigration({ gymId, status: 'success', durationMs });

  } catch (err) {
    const durationMs = Date.now() - startTs;
    await logMigration({ gymId, status: 'failure', error: err.message, durationMs });
  }
}

module.exports = migrateGym;
