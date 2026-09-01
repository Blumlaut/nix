'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { withApp, goto, ME } = require('./harness');

test('rainbow border survives row hover in top nixers', withApp(async (ctx) => {
  const board = {
    me: ME,
    targets: [ME, { id: '2', name: 'Florian', avatar: null }],
    leaderboard: [
      { uid: '2', name: 'Florian', avatar: null, n: 4, received: 3, level: 9, title: 'Nix Master', border: 'rainbow' },
      { uid: '1', name: 'TestUser', avatar: null, n: 3, received: 4, level: 7, title: 'Nix Adept', border: null },
    ],
    mostNixed: [{ uid: '1', name: 'TestUser', n: 4 }],
    topPairs: [],
    streaks: [],
    recent: [],
    recentTotal: 0,
  };
  // Own routes instead of mockAuth() so the mock board can carry a rainbow
  // border (routes are per-page, so nothing else is affected).
  const page = await ctx.newPage({ width: 1280, height: 800 });
  await page.route('**/auth/discord*', (route) => route.abort());
  await page.route('**/api/me', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(ME) }));
  await page.route('**/api/xp', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ level: 9 }) }));
  await page.route('**/api/nemesis', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ nemesisId: '2', username: 'Florian', timesNixedYou: 4, revenge: 0 }) }));
  await page.route('**/api/board', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(board) }));
  await page.route('**/api/nixes*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [], total: 0, page: 1, limit: 10 }) }));
  await page.goto(ctx.url + '/', { waitUntil: 'domcontentloaded' });
  const row = page.locator('.list li.border-rainbow');
  await row.waitFor({ timeout: 10_000 });

  const bgImage = (el) => el.evaluate((n) => getComputedStyle(n).backgroundImage);
  assert.match(await bgImage(row), /linear-gradient/, 'rainbow gradient rendered before hover');

  await row.hover();
  assert.match(
    await bgImage(row),
    /linear-gradient/,
    'rainbow gradient must survive the row hover'
  );
}));
