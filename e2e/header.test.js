'use strict';

/**
 * E2E: header layout at mobile and desktop widths.
 * Run: npm run test:e2e
 */

const assert = require('node:assert');
const { test } = require('node:test');
const { withApp, goto } = require('./harness');

test('mobile header: brand+actions row 1, scrollable nav row 2', withApp(async (ctx) => {
  const page = await goto(ctx, '/', 'header');
  const m = await page.evaluate(() => {
    const r = (sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { top: b.top, left: b.left, right: b.right, bottom: b.bottom };
    };
    const nav = document.querySelector('nav.nav');
    return {
      brand: r('.brand'),
      nav: { ...r('nav.nav'), scrollWidth: nav.scrollWidth, clientWidth: nav.clientWidth },
      right: r('.hdr-right'),
      docWidth: document.documentElement.clientWidth,
    };
  });

  // Actions (theme toggle + avatar) share row 1 with the brand.
  assert.ok(m.right.bottom <= m.nav.top, `actions (${m.right.bottom}) should end before nav row (${m.nav.top})`);
  assert.ok(m.brand.bottom <= m.nav.top, 'brand should be on row 1');
  // Nav is its own full-width row and fits the viewport.
  assert.ok(m.nav.left <= 16 && m.nav.right >= m.docWidth - 16, 'nav strip should span the header width');
  assert.ok(m.nav.right <= m.docWidth + 1, 'nav must not overflow the viewport');
  // Links must not wrap vertically inside the strip.
  assert.ok(m.nav.bottom - m.nav.top < 60, 'nav links should stay on one line (scroll, not wrap)');
}));

test('mobile nav link navigates', withApp(async (ctx) => {
  const page = await goto(ctx, '/', 'header');
  await page.click('nav.nav a[href="/rules"]');
  await page.waitForURL('**/rules');
  await page.waitForSelector('main');
}));

test('desktop header stays a single row', withApp(async (ctx) => {
  const page = await goto(ctx, '/', 'header', { width: 1280, height: 800 });
  const v = await page.evaluate(() => {
    const b = (sel) => document.querySelector(sel).getBoundingClientRect();
    const band = { brand: b('.brand'), nav: b('nav.nav'), right: b('.hdr-right') };
    // Same row <=> all vertical ranges share a common band.
    const maxTop = Math.max(...Object.values(band).map((r) => r.top));
    const minBottom = Math.min(...Object.values(band).map((r) => r.bottom));
    return {
      sameRow: maxTop < minBottom,
      navWidth: band.nav.width,
      docWidth: document.documentElement.clientWidth,
    };
  });
  assert.ok(v.sameRow, 'brand, nav and actions should share one row on desktop');
  assert.ok(v.navWidth < v.docWidth, 'nav should not overflow on desktop');
}));
