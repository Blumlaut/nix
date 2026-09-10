'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { withApp, goto } = require('./harness');

// Issue #14: the Main Dashboard shows a Net Nix Balance leaderboard
// (given − received) for all users, ranked highest net first, with given,
// received, net and the K/D ratio (given ÷ received) shown alongside so the
// ranking stays transparent.
test('net nix balance card ranks users and shows given/received/net/kd', withApp(async (ctx) => {
  const page = await goto(ctx, '/', '#net-balance');

  const rows = page.locator('#net-balance .list li.user-row');
  assert.strictEqual(await rows.count(), 5, 'all users are listed');

  const names = await rows.locator('.uname').allTextContents();
  assert.deepStrictEqual(
    names,
    ['Zoe', 'Nadia', 'Florian', 'Robin', 'TestUser'],
    'ranked by net descending'
  );

  const kd = async (row) => (await row.locator('.nix-kd').textContent()).trim();

  // Net +4, 7 given against 3 received: rounded to two decimals.
  const first = rows.nth(0);
  assert.strictEqual((await first.locator('.nix-given').textContent()).trim(), '⚔️ 7');
  assert.strictEqual((await first.locator('.nix-received').textContent()).trim(), '🛡️ 3');
  const firstNet = first.locator('.nix-net');
  assert.strictEqual((await firstNet.textContent()).trim(), '+4');
  assert.ok(await firstNet.evaluate((el) => el.classList.contains('positive')));
  assert.strictEqual(await kd(first), 'K/D 2.33');

  // Net +3, nobody ever nixed her: an infinite K/D (not a division by zero).
  assert.strictEqual(await kd(rows.nth(1)), 'K/D ∞');

  // Net +2, 4 given for 2 received: a whole ratio drops the decimals.
  assert.strictEqual(await kd(rows.nth(2)), 'K/D 2');

  // Net 0, no nixes at all: there is no ratio to show.
  assert.strictEqual(await kd(rows.nth(3)), 'K/D —');

  // Net -1: the sign and colour make a negative balance explicit, and a K/D
  // below 1 shows the losing side of it.
  const last = rows.nth(4);
  const lastNet = last.locator('.nix-net');
  assert.strictEqual((await lastNet.textContent()).trim(), '-1');
  assert.ok(await lastNet.evaluate((el) => el.classList.contains('negative')));
  assert.strictEqual(await kd(last), 'K/D 0.75');

  // The extra column must not widen the card past the viewport on a phone
  // (goto's default 390px viewport).
  const overflow = await page.$eval('#net-balance', (el) => el.scrollWidth - el.clientWidth);
  assert.ok(overflow <= 1, `net balance card overflows by ${overflow}px on a phone`);
}));
