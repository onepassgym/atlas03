'use strict';
const mongoose = require('mongoose');

// ── Sub-schemas ───────────────────────────────────────────────────────────────

const GeoPointSchema = new mongoose.Schema({
  type:        { type: String, enum: ['Point'], default: 'Point' },
  coordinates: { type: [Number], required: true }, // [lng, lat]
}, { _id: false });

const HoursSchema = new mongoose.Schema({
  day:      String,
  open:     String,
  close:    String,
  isOpen24: { type: Boolean, default: false },
  isClosed: { type: Boolean, default: false },
}, { _id: false });

const ReviewSchema = new mongoose.Schema({
  reviewId:    String,
  authorName:  String,
  authorUrl:   String,
  authorAvatar:String,
  rating:      { type: Number, min: 1, max: 5 },
  text:        String,
  language:    String,
  photos:      [String],
  publishedAt: String,
  likes:       { type: Number, default: 0 },
  ownerReply:  {
    text:        String,
    publishedAt: String,
  },
}, { _id: false });

const MediaSchema = new mongoose.Schema({
  originalUrl:   String,
  localPath:     String,
  publicUrl:     String,
  thumbnailUrl:  String,
  type:          { type: String, enum: ['photo', 'video', 'thumbnail', 'cover'] },
  caption:       String,
  width:         Number,
  height:        Number,
  sizeBytes:     Number,
  downloadedAt:  Date,
  downloadError: String,
}, { _id: false });

const ContactSchema = new mongoose.Schema({
  phone:   String,
  website: String,
  email:   String,
}, { _id: false });

const CrawlMetaSchema = new mongoose.Schema({
  firstCrawledAt:   Date,
  lastCrawledAt:    Date,
  crawlStatus:      { type: String, enum: ['pending','in_progress','completed','failed','partial'], default: 'pending' },
  crawlVersion:     { type: Number, default: 1 },
  crawlError:       String,
  missingFields:    [String],
  dataCompleteness: { type: Number, default: 0 }, // 0–100
  sourceUrl:        String,
  jobId:            String,
}, { _id: false });

// ── Main Schema ───────────────────────────────────────────────────────────────

const GymSchema = new mongoose.Schema({
  // Identity
  placeId:       { type: String, sparse: true },
  googleMapsUrl: String,
  name:          { type: String, required: true },
  slug:          String,
  aliases:       [String],

  // Category
  category:    { type: String, default: 'fitness_venue' },
  categories:  [String],
  primaryType: String,
  types:       [String],

  // Location
  geoLocation: { type: GeoPointSchema },   // 2dsphere index declared below
  lat:         Number,
  lng:         Number,
  address:     String,
  addressParts: {
    street:     String,
    area:       String,
    city:       String,
    state:      String,
    country:    String,
    postalCode: String,
  },
  plusCode: String,

  // Contact
  contact: ContactSchema,

  // Ratings
  rating:       Number,
  totalReviews: { type: Number, default: 0 },
  ratingBreakdown: {
    fiveStar:  { type: Number, default: 0 },
    fourStar:  { type: Number, default: 0 },
    threeStar: { type: Number, default: 0 },
    twoStar:   { type: Number, default: 0 },
    oneStar:   { type: Number, default: 0 },
  },

  // Reviews
  reviews:        [ReviewSchema],
  reviewsScraped: { type: Number, default: 0 },

  // Hours
  openingHours: [HoursSchema],
  isOpenNow:    Boolean,
  popularTimes: mongoose.Schema.Types.Mixed,

  // Media
  coverPhoto: MediaSchema,
  photos:     [MediaSchema],
  videos:     [MediaSchema],
  totalPhotos: { type: Number, default: 0 },

  // Details
  description:    String,
  priceLevel:     String,
  amenities:      { raw: [String] },
  highlights:     [String],
  offerings:      [String],
  serviceOptions: [String],
  accessibility:  [String],

  // Status
  permanentlyClosed: { type: Boolean, default: false },
  temporarilyClosed: { type: Boolean, default: false },
  claimedByOwner:    { type: Boolean, default: false },

  // Atlas05 platform fields
  atlas05: {
    isListed:   { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    isPartner:  { type: Boolean, default: false },
    listedAt:   Date,
    partnerSince:Date,
    planIds:    [String],
  },

  // Crawl metadata
  crawlMeta: CrawlMetaSchema,

  // Job reference
  areaName:   String,
  crawlJobId: String,

}, { timestamps: true, collection: 'gyms' });

// ── Indexes (declared once, no duplicates) ────────────────────────────────────

GymSchema.index({ geoLocation: '2dsphere' });
GymSchema.index({ placeId: 1 }, { unique: true, sparse: true });
GymSchema.index({ lat: 1, lng: 1 });
GymSchema.index({ name: 'text', description: 'text', areaName: 'text' });
GymSchema.index({ areaName: 1, category: 1 });
GymSchema.index({ rating: -1 });
GymSchema.index({ 'crawlMeta.crawlStatus': 1 });
GymSchema.index({ 'atlas05.isListed': 1 });

// ── Completeness helper ───────────────────────────────────────────────────────

GymSchema.methods.calcCompleteness = function () {
  const checks = [
    this.name, this.lat, this.lng, this.address,
    this.contact?.phone, this.contact?.website,
    this.rating, this.totalReviews,
    this.openingHours?.length > 0,
    this.photos?.length > 0,
    this.description, this.category,
  ];
  const filled = checks.filter(Boolean).length;
  return Math.round((filled / checks.length) * 100);
};

module.exports = mongoose.model('Gym', GymSchema);
