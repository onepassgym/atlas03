'use strict';
const express = require('express');
const { query, param, validationResult } = require('express-validator');
const router  = express.Router();
const Gym     = require('../db/gymModel');

function ok(res, data)       { res.json({ success: true, ...data }); }
function err(res, msg, s=500){ res.status(s).json({ success: false, error: msg }); }
function validate(req, res)  { const e = validationResult(req); if (!e.isEmpty()) { res.status(400).json({ success: false, errors: e.array() }); return true; } return false; }

// GET /api/gyms  — list with filters
router.get('/',
  query('city').optional().trim(),
  query('category').optional().trim(),
  query('minRating').optional().isFloat({ min: 0, max: 5 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('page').optional().isInt({ min: 1 }),
  query('sortBy').optional().isIn(['rating','totalReviews','name','createdAt']),
  async (req, res) => {
    if (validate(req, res)) return;
    const { city, category, minRating, limit = 20, page = 1, sortBy = 'rating', order = 'desc', search } = req.query;
    const filter = {};
    if (city)      filter.areaName = { $regex: new RegExp(city, 'i') };
    if (category)  filter.category = category;
    if (minRating) filter.rating   = { $gte: +minRating };
    if (search)    filter.$text    = { $search: search };
    try {
      const [gyms, total] = await Promise.all([
        Gym.find(filter)
           .select('-crawlMeta')
           .populate('categoryId', 'slug label')
           .populate('amenityIds', 'slug label icon')
           .sort({ [sortBy]: order === 'asc' ? 1 : -1 })
           .limit(+limit)
           .skip((+page - 1) * +limit)
           .lean(),
        Gym.countDocuments(filter),
      ]);
      ok(res, { total, page: +page, limit: +limit, pages: Math.ceil(total / +limit), gyms });
    } catch (e) { err(res, e.message); }
  }
);

// GET /api/gyms/nearby  — geospatial
router.get('/nearby',
  query('lat').isFloat(),
  query('lng').isFloat(),
  query('radiusKm').optional().isFloat({ min: 0.1, max: 50 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  async (req, res) => {
    if (validate(req, res)) return;
    const { lat, lng, radiusKm = 5, limit = 20, category } = req.query;
    const filter = {
      geoLocation: { $near: { $geometry: { type: 'Point', coordinates: [+lng, +lat] }, $maxDistance: +radiusKm * 1000 } },
    };
    if (category) filter.category = category;
    try {
      const gyms = await Gym.find(filter)
        .limit(+limit)
        .populate('categoryId', 'slug label')
        .populate('amenityIds', 'slug label icon')
        .lean();
      ok(res, { count: gyms.length, gyms });
    } catch (e) { err(res, e.message); }
  }
);

// GET /api/gyms/stats
router.get('/stats', async (_, res) => {
  try {
    const [total, byCategory, topCities, avgRating] = await Promise.all([
      Gym.countDocuments(),
      Gym.aggregate([
        { $group: { _id: '$categoryId', count: { $sum: 1 } } },
        { $lookup: { from: 'gym_categories', localField: '_id', foreignField: '_id', as: 'cat' } },
        { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
        { $project: { _id: { $ifNull: ['$cat.label', 'Unknown'] }, count: 1 } },
        { $sort: { count: -1 } }
      ]),
      Gym.aggregate([{ $group: { _id: '$areaName', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 20 }]),
      Gym.aggregate([{ $match: { rating: { $gt: 0 } } }, { $group: { _id: null, avg: { $avg: '$rating' } } }]),
    ]);
    ok(res, { stats: { total, byCategory, topCities, averageRating: avgRating[0]?.avg?.toFixed(2) } });
  } catch (e) { err(res, e.message); }
});

// GET /api/gyms/:id
router.get('/:id', param('id').isMongoId(), async (req, res) => {
  if (validate(req, res)) return;
  try {
    const gym = await Gym.findById(req.params.id)
      .populate('categoryId', 'slug label description')
      .populate('amenityIds', 'slug label icon')
      .populate('reviews')
      .populate('photos', '-localPath')
      .populate('crawlMeta')
      .lean({ virtuals: true });
    
    if (!gym) return err(res, 'Gym not found', 404);
    ok(res, { gym });
  } catch (e) { err(res, e.message); }
});

// PATCH /api/gyms/:id  — update platform fields only
router.patch('/:id', param('id').isMongoId(), async (req, res) => {
  if (validate(req, res)) return;
  const allowed = ['atlas05'];
  const set = {};
  for (const k of allowed) if (req.body[k]) set[k] = req.body[k];
  try {
    const gym = await Gym.findByIdAndUpdate(req.params.id, { $set: set }, { new: true });
    if (!gym) return err(res, 'Gym not found', 404);
    ok(res, { gym });
  } catch (e) { err(res, e.message); }
});

module.exports = router;
