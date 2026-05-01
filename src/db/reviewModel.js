'use strict';
const mongoose = require('mongoose');

// ── Relative-date parser ──────────────────────────────────────────────────────
// Converts Google's "X weeks ago" style strings to an ISODate.
// Fallback: current timestamp when string is unrecognised.

function parseRelativeDate(raw) {
  if (!raw || typeof raw !== 'string') return new Date();

  const s   = raw.trim().toLowerCase();
  const now = Date.now();

  // "just now" / "moments ago"
  if (/just now|moments? ago/.test(s)) return new Date(now);

  const match = s.match(/^(\d+|a|an)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/);
  if (!match) return new Date(now);

  const qty  = (match[1] === 'a' || match[1] === 'an') ? 1 : parseInt(match[1], 10);
  const unit = match[2];

  const MS = {
    second: 1_000,
    minute: 60_000,
    hour:   3_600_000,
    day:    86_400_000,
    week:   7  * 86_400_000,
    month:  30 * 86_400_000,
    year:   365 * 86_400_000,
  };

  return new Date(now - qty * MS[unit]);
}

// ── Schema ────────────────────────────────────────────────────────────────────

const ReviewSchema = new mongoose.Schema(
  {
    gymId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Gym', required: true },
    reviewId:     { type: String, required: true },

    authorName:   String,
    authorUrl:    String,
    authorAvatar: String,

    rating:       { type: Number, min: 1, max: 5 },
    text:         String,
    photos:       [String],

    // Keep the raw string Google gives us (e.g. "a month ago")
    publishedAtRaw: String,

    // Parsed ISODate
    publishedAt:  Date,

    likes:        { type: Number, default: 0 },

    ownerReply: {
      text:        String,
      publishedAt: Date,
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: false },
    collection: 'gym_reviews',
    autoIndex: false,
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
// Primary indexes are created imperatively in ensureIndexes.js so they are
// guaranteed to exist before the first write.  We still declare them here
// for Mongoose's schema introspection / IDE support.
ReviewSchema.index({ gymId: 1 });
ReviewSchema.index({ reviewId: 1 }, { unique: true });

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert an array of raw review objects (as scraped) into properly-shaped
 * documents ready for insertion into the `reviews` collection.
 *
 * @param {ObjectId} gymId
 * @param {Array}    rawReviews  — array of review objects from the scraper
 * @returns {Array}
 */
function buildReviewDocs(gymId, rawReviews = []) {
  return rawReviews.map((r) => ({
    gymId,
    reviewId:     r.reviewId   || r.id || String(Math.random()),
    authorName:   r.authorName || r.author || null,
    authorUrl:    r.authorUrl   || null,
    authorAvatar: r.authorAvatar || r.avatar || null,
    rating:       r.rating      || null,
    text:         r.text        || r.body  || null,
    photos:       Array.isArray(r.photos) ? r.photos : [],
    publishedAtRaw: r.publishedAt || r.publishedAtRaw || null,
    publishedAt:  parseRelativeDate(r.publishedAt || r.publishedAtRaw),
    likes:        r.likes || 0,
    ownerReply: r.ownerReply
      ? {
          text:        r.ownerReply.text || null,
          publishedAt: r.ownerReply.publishedAt
            ? parseRelativeDate(r.ownerReply.publishedAt)
            : null,
        }
      : undefined,
  }));
}

const Review = mongoose.model('Review', ReviewSchema);

module.exports = { Review, buildReviewDocs, parseRelativeDate };
