'use strict';

const cfg = require('../../config');
const { err } = require('../utils/apiUtils');

/**
 * Middleware to enforce X-API-Key authentication.
 * Bypassed for GET /health and root/docs routes if applied globally.
 */
function requireApiKey(req, res, next) {
  // Allow health check endpoint explicitly if this is mounted globally
  if (req.path === '/health' || req.path === '/') {
    return next();
  }

  // Allow events stream optionally via query param (since EventSource browser API lacks headers)
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!apiKey) {
    return err(res, 'Unauthorized: Missing API Key in header (X-API-Key) or query param (?api_key)', 401);
  }

  if (!cfg.auth.apiKeys.includes(apiKey)) {
    return err(res, 'Forbidden: Invalid API Key', 403);
  }

  next();
}

module.exports = requireApiKey;
