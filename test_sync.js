const mongoose = require('mongoose');
require('dotenv').config();
const cfg = require('./config/index');
const Photo = require('./src/db/photoModel');
const Gym = require('./src/db/gymModel');

mongoose.connect(cfg.mongo.uri).then(async () => {
  const count = await Photo.countDocuments();
  console.log('Photos in gym_photos before sync:', count);

  // Run the sync logic directly
  const path = require('path');
  const fs = require('fs');
  const fsp = fs.promises;
  
  const MEDIA_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.mp4', '.mov', '.avi', '.webm']);
  
  async function walkDir(dirPath) {
    const results = [];
    async function walk(current) {
      let entries;
      try { entries = await fsp.readdir(current, { withFileTypes: true }); }
      catch { return; }
      await Promise.all(entries.map(async entry => {
        if (entry.name.startsWith('.')) return;
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.isFile()) {
          try {
            const stat = await fsp.stat(full);
            results.push({ name: entry.name, path: full, size: stat.size, mtimeMs: stat.mtimeMs });
          } catch {}
        }
      }));
    }
    await walk(dirPath);
    return results;
  }

  const basePath = path.resolve(cfg.media.basePath);
  const baseUrl  = cfg.media.baseUrl.replace(/\/$/, '');

  const allFiles   = await walkDir(basePath);
  const mediaFiles = allFiles.filter(f => MEDIA_EXTENSIONS.has(path.extname(f.name).toLowerCase()));
  console.log('Media files on disk:', mediaFiles.length);

  await mongoose.disconnect();
}).catch(console.error);
