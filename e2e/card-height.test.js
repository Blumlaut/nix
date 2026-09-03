'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { withApp, ME } = require('./harness');

// Issue #8: "Top pairs" and "On a streak" both list 3 values but rendered at
// different card heights (streak rows use larger 26px avatars than the 20px
// pair avatars). Side-by-side cards in the same board row must be level.
test('side-by-side board cards share the same height', withApp(async (ctx) => {
  const board = {
    me: ME,
    targets: [ME],
    leaderboard: [],
    mostNixed: [
      { uid: '2', name: 'Alice', avatar: null, n: 4 },
      { uid: '3', name: 'Bob', avatar: null, n: 42 },
      { uid: '4', name: 'Carol', avatar: null, n: 128 },
    ],
    topPairs: [
      { nixer: 'Alice', auid: '2', aAvatar: null, target: 'Bob', buid: '3', bAvatar: null, n: 4 },
      { nixer: 'Bob', auid: '3', aAvatar: null, target: 'Carol', buid: '4', bAvatar: null, n: 42 },
      { nixer: 'Carol', auid: '4', aAvatar: null, target: 'Alice', buid: '2', bAvatar: null, n: 128 },
    ],
    streaks: [
      { id: '2', name: 'Alice', avatar: null, streak: 12 },
      { id: '3', name: 'Bob', avatar: null, streak: 27 },
      { id: '4', name: 'Carol', avatar: null, streak: 2 },
    ],
    recent: [],
    recentTotal: 0,
  };
  const page = await ctx.newPage({ width: 1280, height: 900 });
  await page.route('**/auth/discord*', (r) => r.abort());
  await page.route('**/api/me', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(ME) }));
  await page.route('**/api/xp', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ level: 1 }) }));
  await page.route('**/api/nemesis', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ nemesisId: null, username: null, timesNixedYou: 0, revenge: 0 }) }));
  await page.route('**/api/board', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(board) }));
  await page.route('**/api/nixes*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [], total: 0, page: 1, limit: 10 }) }));
  await page.goto(ctx.url + '/', { waitUntil: 'domcontentloaded' });
  await page.locator('#most-nixed .user-row').first().waitFor({ timeout: 10_000 });

  const cardByHeading = (heading) =>
    page.locator('.MuiGrid-root > .card', { has: page.locator('h2', { hasText: heading }) });

  const pairs = cardByHeading('Top pairs');
  const streak = cardByHeading('On a streak');
  assert.ok((await pairs.count()) === 1, 'top pairs card found');
  assert.ok((await streak.count()) === 1, 'streak card found');

  const h = (loc) => loc.evaluate((el) => el.getBoundingClientRect().height);
  const pairsH = await h(pairs);
  const streakH = await h(streak);

  // Same row → same top edge, and heights must match.
  const tops = async (loc) => loc.evaluate((el) => el.getBoundingClientRect().top);
  assert.ok(Math.abs(await tops(pairs) - await tops(streak)) < 1, 'cards are on the same row');
  assert.ok(
    Math.abs(pairsH - streakH) < 1,
    `top pairs (${pairsH}px) and streak (${streakH}px) card heights differ`
  );
}));
