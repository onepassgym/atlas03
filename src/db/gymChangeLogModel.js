'use strict';
const mongoose = require('mongoose');

// ── Schema ────────────────────────────────────────────────────────────────────

const GymChangeLogSchema = new mongoose.Schema(
  {
    gymId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Gym', required: true },
    field:    { type: String, required: true },
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
    changedAt:{ type: Date, default: () => new Date() },
    source:   { type: String, default: 'crawler' },
  },
  {
    // No auto-timestamps — changedAt is explicit above
    timestamps: false,
    collection: 'gymChangeLogs',
    autoIndex: false,
  }
);

// ── Indexes (also created imperatively in ensureIndexes.js) ───────────────────
GymChangeLogSchema.index({ gymId: 1 });
GymChangeLogSchema.index({ changedAt: -1 });

module.exports = mongoose.model('GymChangeLog', GymChangeLogSchema);
