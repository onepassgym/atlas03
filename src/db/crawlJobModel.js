'use strict';
const mongoose = require('mongoose');

const CrawlJobSchema = new mongoose.Schema({
  jobId:  { type: String, required: true, unique: true },
  type:   { type: String, enum: ['city', 'gym_name', 'retry'], default: 'city' },

  input: {
    cityName:   String,
    gymName:    String,
    categories: [String],
  },

  status: {
    type:    String,
    enum:    ['queued','running','completed','failed','partial'],
    default: 'queued',
  },

  progress: {
    total:       { type: Number, default: 0 },
    scraped:     { type: Number, default: 0 },
    failed:      { type: Number, default: 0 },
    skipped:     { type: Number, default: 0 },
    newGyms:     { type: Number, default: 0 },
    updatedGyms: { type: Number, default: 0 },
  },

  queuedAt:    { type: Date, default: Date.now },
  startedAt:   Date,
  completedAt: Date,
  durationMs:  Number,

  gymIds:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'Gym' }],
  jobErrors:  [{ message: String, url: String, at: Date }],  // renamed from 'errors' (reserved)
  errorCount: { type: Number, default: 0 },

  bullJobId: String,

}, { timestamps: true, collection: 'crawl_jobs' });

CrawlJobSchema.index({ status: 1 });
CrawlJobSchema.index({ createdAt: -1 });

module.exports = mongoose.model('CrawlJob', CrawlJobSchema);
