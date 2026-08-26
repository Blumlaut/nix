'use strict';

/**
 * Minimal SQLite-backed session store for express-session.
 * Keeps sessions across restarts so users stay logged in.
 */

const Store = require('express-session').Store;
const { db } = require('./db');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    sid     TEXT PRIMARY KEY,
    data    TEXT    NOT NULL,
    expires INTEGER NOT NULL DEFAULT 0
  );
`);

const q = {
  get:   db.prepare('SELECT data, expires FROM sessions WHERE sid = ?'),
  upsert: db.prepare(`
    INSERT INTO sessions (sid, data, expires) VALUES (?, ?, ?)
    ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires = excluded.expires`),
  del:   db.prepare('DELETE FROM sessions WHERE sid = ?'),
  purge: db.prepare('DELETE FROM sessions WHERE expires < ?')
};

// Opportunistic cleanup of expired sessions.
setInterval(() => { try { q.purge.run(Date.now()); } catch (_) { /* ignore */ } }, 3600_000).unref();

class SqliteSessionStore extends Store {
  get(sid, cb) {
    try {
      const row = q.get.get(sid);
      if (!row) return cb(null, null);
      if (row.expires && row.expires < Date.now()) { q.del.run(sid); return cb(null, null); }
      return cb(null, JSON.parse(row.data));
    } catch (err) { return cb(err); }
  }

  set(sid, session, cb) {
    try {
      const expires = session && session.cookie && session.cookie.expires
        ? new Date(session.cookie.expires).getTime()
        : 0;
      q.upsert.run(sid, JSON.stringify(session), expires);
      return cb ? cb(null) : undefined;
    } catch (err) { return cb(err); }
  }

  destroy(sid, cb) {
    try { q.del.run(sid); return cb ? cb(null) : undefined; }
    catch (err) { return cb(err); }
  }

  touch(sid, session, cb) { return this.set(sid, session, cb); }
}

module.exports = SqliteSessionStore;
