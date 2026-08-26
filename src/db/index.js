'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const { SCHEMA } = require('./schema');
const { seedAchievements } = require('./seed');

/**
 * Drop the `sessions` table if it predates the current session store's
 * format.
 *
 * The old hand-rolled store created `sessions (sid, data, expires)`; the
 * `better-sqlite3-session-store` package we now use expects
 * `sessions (sid, sess, expire)`. Because every statement in the schema is
 * `IF NOT EXISTS`, a pre-existing table is never altered, so the store's
 * `SELECT sess ...` would throw on *every* request.
 *
 * Sessions are transient ("who is currently logged in"), so it is safe to
 * drop them — affected users simply sign in again once. The store recreates
 * the table in its correct format on the next startup.
 */
function migrateSessionsTable(db) {
  const has = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"
  ).get();
  if (!has) return;

  const cols = db.prepare('PRAGMA table_info(sessions)').all();
  const names = cols.map((c) => c.name);
  // Current format requires the `sess` column; the old format used `data`.
  if (names.includes('sess')) return;

  console.warn('[nix] migrating legacy sessions table (users will need to sign in again)');
  db.exec('DROP TABLE sessions');
}

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

  migrateSessionsTable(db);
  db.exec(SCHEMA);
  seedAchievements(db);

  return db;
}

module.exports = { open };
