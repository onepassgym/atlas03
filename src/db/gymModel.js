'use strict';
const mongoose = require('mongoose');

// Register related models for population
require('./categoryModel');
require('./amenityModel');
require('./reviewModel');
require('./photoModel');
require('./crawlMetaModel');

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

const ContactSchema = new mongoose.Schema({
  phone:   String,
  website: String,
  email:   String,
}, { _id: false });

// (Legacy Schema omitted array embedded objects like reviews/photos to save space - they are now separate models)

// ── Main Schema ───────────────────────────────────────────────────────────────

const GymSchema = new mongoose.Schema({
  // Identity
  placeId:       { type: String, sparse: true },
  googleMapsUrl: String,
  name:          { type: String, required: true },
  slug:          String,
  aliases:       [String],

  // Category Normalized Links
  categoryId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  
  // Legacy / Unnormalized references
  category:    { type: String, default: 'fitness_venue' },
  categories:  [String],
  primaryType: String,
  types:       [String],

  // Location
  geoLocation: { type: GeoPointSchema },   // legacy 2dsphere field (kept for compat)
  location:    { type: GeoPointSchema },   // canonical GeoJSON field (2dsphere indexed)
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

  // Stats
  reviewsScraped: { type: Number, default: 0 },

  // Hours
  openingHours: [HoursSchema],
  isOpenNow:    Boolean,
  popularTimes: mongoose.Schema.Types.Mixed,

  // Merged Cover Media fields
  coverPhoto: {
    publicUrl: String,
    thumbnailUrl: String,
    width: Number,
    height: Number
  },
  totalPhotos: { type: Number, default: 0 },

  // Details
  description:    String,
  priceLevel:     String,
  amenityIds:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'Amenity' }],
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

  // Job reference
  areaName:   String,
  crawlJobId: String,

  // Raw Crawled Arrays (Stored for diffing)
  rawPhotos:     [mongoose.Schema.Types.Mixed],
  rawAmenities:  mongoose.Schema.Types.Mixed,
  rawCrawlMeta:  mongoose.Schema.Types.Mixed,

  // Data Pipeline
  parsed:    { type: Boolean, default: false },

}, { 
  timestamps: true, 
  collection: 'gyms',
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ── Virtuals ──────────────────────────────────────────────────────────────────

GymSchema.virtual('reviews', {
  ref: 'Review',
  localField: '_id',
  foreignField: 'gymId'
});

GymSchema.virtual('photos', {
  ref: 'Photo',
  localField: '_id',
  foreignField: 'gymId'
});

GymSchema.virtual('crawlMeta', {
  ref: 'CrawlMeta',
  localField: '_id',
  foreignField: 'gymId',
  justOne: true
});

// ── Indexes (declared once, no duplicates) ────────────────────────────────────

GymSchema.index({ geoLocation: '2dsphere' });                              // legacy
GymSchema.index({ location:    '2dsphere' }, { sparse: true });            // canonical
GymSchema.index({ slug:        1 },         { unique: true, sparse: true });
GymSchema.index({ googleMapsUrl: 1 });
GymSchema.index({ placeId:     1 },         { sparse: true });             // non-unique (ensureIndexes handles uniqueness via native driver)
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
