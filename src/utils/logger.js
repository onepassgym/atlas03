'use strict';
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs   = require('fs');
const cfg  = require('../../config');

const logDir = cfg.log.dir;
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const { combine, timestamp, printf, colorize, errors } = winston.format;

const fmt = printf(({ level, message, timestamp, stack, ...meta }) => {
  const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
  return `[${timestamp}] ${level}: ${stack || message}${extra}`;
});

const logger = winston.createLogger({
  level: cfg.log.level,
  format: combine(errors({ stack: true }), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), fmt),
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), fmt),
    }),
    new DailyRotateFile({
      filename:    path.join(logDir, 'app-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles:    '14d',
      maxSize:     '20m',
    }),
    new DailyRotateFile({
      filename:    path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles:    '30d',
      level:       'error',
    }),
  ],
});

module.exports = logger;
