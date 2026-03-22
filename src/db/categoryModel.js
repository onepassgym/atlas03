'use strict';
const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema({
  slug:        { type: String, required: true, unique: true },
  label:       { type: String, required: true },
  description: String,
}, { timestamps: { createdAt: 'createdAt', updatedAt: false }, collection: 'gym_categories' });

module.exports = mongoose.model('Category', CategorySchema);
