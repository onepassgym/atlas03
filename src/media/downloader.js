'use strict';
const axios  = require('axios');
const sharp  = require('sharp');
const path   = require('path');
const fs     = require('fs');
const { v4: uuidv4 } = require('uuid');
const cfg    = require('../../config');
const logger = require('../utils/logger');

const BASE    = path.resolve(cfg.media.basePath);
const PUB_URL = cfg.media.baseUrl.replace(/\/$/, '');

// Ensure base dirs exist on startup
['photos', 'thumbnails'].forEach(d => fs.mkdirSync(path.join(BASE, d), { recursive: true }));

const AX = axios.create({
  timeout: 20_000,
  responseType: 'arraybuffer',
  headers: {
    'User-Agent': cfg.scraper.userAgent,
    Referer:      'https://www.google.com/maps',
    Accept:       'image/webp,image/apng,image/*,*/*',
  },
});

async function downloadImage(url, gymSlug = 'gym') {
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

      const [meta] = await Promise.all([
        sharp(buffer).jpeg({ quality: 82, progressive: true }).toFile(absPath),
        sharp(buffer).resize(400, 300, { fit: 'cover' }).jpeg({ quality: 65 }).toFile(thumbPath),
      ]);

      return {
        originalUrl:  url,
        localPath:    absPath,
        publicUrl:    `${PUB_URL}/${relPath.replace(/\\/g, '/')}`,
        thumbnailUrl: `${PUB_URL}/thumbnails/${thumbName}`,
        type:         'photo',
        width:        meta.width,
        height:       meta.height,
        sizeBytes:    meta.size,
        downloadedAt: new Date(),
      };
    } catch (err) {
      if (attempt === 3) {
        return { originalUrl: url, localPath: null, publicUrl: null, type: 'photo', downloadError: err.message, downloadedAt: new Date() };
      }
      await sleep(1000 * attempt);
    }
  }
}

async function downloadAllMedia(photoUrls = [], gymSlug = 'gym') {
  if (!photoUrls.length) return [];

  // Simple inline concurrency limiter — no ESM/CJS issues
  const CONCURRENCY = 4;
  const results = [];
  for (let i = 0; i < photoUrls.length; i += CONCURRENCY) {
    const batch = photoUrls.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(url => downloadImage(url, gymSlug)));
    results.push(...batchResults);
  }

  const ok  = results.filter(r => r?.localPath).length;
  const bad = results.filter(r => !r?.localPath).length;
  if (bad > 0) logger.warn(`Media [${gymSlug}]: ${ok} ok, ${bad} failed`);
  return results.filter(Boolean);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { downloadImage, downloadAllMedia };
