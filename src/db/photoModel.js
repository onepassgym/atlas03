'use strict';
const mongoose = require('mongoose');

const PhotoSchema = new mongoose.Schema({
  gymId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Gym', required: true },
  originalUrl:   String,
  localPath:     String,
  publicUrl:     String,
  thumbnailUrl:  String,
  type:          { type: String, enum: ['photo', 'video', 'thumbnail', 'cover'] },
  caption:       String,
  width:         Number,
  height:        Number,
  sizeBytes:     Number,
  appealScore:   { type: Number, default: 0 },
  brightness:    Number,
  contrast:      Number,
  tags:          [{ type: String }],
  isCover:       { type: Boolean, default: false },
  downloadedAt:  Date,
  downloadError: String,
}, { timestamps: { createdAt: 'createdAt', updatedAt: false }, collection: 'gym_photos' });

PhotoSchema.index({ gymId: 1 });
PhotoSchema.index({ publicUrl: 1 }, { unique: true });

module.exports = mongoose.model('Photo', PhotoSchema);
