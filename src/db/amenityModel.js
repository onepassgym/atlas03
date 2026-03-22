'use strict';
const mongoose = require('mongoose');

const AmenitySchema = new mongoose.Schema({
  slug:  { type: String, required: true, unique: true },
  label: { type: String, required: true },
  icon:  String,
}, { timestamps: { createdAt: 'createdAt', updatedAt: false }, collection: 'gym_amenities' });

module.exports = mongoose.model('Amenity', AmenitySchema);
