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
const { createForumService } = require('../src/services/forum');

let db;
let q;
let stats;
let streaks;
let prog;
let users;
let forum;
let tmpDb;

before(() => {
  tmpDb = path.join(os.tmpdir(), `nix-test-${process.pid}.sqlite`);
  db = open(tmpDb);
  q = prepareAll(db);
  stats = createStatsService(db, q);
  streaks = createStreaksService(db, q);
  prog = createProgressionService(db, q);
  users = createUsersService(db, q);
  forum = createForumService(db, q);
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

test('streaks track runs', () => {
  const { alice, bob } = seed();
  q.insertNix.run(alice.id, bob.id);
  q.insertNix.run(alice.id, bob.id);
  const { current } = streaks.getStreaks();
  assert.ok(current[alice.id] >= 2, 'alice has a run of nixes');
  assert.equal(current[bob.id], 0, 'bob (the target) is not on a streak');
});

test('forum voting toggles and scores', () => {
  const { alice, bob } = seed();
  const info = q.createThread.run(alice.id, 'Hello', 'Body text');
  const tid = info.lastInsertRowid;

  assert.deepEqual(forum.castVote(bob.id, 'thread', tid, 1), { voted: 1, score: 1 });
  // voting the same direction removes the vote
  assert.deepEqual(forum.castVote(bob.id, 'thread', tid, 1), { voted: 0, score: 0 });
  // opposite direction flips
  assert.deepEqual(forum.castVote(bob.id, 'thread', tid, -1), { voted: -1, score: -1 });
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
