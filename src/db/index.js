'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const { SCHEMA } = require('./schema');
const { seedAchievements } = require('./seed');

/**
 * Open (creating if needed) the SQLite database, apply the schema and seed
 * the achievement catalog. Returns the live better-sqlite3 connection.
 *
 * @param {string} dbPath
 * @returns {import('better-sqlite3').Database}
 */
function open(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  db.exec(SCHEMA);
  seedAchievements(db);

  return db;
}

module.exports = { open };
