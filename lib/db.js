'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'nix.sqlite');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
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
`);

const stmts = {
  userByDiscord: db.prepare('SELECT * FROM users WHERE discord_id = ?'),
  userById:      db.prepare('SELECT * FROM users WHERE id = ?'),
  userByNameCi:  db.prepare('SELECT * FROM users WHERE name_ci = ?'),
  insertUser:    db.prepare('INSERT INTO users (discord_id, name, name_ci) VALUES (?, ?, ?)'),
  updateName:    db.prepare("UPDATE users SET name = ?, name_ci = ?, updated_at = datetime('now') WHERE id = ?"),
  allUsers:      db.prepare('SELECT id, discord_id, name FROM users ORDER BY name_ci ASC'),
  insertNix: db.prepare('INSERT INTO nixes (nixer_id, nixed_id) VALUES (?, ?)'),
  nixById: db.prepare('SELECT id, nixer_id FROM nixes WHERE id = ?'),
  deleteNix: db.prepare('DELETE FROM nixes WHERE id = ? AND nixer_id = ?'),
  leaderboard: db.prepare(`
    SELECT u.id AS uid, u.name AS name, COUNT(*) AS n
    FROM nixes nx JOIN users u ON u.id = nx.nixer_id
    GROUP BY nx.nixer_id ORDER BY n DESC, u.name_ci ASC LIMIT ?`),
  mostNixed: db.prepare(`
    SELECT u.id AS uid, u.name AS name, COUNT(*) AS n
    FROM nixes nx JOIN users u ON u.id = nx.nixed_id
    GROUP BY nx.nixed_id ORDER BY n DESC, u.name_ci ASC LIMIT ?`),
  topPairs: db.prepare(`
    SELECT a.id AS auid, a.name AS nixer, b.id AS buid, b.name AS target, COUNT(*) AS n
    FROM nixes nx JOIN users a ON a.id = nx.nixer_id JOIN users b ON b.id = nx.nixed_id
    GROUP BY nx.nixer_id, nx.nixed_id
    ORDER BY n DESC, a.name_ci ASC, b.name_ci ASC LIMIT ?`),
  recent: db.prepare(`
    SELECT nx.id AS id, a.name AS nixer, b.name AS target,
           a.id AS nixerUid, b.id AS targetUid,
           nx.created_at AS created_at, nx.nixer_id AS nixerId
    FROM nixes nx JOIN users a ON a.id = nx.nixer_id JOIN users b ON b.id = nx.nixed_id
    ORDER BY nx.id DESC LIMIT ? OFFSET ?`),
  recentCount: db.prepare(`SELECT COUNT(*) AS n FROM nixes`),
  myCalendar: db.prepare(`
    SELECT date(created_at) AS d, COUNT(*) AS n FROM nixes
    WHERE nixer_id = ? AND date(created_at) >= date('now', '-371 days') GROUP BY d`),
  upsertPushSub: db.prepare(`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`),
  allPushSubs: db.prepare('SELECT user_id, endpoint, p256dh, auth FROM push_subscriptions'),
  delPushSub: db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?'),
  delPushSubsForUser: db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?'),
  nemesis: db.prepare(`
    SELECT a.id AS uid, a.name AS name, COUNT(*) AS n
    FROM nixes nx JOIN users a ON a.id = nx.nixer_id
    WHERE nx.nixed_id = ? GROUP BY nx.nixer_id
    ORDER BY n DESC, a.name_ci ASC LIMIT 1`),
  nixCountBetween: db.prepare('SELECT COUNT(*) AS n FROM nixes WHERE nixer_id = ? AND nixed_id = ?'),
  userGiven: db.prepare('SELECT COUNT(*) AS n FROM nixes WHERE nixer_id = ?'),
  userReceived: db.prepare('SELECT COUNT(*) AS n FROM nixes WHERE nixed_id = ?'),
  userFirstNix: db.prepare('SELECT MIN(created_at) AS d FROM nixes WHERE nixer_id = ? OR nixed_id = ?'),
  userLastNix: db.prepare('SELECT MAX(created_at) AS d FROM nixes WHERE nixer_id = ? OR nixed_id = ?'),
  userUniqueTargets: db.prepare('SELECT COUNT(DISTINCT nixed_id) AS n FROM nixes WHERE nixer_id = ?'),
  userTopTargets: db.prepare(`
    SELECT b.id AS uid, b.name AS name, COUNT(*) AS n
    FROM nixes nx JOIN users b ON b.id = nx.nixed_id
    WHERE nx.nixer_id = ? GROUP BY nx.nixed_id ORDER BY n DESC LIMIT 5`),
  userRecentActivity: db.prepare(`
    SELECT nx.id, nx.nixer_id AS nid, nx.nixed_id AS tid, nx.created_at,
           a.name AS nixer, b.name AS target
    FROM nixes nx JOIN users a ON a.id = nx.nixer_id JOIN users b ON b.id = nx.nixed_id
    WHERE nx.nixer_id = ? OR nx.nixed_id = ? ORDER BY nx.id DESC LIMIT 10`),
  topNixedUser: db.prepare('SELECT nixed_id FROM nixes GROUP BY nixed_id ORDER BY COUNT(*) DESC LIMIT 1'),
  allAchievements: db.prepare('SELECT * FROM achievements ORDER BY id'),
  achievementByKey: db.prepare('SELECT * FROM achievements WHERE key = ?'),
  userAchievements: db.prepare(`
    SELECT a.*, ua.unlocked_at FROM user_achievements ua
    JOIN achievements a ON a.id = ua.achievement_id
    WHERE ua.user_id = ? ORDER BY ua.unlocked_at DESC`),
  hasAchievement: db.prepare(`
    SELECT 1 FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id
    WHERE ua.user_id = ? AND a.key = ?`),
  unlockAchievement: db.prepare('INSERT OR IGNORE INTO user_achievements (user_id, achievement_id) VALUES (?, ?)'),
  countUserAch: db.prepare('SELECT COUNT(*) AS n FROM user_achievements WHERE user_id = ?'),
  countAllAch: db.prepare('SELECT COUNT(*) AS n FROM achievements'),
  xpByUser: db.prepare('SELECT * FROM user_xp WHERE user_id = ?'),
  insertXp: db.prepare('INSERT INTO user_xp (user_id, total_xp, season_xp, season) VALUES (?, 0, 0, ?)'),
  awardXp: db.prepare(`
    INSERT INTO user_xp (user_id, total_xp, season_xp, season) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      total_xp = total_xp + excluded.total_xp,
      season_xp = CASE WHEN user_xp.season = excluded.season THEN season_xp + excluded.season_xp ELSE excluded.season_xp END,
      season = excluded.season`),
  bpClaims: db.prepare('SELECT tier FROM bp_claims WHERE user_id = ? AND season = ?'),
  bpClaim: db.prepare('INSERT INTO bp_claims (user_id, season, tier) VALUES (?, ?, ?)'),
  bpClaimExists: db.prepare('SELECT 1 FROM bp_claims WHERE user_id = ? AND season = ? AND tier = ?'),
  createThread: db.prepare('INSERT INTO threads (author_id, title, body) VALUES (?, ?, ?)'),
  listThreads: db.prepare(`
    SELECT t.*, u.name AS author,
      (SELECT COUNT(*) FROM replies r WHERE r.thread_id = t.id) AS reply_count,
      (SELECT COALESCE(SUM(v.direction),0) FROM votes v WHERE v.target_type='thread' AND v.target_id=t.id) AS score
    FROM threads t JOIN users u ON u.id = t.author_id
    ORDER BY t.id DESC LIMIT ?`),
  getThread: db.prepare(`
    SELECT t.*, u.name AS author, u.discord_id AS author_discord,
      (SELECT COALESCE(SUM(v.direction),0) FROM votes v WHERE v.target_type='thread' AND v.target_id=t.id) AS score
    FROM threads t JOIN users u ON u.id = t.author_id WHERE t.id = ?`),
  getReplies: db.prepare(`
    SELECT r.*, u.name AS author, u.discord_id AS author_discord,
      (SELECT COALESCE(SUM(v.direction),0) FROM votes v WHERE v.target_type='reply' AND v.target_id=r.id) AS score
    FROM replies r JOIN users u ON u.id = r.author_id WHERE r.thread_id = ? ORDER BY r.id ASC`),
  createReply: db.prepare('INSERT INTO replies (thread_id, author_id, body) VALUES (?, ?, ?)'),
  voteGet: db.prepare('SELECT direction FROM votes WHERE user_id = ? AND target_type = ? AND target_id = ?'),
  voteInsert: db.prepare('INSERT INTO votes (user_id, target_type, target_id, direction) VALUES (?, ?, ?, ?)'),
  voteUpdate: db.prepare('UPDATE votes SET direction = ? WHERE user_id = ? AND target_type = ? AND target_id = ?'),
  voteDelete: db.prepare('DELETE FROM votes WHERE user_id = ? AND target_type = ? AND target_id = ?'),
  userVotes: db.prepare('SELECT target_type, target_id, direction FROM votes WHERE user_id = ?'),
};

function listDates(start, end) {
  const out = [];
  const t0 = Date.parse(start + 'T00:00:00Z');
  const t1 = Date.parse(end + 'T00:00:00Z');
  if (Number.isNaN(t0) || Number.isNaN(t1) || t0 > t1) return out;
  for (let t = t0; t <= t1; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
function bucketFor(range) { return range === '7d' ? '1h' : range === '30d' ? '6h' : '1d'; }
function listBuckets(start, end, hours) {
  const pad = (x) => String(x).padStart(2, '0');
  const fmt = (t) => {
    const dt = new Date(t);
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth()+1)}-${pad(dt.getUTCDate())} ${pad(dt.getUTCHours())}:00`;
  };
  const toMs = (s) => Date.parse(s.slice(0,16).replace(' ','T')+':00Z');
  const out = []; const step = hours * 3600000;
  for (let t = toMs(start); t <= toMs(end); t += step) out.push(fmt(t));
  return out;
}
function getStats(range) {
  const today = db.prepare("SELECT date('now') AS d").get().d;
  let start;
  if (range === 'all') {
    const min = db.prepare("SELECT min(date(created_at)) AS d FROM nixes").get().d;
    start = min || today;
  } else {
    const days = Math.max(1, Number(String(range).replace('d','')) || 30);
    start = db.prepare("SELECT date('now', ?) AS d").get(`-${days-1} days`).d;
  }
  const bucket = bucketFor(range);
  const dayRows = db.prepare(
    "SELECT date(created_at) AS d, COUNT(*) AS n FROM nixes WHERE date(created_at) BETWEEN ? AND ? GROUP BY d"
  ).all(start, today);
  const byDay = new Map(dayRows.map((r) => [r.d, r.n]));
  let perDay;
  if (bucket === '1d') {
    perDay = listDates(start, today).map((d) => ({ d, n: byDay.get(d) || 0 }));
  } else {
    const key = bucket === '1h'
      ? "strftime('%Y-%m-%d %H:00', created_at)"
      : "strftime('%Y-%m-%d', created_at) || ' ' || (CAST(strftime('%H', created_at) AS INTEGER) / 6 * 6) || ':00'";
    const nowIso = db.prepare("SELECT datetime('now') AS t").get().t;
    const rows = db.prepare(
      `SELECT ${key} AS d, COUNT(*) AS n FROM nixes WHERE datetime(created_at) BETWEEN ? AND ? GROUP BY d`
    ).all(`${start} 00:00:00`, nowIso);
    const byB = new Map(rows.map((r) => [r.d, r.n]));
    perDay = listBuckets(`${start} 00:00`, nowIso, bucket === '1h' ? 1 : 6)
      .map((d) => ({ d, n: byB.get(d) || 0 }));
  }
  const before = range === 'all' ? 0 : db.prepare("SELECT COUNT(*) AS c FROM nixes WHERE date(created_at) < ?").get(start).c;
  let running = before;
  const cumulative = perDay.map((p) => ({ d: p.d, c: (running += p.n) }));
  const totalAll = db.prepare("SELECT COUNT(*) AS c FROM nixes").get().c;
  const players = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  const inRange = perDay.reduce((s, p) => s + p.n, 0);
  const daysInRange = range === 'all' ? listDates(start, today).length : Math.max(1, Number(String(range).replace('d','')) || 1);
  const avgPerDay = daysInRange ? Math.round((inRange / daysInRange) * 10) / 10 : 0;
  let busiest = null;
  for (const p of dayRows) { if (!busiest || p.n > busiest.n) busiest = { d: p.d, n: p.n }; }
  if (busiest && busiest.n === 0) busiest = null;
  const first = db.prepare("SELECT min(date(created_at)) AS d FROM nixes").get().d;
  const last = db.prepare("SELECT max(date(created_at)) AS d FROM nixes").get().d;
  return { range, bucket, start, end: today, perDay, cumulative, summary: { totalAll, players, inRange, avgPerDay, busiest, first, last } };
}
function myNixCalendar(userId) {
  const rows = stmts.myCalendar.all(userId);
  const map = {}; let total = 0;
  for (const r of rows) { map[r.d] = r.n; total += r.n; }
  const end = db.prepare("SELECT date('now') AS d").get().d;
  return { map, total, end };
}
function getStreaks() {
  const rows = db.prepare('SELECT nixer_id, nixed_id FROM nixes ORDER BY id ASC').all();
  const current = {}; const best = {};
  for (const r of rows) {
    current[r.nixed_id] = 0;
    current[r.nixer_id] = (current[r.nixer_id] || 0) + 1;
    if (current[r.nixer_id] > (best[r.nixer_id] || 0)) best[r.nixer_id] = current[r.nixer_id];
  }
  return { current, best };
}
function getStreakPairs() {
  const rows = db.prepare('SELECT nixer_id, nixed_id FROM nixes ORDER BY id ASC').all();
  const current = {}; const best = {};
  for (const r of rows) {
    const ab = r.nixer_id + ':' + r.nixed_id;
    const ba = r.nixed_id + ':' + r.nixer_id;
    current[ba] = 0;
    current[ab] = (current[ab] || 0) + 1;
    if (current[ab] > (best[ab] || 0)) best[ab] = current[ab];
  }
  return { current, best };
}
function getNemesis(userId) {
  const row = stmts.nemesis.get(userId);
  if (!row) return null;
  const revenge = stmts.nixCountBetween.get(userId, row.uid).n;
  return { nemesisId: row.uid, username: row.name, timesNixedYou: row.n, revenge };
}
function getUserStats(userId) {
  return {
    given: stmts.userGiven.get(userId).n,
    received: stmts.userReceived.get(userId).n,
    firstNix: stmts.userFirstNix.get(userId, userId).d,
    lastNix: stmts.userLastNix.get(userId, userId).d,
    uniqueNixed: stmts.userUniqueTargets.get(userId).n,
  };
}
function getProfile(userId) {
  const user = stmts.userById.get(userId);
  if (!user) return null;
  const stats = getUserStats(userId);
  const xp = getUserXp(userId);
  const achievements = stmts.userAchievements.all(userId);
  const nemesis = getNemesis(userId);
  const cosmetics = getUserCosmetics(userId);
  const bp = getBattlepass(userId);
  const topTargets = stmts.userTopTargets.all(userId);
  const recentActivity = stmts.userRecentActivity.all(userId, userId);
  return { user, stats, xp, achievements, nemesis, cosmetics, battlepass: bp, topTargets, recentActivity };
}
function unlockAch(userId, key) {
  const ach = stmts.achievementByKey.get(key);
  if (!ach) return false;
  if (stmts.hasAchievement.get(userId, key)) return false;
  stmts.unlockAchievement.run(userId, ach.id);
  return true;
}
function checkAchievements(userId) {
  const s = getUserStats(userId);
  const unlocked = [];
  const tryUnlock = (key) => { if (unlockAch(userId, key)) unlocked.push(key); };
  if (s.given >= 1) tryUnlock('first_nix');
  if (s.given >= 10) tryUnlock('nix_10');
  if (s.given >= 25) tryUnlock('nix_25');
  if (s.given >= 50) tryUnlock('nix_50');
  if (s.given >= 100) tryUnlock('nix_100');
  if (s.received >= 1) tryUnlock('first_received');
  if (s.received >= 10) tryUnlock('received_10');
  if (s.received >= 25) tryUnlock('received_25');
  if (s.uniqueNixed >= 5) tryUnlock('social_butterfly');
  const nem = getNemesis(userId);
  if (nem && nem.timesNixedYou >= 3) tryUnlock('nemesis');
  const top = stmts.topNixedUser.get();
  if (top && top.nixed_id === userId && s.received >= 2) tryUnlock('top_dog');
  if (s.firstNix && s.lastNix) {
    const d1 = new Date(s.firstNix.replace(' ','T')+'Z');
    const d2 = new Date(s.lastNix.replace(' ','T')+'Z');
    if (d2 - d1 >= 30*86400000) tryUnlock('veteran');
  }
  const total = stmts.countUserAch.get(userId).n;
  if (total >= 5) tryUnlock('collector');
  if (total >= stmts.countAllAch.get().n) tryUnlock('completionist');
  return unlocked;
}
const XP_GIVEN = 50, XP_RECEIVED = 20, XP_ACH = 100, XP_DAILY = 10;
const XP_PER_LEVEL = 200;
function currentSeason() { return new Date().toISOString().slice(0, 7); }
function levelFromXp(xp) { return Math.floor(xp / XP_PER_LEVEL) + 1; }
function getUserXp(userId) {
  const season = currentSeason();
  let row = stmts.xpByUser.get(userId);
  if (!row) {
    stmts.insertXp.run(userId, season);
    return { totalXp: 0, seasonXp: 0, season, level: 1, levelProgress: 0 };
  }
  if (row.season !== season) {
    db.prepare('UPDATE user_xp SET season_xp = 0, season = ? WHERE user_id = ?').run(season, userId);
    row = { ...row, season_xp: 0, season };
  }
  return {
    totalXp: row.total_xp, seasonXp: row.season_xp, season,
    level: levelFromXp(row.total_xp),
    levelProgress: (row.total_xp % XP_PER_LEVEL) / XP_PER_LEVEL,
  };
}
function awardXp(userId, amount) { stmts.awardXp.run(userId, amount, amount, currentSeason()); }
function awardNixXp(giverId, receiverId) {
  let g = XP_GIVEN, r = XP_RECEIVED;
  let revenge = false;
  const nem = getNemesis(giverId);
  if (nem && nem.nemesisId === receiverId) { g *= 2; revenge = true; unlockAch(giverId, 'revenge'); }
  if (g) awardXp(giverId, g);
  if (r) awardXp(receiverId, r);
  return { giverXp: g, receiverXp: r, revenge };
}
const BP_TIERS = [
  { tier: 1, name: 'Rookie', xp: 0, reward: 'title', value: 'Rookie' },
  { tier: 2, name: 'Blue Border', xp: 200, reward: 'border', value: 'blue' },
  { tier: 3, name: 'Nix Apprentice', xp: 400, reward: 'title', value: 'Nix Apprentice' },
  { tier: 4, name: 'Purple Border', xp: 600, reward: 'border', value: 'purple' },
  { tier: 5, name: 'Nix Adept', xp: 800, reward: 'title', value: 'Nix Adept' },
  { tier: 6, name: 'Gold Border', xp: 1000, reward: 'border', value: 'gold' },
  { tier: 7, name: 'Nix Master', xp: 1200, reward: 'title', value: 'Nix Master' },
  { tier: 8, name: 'Rainbow Border', xp: 1400, reward: 'border', value: 'rainbow' },
  { tier: 9, name: 'Nix Grandmaster', xp: 1600, reward: 'title', value: 'Nix Grandmaster' },
  { tier: 10, name: 'Nix Legend', xp: 1800, reward: 'badge', value: 'legend' },
];
function getUserCosmetics(userId) {
  const season = currentSeason();
  const claims = stmts.bpClaims.all(userId, season);
  if (!claims.length) return { title: null, border: null, badge: null };
  const tiers = new Set(claims.map(c => c.tier));
  let title = null, border = null, badge = null;
  for (const t of BP_TIERS) {
    if (!tiers.has(t.tier)) continue;
    if (t.reward === 'title') title = t.value;
    if (t.reward === 'border') border = t.value;
    if (t.reward === 'badge') badge = t.value;
  }
  return { title, border, badge };
}
function getBattlepass(userId) {
  const xp = getUserXp(userId);
  const claims = new Set(stmts.bpClaims.all(userId, xp.season).map(c => c.tier));
  const tiers = BP_TIERS.map(t => ({ ...t, unlocked: xp.seasonXp >= t.xp, claimed: claims.has(t.tier) }));
  const highest = tiers.filter(t => t.unlocked).pop();
  let title = null, border = null, badge = null;
  for (const t of tiers) {
    if (!t.claimed) continue;
    if (t.reward === 'title') title = t.value;
    if (t.reward === 'border') border = t.value;
    if (t.reward === 'badge') badge = t.value;
  }
  return { season: xp.season, seasonXp: xp.seasonXp, tiers, highestTier: highest ? highest.tier : 0, activeTitle: title, activeBorder: border, activeBadge: badge };
}
function claimBpTier(userId, tier) {
  const xp = getUserXp(userId);
  const t = BP_TIERS.find(t => t.tier === tier);
  if (!t) return { error: 'invalid tier' };
  if (xp.seasonXp < t.xp) return { error: 'not unlocked yet' };
  if (stmts.bpClaimExists.get(userId, xp.season, tier)) return { error: 'already claimed' };
  stmts.bpClaim.run(userId, xp.season, tier);
  return { ok: true };
}
function castVote(userId, targetType, targetId, direction) {
  direction = direction === 1 ? 1 : -1;
  const existing = stmts.voteGet.get(userId, targetType, targetId);
  if (existing) {
    if (existing.direction === direction) {
      stmts.voteDelete.run(userId, targetType, targetId);
    } else {
      stmts.voteUpdate.run(direction, userId, targetType, targetId);
    }
  } else {
    stmts.voteInsert.run(userId, targetType, targetId, direction);
  }
  const row = db.prepare('SELECT COALESCE(SUM(direction),0) AS s FROM votes WHERE target_type=? AND target_id=?').get(targetType, targetId);
  return { voted: existing && existing.direction === direction ? 0 : direction, score: row.s };
}
module.exports = {
  db, stmts, DB_PATH,
  getStats, myNixCalendar, getStreaks, getStreakPairs,
  getNemesis, getUserStats, getProfile,
  checkAchievements, unlockAch,
  getUserXp, awardXp, awardNixXp, currentSeason,
  getBattlepass, claimBpTier, getUserCosmetics, BP_TIERS,
  castVote,
  XP_GIVEN, XP_RECEIVED, XP_ACH, XP_DAILY, XP_PER_LEVEL,
};
