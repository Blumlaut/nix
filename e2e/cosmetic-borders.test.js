'use strict';

/**
 * E2E: every border cosmetic a nixpass tier can grant must actually paint.
 * Solid borders come from a --cos-* colour, the gradient ones from the
 * shared background-image recipe — a tier whose value has no CSS renders a
 * borderless row, which is the bug this guards against.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { withApp, ME } = require('./harness');

const SOLID = ['ruby', 'sapphire', 'jade'];
const GRADIENT = ['aurora', 'prismatic'];

test('all nixpass border cosmetics render on leaderboard rows', withApp(async (ctx) => {
  const borders = [...SOLID, ...GRADIENT];
  const board = {
    me: ME,
    targets: [ME],
    leaderboard: borders.map((border, i) => ({
      uid: String(i + 2),
      name: `Player ${border}`,
      avatar: null,
      n: 5 - i,
      received: 0,
      level: 30,
      title: null,
      border,
    })),
    mostNixed: [],
    topPairs: [],
    streaks: [],
    recent: [],
    recentTotal: 0,
  };
  const page = await ctx.newPage({ width: 1280, height: 900 });
  await page.route('**/auth/discord*', (route) => route.abort());
  await page.route('**/api/me', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(ME) }));
  await page.route('**/api/xp', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ level: 30 }) }));
  await page.route('**/api/nemesis', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(null) }));
  await page.route('**/api/board', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(board) }));
  await page.route('**/api/nixes*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [], total: 0, page: 1, limit: 10 }) }));
  await page.goto(ctx.url + '/', { waitUntil: 'domcontentloaded' });

  for (const border of borders) {
    const row = page.locator(`.list li.border-${border}`);
    await row.waitFor({ timeout: 10_000 });
    const style = await row.evaluate((n) => {
      const s = getComputedStyle(n);
      return { width: s.borderTopWidth, style: s.borderTopStyle, color: s.borderTopColor, image: s.backgroundImage };
    });
    assert.equal(style.width, '2px', `.border-${border} must set a 2px border`);
    assert.equal(style.style, 'solid', `.border-${border} must render a solid border`);
    if (GRADIENT.includes(border)) {
      assert.match(style.image, /linear-gradient/, `.border-${border} must paint its gradient`);
      assert.equal(style.color, 'rgba(0, 0, 0, 0)', `.border-${border} keeps the border transparent for the gradient`);
    } else {
      assert.ok(
        style.color && style.color !== 'rgba(0, 0, 0, 0)',
        `.border-${border} must resolve its colour (got ${style.color})`
      );
    }
  }
}));
