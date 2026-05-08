'use strict';
const path   = require('path');
const fs     = require('fs');
const { v4: uuidv4 } = require('uuid');
const cfg    = require('../../config');
const logger = require('../utils/logger');

// ── Media download gate ────────────────────────────────────────────────────────
// MEDIA_DOWNLOAD_ENABLED=true  → download + resize via Sharp (legacy behaviour)
// MEDIA_DOWNLOAD_ENABLED=false → URL capture only, no disk writes (enrichment default)
const DOWNLOAD_ENABLED = cfg.media.downloadEnabled;

if (!DOWNLOAD_ENABLED) {
  logger.info('[downloader] MEDIA_DOWNLOAD_ENABLED=false — URL capture mode, no downloads');
}

// Lazy-require heavy deps only when downloads are enabled
// This avoids loading Sharp/Axios in enrichment workers entirely
let axios = null;
let sharp = null;
let analyzePhotoBuffer = null;
let BASE = null;
let PUB_URL = null;
let AX = null;

function ensureDownloadDeps() {
  if (!axios) {
    axios = require('axios');
    sharp = require('sharp');
    ({ analyzePhotoBuffer } = require('../services/intelligence/photoVision'));
    BASE    = path.resolve(cfg.media.basePath);
    PUB_URL = cfg.media.baseUrl.replace(/\/$/, '');
    AX = axios.create({
      timeout: 20_000,
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': cfg.scraper.userAgent,
        Referer:      'https://www.google.com/maps',
        Accept:       'image/webp,image/apng,image/*,*/*',
      },
    });
    // Ensure base dirs exist
    ['photos', 'thumbnails'].forEach(d => fs.mkdirSync(path.join(BASE, d), { recursive: true }));
  }
}

// ── URL-capture-only record (no disk writes) ───────────────────────────────────
function captureRecord(url, sourceType = 'user') {
  return {
    originalUrl:  url,
    localPath:    null,
    publicUrl:    null,          // no local copy — use originalUrl directly
    thumbnailUrl: null,
    type:         'photo',
    sourceType,
    downloaded:   false,
    capturedAt:   new Date(),
  };
}

// ── Download + resize (full pipeline — only when DOWNLOAD_ENABLED) ─────────────
async function downloadImage(url, gymSlug = 'gym', sourceType = 'user') {
  if (!DOWNLOAD_ENABLED) {
    // No download — return capture record only
    return captureRecord(url, sourceType);
  }

  ensureDownloadDeps();

  const subdir  = path.join('photos', gymSlug);
  const absDir  = path.join(BASE, subdir);
  fs.mkdirSync(absDir, { recursive: true });

  const filename  = `${uuidv4()}.jpg`;
  const relPath   = path.join(subdir, filename);
  const absPath   = path.join(BASE, relPath);
  const thumbName = `th_${filename}`;
  const thumbPath = path.join(BASE, 'thumbnails', thumbName);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp   = await AX.get(url);
      const buffer = Buffer.from(resp.data);

      const [meta, intelligence] = await Promise.all([
        sharp(buffer).jpeg({ quality: 82, progressive: true }).toFile(absPath),
        analyzePhotoBuffer(buffer),
      ]);
      await sharp(buffer).resize(400, 300, { fit: 'cover' }).jpeg({ quality: 65 }).toFile(thumbPath);

      return {
        originalUrl:  url,
        localPath:    absPath,
        publicUrl:    `${PUB_URL}/${relPath.replace(/\\/g, '/')}`,
        thumbnailUrl: `${PUB_URL}/thumbnails/${thumbName}`,
        type:         'photo',
        sourceType,
        downloaded:   true,
        width:        meta.width,
        height:       meta.height,
        sizeBytes:    meta.size,
        appealScore:  intelligence.appealScore,
        brightness:   intelligence.brightness,
        contrast:     intelligence.contrast,
        tags:         intelligence.tags,
        downloadedAt: new Date(),
        capturedAt:   new Date(),
      };
    } catch (err) {
      if (attempt === 3) {
        return { originalUrl: url, localPath: null, publicUrl: null, type: 'photo', sourceType, downloaded: false, downloadError: err.message, capturedAt: new Date() };
      }
      await sleep(1000 * attempt);
    }
  }
}

async function downloadAllMedia(photoUrls = [], gymSlug = 'gym', sourceType = 'user') {
  if (!photoUrls.length) return [];

  if (!DOWNLOAD_ENABLED) {
    // URL capture only — return capture records immediately, no I/O
    return photoUrls.map(url => captureRecord(url, sourceType));
  }

  // Full download pipeline (original behaviour)
  const CONCURRENCY = 4;
  const results = [];
  for (let i = 0; i < photoUrls.length; i += CONCURRENCY) {
    const batch = photoUrls.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(url => downloadImage(url, gymSlug, sourceType)));
    results.push(...batchResults);
  }

  const ok  = results.filter(r => r?.localPath).length;
  const bad = results.filter(r => !r?.localPath).length;
  if (bad > 0) logger.warn(`Media [${gymSlug}]: ${ok} ok, ${bad} failed`);
  return results.filter(Boolean);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { downloadImage, downloadAllMedia, DOWNLOAD_ENABLED };
