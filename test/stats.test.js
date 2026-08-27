'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { open } = require('../src/db');
const { prepareAll } = require('../src/db/queries');
const { createStatsService } = require('../src/services/stats');

let db;
let q;
let stats;
let tmpDb;

before(() => {
  tmpDb = path.join(os.tmpdir(), `nix-stats-test-${process.pid}.sqlite`);
  db = open(tmpDb);
  q = prepareAll(db);
  stats = createStatsService(db, q);
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

test('stats 6h buckets count the midnight (00:00-06:00) bucket', () => {
  const { alice, bob } = seed();
  // A nix from 10 days ago, inside the midnight bucket: the SQL bucket key
  // used to render the hour unpadded ('0:00') while listBuckets() labels
  // are zero-padded ('00:00'), so nixes in this window vanished from charts.
  const midnightTs = db.prepare(
    "SELECT strftime('%Y-%m-%d 02:30:00', 'now', '-10 days') AS t"
  ).get().t;
  db.prepare('INSERT INTO nixes (nixer_id, nixed_id, created_at) VALUES (?, ?, ?)')
    .run(alice.id, bob.id, midnightTs);
  const s = stats.getStats('30d');
  const label = `${midnightTs.slice(0, 10)} 00:00`;
  const midnight = s.perDay.find((p) => p.d === label);
  assert.ok(midnight, `${label} bucket present`);
  assert.equal(midnight.n, 1, 'nix in the midnight bucket is counted');
});
