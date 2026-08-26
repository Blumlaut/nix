'use strict';

/**
 * Web Push layer.
 *
 * - Generates a VAPID key pair on first run and persists it to data/vapid.json
 *   (stable across restarts, so existing subscriptions keep working).
 * - Sends encrypted (aes128gcm) push messages via the `web-push` package.
 * - Fans out a "nix" to every subscriber except the person who did the nix.
 */

const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const SUBJECT = 'mailto:admin@nix.zap.cloud'; // VAPID "contact" (claim, not used for delivery)
const ICON = '/icon-192.png';

function loadVapidKeys(dataDir) {
  const file = path.join(dataDir, 'vapid.json');
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  const keys = webpush.generateVAPIDKeys();
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(keys, null, 2), { mode: 0o600 });
  return keys;
}

/**
 * @param {ReturnType<import('./db/queries').prepareAll>} queries
 * @param {string} dataDir
 */
function createPush(queries, dataDir) {
  const vapidKeys = loadVapidKeys(dataDir);
  webpush.setVapidDetails(SUBJECT, vapidKeys.publicKey, vapidKeys.privateKey);

  function sendOne(sub, payload) {
    return webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify(payload),
      { TTL: 60 }
    );
  }

  /**
   * Push a nix to all subscribers except the nixer. Fire-and-forget: dead
   * subscriptions (HTTP 404/410) are pruned, other errors are swallowed.
   */
  function notifyNix(excludeUserId, nixerName, targetName) {
    let subs;
    try {
      subs = queries.allPushSubs.all();
    } catch (e) {
      return; // never let push break the nix
    }
    subs = subs.filter((s) => s.user_id !== excludeUserId);
    if (!subs.length) return;

    const payload = {
      title: `${nixerName} nixed ${targetName}`,
      body: 'NIX scoreboard',
      icon: ICON,
      url: '/',
    };

    subs.forEach((row) => {
      const sub = {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      sendOne(sub, payload).catch((err) => {
        const code = err && err.statusCode;
        if (code === 404 || code === 410) {
          try {
            queries.delPushSub.run(row.endpoint);
          } catch (_) { /* ignore */ }
        }
      });
    });
  }

  return { publicKey: vapidKeys.publicKey, sendOne, notifyNix };
}

module.exports = { createPush };
