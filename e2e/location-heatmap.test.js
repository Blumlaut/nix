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
        coarseCellDegrees: 0.1,
        minCellNixes: 2,
        minCellNixers: byUser ? 1 : 2,
        coarseMinCellNixes: 1,
        located: byUser ? 3 : 12,
        nixes: 40,
        cells: byUser
          ? [{
            lat: 52.52, lon: 13.4, n: 3, nixers: 1, degrees: 0.01,
            pairs: [{ nixer: 'Zoe', target: 'Bob', at: '2025-01-05 10:00:00' }],
          }]
          : [
            {
              lat: 52.52, lon: 13.4, n: 9, nixers: 4, degrees: 0.01,
              pairs: [
                { nixer: 'Wanda', target: 'Bob', at: '2025-01-05 10:00:00' },
                { nixer: 'Uwe', target: 'Bob', at: '2025-01-04 09:00:00' },
                { nixer: 'Vera', target: 'Bob', at: '2025-01-03 08:00:00' },
              ],
            },
            { lat: 52.53, lon: 13.41, n: 3, nixers: 3, degrees: 0.01, pairs: [] },
            {
              lat: 53.5, lon: 10.0, n: 2, nixers: 1, degrees: 0.1,
              pairs: [{ nixer: 'Zoe', target: 'Bob', at: '2025-01-02 12:00:00' }],
            },
          ],
        users: [{ id: '2', name: 'Florian' }, { id: '3', name: 'Zoe' }],
      }),
    });
  });

  await page.goto(ctx.url + '/stats', { waitUntil: 'domcontentloaded' });
  await page.locator('#nix-map .leaflet-container').waitFor({ timeout: 10_000 });

  assert.ok(heatUrls[0].includes('range=30d'), `map follows the page range: ${heatUrls[0]}`);
  const pins = page.locator('#nix-map .nix-pin');
  const clusters = page.locator('#nix-map .nix-pin.is-cluster');
  // Zoomed out, the two Berlin cells sit far closer than a pin is wide, so
  // they share one pin; Munich stands on its own.
  assert.strictEqual(await pins.count(), 2, 'cells that close together share a pin');
  assert.strictEqual(await clusters.count(), 1, 'the two Berlin cells are the merged ones');
  assert.deepStrictEqual(
    (await pins.allTextContents()).sort(),
    ['12', '2'],
    'a merged pin counts every nix behind it',
  );
  assert.strictEqual(await page.locator('#nix-map .nix-pin.is-coarse').count(), 1, 'the ~11 km cell gets the dashed outline');
  // Pins are painted from the theme's accent ramp, not fixed hexes, and
  // leaflet's default white div-icon box is styled away.
  assert.strictEqual(await page.locator('#nix-map .nix-pin.lvl-4').count(), 1, 'the busiest pin takes the top density step');
  assert.match(
    await clusters.locator('span b').evaluate((el) => getComputedStyle(el).maskImage),
    /^url\("data:image\/svg\+xml/,
    'a merged pin wears its own ring',
  );
  const pinPaint = await pins.first().evaluate((el) => {
    const span = el.querySelector('span');
    const body = getComputedStyle(span, '::before');
    const label = getComputedStyle(span.querySelector('i'));
    return {
      box: getComputedStyle(el).backgroundColor,
      fill: body.backgroundImage,
      mask: body.maskImage || body.webkitMaskImage,
      ring: getComputedStyle(document.querySelector('#nix-map .nix-pin.is-coarse span'), '::after').maskImage,
      w: parseFloat(span.style.width),
      h: parseFloat(span.style.height),
      labelTop: parseFloat(label.top),
    };
  });
  assert.ok(/^rgba?\(0, 0, 0, 0\)$/.test(pinPaint.box), `pin icon box stays clear: ${pinPaint.box}`);
  assert.match(pinPaint.fill, /linear-gradient/, 'pin fill follows the theme accent gradient');
  // The silhouette is a masked map-pin path, not a border-radius box.
  assert.match(pinPaint.mask, /^url\("data:image\/svg\+xml/, `the fill is clipped to a pin shape: ${pinPaint.mask}`);
  assert.match(pinPaint.ring, /^url\("data:image\/svg\+xml/);
  assert.notStrictEqual(pinPaint.ring, pinPaint.mask, 'the coarse outline is its own dashed shape');
  assert.ok(pinPaint.h >= 24 && pinPaint.h <= 44, `pins stay small: ${pinPaint.h}px tall`);
  const loneH = await page.locator('#nix-map .nix-pin:not(.is-cluster) span')
    .evaluate((span) => parseFloat(span.style.height));
  assert.ok(loneH >= 24 && loneH <= 40, `a single-area pin keeps to the normal size: ${loneH}px tall`);
  assert.ok(pinPaint.w < pinPaint.h, `a pin is taller than it is wide: ${pinPaint.w}x${pinPaint.h}`);
  // The count sits on the head, 35% down the pin's box.
  assert.ok(Math.abs(pinPaint.labelTop / pinPaint.h - 0.35) < 0.02,
    `the label is centred on the head: ${pinPaint.labelTop} of ${pinPaint.h}`);
  assert.match(await page.locator('#nix-map .loc-head .sub').textContent(), /12 of 40 nixes/);
  assert.match(await page.locator('#nix-map .loc-note').textContent(), /click one to see who nixed whom/);
  assert.match(await page.locator('#nix-map .loc-note').textContent(), /roughly 11 km area/);

  // Clicking a merged pin zooms to the level where its areas split apart…
  await clusters.click();
  await page.waitForFunction(() => document.querySelectorAll('#nix-map .nix-pin.is-cluster').length === 0);
  assert.strictEqual(await pins.count(), 3, 'zooming in spreads the merged cells apart again');
  assert.deepStrictEqual((await pins.allTextContents()).sort(), ['2', '3', '9']);
  // …and one step back out gathers them up again.
  await page.locator('#nix-map .leaflet-control-zoom-out').click();
  await page.waitForFunction(() => document.querySelectorAll('#nix-map .nix-pin.is-cluster').length === 1);
  assert.strictEqual(await pins.count(), 2, 'zooming out merges them back into one pin');
  await clusters.click();
  await page.waitForFunction(() => document.querySelectorAll('#nix-map .nix-pin.is-cluster').length === 0);

  // A pin's popup lists who nixed whom in that area.
  await pins.filter({ hasText: '9' }).click();
  const popup = page.locator('#nix-map .leaflet-popup-content');
  await popup.getByText('Wanda nixed Bob').waitFor({ timeout: 5_000 });
  assert.match(await popup.textContent(), /Uwe nixed Bob/);
  assert.match(await popup.textContent(), /2025-01-03/);
  assert.match(await popup.textContent(), /Showing the latest 3 of 9/);

  // The range toggle on the page drives the map too.
  await page.getByRole('button', { name: '90 days' }).click();
  await page.locator('#nix-map .nix-pin').nth(1).waitFor();
  assert.ok(heatUrls.some((s) => s.includes('range=90d')), `range change refetches: ${heatUrls.join(' ')}`);

  // …and so does the nixer filter, down to a single nixer's own cells.
  await page.locator('#loc-user').click();
  await page.getByRole('option', { name: 'Zoe' }).click();
  await page.waitForFunction(() => document.querySelectorAll('#nix-map .nix-pin').length === 1);
  assert.strictEqual(await clusters.count(), 0, 'a lone cell is never a merged pin');
  assert.ok(heatUrls.some((s) => s.includes('user=3')), `nixer filter refetches: ${heatUrls.join(' ')}`);
  assert.match(await page.locator('#nix-map .loc-head .sub').textContent(), /3 of 40 nixes/);
}));

test('the map says so when a range holds no location data', withApp(async (ctx) => {
  const page = await ctx.newPage({ width: 1280, height: 1000 });
  const json = (body) => (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });

  await page.route('**/auth/discord*', (route) => route.abort());
  await page.route('**/api/me', json(ME));
  await page.route('**/api/xp', json({ level: 7 }));
  await page.route('**/api/nemesis', json({ nemesisId: null }));
  await page.route('**/api/stats*', json(STATS));
  await page.route('**/api/me/nix-calendar', json({ map: {}, total: 0, end: '2025-01-31' }));
  await page.route('**/api/location/heatmap*', json({
    range: '30d', cellDegrees: 0.01, coarseCellDegrees: 0.1,
    minCellNixes: 2, minCellNixers: 2, coarseMinCellNixes: 1,
    located: 0, nixes: 40, cells: [], users: [],
  }));

  await page.goto(ctx.url + '/stats', { waitUntil: 'domcontentloaded' });
  await page.locator('#nix-map').waitFor({ timeout: 10_000 });
  await page.getByText(/No located nixes in this range yet/).waitFor({ timeout: 10_000 });
  assert.strictEqual(await page.locator('#nix-map .nix-pin').count(), 0);
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

test('cells sharing a centre stay one pin and list both areas', withApp(async (ctx) => {
  const page = await ctx.newPage({ width: 1280, height: 1000 });
  const json = (body) => (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });

  await page.route('**/auth/discord*', (route) => route.abort());
  await page.route('**/api/me', json(ME));
  await page.route('**/api/xp', json({ level: 7 }));
  await page.route('**/api/nemesis', json({ nemesisId: null }));
  await page.route('**/api/stats*', json(STATS));
  await page.route('**/api/me/nix-calendar', json({ map: {}, total: 0, end: '2025-01-31' }));
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ contentType: 'image/png', body: TILE }));
  // A ~1 km cell sitting exactly on the ~11 km cell around it: no zoom can
  // tell those two apart, so the pin must stay merged and keep both reachable.
  await page.route('**/api/location/heatmap*', json({
    range: '30d', cellDegrees: 0.01, coarseCellDegrees: 0.1,
    minCellNixes: 2, minCellNixers: 2, coarseMinCellNixes: 1,
    located: 6, nixes: 40,
    cells: [
      { lat: 52.5, lon: 13.4, n: 4, nixers: 2, degrees: 0.01, pairs: [] },
      { lat: 52.5, lon: 13.4, n: 2, nixers: 1, degrees: 0.1, pairs: [] },
    ],
    users: [],
  }));

  await page.goto(ctx.url + '/stats', { waitUntil: 'domcontentloaded' });
  await page.locator('#nix-map .leaflet-container').waitFor({ timeout: 10_000 });

  const merged = page.locator('#nix-map .nix-pin.is-cluster');
  await merged.waitFor({ timeout: 10_000 });
  assert.strictEqual(await page.locator('#nix-map .nix-pin').count(), 1, 'overlapping cells share a pin');
  assert.strictEqual(await merged.textContent(), '6', 'the merged pin counts both areas');

  await merged.click();
  const popup = page.locator('#nix-map .leaflet-popup-content');
  await popup.getByText('4 nixes · 2 nixers · ~1 km area').waitFor({ timeout: 5_000 });
  assert.match(await popup.textContent(), /2 nixes · 1 nixer · ~11 km area/, 'both areas stay reachable');
}));
