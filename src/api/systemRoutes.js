'use strict';
const express = require('express');
const fs      = require('fs');
const path    = require('path');
const { query, validationResult } = require('express-validator');
const router  = express.Router();
const cfg     = require('../../config');
const logger  = require('../utils/logger');

const LOG_DIR = cfg.log.dir;

function ok(res, data) { res.json({ success: true, ...data }); }
function err(res, msg, status = 500) { res.status(status).json({ success: false, error: msg }); }

function validate(req, res) {
  const e = validationResult(req);
  if (!e.isEmpty()) { res.status(400).json({ success: false, errors: e.array() }); return true; }
  return false;
}

// GET /api/system/logs — lists all log files or tails a specific one
router.get('/logs',
  query('file').optional().trim(),
  query('tail').optional().isInt({ min: 1, max: 2000 }),
  async (req, res) => {
    if (validate(req, res)) return;
    const { file, tail = 100 } = req.query;

    try {
      if (!fs.existsSync(LOG_DIR)) {
        return err(res, 'Log directory not found', 404);
      }

      const files = fs.readdirSync(LOG_DIR)
        .filter(f => f.endsWith('.log'))
        .sort((a, b) => fs.statSync(path.join(LOG_DIR, b)).mtimeMs - fs.statSync(path.join(LOG_DIR, a)).mtimeMs);

      if (!file) {
        return ok(res, { 
          message: 'Specify ?file=filename to view content. Latest files listed below.',
          files: files.map(f => ({
            name: f,
            size: (fs.statSync(path.join(LOG_DIR, f)).size / 1024).toFixed(2) + ' KB',
            modified: fs.statSync(path.join(LOG_DIR, f)).mtime
          }))
        });
      }

      // Security check: prevent directory traversal
      const safeFile = path.basename(file);
      const filePath = path.join(LOG_DIR, safeFile);

      if (!fs.existsSync(filePath)) {
        return err(res, 'File not found', 404);
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      const resultLines = lines.slice(-tail);

      res.type('text/plain').send(resultLines.join('\n'));

    } catch (e) {
      logger.error('Log API error:', e);
      err(res, e.message);
    }
  }
);

// GET /api/system/logs/latest — shortcut to tail the latest app log
router.get('/logs/latest', async (req, res) => {
  try {
    const files = fs.readdirSync(LOG_DIR)
      .filter(f => f.startsWith('app-') && f.endsWith('.log'))
      .sort((a, b) => fs.statSync(path.join(LOG_DIR, b)).mtimeMs - fs.statSync(path.join(LOG_DIR, a)).mtimeMs);

    if (!files.length) return err(res, 'No app logs found', 404);

    const filePath = path.join(LOG_DIR, files[0]);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    const tail = req.query.tail ? parseInt(req.query.tail) : 100;
    
    res.type('text/plain').send(lines.slice(-Math.min(tail, 1000)).join('\n'));
  } catch (e) {
    err(res, e.message);
  }
});

module.exports = router;
