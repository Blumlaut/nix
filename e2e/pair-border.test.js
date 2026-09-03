'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { withApp, ME } = require('./harness');

test('top pairs border frames wrap avatar + name (#11)', withApp(async (ctx) => {
  const board = {
    me: ME,
    targets: [ME, { id: '2', name: 'Florian', avatar: null }],
    leaderboard: [],
    mostNixed: [],
    topPairs: [
      { auid: '2', buid: '1', nixer: 'Florian', target: 'TestUser', aAvatar: null, bAvatar: null, n: 5, aBorder: 'gold', bBorder: null },
    ],
    streaks: [],
    recent: [],
    recentTotal: 0,
  };
  // Own routes instead of mockAuth() so the mock board can carry pair borders.
  const page = await ctx.newPage({ width: 1280, height: 800 });
  await page.route('**/auth/discord*', (route) => route.abort());
  await page.route('**/api/me', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(ME) }));
  await page.route('**/api/xp', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ level: 7 }) }));
  await page.route('**/api/nemesis', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ nemesisId: '2', username: 'Florian', timesNixedYou: 4, revenge: 0 }) }));
  await page.route('**/api/board', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(board) }));
  await page.route('**/api/nixes*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [], total: 0, page: 1, limit: 10 }) }));
  await page.goto(ctx.url + '/', { waitUntil: 'domcontentloaded' });

  // The framed unit is the .pair-user badge itself (avatar + name), not the name pill.
  const framed = page.locator('li.pair-row .pair-user.border-gold');
  await framed.waitFor({ timeout: 10_000 });
  const info = await framed.evaluate((el) => {
    const cs = getComputedStyle(el);
    const name = el.querySelector('.pair-name');
    return {
      border: cs.borderTopColor,
      hasAvatar: !!el.querySelector('img, .MuiAvatar-root'),
      nameBorderWidth: getComputedStyle(name).borderTopWidth,
      padLeft: getComputedStyle(el).paddingLeft,
      padRight: getComputedStyle(el).paddingRight,
    };
  });
  assert.doesNotMatch(info.border, /rgba\(0, 0, 0, 0\)/, 'framed pair-user must have a visible border');
  assert.ok(info.hasAvatar, 'avatar must sit inside the frame');
  assert.strictEqual(info.nameBorderWidth, '0px', 'inner name link must not add a second border in the frame');
  assert.strictEqual(info.padLeft, info.padRight, 'badge padding must be symmetric like the feed frame');

  // The unframed counterpart carries the same transparent baseline border, so
  // a cosmetic only adds color and framed/unframed rows stay identically sized.
  const plainBorder = await page.locator('li.pair-row .pair-user:not(.border-gold)')
    .evaluate((el) => getComputedStyle(el).borderTopColor);
  assert.match(plainBorder, /rgba\(0, 0, 0, 0\)/, 'unframed pair-user must have the transparent baseline border');
}));
