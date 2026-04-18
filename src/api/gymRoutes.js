'use strict';
const express = require('express');
const { query, param, validationResult } = require('express-validator');
const router  = express.Router();
const Gym     = require('../db/gymModel');

const { ok, err, validate } = require('../utils/apiUtils');

/**
 * @swagger
 * tags:
 *   name: Gyms
 *   description: Query and view scraped fitness venues
 */

/**
 * @swagger
 * /api/gyms:
 *   get:
 *     summary: List gyms with advanced filtering
 *     tags: [Gyms]
 *     parameters:
 *       - in: query
 *         name: city
 *         schema:
 *           type: string
 *         description: Area name (regex search)
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: minRating
 *         schema:
 *           type: number
 *           format: float
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [rating, totalReviews, name, createdAt, qualityScore, sentimentScore]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Text search on name/address
 *     responses:
 *       200:
 *         description: Paginated list of gyms
 */
// GET /api/gyms  — list with filters
router.get('/',
  query('city').optional().trim(),
  query('category').optional().trim(),
  query('minRating').optional().isFloat({ min: 0, max: 5 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('page').optional().isInt({ min: 1 }),
  query('sortBy').optional().isIn(['rating','totalReviews','name','createdAt','qualityScore','sentimentScore']),
  async (req, res) => {
    if (validate(req, res)) return;
    const { city, category, minRating, limit = 20, page = 1, sortBy = 'qualityScore', order = 'desc', search } = req.query;
    const filter = {};
    if (city)      filter.areaName = { $regex: new RegExp(city, 'i') };
    if (category)  filter.category = category;
    if (minRating) filter.rating   = { $gte: +minRating };
    if (search)    filter.$text    = { $search: search };
    if (req.query.chainSlug)     filter.chainSlug     = req.query.chainSlug;
    if (req.query.isChainMember) filter.isChainMember  = req.query.isChainMember === 'true';
    if (req.query.minReviews)    filter.totalReviews   = { $gte: +req.query.minReviews };
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

/**
 * @swagger
 * /api/gyms/nearby:
 *   get:
 *     summary: Find gyms near coordinates (Geospatial)
 *     tags: [Gyms]
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema:
 *           type: number
 *           format: float
 *       - in: query
 *         name: lng
 *         required: true
 *         schema:
 *           type: number
 *           format: float
 *       - in: query
 *         name: radiusKm
 *         schema:
 *           type: number
 *           format: float
 *           default: 5
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of nearby gyms
 */
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

/**
 * @swagger
 * /api/gyms/stats:
 *   get:
 *     summary: Get overall venue statistics
 *     tags: [Gyms]
 *     responses:
 *       200:
 *         description: Statistics object
 */
// GET /api/gyms/stats
router.get('/stats', async (_, res) => {
  try {
    const [total, byCategory, topCities, globalStats] = await Promise.all([
      Gym.countDocuments(),
      Gym.aggregate([
        { $group: { _id: '$categoryId', count: { $sum: 1 } } },
        { $lookup: { from: 'gym_categories', localField: '_id', foreignField: '_id', as: 'cat' } },
        { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
        { $project: { _id: { $ifNull: ['$cat.label', 'Unknown'] }, count: 1 } },
        { $sort: { count: -1 } }
      ]),
      Gym.aggregate([
        { $match: { areaName: { $ne: null } } },
        { $group: { _id: '$areaName', count: { $sum: 1 } } }, 
        { $sort: { count: -1 } }, 
        { $limit: 10 }
      ]),
      Gym.aggregate([
        { 
          $group: { 
            _id: null, 
            avgRating: { $avg: '$rating' },
            avgQuality: { $avg: '$qualityScore' },
            avgSentiment: { $avg: '$sentimentScore' },
            totalReviews: { $sum: '$totalReviews' },
            totalPhotos: { $sum: '$totalPhotos' }
          } 
        }
      ]),
    ]);

    ok(res, { stats: { 
      total, 
      byCategory, 
      topCities, 
      averageRating: globalStats[0]?.avgRating?.toFixed(2) || '0.00',
      averageQuality: globalStats[0]?.avgQuality?.toFixed(1) || '0.0',
      averageSentiment: globalStats[0]?.avgSentiment?.toFixed(2) || '0.00',
      totalReviews: globalStats[0]?.totalReviews || 0,
      totalPhotos: globalStats[0]?.totalPhotos || 0,
      cityCount: topCities.length
    } });
  } catch (e) { err(res, e.message); }
});

// GET /api/gyms/export — download all gym data as JSON
router.get('/export', async (req, res) => {
  res.setHeader('Content-disposition', 'attachment; filename=gyms-export.json');
  res.setHeader('Content-type', 'application/json');
  
  res.write('[\n');
  let first = true;
  
  const cursor = Gym.find().select('-reviews -photos.localPath').lean().cursor();
  
  cursor.on('data', (doc) => {
    if (!first) {
      res.write(',\n');
    }
    res.write(JSON.stringify(doc));
    first = false;
  });
  
  cursor.on('error', (e) => {
    // If headers are already sent, we can't send an error JSON nicely.
    // Ensure stream ends.
    if (!res.headersSent) {
      err(res, e.message);
    } else {
      res.end('\n]'); // attempt graceful recovery
    }
  });

  cursor.on('end', () => {
    res.write('\n]');
    res.end();
  });
});


/**
 * @swagger
 * /api/gyms/{id}:
 *   get:
 *     summary: Get full details for a specific gym
 *     tags: [Gyms]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Full gym object with reviews and photos
 *       404:
 *         description: Gym not found
 */
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
  const allowed = ['atlas06'];
  const set = {};
  for (const k of allowed) if (req.body[k]) set[k] = req.body[k];
  try {
    const gym = await Gym.findByIdAndUpdate(req.params.id, { $set: set }, { new: true });
    if (!gym) return err(res, 'Gym not found', 404);
    ok(res, { gym });
  } catch (e) { err(res, e.message); }
});

module.exports = router;
