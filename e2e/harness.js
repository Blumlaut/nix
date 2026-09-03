'use strict';

/**
 * E2E harness: boots the real app in-process (ephemeral port, temp DB, dummy
 * auth) and a headless browser. No env vars, no manual server needed.
 *
 * Usage (node --test):
 *   const { withApp } = require('./e2e/harness');
 *   test('...', async ({ app, browser }) => { ... });
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../src/app');
const { chromium } = require('playwright');

const ME = { id: '1', discordId: '1', name: 'TestUser', avatar: null };

function tempConfig() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-e2e-'));
  return {
    port: 0,
    host: '127.0.0.1',
    baseUrl: 'http://localhost',
    sessionSecret: 'e2e-secret',
    discordClientId: 'e2e-dummy',
    discordClientSecret: 'e2e-dummy',
    dbPath: path.join(dir, 'e2e.sqlite'),
    sessionTtlMs: 60_000,
  };
}

/**
 * Mock the session-gated endpoints with a 200 so the client never sees a 401
 * (any 401 does window.location.href = '/auth/discord', see web/src/api.js).
 * Add routes here as pages under test need more endpoints.
 */
async function mockAuth(page) {
  const fulfill = (body) => (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
  await page.route('**/auth/discord*', (route) => route.abort());
  await page.route('**/api/me', fulfill(ME));
  await page.route('**/api/xp', fulfill({ level: 7 }));
  await page.route('**/api/nemesis', fulfill({ nemesisId: '2', username: 'Florian', timesNixedYou: 4, revenge: 0 }));
  await page.route('**/api/board', fulfill({
    me: ME,
    targets: [ME, { id: '2', name: 'Florian', avatar: null }],
    leaderboard: [
      { uid: '1', name: 'TestUser', avatar: null, n: 3, received: 4, level: 7, title: 'Nix Adept', border: null },
      { uid: '2', name: 'Florian', avatar: null, n: 4, received: 3, level: 9, title: 'Nix Master', border: null },
    ],
    mostNixed: [{ uid: '1', name: 'TestUser', n: 4, border: null }],
    topPairs: [],
    streaks: [],
    recent: [],
    recentTotal: 0,
  }));
  await page.route('**/api/nixes*', fulfill({ items: [], total: 0, page: 1, limit: 10 }));
}

/**
 * Test adapter: test('name', withApp(async (ctx) => { ... }))
 * Boots the app + browser per test and tears both down afterwards.
 * ctx: { url, browser, newPage(viewport?), app: { url, close } }
 */
function withApp(run) {
  return async () => {
    const config = tempConfig();
    // SqliteStore starts a cleanup setInterval it never unrefs, which would
    // keep this process alive forever. Unref every interval created while
    // building the app (test-only; production behavior is untouched).
    const origSetInterval = global.setInterval;
    global.setInterval = (...args) => origSetInterval(...args).unref?.();
    let app;
    try {
      app = createApp(config);
    } finally {
      global.setInterval = origSetInterval;
    }
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;

    // Prefer playwright's own browser; fall back to system chromium when the
    // cached build doesn't match (version skew between install and cache).
    let browser;
    try {
      browser = await chromium.launch({ args: ['--no-sandbox'] });
    } catch (err) {
      if (!/Executable doesn't exist/.test(String(err))) throw err;
      browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
    }

    const ctx = {
      url,
      browser,
      newPage: (viewport = { width: 390, height: 844 }) =>
        browser.newPage({ viewport, deviceScaleFactor: 2 }),
      app: {
        url,
        // close() alone hangs: keep-alive sockets stay open. Force them shut first.
        close: () => new Promise((resolve) => {
          server.closeAllConnections?.();
          server.close(resolve);
        }),
      },
    };
    try {
      await run(ctx);
    } finally {
      await browser.close();
      await ctx.app.close();
      fs.rmSync(path.dirname(config.dbPath), { recursive: true, force: true });
    }
  };
}

/**
 * Load a page and return it after network settle. Apps with polling
 * intervals never reach 'networkidle', so wait for a marker element instead.
 */
async function goto(ctx, pathName = '/', selector = 'header', viewport) {
  const page = await ctx.newPage(viewport);
  await mockAuth(page);
  await page.goto(ctx.url + pathName, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(selector, { timeout: 10_000 });
  return page;
}

module.exports = { withApp, mockAuth, goto, ME };
