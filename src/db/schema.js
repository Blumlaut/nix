'use strict';

/**
 * SQLite schema.
 *
 * This is the authoritative source of truth for the database layout and MUST
 * remain backward-compatible with the existing production database
 * (`data/nix.sqlite`). It is idempotent: every statement uses
 * `IF NOT EXISTS`, so it is safe to run on every startup.
 *
 * The only table intentionally *not* declared here is `sessions`, which is
 * owned by the `better-sqlite3-session-store` package.
 */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id  TEXT    NOT NULL UNIQUE,
    name        TEXT    NOT NULL,
    name_ci     TEXT    NOT NULL UNIQUE,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS nixes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    nixer_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nixed_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    endpoint    TEXT NOT NULL UNIQUE,
    p256dh      TEXT NOT NULL,
    auth        TEXT NOT NULL,
    user_agent  TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_nixes_nixer   ON nixes(nixer_id);
  CREATE INDEX IF NOT EXISTS idx_nixes_nixed   ON nixes(nixed_id);
  CREATE INDEX IF NOT EXISTS idx_nixes_created ON nixes(id DESC);
  CREATE INDEX IF NOT EXISTS idx_push_user     ON push_subscriptions(user_id);
  CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    icon TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'nixing'
  );
  CREATE TABLE IF NOT EXISTS user_achievements (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id INTEGER NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
    unlocked_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, achievement_id)
  );
  CREATE TABLE IF NOT EXISTS user_xp (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    total_xp INTEGER NOT NULL DEFAULT 0,
    season_xp INTEGER NOT NULL DEFAULT 0,
    season TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS bp_claims (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    season TEXT NOT NULL,
    tier INTEGER NOT NULL,
    claimed_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, season, tier)
  );
  CREATE TABLE IF NOT EXISTS threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_replies_thread ON replies(thread_id);
  CREATE TABLE IF NOT EXISTS votes (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK(target_type IN ('thread','reply')),
    target_id INTEGER NOT NULL,
    direction INTEGER NOT NULL CHECK(direction IN (1,-1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, target_type, target_id)
  );
  CREATE INDEX IF NOT EXISTS idx_votes_target ON votes(target_type, target_id);
`;

module.exports = { SCHEMA };
