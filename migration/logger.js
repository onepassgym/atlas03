'use strict';
const mongoose = require('mongoose');

async function logMigration({ gymId, status, error = null, durationMs }) {
  try {
    const db = mongoose.connection.db;
    await db.collection('gym_migration_logs').insertOne({
      gymId,
      status,
      error,
      processedAt: new Date(),
      duration_ms: durationMs
    });
  } catch (err) {
    console.error('Failed to write migration log:', err);
  }
}

module.exports = { logMigration };
