'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { open } = require('../src/db');
const { prepareAll } = require('../src/db/queries');
const { createStatsService } = require('../src/services/stats');
const { createStreaksService } = require('../src/services/streaks');
const { createProgressionService } = require('../src/services/progression');
const { createUsersService } = require('../src/services/users');

let db;
let q;
let stats;
let streaks;
let prog;
let users;
let tmpDb;

before(() => {
  tmpDb = path.join(os.tmpdir(), `nix-test-${process.pid}.sqlite`);
  db = open(tmpDb);
  q = prepareAll(db);
  stats = createStatsService(db, q);
  streaks = createStreaksService(db, q);
  prog = createProgressionService(db, q);
  users = createUsersService(db, q);
});

after(() => {
  db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(tmpDb + suffix); } catch { /* ignore */ }
  }
});

function seed() {
  const upsert = db.prepare(
    'INSERT OR IGNORE INTO users (discord_id, name, name_ci) VALUES (?, ?, ?)'
  );
  upsert.run('discord-a', 'Alice', 'alice');
  upsert.run('discord-b', 'Bob', 'bob');
  return { alice: q.userByDiscord.get('discord-a'), bob: q.userByDiscord.get('discord-b') };
}

test('achievements are seeded on startup', () => {
  assert.equal(q.allAchievements.all().length, 15);
});

test('nix flow awards XP and achievements', () => {
  const { alice, bob } = seed();
  q.insertNix.run(alice.id, bob.id);
  q.insertNix.run(alice.id, bob.id);
  prog.awardNixXp(alice.id, bob.id);

  const aliceAch = prog.checkAchievements(alice.id);
  assert.ok(aliceAch.includes('first_nix'));

  const xp = prog.getUserXp(alice.id);
  assert.ok(xp.totalXp >= 50);
  assert.equal(xp.level, 1);

  // leaderboard reflects the nixes
  const lb = q.leaderboard.all(3);
  assert.equal(lb[0].name, 'Alice');
  assert.equal(lb[0].n, 2);

  // Bob's nemesis is Alice
  const nem = prog.getNemesis(bob.id);
  assert.equal(nem.nemesisId, alice.id);
});

test('achievements unlock retroactively for pre-existing nixes', () => {
  const fiona = freshUser('discord-fiona', 'Fiona');
  const greg = freshUser('discord-greg', 'Greg');

  // Nixes recorded before the achievements system rolled out — nobody ran
  // checkAchievements when they were made.
  q.insertNix.run(fiona.id, greg.id);
  q.insertNix.run(greg.id, fiona.id);
  assert.equal(q.userAchievements.all(fiona.id).length, 0);

  // Loading the profile triggers the deferred sync.
  const unlocked = prog.syncAchievements(fiona.id);
  assert.ok(unlocked.includes('first_nix'), 'fiona earns first_nix');
  assert.ok(unlocked.includes('first_received'), 'fiona earns first_received');
  assert.ok(!unlocked.includes('nix_10'), 'fiona has only given one nix');

  // New unlocks award the standard achievement XP (100 each).
  const xpAfter = prog.getUserXp(fiona.id).totalXp;
  assert.equal(xpAfter, unlocked.length * 100);

  // Idempotent: a second check re-unlocks nothing and awards no XP.
  assert.deepEqual(prog.syncAchievements(fiona.id), []);
  assert.equal(prog.getUserXp(fiona.id).totalXp, xpAfter);
});

test('streaks track runs', () => {
  const { alice, bob } = seed();
  q.insertNix.run(alice.id, bob.id);
  q.insertNix.run(alice.id, bob.id);
  const { current } = streaks.getStreaks();
  assert.ok(current[alice.id] >= 2, 'alice has a run of nixes');
  assert.equal(current[bob.id], 0, 'bob (the target) is not on a streak');
});

test('stats service produces series', () => {
  const { alice, bob } = seed();
  q.insertNix.run(alice.id, bob.id);
  const s = stats.getStats('30d');
  assert.ok(s.summary.totalAll >= 1);
  assert.ok(s.summary.inRange >= 1);
  assert.ok(s.perDay.length > 0);
  assert.ok(s.cumulative.length > 0);
});

test('profile assembles user data', () => {
  const { alice } = seed();
  const p = users.getProfile(alice.id, prog);
  assert.equal(p.user.name, 'Alice');
  assert.ok(Array.isArray(p.achievements));
  assert.ok(Array.isArray(p.topTargets));
  assert.ok(p.xp);
});

test('profile achievements show the profiled user, not the viewer', () => {
  const { alice, bob } = seed();
  // Alice nixed Bob enough times to pass the 10-nix and 25-nix thresholds.
  for (let i = 0; i < 25; i++) q.insertNix.run(alice.id, bob.id);
  // The profile route syncs the profiled user before assembling the profile.
  prog.syncAchievements(alice.id);
  prog.syncAchievements(bob.id);

  const aliceAch = new Map(users.getProfile(alice.id, prog).achievements.map((a) => [a.key, a.unlocked]));
  const bobAch = new Map(users.getProfile(bob.id, prog).achievements.map((a) => [a.key, a.unlocked]));

  // Full catalog for both users, each with their own unlock state.
  assert.equal(aliceAch.size, 15);
  assert.equal(bobAch.size, 15);
  assert.equal(aliceAch.get('nix_10'), true, 'alice (25 given) has Getting Warm');
  assert.equal(aliceAch.get('nix_25'), true, 'alice (25 given) has Serial Nixer');
  assert.equal(bobAch.get('nix_10'), false, 'bob never nixed — his own state, not alice\'s');
  assert.equal(bobAch.get('nix_25'), false);
  assert.equal(bobAch.get('first_received'), true);
});

test('battlepass is only included in the profile of the owner', () => {
  const { alice } = seed();
  // Someone else's (or a guest's) profile stays free of tier/claim state —
  // otherwise the claim buttons would act on the viewer's own account.
  assert.ok(!('battlepass' in users.getProfile(alice.id, prog)));
  assert.ok(!('battlepass' in users.getProfile(alice.id, prog, { isMe: false })));
  assert.ok('battlepass' in users.getProfile(alice.id, prog, { isMe: true }));
  // Public cosmetics still show on everyone's profile.
  assert.ok('cosmetics' in users.getProfile(alice.id, prog));
});

function freshUser(discordId, name) {
  db.prepare('INSERT OR IGNORE INTO users (discord_id, name, name_ci) VALUES (?, ?, ?)')
    .run(discordId, name, name.toLowerCase());
  return q.userByDiscord.get(discordId);
}

test('battlepass tiers unlock by level (total XP), not season', () => {
  const carol = freshUser('discord-carol', 'Carol');

  let xp = prog.getUserXp(carol.id);
  assert.equal(xp.totalXp, 0);
  assert.equal(xp.level, 1);
  assert.ok(!('seasonXp' in xp) && !('season' in xp), 'no season XP track remains');

  let bp = prog.getBattlepass(carol.id);
  assert.ok(bp.tiers[0].unlocked, 'tier 1 is free');
  assert.ok(!bp.tiers[1].unlocked, 'tier 2 locked at level 1');

  prog.awardXp(carol.id, 200); // → level 2
  bp = prog.getBattlepass(carol.id);
  assert.equal(bp.level, 2);
  assert.ok(bp.tiers[1].unlocked, 'tier 2 unlocks at level 2');
  assert.ok(!bp.tiers[2].unlocked, 'tier 3 still locked');

  prog.awardXp(carol.id, 270); // → 470 total → level 3
  xp = prog.getUserXp(carol.id);
  assert.equal(xp.totalXp, 470);
  assert.equal(xp.level, 3);
  bp = prog.getBattlepass(carol.id);
  assert.ok(bp.tiers[2].unlocked, 'tier 3 unlocks at 400 total XP');
  assert.equal(bp.totalXp, 470);
});

test('battlepass claim requires the tier level and is stored per user+tier', () => {
  const dave = freshUser('discord-dave', 'Dave');

  assert.deepEqual(prog.claimBpTier(dave.id, 2), { error: 'not unlocked yet' });

  prog.awardXp(dave.id, 200); // level 2
  assert.deepEqual(prog.claimBpTier(dave.id, 2), { ok: true });
  assert.deepEqual(prog.claimBpTier(dave.id, 2), { error: 'already claimed' });

  assert.equal(prog.getUserCosmetics(dave.id).border, 'blue', 'claimed tier 2 grants the blue border');
  assert.equal(prog.getBattlepass(dave.id).highestTier, 2);
});

test('cosmetics can be switched between unlocked tiers', () => {
  const erin = freshUser('discord-erin', 'Erin');
  prog.awardXp(erin.id, 800); // level 5 → tiers 1-4 claimable
  for (const tier of [1, 2, 3, 4]) {
    assert.deepEqual(prog.claimBpTier(erin.id, tier), { ok: true });
  }

  // Default: highest claimed tier per category
  let cos = prog.getUserCosmetics(erin.id);
  assert.equal(cos.title, 'Nix Apprentice');
  assert.equal(cos.border, 'purple');

  // Switch both categories to lower tiers (independently)
  assert.equal(prog.setActiveCosmetic(erin.id, 'title', 'Rookie').cosmetics.title, 'Rookie');
  assert.equal(prog.setActiveCosmetic(erin.id, 'border', 'blue').cosmetics.border, 'blue');
  cos = prog.getUserCosmetics(erin.id);
  assert.equal(cos.title, 'Rookie');
  assert.equal(cos.border, 'blue');

  // Battlepass reflects the active choice
  const bp = prog.getBattlepass(erin.id);
  assert.equal(bp.activeTitle, 'Rookie');
  assert.equal(bp.activeBorder, 'blue');

  // Cannot equip a reward that was never claimed, or an unknown kind
  assert.deepEqual(prog.setActiveCosmetic(erin.id, 'border', 'gold'), { error: 'not unlocked' });
  assert.deepEqual(prog.setActiveCosmetic(erin.id, 'hats', 'blue'), { error: 'invalid kind' });

  // Clearing the choice falls back to the highest claimed; other
  // categories keep their selection
  assert.equal(prog.setActiveCosmetic(erin.id, 'title', null).cosmetics.title, 'Nix Apprentice');
  assert.equal(prog.getUserCosmetics(erin.id).border, 'blue');
});

test('open() migrates legacy season-based battlepass tables', () => {
  const dbPath = path.join(os.tmpdir(), `nix-bp-legacy-${process.pid}.sqlite`);
  for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(dbPath + suffix); } catch {} }

  // Old layout: season XP track + per-season claims.
  const legacy = new (require('better-sqlite3'))(dbPath);
  legacy.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      name_ci TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE user_xp (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      total_xp INTEGER NOT NULL DEFAULT 0,
      season_xp INTEGER NOT NULL DEFAULT 0,
      season TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE bp_claims (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      season TEXT NOT NULL,
      tier INTEGER NOT NULL,
      claimed_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, season, tier)
    );
  `);
  legacy.prepare('INSERT INTO users (discord_id, name, name_ci) VALUES (?, ?, ?)').run('d1', 'Alice', 'alice');
  // Level-3 player (470 XP) who claimed tier 1 in two seasons and tier 2 in one.
  legacy.prepare('INSERT INTO user_xp (user_id, total_xp, season_xp, season) VALUES (?, 470, 0, ?)').run(1, '2026-07');
  legacy.prepare('INSERT INTO bp_claims (user_id, season, tier) VALUES (?, ?, ?)').run(1, '2026-06', 1);
  legacy.prepare('INSERT INTO bp_claims (user_id, season, tier) VALUES (?, ?, ?)').run(1, '2026-07', 1);
  legacy.prepare('INSERT INTO bp_claims (user_id, season, tier) VALUES (?, ?, ?)').run(1, '2026-07', 2);
  legacy.close();

  const db2 = open(dbPath);
  const q2 = prepareAll(db2);
  const prog2 = createProgressionService(db2, q2);

  const xpCols = db2.prepare('PRAGMA table_info(user_xp)').all().map((c) => c.name);
  assert.deepEqual(xpCols, ['user_id', 'total_xp'], 'season columns dropped from user_xp');

  const bpCols = db2.prepare('PRAGMA table_info(bp_claims)').all().map((c) => c.name);
  assert.ok(bpCols.includes('user_id') && bpCols.includes('tier') && bpCols.includes('claimed_at'));
  assert.ok(!bpCols.includes('season'), 'season column dropped from bp_claims');

  const tiers = q2.bpClaims.all(1).map((c) => c.tier).sort((a, b) => a - b);
  assert.deepEqual(tiers, [1, 2], 'claims carried over, deduped per user+tier');

  const xp = prog2.getUserXp(1);
  assert.equal(xp.totalXp, 470);
  assert.equal(xp.level, 3);

  const bp = prog2.getBattlepass(1);
  assert.equal(bp.level, 3);
  assert.ok(bp.tiers[0].unlocked && bp.tiers[0].claimed);
  assert.ok(bp.tiers[1].unlocked && bp.tiers[1].claimed);
  assert.ok(bp.tiers[2].unlocked && !bp.tiers[2].claimed, 'tier 3 unlocked by level, not yet claimed');
  assert.equal(bp.highestTier, 3);

  db2.close();
  for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(dbPath + suffix); } catch {} }
});

test('open() migrates a legacy (hand-rolled) sessions table', () => {
  const dbPath = path.join(os.tmpdir(), `nix-legacy-${process.pid}.sqlite`);
  for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(dbPath + suffix); } catch {} }

  // Simulate the old store: sessions (sid, data, expires)
  const legacy = new (require('better-sqlite3'))(dbPath);
  legacy.exec('CREATE TABLE sessions (sid TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL DEFAULT 0)');
  legacy.close();

  const migrated = open(dbPath);

  // Mirror app.js: the session store creates/recreates the sessions table.
  // The store's constructor schedules a non-unref'd setInterval cleanup
  // timer (15 min) and exposes no handle to clear it — so intercept
  // setInterval while constructing, or the test process never exits.
  const SqliteStore = require('better-sqlite3-session-store')(require('express-session'));
  const origSetInterval = global.setInterval;
  let intervalMs;
  global.setInterval = (fn, ms) => { intervalMs = ms; return { fn, ms }; };
  try {
    new SqliteStore({ client: migrated });
  } finally {
    global.setInterval = origSetInterval;
  }
  assert.ok(Number.isFinite(intervalMs) && intervalMs > 0, 'store schedules expired-session cleanup');

  const cols = migrated.prepare('PRAGMA table_info(sessions)').all().map((c) => c.name);
  migrated.close();

  assert.ok(cols.includes('sess'), 'new store column `sess` present');
  assert.ok(!cols.includes('data'), 'legacy `data` column removed');
  assert.ok(cols.includes('expire'), 'new store column `expire` present');

  for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(dbPath + suffix); } catch {} }
});

test('open() adds users.avatar_url to legacy databases (idempotently)', () => {
  const dbPath = path.join(os.tmpdir(), `nix-avatar-legacy-${process.pid}.sqlite`);
  for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(dbPath + suffix); } catch {} }

  // Pre-avatar layout: users table without the avatar_url column.
  const legacy = new (require('better-sqlite3'))(dbPath);
  legacy.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      name_ci TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  legacy.prepare('INSERT INTO users (discord_id, name, name_ci) VALUES (?, ?, ?)').run('d1', 'Alice', 'alice');
  legacy.close();

  const db2 = open(dbPath);
  const q2 = prepareAll(db2);

  const cols = db2.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  assert.ok(cols.includes('avatar_url'), 'avatar_url column added to legacy table');

  // Existing rows keep their data and get a NULL avatar until first login.
  const row = db2.prepare('SELECT * FROM users WHERE discord_id = ?').get('d1');
  assert.equal(row.name, 'Alice');
  assert.equal(row.avatar_url, null);

  // First-login flow: no row yet, so the avatar rides in the session until
  // the name is picked — insertUser now takes the avatar as 4th param.
  q2.insertUser.run('d2', 'Bob', 'bob', 'https://cdn.discordapp.com/embed/avatars/1.png');
  const bob = q2.userByDiscord.get('d2');
  assert.equal(bob.avatar_url, 'https://cdn.discordapp.com/embed/avatars/1.png');

  // Re-login refreshes a changed avatar.
  q2.updateAvatar.run('https://cdn.discordapp.com/avatars/d2/xyz.png?size=128', bob.id);
  assert.equal(q2.userByDiscord.get('d2').avatar_url, 'https://cdn.discordapp.com/avatars/d2/xyz.png?size=128');

  db2.close();

  // A second open() on an already-migrated db is a no-op.
  const db3 = open(dbPath);
  const cols2 = db3.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  assert.ok(cols2.includes('avatar_url'));
  db3.close();

  for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(dbPath + suffix); } catch {} }
});
