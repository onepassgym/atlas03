'use strict';
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs   = require('fs');
const cfg  = require('../../config');
const bus  = require('../services/eventBus');

const logDir = cfg.log.dir;
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const { combine, timestamp, printf, colorize, errors } = winston.format;

const fmt = printf(({ level, message, timestamp, stack, ...meta }) => {
  const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
  return `[${timestamp}] ${level}: ${stack || message}${extra}`;
});

// ── Custom EventBus Transport ──────────────────────────────────────────────
// Regex to detect Morgan HTTP access log lines (noise, not app events)
const HTTP_ACCESS_RE = /^\S+ - - \[.+\] "(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) /;

class EventBusTransport extends winston.Transport {
  constructor(opts) {
    super(opts);
  }
  log(info, callback) {
    // Skip raw HTTP access log lines from Morgan — they flood the SSE stream
    // with irrelevant request noise. Only publish meaningful app-level logs.
    if (!HTTP_ACCESS_RE.test(info.message)) {
      setImmediate(() => {
        bus.publish('system:log', {
          level: info.level,
          message: info.message,
          timestamp: info.timestamp,
          stack: info.stack,
        });
      });
    }
    callback();
  }
}

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
    new EventBusTransport({ level: 'info' })
  ],
});

module.exports = logger;
