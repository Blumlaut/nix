'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { withApp, goto } = require('./harness');

// Issue #14: the Main Dashboard shows a Net Nix Balance leaderboard
// (given − received) for all users, ranked highest net first, with given and
// received shown alongside so the ranking stays transparent.
test('net nix balance card ranks users and shows given/received/net', withApp(async (ctx) => {
  const page = await goto(ctx, '/', '#net-balance');

  const rows = page.locator('#net-balance .list li.user-row');
  assert.strictEqual(await rows.count(), 2, 'both users are listed');

  const names = await rows.locator('.uname').allTextContents();
  assert.deepStrictEqual(names, ['Florian', 'TestUser'], 'ranked by net descending');

  // First place (net +1): 4 given, 3 received, +1 net.
  const first = rows.first();
  assert.strictEqual((await first.locator('.nix-given').textContent()).trim(), '⚔️ 4');
  assert.strictEqual((await first.locator('.nix-received').textContent()).trim(), '🛡️ 3');
  const firstNet = first.locator('.nix-net');
  assert.strictEqual((await firstNet.textContent()).trim(), '+1');
  assert.ok(await firstNet.evaluate((el) => el.classList.contains('positive')));

  // Last place (net -1): the sign and colour make a negative balance explicit.
  const lastNet = rows.last().locator('.nix-net');
  assert.strictEqual((await lastNet.textContent()).trim(), '-1');
  assert.ok(await lastNet.evaluate((el) => el.classList.contains('negative')));
}));
