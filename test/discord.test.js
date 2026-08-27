'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { discordAvatarUrl } = require('../src/lib/discord');

test('discordAvatarUrl builds the CDN URL from an avatar hash', () => {
  assert.equal(
    discordAvatarUrl('123456789', 'abc123def'),
    'https://cdn.discordapp.com/avatars/123456789/abc123def.png?size=128'
  );
});

test('discordAvatarUrl falls back to a default avatar when the hash is null', () => {
  assert.equal(
    discordAvatarUrl('123456789', null),
    'https://cdn.discordapp.com/embed/avatars/4.png' // 123456789 % 5 === 4
  );
});

test('discordAvatarUrl handles snowflake-sized ids without precision loss', () => {
  // A real-world snowflake, larger than Number.MAX_SAFE_INTEGER.
  const id = '313376114651145216';
  assert.equal(
    discordAvatarUrl(id, null),
    'https://cdn.discordapp.com/embed/avatars/1.png' // 313376114651145216 % 5 === 1
  );
  assert.equal(
    discordAvatarUrl(id, 'xyz'),
    `https://cdn.discordapp.com/avatars/${id}/xyz.png?size=128`
  );
});
