'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { withApp, ME } = require('./harness');

// Issue #13: a nix can carry the *nixer's* position, recording is opt-out,
// and the statistics page shows the aggregated heatmap with filters.
const BOARD = {
  me: ME,
  targets: [ME, { id: '2', name: 'Florian', avatar: null }],
  leaderboard: [],
  mostNixed: [],
  netLeaderboard: [],
  topPairs: [],
  streaks: [],
  recent: [],
  recentTotal: 0,
};

const TILE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);

const STATS = {
  range: '30d',
  bucket: '1d',
  start: '2025-01-01',
  end: '2025-01-31',
  perDay: [{ d: '2025-01-01', n: 5 }],
  cumulative: [{ d: '2025-01-01', c: 5 }],
  streakTable: [],
  summary: {
    totalAll: 10,
    players: 3,
    inRange: 5,
    avgPerDay: 0.2,
    busiest: { d: '2025-01-01', n: 5 },
    first: '2025-01-01',
    last: '2025-01-31',
    highestStreak: null,
  },
};

async function mockBoard(page, location) {
  const json = (body) => (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/auth/discord*', (route) => route.abort());
  await page.route('**/api/me', json(ME));
  await page.route('**/api/xp', json({ level: 7 }));
  await page.route('**/api/nemesis', json({ nemesisId: null, username: null, timesNixedYou: 0, revenge: 0 }));
  await page.route('**/api/board', json({ ...BOARD, location: { enabled: location } }));
  await page.route('**/api/nixes*', json({ items: [], total: 0, page: 1, limit: 10 }));
}

/** Report a nix as Florian and hand back the request body the client sent. */
async function reportNix(page) {
  let posted;
  const sent = new Promise((resolve) => { posted = resolve; });
  await page.route('**/api/nix', async (route) => {
    const body = JSON.parse(route.request().postData());
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    posted(body);
  });

  await page.locator('#nix-target').click();
  await page.getByRole('option', { name: 'Florian' }).click();
  await page.getByRole('button', { name: 'I nixed them' }).click();
  return sent;
}

test('a granted geolocation permission travels with the nix', withApp(async (ctx) => {
  const page = await ctx.newPage();
  await mockBoard(page, true);
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 52.52, longitude: 13.405, accuracy: 20 });

  await page.goto(ctx.url + '/', { waitUntil: 'domcontentloaded' });
  await page.locator('#nix-target').waitFor({ timeout: 10_000 });

  const body = await reportNix(page);
  assert.deepStrictEqual(body.location, { lat: 52.52, lon: 13.405, accuracy: 20 });
}));

test('a denied permission just means no location — the nix still counts', withApp(async (ctx) => {
  const page = await ctx.newPage();
  await mockBoard(page, true);

  await page.goto(ctx.url + '/', { waitUntil: 'domcontentloaded' });
  await page.locator('#nix-target').waitFor({ timeout: 10_000 });

  const body = await reportNix(page);
  assert.strictEqual(body.location, undefined, 'nothing is sent when the browser withholds a fix');
  assert.strictEqual(await page.locator('.MuiSnackbar-root').textContent(), 'Nix recorded.');
}));

test('a switched-off setting never asks the browser at all', withApp(async (ctx) => {
  const page = await ctx.newPage();
  await mockBoard(page, false);
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 52.52, longitude: 13.405, accuracy: 20 });

  await page.goto(ctx.url + '/', { waitUntil: 'domcontentloaded' });
  await page.locator('#nix-target').waitFor({ timeout: 10_000 });

  const body = await reportNix(page);
  assert.strictEqual(body.location, undefined);
}));

test('the statistics page maps nixes and filters them by range and nixer', withApp(async (ctx) => {
  const page = await ctx.newPage({ width: 1280, height: 1000 });
  const json = (body) => (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  const heatUrls = [];

  await page.route('**/auth/discord*', (route) => route.abort());
  await page.route('**/api/me', json(ME));
  await page.route('**/api/xp', json({ level: 7 }));
  await page.route('**/api/nemesis', json({ nemesisId: null }));
  await page.route('**/api/stats*', json(STATS));
  await page.route('**/api/me/nix-calendar', json({ map: {}, total: 0, end: '2025-01-31' }));
  // Tiles stay offline; the vector cells are what the test asserts on.
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ contentType: 'image/png', body: TILE }));
  await page.route('**/api/location/heatmap*', (route) => {
    const url = new URL(route.request().url());
    heatUrls.push(url.search);
    const byUser = url.searchParams.get('user') === '3';
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        range: url.searchParams.get('range'),
        cellDegrees: 0.01,
        minCellNixes: 3,
        minCellNixers: byUser ? 1 : 3,
        located: byUser ? 3 : 12,
        nixes: 40,
        cells: byUser
          ? [{ lat: 52.52, lon: 13.4, n: 3, nixers: 1 }]
          : [
            { lat: 52.52, lon: 13.4, n: 9, nixers: 4 },
            { lat: 52.53, lon: 13.41, n: 3, nixers: 3 },
          ],
        users: [{ id: '2', name: 'Florian' }, { id: '3', name: 'Zoe' }],
      }),
    });
  });

  await page.goto(ctx.url + '/stats', { waitUntil: 'domcontentloaded' });
  await page.locator('#nix-map .leaflet-container').waitFor({ timeout: 10_000 });

  assert.ok(heatUrls[0].includes('range=30d'), `map follows the page range: ${heatUrls[0]}`);
  assert.strictEqual(await page.locator('#nix-map path.leaflet-interactive').count(), 2, 'one square per cell');
  assert.match(await page.locator('#nix-map .loc-head .sub').textContent(), /12 of 40 nixes/);
  assert.match(await page.locator('#nix-map .loc-note').textContent(), /at least 3 different nixers/);

  // The range toggle on the page drives the map too.
  await page.getByRole('button', { name: '90 days' }).click();
  await page.locator('#nix-map path.leaflet-interactive').nth(1).waitFor();
  assert.ok(heatUrls.some((s) => s.includes('range=90d')), `range change refetches: ${heatUrls.join(' ')}`);

  // …and so does the nixer filter, down to a single nixer's own cells.
  await page.locator('#loc-user').click();
  await page.getByRole('option', { name: 'Zoe' }).click();
  await page.waitForFunction(() => document.querySelectorAll('#nix-map path.leaflet-interactive').length === 1);
  assert.ok(heatUrls.some((s) => s.includes('user=3')), `nixer filter refetches: ${heatUrls.join(' ')}`);
  assert.match(await page.locator('#nix-map .loc-head .sub').textContent(), /3 of 40 nixes/);
}));

test('the map says so when a range holds too little location data', withApp(async (ctx) => {
  const page = await ctx.newPage({ width: 1280, height: 1000 });
  const json = (body) => (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });

  await page.route('**/auth/discord*', (route) => route.abort());
  await page.route('**/api/me', json(ME));
  await page.route('**/api/xp', json({ level: 7 }));
  await page.route('**/api/nemesis', json({ nemesisId: null }));
  await page.route('**/api/stats*', json(STATS));
  await page.route('**/api/me/nix-calendar', json({ map: {}, total: 0, end: '2025-01-31' }));
  await page.route('**/api/location/heatmap*', json({
    range: '30d', cellDegrees: 0.01, minCellNixes: 3, minCellNixers: 3,
    located: 2, nixes: 40, cells: [], users: [],
  }));

  await page.goto(ctx.url + '/stats', { waitUntil: 'domcontentloaded' });
  await page.locator('#nix-map').waitFor({ timeout: 10_000 });
  await page.getByText('Not enough located nixes in this range yet.').waitFor({ timeout: 10_000 });
  assert.strictEqual(await page.locator('#nix-map path.leaflet-interactive').count(), 0);
}));

test('the settings switch turns recording off and on again', withApp(async (ctx) => {
  const page = await ctx.newPage();
  const json = (body) => (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  let posted = null;

  await page.route('**/auth/discord*', (route) => route.abort());
  await page.route('**/api/me', json(ME));
  await page.route('**/api/xp', json({ level: 7 }));
  await page.route('**/api/location/settings', (route) => {
    if (route.request().method() === 'POST') {
      posted = JSON.parse(route.request().postData());
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ enabled: posted.enabled }) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ enabled: true, located: 5 }) });
  });

  await page.goto(ctx.url + '/settings', { waitUntil: 'domcontentloaded' });
  const card = page.locator('#location-settings');
  await card.waitFor({ timeout: 10_000 });
  assert.match(await card.textContent(), /5 locations stored/);

  await card.locator('input[type="checkbox"]').click();
  assert.deepStrictEqual(posted, { enabled: false });
  await card.getByText('Location recording is off').waitFor({ timeout: 10_000 });
}));
