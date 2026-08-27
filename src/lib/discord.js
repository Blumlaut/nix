'use strict';

/**
 * Discord avatar helpers.
 *
 * passport-discord passes the raw `/users/@me` payload as `profile`:
 * `profile.id` is the (string) snowflake ID and `profile.avatar` is the
 * avatar hash, or null when the user has no custom avatar.
 */
const CDN = 'https://cdn.discordapp.com';

/**
 * Build the CDN URL for a user's avatar.
 *
 * Users without a custom avatar get a deterministic default avatar.
 * Discord indexes defaults by `id % 6` for accounts created after the
 * username-reform (Sept 2022) and by `id % 5` for older ones; the
 * identify-scope payload carries no creation date, so we use the classic
 * `% 5`. Worst case a custom-less user gets a different-but-valid default
 * image, and anyone with a real avatar is unaffected.
 *
 * @param {string} discordId  snowflake user ID
 * @param {string|null} avatarHash  hash from the Discord API, or null
 * @returns {string} absolute CDN URL
 */
function discordAvatarUrl(discordId, avatarHash) {
  const id = String(discordId);
  if (avatarHash) return `${CDN}/avatars/${id}/${avatarHash}.png?size=128`;
  return `${CDN}/embed/avatars/${(BigInt(id) % 5n).toString()}.png`;
}

module.exports = { discordAvatarUrl };
