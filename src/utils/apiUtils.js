'use strict';
const { validationResult } = require('express-validator');

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, ...data });
}

function err(res, msg, status = 500) {
  res.status(status).json({ success: false, error: msg });
}

function validate(req, res) {
  const e = validationResult(req);
  if (!e.isEmpty()) {
    res.status(400).json({ success: false, errors: e.array() });
    return true; // Validation failed
  }
  return false; // Validation passed
}

module.exports = {
  ok,
  err,
  validate
};
