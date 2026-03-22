'use strict';
const mongoose = require('mongoose');

const PlaceTypeSchema = new mongoose.Schema({
  slug:       { type: String, required: true, unique: true },
  label:      { type: String, required: true },
  googleType: String,
}, { timestamps: { createdAt: 'createdAt', updatedAt: false }, collection: 'gym_place_types' });

module.exports = mongoose.model('PlaceType', PlaceTypeSchema);
