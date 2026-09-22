'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const { open } = require('../src/db');
const { prepareAll } = require('../src/db/queries');
const { createStatsService } = require('../src/services/stats');
const { createStreaksService } = require('../src/services/streaks');
const { createProgressionService } = require('../src/services/progression');
const { createUsersService } = require('../src/services/users');
const { createLocationsService, parseFix } = require('../src/services/locations');
const { createApiRouter } = require('../src/routes/api');

let db;
let q;
let locations;
let server;
let baseUrl;
let tmpDb;

// The office cell (52.52 / 13.40, ~1.1 km across) is where the interesting
// cases live; every other test gets its own cell so the counts stay readable.
const OFFICE = { lat: 52.520, lon: 13.400, accuracy: 20 };
const HAMBURG = { lat: 53.551, lon: 9.993, accuracy: 30 };
const FRANKFURT = { lat: 50.111, lon: 8.681, accuracy: 30 };

before(async () => {
  tmpDb = path.join(os.tmpdir(), `nix-locations-${process.pid}.sqlite`);
  db = open(tmpDb);
  q = prepareAll(db);
  locations = createLocationsService(db, q);

  const deps = {
    queries: q,
    stats: createStatsService(db, q),
    streaks: createStreaksService(db, q),
    progression: createProgressionService(db, q),
    users: createUsersService(db, q),
    locations,
    push: { publicKey: null, notifyNix() {} },
    config: {},
  };

  // A stub login keeps the real routes under test without Discord.
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = q.userByDiscord.get('discord-alice');
    req.isAuthenticated = () => true;
    next();
  });
  app.use('/api', createApiRouter(deps));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(resolve);
  });
  db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(tmpDb + suffix); } catch { /* ignore */ }
  }
});

function user(name) {
  db.prepare('INSERT OR IGNORE INTO users (discord_id, name, name_ci) VALUES (?, ?, ?)')
    .run(`discord-${name.toLowerCase()}`, name, name.toLowerCase());
  return q.userByNameCi.get(name.toLowerCase());
}

/** Record a nix for `nixer` against `target`, optionally with a fix. */
function nix(nixer, target, fix) {
  const { lastInsertRowid } = q.insertNix.run(nixer.id, target.id);
  locations.recordForNix(Number(lastInsertRowid), nixer.id, fix);
  return Number(lastInsertRowid);
}

test('parseFix coarsens the fix and rejects anything unusable', () => {
  assert.equal(parseFix(null), null);
  assert.equal(parseFix({ lat: 'nope', lon: 1 }), null);
  assert.equal(parseFix({ lat: 91, lon: 0 }), null);
  assert.equal(parseFix({ lat: 0, lon: -181 }), null);
  // A fix worse than 200 m tells us nothing about where the nix happened.
  assert.equal(parseFix({ lat: 52.52, lon: 13.4, accuracy: 5000 }), null);

  assert.deepEqual(
    parseFix({ lat: 52.520008, lon: 13.404954, accuracy: 12.4 }),
    { lat: 52.52, lon: 13.405, accuracy: 12 }
  );
  // Missing accuracy is allowed — the precision is ours to pick, not the client's.
  assert.deepEqual(parseFix({ lat: 52.520008, lon: 13.404954 }), { lat: 52.52, lon: 13.405, accuracy: null });
});

test('a nix stores the nixer\'s position, never the target\'s', () => {
  const alice = user('Alice');
  const bob = user('Bob');
  nix(alice, bob, HAMBURG);

  const rows = db.prepare('SELECT nix_id, nixer_id, lat, lon FROM nix_locations').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].nixer_id, alice.id);
  assert.equal(rows[0].lat, 53.551);
  assert.equal(rows[0].lon, 9.993);
  assert.equal(q.userLocationCount.get(bob.id).n, 0);
});

test('an opt-out records nothing', () => {
  const carol = user('Carol');
  const bob = user('Bob');
  locations.setEnabled(carol.id, false);
  assert.equal(locations.isEnabled(carol.id), false);

  const id = nix(carol, bob, FRANKFURT);
  assert.equal(q.userLocationCount.get(carol.id).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM nix_locations WHERE nix_id = ?').get(id).n, 0);

  // Switching back on resumes recording; a missing row already means "on".
  locations.setEnabled(carol.id, true);
  nix(carol, bob, FRANKFURT);
  assert.equal(q.userLocationCount.get(carol.id).n, 1);
  assert.equal(locations.isEnabled(user('Dave').id), true);
});

test('a bad or missing fix never costs the nix', () => {
  const erin = user('Erin');
  const bob = user('Bob');
  assert.ok(nix(erin, bob, undefined));
  assert.ok(nix(erin, bob, { lat: 999, lon: 0 }));
  assert.ok(nix(erin, bob, { lat: 52.52, lon: 13.4, accuracy: 900 }));
  assert.equal(q.userLocationCount.get(erin.id).n, 0);
  assert.equal(q.userGiven.get(erin.id).n, 3);
});

test('the heatmap publishes thin cells coarsely instead of dropping them', () => {
  const wanda = user('Wanda');
  const uwe = user('Uwe');
  const vera = user('Vera');
  const zoe = user('Zoe');
  const target = user('Bob');
  const before = locations.heatmap({ range: 'all' }).located;

  // Five nixes from three different nixers in the office cell.
  nix(wanda, target, OFFICE);
  nix(wanda, target, { lat: 52.521, lon: 13.401, accuracy: 25 });
  nix(wanda, target, { lat: 52.523, lon: 13.403, accuracy: 25 });
  nix(uwe, target, OFFICE);
  nix(vera, target, OFFICE);
  // Two nixes from one nixer in a second cell: no company, so only coarse.
  nix(zoe, target, { lat: 50.941, lon: 6.951, accuracy: 30 });
  nix(zoe, target, { lat: 50.942, lon: 6.952, accuracy: 30 });

  const map = locations.heatmap({ range: 'all' });
  assert.equal(map.located, before + 7, 'coverage counts every fix, published or not');

  const cell = map.cells.find((c) => c.lat === 52.52 && c.lon === 13.4);
  assert.ok(cell, 'the office cell is served');
  assert.equal(cell.n, 5);
  assert.equal(cell.nixers, 3);
  assert.equal(cell.degrees, 0.01, 'a multi-nixer cell keeps the fine grid');
  assert.equal(map.minCellNixers, 2, 'the floor travels with the response');

  assert.equal(
    map.cells.some((c) => c.lat === 50.94 || c.lon === 6.95),
    false,
    "a lone nixer's fixes are never published on the fine grid",
  );
  const lone = map.cells.find((c) => c.lat === 50.9 && c.lon === 7);
  assert.ok(lone, "a lone nixer's fixes still show up, just roughly");
  assert.equal(lone.n, 2);
  assert.equal(lone.nixers, 1);
  assert.equal(lone.degrees, 0.1, 'the fallback grid is ~11 km, an order of magnitude coarser');
  assert.equal(map.coarseCellDegrees, 0.1);
});

test('a single located nix is still not a cell', () => {
  const zoe = q.userByNameCi.get('zoe');
  nix(zoe, user('Bob'), { lat: 48.137, lon: 11.576, accuracy: 25 });

  const map = locations.heatmap({ range: 'all' });
  assert.equal(
    map.cells.some((c) => c.lat === 48.1),
    false,
    'one fix says too little to publish, even coarsely',
  );
});

test('the heatmap can be filtered by nixer and by range', () => {
  const wanda = q.userByNameCi.get('wanda');
  const filtered = locations.heatmap({ range: 'all', userId: wanda.id });
  assert.equal(filtered.minCellNixers, 1, 'one nixer can meet the nix floor, not the nixer floor');
  assert.deepEqual(filtered.cells.map((c) => c.n), [3], 'only her own three nixes');
  assert.equal(filtered.nixes, q.userGiven.get(wanda.id).n, 'coverage follows the filter too');

  // Backdate every fix out of the 7-day window.
  db.prepare("UPDATE nix_locations SET created_at = datetime('now', '-40 days')").run();
  const all = locations.heatmap({ range: 'all' });
  assert.equal(all.cells.length, 2, 'the office cell plus the lone nixer\'s coarse one');
  assert.equal(all.cells[0].lat, 52.52, 'busiest cell first');
  assert.equal(locations.heatmap({ range: '7d' }).cells.length, 0);
  assert.equal(locations.heatmap({ range: 'nonsense' }).range, '30d', 'unknown ranges fall back');
});

test('deleting a nix deletes the position with it', () => {
  const alice = q.userByNameCi.get('alice');
  const bob = q.userByNameCi.get('bob');
  const before = q.userLocationCount.get(alice.id).n;
  const id = nix(alice, bob, OFFICE);

  q.deleteNix.run(id, alice.id);
  assert.equal(q.userLocationCount.get(alice.id).n, before, 'the fix dies with its nix');
});

test('a user can wipe every position they ever recorded', () => {
  const alice = q.userByNameCi.get('alice');
  const before = locations.heatmap({ range: 'all' }).located;
  const removed = locations.forget(alice.id);

  assert.ok(removed > 0);
  assert.equal(q.userLocationCount.get(alice.id).n, 0);
  assert.equal(locations.heatmap({ range: 'all' }).located, before - removed, 'other users are untouched');
});

test('POST /api/nix records the fix and the heatmap serves cells only', async () => {
  const bob = q.userByNameCi.get('bob');
  const res = await fetch(`${baseUrl}/api/nix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetId: bob.id, location: { lat: 52.5198, lon: 13.4004, accuracy: 18 } }),
  });
  assert.equal(res.status, 200);
  assert.equal(q.userLocationCount.get(bob.id).n, 0, 'never the target');
  const stored = db.prepare('SELECT lat, lon FROM nix_locations ORDER BY nix_id DESC LIMIT 1').get();
  assert.deepEqual(stored, { lat: 52.52, lon: 13.4 });

  const map = await (await fetch(`${baseUrl}/api/location/heatmap?range=all`)).json();
  assert.deepEqual(map.cells.map((c) => [c.lat, c.lon]), [[52.52, 13.4], [50.9, 7]]);
  assert.deepEqual(map.cells.map((c) => c.degrees), [0.01, 0.1]);
  assert.equal(JSON.stringify(map).includes('52.5198'), false, 'no raw precision leaves the server');

  const denied = await fetch(`${baseUrl}/api/nix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetId: bob.id, location: { lat: 52.5, lon: 13.4, accuracy: 1000 } }),
  });
  assert.equal(denied.status, 200, 'a rejected fix does not reject the nix');
  assert.equal(q.userLocationCount.get(bob.id).n, 0);

  assert.equal((await fetch(`${baseUrl}/api/location/heatmap?user=abc`)).status, 400);
  assert.equal((await fetch(`${baseUrl}/api/location/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: 'yes' }),
  })).status, 400);
});
