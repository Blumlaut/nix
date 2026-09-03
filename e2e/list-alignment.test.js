'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { withApp, ME } = require('./harness');

// Issue #7: avatars/names in "Most nixed", "Top pairs" and "On a streak"
// shifted with the width of the value on the right. They must line up
// vertically no matter how many digits the value has.
test('leaderboard rows keep left content aligned regardless of value width', withApp(async (ctx) => {
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
      { id: '2', name: 'Alice', avatar: null, streak: 2 },
      { id: '3', name: 'Bob', avatar: null, streak: 27 },
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

  const boxes = async (selector) =>
    page.$$eval(selector, (els) =>
      els.map((el) => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right }; })
    );

  // Most nixed: avatars and names left-aligned, values right-aligned.
  const avatars = await boxes('#most-nixed .user-row .MuiAvatar-root');
  const vals = await boxes('#most-nixed .n');
  const streakAvatars = await boxes('#streaks .user-row .MuiAvatar-root');

  const sameLeft = (boxes, label) =>
    assert.ok(
      boxes.every((b) => Math.abs(b.left - boxes[0].left) < 1),
      `${label} lefts not aligned: ${JSON.stringify(boxes)}`
    );

  sameLeft(avatars, 'most-nixed avatars');
  sameLeft(streakAvatars, 'streak avatars');

  // Values share the same right edge (flush right).
  assert.ok(
    vals.every((b) => Math.abs(b.right - vals[0].right) < 1),
    `most-nixed value rights not aligned: ${JSON.stringify(vals)}`
  );

  // Top pairs: the "A nixed B" text starts at the same x on every row.
  const pairLefts = await page.$$eval('.card .list li .pair', (els) =>
    els.map((el) => el.getBoundingClientRect().left)
  );
  assert.ok(pairLefts.length === 3, 'top pairs rows rendered');
  assert.ok(
    pairLefts.every((l) => Math.abs(l - pairLefts[0]) < 1),
    `top-pair rows not aligned: ${JSON.stringify(pairLefts)}`
  );
}));
