'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { withApp, ME } = require('./harness');

// Issues #7/#9: avatars/names must stay left-aligned and vertically centered
// in EVERY ranked card, regardless of value width or row content. Rows come
// from components/RankedList.jsx (user-row / pair-row) — this pins the shared
// markup so the bug cannot recur in just one panel again (#3/#9 were the same
// misalignment, two panels apart).
test('leaderboard rows keep left content aligned regardless of value width', withApp(async (ctx) => {
  const board = {
    me: ME,
    targets: [ME],
    leaderboard: [
      { uid: '2', name: 'Alice', avatar: null, n: 128, received: 4, level: 9, title: 'Nix Master', border: null },
      { uid: '3', name: 'Bob', avatar: null, n: 42, received: 42, level: 5, title: null, border: 'gold' },
      { uid: '4', name: 'Carol', avatar: null, n: 4, received: 128, level: 2, title: null, border: null },
    ],
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

  // Reported on desktop and on a narrow (phone) viewport — run the whole
  // contract at both.
  for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const page = await ctx.newPage(vp);
    await page.route('**/auth/discord*', (r) => r.abort());
    await page.route('**/api/me', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(ME) }));
    await page.route('**/api/xp', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ level: 1 }) }));
    await page.route('**/api/nemesis', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ nemesisId: null, username: null, timesNixedYou: 0, revenge: 0 }) }));
    await page.route('**/api/board', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(board) }));
    await page.route('**/api/nixes*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [], total: 0, page: 1, limit: 10 }) }));
    await page.goto(ctx.url + '/', { waitUntil: 'domcontentloaded' });
    await page.locator('#most-nixed .user-row').first().waitFor({ timeout: 10_000 });
    const where = `@${vp.width}x${vp.height}`;

    const boxes = async (selector) =>
      page.$$eval(selector, (els) =>
        els.map((el) => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right }; })
      );
    // Card-scoped: avatars must share one x within their own card (each card
    // has its own rank column, so lefts only agree inside a card).
    const cardByHeading = (heading) =>
      page.locator('.MuiGrid-root > .card', { has: page.locator('h2', { hasText: heading }) });
    const leftsIn = async (card) =>
      card.locator('.user-row .MuiAvatar-root').evaluateAll((els) =>
        els.map((el) => el.getBoundingClientRect().left)
      );

    // Most nixed: avatars and names left-aligned, values right-aligned.
    const avatars = await boxes('#most-nixed .user-row .MuiAvatar-root');
    const vals = await boxes('#most-nixed .n');
    const streakAvatars = await leftsIn(cardByHeading('On a streak'));
    const topNixersAvatars = await leftsIn(cardByHeading('Top nixers'));

    const sameLeft = (xs, label) =>
      assert.ok(
        xs.length > 1 && xs.every((x) => Math.abs(x - xs[0]) < 1),
        `${label} lefts not aligned ${where}: ${JSON.stringify(xs)}`
      );

    sameLeft(avatars.map((b) => b.left), 'most-nixed avatars');
    sameLeft(streakAvatars, 'streak avatars');
    sameLeft(topNixersAvatars, 'top-nixers avatars');

    // Every ranked card renders its rows (all four are built from RankedList).
    const perCard = await page.$$eval('.card .list li:not(.empty)', (rows) => {
      const by = {};
      for (const li of rows) {
        const head = li.closest('.card').querySelector('h2').textContent;
        by[head] = (by[head] || 0) + 1;
      }
      return by;
    });
    assert.deepStrictEqual(perCard, {
      'Top nixers': 3,
      'Most nixed': 3,
      'Top pairs': 3,
      '🔥 On a streak': 2,
    }, `all four leaderboard cards render through RankedList ${where}`);

    // Values share the same right edge (flush right).
    assert.ok(
      vals.every((b) => Math.abs(b.right - vals[0].right) < 1),
      `most-nixed value rights not aligned ${where}: ${JSON.stringify(vals)}`
    );

    // Top pairs: the "A nixed B" text starts at the same x on every row.
    const pairLefts = await page.$$eval('.card .list li .pair', (els) =>
      els.map((el) => el.getBoundingClientRect().left)
    );
    assert.ok(pairLefts.length === 3, `top pairs rows rendered ${where}`);
    assert.ok(
      pairLefts.every((l) => Math.abs(l - pairLefts[0]) < 1),
      `top-pair rows not aligned ${where}: ${JSON.stringify(pairLefts)}`
    );

    // Issues #3/#9: every row child (avatar, name, meta, value) must be
    // vertically centered within its row — in every card, not just Top pairs.
    await page.$$eval('.card .list li:not(.empty)', (rows) =>
      rows.forEach((li) => {
        const row = li.getBoundingClientRect();
        const rowCenter = (row.top + row.bottom) / 2;
        li.querySelectorAll('.MuiAvatar-root, a, .n, .user-meta, .user-nixes, .pair').forEach((el) => {
          const b = el.getBoundingClientRect();
          const center = (b.top + b.bottom) / 2;
          if (Math.abs(center - rowCenter) > 3) {
            throw new Error(
              `row child not vertically centered ${where}: offset ${Math.abs(center - rowCenter).toFixed(1)}px`
            );
          }
        });
      })
    );
    await page.close();
  }
}));
