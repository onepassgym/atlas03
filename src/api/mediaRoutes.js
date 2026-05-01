'use strict';
/**
 * mediaRoutes.js — Dedicated production-grade media management API
 *
 * Queries the `gym_photos` collection (Photo model) — NOT rawPhotos embedded in Gym.
 * This is the correct source for all 26k+ downloaded media files.
 *
 * Endpoints:
 *   GET  /api/media               — paginated library (cursor-based)
 *   GET  /api/media/stats         — aggregate analytics
 *   GET  /api/media/scan          — scan filesystem and return summary
 *   POST /api/media/sync          — upsert missing DB records from filesystem
 *   GET  /api/media/:id           — single photo detail
 *   PATCH /api/media/:id          — update tags/caption/gym link
 *   DELETE /api/media/:id         — soft-delete (mark orphaned)
 *   DELETE /api/media/bulk        — bulk delete
 */

const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const fsp      = fs.promises;
const mongoose = require('mongoose');
const { param, query, body, validationResult } = require('express-validator');
const router   = express.Router();
const Photo    = require('../db/photoModel');
const Gym      = require('../db/gymModel');
const cfg      = require('../../config');
const logger   = require('../utils/logger');
const { ok, err } = require('../utils/apiUtils');

const MEDIA_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif',
  '.mp4', '.mov', '.avi', '.webm',
]);

// ── In-memory job progress store ──────────────────────────────────────────────
// Keyed by job name: 'migrate' | 'sync' | 'relink'
const JOB_PROGRESS = {};

function setProgress(job, data) {
  JOB_PROGRESS[job] = { ...data, updatedAt: Date.now() };
}
function clearProgress(job) {
  delete JOB_PROGRESS[job];
}

// ── GET /api/media/progress — poll live job status ────────────────────────────
router.get('/progress', (req, res) => {
  ok(res, { jobs: JOB_PROGRESS });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildFilter(q) {
  const filter = {};

  // Gym filter
  if (q.gymId && mongoose.isValidObjectId(q.gymId)) {
    filter.gymId = new mongoose.Types.ObjectId(q.gymId);
  }

  // Type filter
  if (q.type && ['photo', 'video', 'thumbnail', 'cover'].includes(q.type)) {
    filter.type = q.type;
  }

  // Tag filter
  if (q.tag) filter.tags = q.tag;

  // Folder filter
  if (q.folder) filter.folder = { $regex: new RegExp(q.folder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') };

  // Size filters
  if (q.minSize) filter.sizeBytes = { ...(filter.sizeBytes || {}), $gte: +q.minSize };
  if (q.maxSize) filter.sizeBytes = { ...(filter.sizeBytes || {}), $lte: +q.maxSize };

  // Date filters
  if (q.since)  filter.createdAt = { ...(filter.createdAt || {}), $gte: new Date(q.since) };
  if (q.before) filter.createdAt = { ...(filter.createdAt || {}), $lte: new Date(q.before) };

  // Orphaned / missing files
  if (q.orphaned === 'true') filter.isOrphaned = true;
  if (q.missing   === 'true') filter.fsExists   = false;

  // Text / filename search
  if (q.search && q.search.trim().length >= 2) {
    const escaped = q.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { filename: { $regex: new RegExp(escaped, 'i') } },
      { caption:  { $regex: new RegExp(escaped, 'i') } },
      { folder:   { $regex: new RegExp(escaped, 'i') } },
      { tags:     { $regex: new RegExp(escaped, 'i') } },
    ];
  }

  return filter;
}

function buildSort(sortBy, order) {
  const dir = order === 'asc' ? 1 : -1;
  const map = {
    date:    { createdAt: dir },
    size:    { sizeBytes: dir },
    appeal:  { appealScore: dir },
    name:    { filename: dir },
  };
  return map[sortBy] || { createdAt: -1 };
}

// ── GET /api/media — paginated library ───────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = Math.min(200, parseInt(req.query.limit) || 60);
    const skip   = (page - 1) * limit;
    const sortBy = req.query.sortBy || 'date';
    const order  = req.query.order  || 'desc';

    const filter = buildFilter(req.query);
    const sort   = buildSort(sortBy, order);

    const [photos, total] = await Promise.all([
      Photo.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('gymId', 'name areaName slug')
        .lean(),
      Photo.countDocuments(filter),
    ]);

    ok(res, {
      photos,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (e) {
    logger.error('[media] GET / error:', e.message);
    err(res, e.message);
  }
});

// ── GET /api/media/stats ─────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [
      totalCount,
      totalSizeAgg,
      byType,
      byGymTop,
      recentUploads,
      missingCount,
      orphanedCount,
      largestFiles,
      unlinkedCount,
      gymPhotoSum,
    ] = await Promise.all([
      Photo.countDocuments(),
      Photo.aggregate([{ $group: { _id: null, totalSize: { $sum: '$sizeBytes' }, avgSize: { $avg: '$sizeBytes' } } }]),
      Photo.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 }, size: { $sum: '$sizeBytes' } } },
        { $sort: { count: -1 } }
      ]),
      Photo.aggregate([
        { $group: { _id: '$gymId', count: { $sum: 1 }, size: { $sum: '$sizeBytes' } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'gyms', localField: '_id', foreignField: '_id', as: 'gym' } },
        { $unwind: { path: '$gym', preserveNullAndEmptyArrays: true } },
        { $project: { gymName: { $ifNull: ['$gym.name', 'Unknown'] }, count: 1, size: 1 } }
      ]),
      Photo.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) } }),
      Photo.countDocuments({ fsExists: false }),
      Photo.countDocuments({ isOrphaned: true }),
      Photo.find().sort({ sizeBytes: -1 }).limit(5).populate('gymId', 'name').lean(),
      Photo.countDocuments({ gymId: null }),
      Gym.aggregate([{ $group: { _id: null, total: { $sum: '$totalPhotos' } } }]),
    ]);

    ok(res, {
      stats: {
        totalCount,
        totalSize:    totalSizeAgg[0]?.totalSize || 0,
        avgSize:      totalSizeAgg[0]?.avgSize   || 0,
        byType,
        byGymTop,
        recentUploads,
        missingCount,
        orphanedCount,
        largestFiles,
        unlinkedCount,
        gymPhotoSum:  gymPhotoSum[0]?.total || 0,   // sum of gym.totalPhotos — shows discrepancy
        needsMigration: (gymPhotoSum[0]?.total || 0) > totalCount,
      }
    });
  } catch (e) {
    logger.error('[media] GET /stats error:', e.message);
    err(res, e.message);
  }
});

// ── GET /api/media/scan — scan filesystem, return summary (read-only) ─────────
router.get('/scan', async (req, res) => {
  try {
    const basePath = path.resolve(cfg.media.basePath);
    let accessible = true;
    try { await fsp.access(basePath); } catch { accessible = false; }

    if (!accessible) {
      return ok(res, { accessible: false, files: [], totalSize: 0, count: 0 });
    }

    const allFiles = await walkDir(basePath);
    const mediaFiles = allFiles.filter(f => MEDIA_EXTENSIONS.has(path.extname(f.name).toLowerCase()));

    const totalSize = mediaFiles.reduce((s, f) => s + f.size, 0);
    const dbCount   = await Photo.countDocuments();

    ok(res, {
      accessible: true,
      fsCount:    mediaFiles.length,
      dbCount,
      diff:       mediaFiles.length - dbCount,
      totalSize,
      sample:     mediaFiles.slice(0, 20), // preview
    });
  } catch (e) {
    logger.error('[media] GET /scan error:', e.message);
    err(res, e.message);
  }
});

// ── POST /api/media/migrate-from-gyms — bulk-populate gym_photos from Gym.photos arrays ──
// This is the PRIMARY fix for the 26k discrepancy — gyms store downloaded photo data
// embedded in Gym.photos field; this migrates all of them into the Photo collection.
router.post('/migrate-from-gyms', async (req, res) => {
  res.status(202).json({ success: true, message: 'Migration started in background. Check /api/media/stats for progress.' });

  (async () => {
    try {
      logger.info('[media-migrate] Starting Gym.photos → gym_photos migration...');

      const gymSlugs = await Gym.find({}).select('_id slug').lean();
      const slugMap  = new Map(gymSlugs.map(g => [g.slug, g._id]));
      logger.info(`[media-migrate] Loaded ${slugMap.size} gym slugs`);

      // Fetch every gym that has coverPhoto.publicUrl OR a non-empty rawPhotos array
      const gyms = await Gym.find({
        $or: [
          { 'coverPhoto.publicUrl': { $exists: true, $ne: null } },
          { rawPhotos: { $exists: true, $type: 'array', $ne: [] } },
        ],
      }).select('_id slug coverPhoto rawPhotos').lean();
      logger.info(`[media-migrate] Found ${gyms.length} gyms with media`);

      let processed = 0, upserted = 0, skipped = 0;
      const BATCH = 200;
      let ops = [];

      // Build one bulkWrite op from a normalised photo descriptor
      function buildOp(gymId, gymSlug, p, isCover) {
        let folder = `photos/${gymSlug}`;
        if (p.localPath) {
          try {
            folder = path.dirname(
              path.relative(path.resolve(cfg.media.basePath), p.localPath)
            ).replace(/\\/g, '/');
          } catch (_) { /* keep default */ }
        }
        const filename = p.localPath
          ? path.basename(p.localPath)
          : path.basename((p.publicUrl || 'photo.jpg').split('?')[0]);

        return {
          updateOne: {
            filter: { publicUrl: p.publicUrl },
            update: {
              $setOnInsert: {
                gymId,
                originalUrl:  p.originalUrl  || null,
                localPath:    p.localPath    || null,
                publicUrl:    p.publicUrl,
                thumbnailUrl: p.thumbnailUrl || null,
                filename,
                folder,
                type:         p.type         || 'photo',
                width:        p.width        ?? null,
                height:       p.height       ?? null,
                sizeBytes:    p.sizeBytes    ?? null,
                mimeType:     p.mimeType     || null,
                appealScore:  p.appealScore  || 0,
                brightness:   p.brightness   || null,
                contrast:     p.contrast     || null,
                tags:         Array.isArray(p.tags) ? p.tags : [],
                isCover:      Boolean(isCover),
                downloadedAt: p.downloadedAt ? new Date(p.downloadedAt) : null,
                fsExists:     true,
                createdAt:    p.downloadedAt ? new Date(p.downloadedAt) : new Date(),
              },
              $set: { gymId, ...(isCover ? { isCover: true } : {}) },
            },
            upsert: true,
          },
        };
      }

      async function flushBatch() {
        if (!ops.length) return;
        try {
          const result = await Photo.bulkWrite(ops, { ordered: false });
          upserted += result.upsertedCount + result.modifiedCount;
        } catch (bwe) {
          upserted += bwe.result?.result?.nUpserted || 0;
          logger.warn(`[media-migrate] bulkWrite partial (${bwe.code}): ${String(bwe.message).slice(0, 150)}`);
        }
        ops = [];
      }

      for (const gym of gyms) {
        // Deduplicate per gym by publicUrl; rawPhotos is the primary source
        const photoMap = new Map(); // publicUrl → { p, isCover }

        // 1 — rawPhotos: has localPath, sizeBytes, downloadedAt, originalUrl
        if (Array.isArray(gym.rawPhotos)) {
          for (const p of gym.rawPhotos) {
            if (!p || typeof p !== 'object' || !p.publicUrl) { skipped++; continue; }
            photoMap.set(p.publicUrl, { p, isCover: false });
          }
        }

        // 2 — coverPhoto: merge into existing entry or add as standalone record
        //     Fields: publicUrl, thumbnailUrl, width, height
        if (gym.coverPhoto?.publicUrl) {
          const existing = photoMap.get(gym.coverPhoto.publicUrl);
          if (existing) {
            // Same file as a rawPhoto — mark cover + fill any missing dimensions
            existing.isCover        = true;
            existing.p.width        = existing.p.width        ?? gym.coverPhoto.width        ?? null;
            existing.p.height       = existing.p.height       ?? gym.coverPhoto.height       ?? null;
            existing.p.thumbnailUrl = existing.p.thumbnailUrl ?? gym.coverPhoto.thumbnailUrl ?? null;
          } else {
            // coverPhoto not present in rawPhotos — create standalone entry
            photoMap.set(gym.coverPhoto.publicUrl, {
              p: {
                publicUrl:    gym.coverPhoto.publicUrl,
                thumbnailUrl: gym.coverPhoto.thumbnailUrl || null,
                width:        gym.coverPhoto.width        ?? null,
                height:       gym.coverPhoto.height       ?? null,
                originalUrl:  null,
                localPath:    null,
                type:         'photo',
                sizeBytes:    null,
                downloadedAt: null,
              },
              isCover: true,
            });
          }
        }

        if (photoMap.size === 0) { skipped++; continue; }

        for (const { p, isCover } of photoMap.values()) {
          ops.push(buildOp(gym._id, gym.slug, p, isCover));
          if (ops.length >= BATCH) {
            await flushBatch();
            if (upserted % 2000 === 0 && upserted > 0)
              logger.info(`[media-migrate] Migrated ${upserted} photos so far...`);
          }
        }
        processed++;
      }

      // Flush remainder
      await flushBatch();

      const finalCount = await Photo.countDocuments();
      setProgress('migrate', { status: 'done', phase: 'Migration complete', processed, upserted, skipped, finalCount });
      setTimeout(() => clearProgress('migrate'), 60_000);
      logger.info(`[media-migrate] ✅ Done: ${processed} gyms, ${upserted} upserted, ${skipped} skipped, ${finalCount} total in gym_photos`);
    } catch (e) {
      setProgress('migrate', { status: 'error', phase: String(e.message || e) });
      setTimeout(() => clearProgress('migrate'), 30_000);
      logger.error(`[media-migrate] Error: ${e.stack || e}`);
    }
  })();
});

// ── POST /api/media/sync — upsert DB records from filesystem ─────────────────
// Background job — responds 202, runs async
router.post('/sync', async (req, res) => {
  res.status(202).json({ success: true, message: 'Filesystem sync started in background. Check /api/media/stats for progress.' });

  (async () => {
    try {
      const basePath = path.resolve(cfg.media.basePath);
      // Guard: baseUrl may be undefined if env var is missing
      const rawBaseUrl = cfg.media.baseUrl || `http://localhost:${process.env.PORT || '8747'}/media`;
      const baseUrl  = rawBaseUrl.replace(/\/$/, '');

      let accessible = true;
      try { await fsp.access(basePath); } catch { accessible = false; }
      if (!accessible) {
        setProgress('sync', { status: 'error', phase: 'Media directory not found', done: 0, total: 0 });
        setTimeout(() => clearProgress('sync'), 30_000);
        logger.warn('[media-sync] Media directory not found, aborting sync.');
        return;
      }

      logger.info('[media-sync] Starting filesystem → DB sync...');
      setProgress('sync', { status: 'running', phase: 'Scanning filesystem…', done: 0, total: 0 });

      const gymSlugs = await Gym.find({}).select('_id slug').lean();
      const slugMap  = new Map(gymSlugs.map(g => [g.slug, g._id]));

      const allFiles   = await walkDir(basePath);
      const mediaFiles = allFiles.filter(f => MEDIA_EXTENSIONS.has(path.extname(f.name).toLowerCase()));
      logger.info(`[media-sync] Found ${mediaFiles.length} media files on disk`);
      setProgress('sync', { status: 'running', phase: 'Upserting to database…', done: 0, total: mediaFiles.length });

      const BATCH = 200;
      let upserted = 0, errors = 0;

      for (let i = 0; i < mediaFiles.length; i += BATCH) {
        const chunk = mediaFiles.slice(i, i + BATCH);

        const ops = chunk.map(f => {
          const rel      = path.relative(basePath, f.path).replace(/\\/g, '/');
          const pubUrl   = `${baseUrl}/${rel}`;
          const folder   = path.dirname(rel).replace(/\\/g, '/');
          const isThumb  = rel.startsWith('thumbnails/') || f.name.startsWith('th_');
          const parts    = rel.split('/');
          const slug     = (!isThumb && parts.length >= 2) ? parts[1] : null;
          const gymId    = slug ? (slugMap.get(slug) || null) : null;

          return {
            updateOne: {
              filter: { publicUrl: pubUrl },
              update: {
                $setOnInsert: {
                  publicUrl:    pubUrl,
                  localPath:    f.path,
                  filename:     f.name,
                  folder,
                  type:         isThumb ? 'thumbnail' : 'photo',
                  sizeBytes:    f.size,
                  fsExists:     true,
                  fsVerifiedAt: new Date(),
                  createdAt:    new Date(f.mtimeMs),
                  ...(gymId ? { gymId } : {}),
                },
                $set: { fsExists: true, fsVerifiedAt: new Date(), ...(gymId ? { gymId } : {}) },
              },
              upsert: true,
            },
          };
        });

        try {
          await Photo.bulkWrite(ops, { ordered: false });
          upserted += chunk.length;
        } catch (bwe) {
          // E11000 / partial failure — count what succeeded
          const ok = bwe.result?.result?.nUpserted || 0;
          upserted += ok;
          errors++;
          logger.warn(`[media-sync] bulkWrite chunk error (${bwe.code}): ${String(bwe.message).slice(0, 120)}`);
        }

        setProgress('sync', { status: 'running', phase: 'Upserting to database…', done: upserted, total: mediaFiles.length });
        if (upserted % 2000 === 0 && upserted > 0)
          logger.info(`[media-sync] Upserted ${upserted}/${mediaFiles.length}`);
      }

      // Mark DB records whose local files no longer exist on disk
      setProgress('sync', { status: 'running', phase: 'Checking for missing files…', done: upserted, total: mediaFiles.length });
      const allDbPhotos = await Photo.find({ localPath: { $ne: null } }).select('_id localPath').lean();
      const missingIds  = [];
      const MISS_BATCH  = 500;
      for (let i = 0; i < allDbPhotos.length; i += MISS_BATCH) {
        await Promise.all(allDbPhotos.slice(i, i + MISS_BATCH).map(async p => {
          try { await fsp.access(p.localPath); }
          catch { missingIds.push(p._id); }
        }));
      }
      if (missingIds.length > 0) {
        await Photo.updateMany({ _id: { $in: missingIds } }, { $set: { fsExists: false } });
      }

      const finalCount = await Photo.countDocuments();
      setProgress('sync', { status: 'done', phase: 'Sync complete', done: upserted, total: mediaFiles.length, missing: missingIds.length, chunkErrors: errors, finalCount });
      setTimeout(() => clearProgress('sync'), 60_000);
      logger.info(`[media-sync] ✅ Sync complete: ${upserted} upserted, ${missingIds.length} missing, ${errors} chunk errors, ${finalCount} total`);
    } catch (e) {
      setProgress('sync', { status: 'error', phase: String(e.message || e), done: 0, total: 0 });
      setTimeout(() => clearProgress('sync'), 30_000);
      logger.error(`[media-sync] Sync error: ${e.stack || e}`);
    }
  })();
});

// ── POST /api/media/relink-gyms — assign gymId to photos that have folder slugs ──
router.post('/relink-gyms', async (req, res) => {
  try {
    setProgress('relink', { status: 'running', phase: 'Loading gym slugs…', done: 0, total: 0 });
    const gymSlugs = await Gym.find({}).select('_id slug').lean();
    const slugMap  = new Map(gymSlugs.map(g => [g.slug, g._id]));

    const unlinked = await Photo.find({ gymId: null, folder: { $regex: /^photos\// } })
      .select('_id folder')
      .lean();

    setProgress('relink', { status: 'running', phase: `Linking ${unlinked.length} photos…`, done: 0, total: unlinked.length });

    let linked = 0;
    const ops = [];
    for (const p of unlinked) {
      const parts = (p.folder || '').split('/');
      const slug  = parts[1];
      const gymId = slug ? slugMap.get(slug) : null;
      if (gymId) {
        ops.push({ updateOne: { filter: { _id: p._id }, update: { $set: { gymId } } } });
        linked++;
      }
    }
    if (ops.length) await Photo.bulkWrite(ops, { ordered: false });
    setProgress('relink', { status: 'done', phase: 'Relink complete', done: unlinked.length, total: unlinked.length, linked });
    setTimeout(() => clearProgress('relink'), 30_000);
    ok(res, { unlinked: unlinked.length, linked, message: `Linked ${linked} photos to gyms` });
  } catch (e) {
    setProgress('relink', { status: 'error', phase: e.message, done: 0, total: 0 });
    setTimeout(() => clearProgress('relink'), 30_000);
    err(res, e.message);
  }
});

// ── GET /api/media/:id ───────────────────────────────────────────────────────
router.get('/:id', param('id').isMongoId(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return err(res, 'Invalid ID', 400);
  try {
    const photo = await Photo.findById(req.params.id).populate('gymId', 'name areaName slug').lean();
    if (!photo) return err(res, 'Photo not found', 404);
    ok(res, { photo });
  } catch (e) { err(res, e.message); }
});

// ── PATCH /api/media/:id — update tags, caption, gymId ──────────────────────
router.patch('/:id',
  param('id').isMongoId(),
  express.json(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return err(res, 'Invalid ID', 400);
    const allowed = ['tags', 'caption', 'gymId', 'type', 'isCover'];
    const set = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) set[k] = req.body[k];
    }
    try {
      const photo = await Photo.findByIdAndUpdate(req.params.id, { $set: set }, { new: true });
      if (!photo) return err(res, 'Photo not found', 404);
      ok(res, { photo });
    } catch (e) { err(res, e.message); }
  }
);

// ── DELETE /api/media/bulk — MUST be before /:id to avoid 'bulk' parsed as MongoId
router.delete('/bulk', express.json(), async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return err(res, 'ids array required', 400);
  const validIds = ids.filter(id => mongoose.isValidObjectId(id));
  if (validIds.length === 0) return err(res, 'No valid IDs provided', 400);
  try {
    const result = await Photo.updateMany(
      { _id: { $in: validIds } },
      { $set: { isOrphaned: true, fsExists: false } }
    );
    ok(res, { deleted: result.modifiedCount });
  } catch (e) { err(res, e.message); }
});

// ── DELETE /api/media/:id — soft delete ─────────────────────────────────────
router.delete('/:id', param('id').isMongoId(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return err(res, 'Invalid ID', 400);
  try {
    const photo = await Photo.findByIdAndUpdate(
      req.params.id,
      { $set: { isOrphaned: true, fsExists: false } },
      { new: true }
    );
    if (!photo) return err(res, 'Photo not found', 404);
    ok(res, { message: 'Photo marked as deleted', photo });
  } catch (e) { err(res, e.message); }
});

// ── Filesystem walker (concurrency-limited to avoid EMFILE on Linux VPS) ───────
async function walkDir(dirPath) {
  const results = [];

  async function walk(current) {
    let entries;
    try { entries = await fsp.readdir(current, { withFileTypes: true }); }
    catch { return; }

    // Process entries sequentially within each directory to cap open-file handles
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(current, entry.name);
      try {
        const stat = await fsp.stat(full);
        if (stat.isDirectory()) {
          await walk(full);
        } else if (stat.isFile()) {
          results.push({
            name:    entry.name,
            path:    full,
            size:    stat.size,
            mtimeMs: stat.mtimeMs,
          });
        }
      } catch { /* skip unreadable / permission denied */ }
    }
  }

  await walk(dirPath);
  return results;
}

module.exports = router;
