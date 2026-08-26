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
 * Migrate the old season-based battlepass tables to the level-based layout.
 *
 * Unlocks used to key off a per-season XP track (`user_xp.season_xp` and
 * `bp_claims.season`). They are now driven by total XP / level, so the
 * season columns are dropped. Levels never decrease, so past tier claims
 * stay valid and are carried over (deduped to one row per user + tier).
 */
function migrateBattlepassTables(db) {
  const xpCols = db.prepare('PRAGMA table_info(user_xp)').all().map((c) => c.name);
  if (xpCols.includes('season_xp')) {
    console.warn('[nix] dropping user_xp.season_xp (battlepass now level-based)');
    db.exec('ALTER TABLE user_xp DROP COLUMN season_xp');
  }
  if (xpCols.includes('season')) {
    db.exec('ALTER TABLE user_xp DROP COLUMN season');
  }

  const hasBp = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='bp_claims'"
  ).get();
  if (!hasBp) return;

  const bpCols = db.prepare('PRAGMA table_info(bp_claims)').all().map((c) => c.name);
  if (!bpCols.includes('season')) return;

  console.warn('[nix] rebuilding bp_claims without season (claims now persist for life)');
  db.exec(`
    CREATE TABLE bp_claims_new (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tier INTEGER NOT NULL,
      claimed_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, tier)
    );
    INSERT OR REPLACE INTO bp_claims_new (user_id, tier, claimed_at)
      SELECT user_id, tier, MIN(claimed_at) FROM bp_claims GROUP BY user_id, tier;
    DROP TABLE bp_claims;
    ALTER TABLE bp_claims_new RENAME TO bp_claims;
  `);
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
  migrateBattlepassTables(db);
  db.exec(SCHEMA);
  seedAchievements(db);

  return db;
}

module.exports = { open };
