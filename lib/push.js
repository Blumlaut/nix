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
const { stmts } = require('./db');

const DATA_DIR = path.join(__dirname, '..', 'data');
const VAPID_FILE = path.join(DATA_DIR, 'vapid.json');
const SUBJECT = 'mailto:admin@nix.zap.cloud'; // VAPID "contact" (claim, not used for delivery)
const ICON = '/icon-192.png';

let vapidKeys;
if (fs.existsSync(VAPID_FILE)) {
  vapidKeys = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8'));
} else {
  vapidKeys = webpush.generateVAPIDKeys();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(VAPID_FILE, JSON.stringify(vapidKeys, null, 2), { mode: 0o600 });
}
webpush.setVapidDetails(SUBJECT, vapidKeys.publicKey, vapidKeys.privateKey);

/** Send one encrypted push to a single subscription. */
function sendOne(sub, payload) {
  return webpush.sendNotification(
    { endpoint: sub.endpoint, keys: sub.keys },
    JSON.stringify(payload),
    { TTL: 60 }
  );
}

/**
 * Push a nix to all subscribers except the nixer. Fire-and-forget:
 * dead subscriptions (HTTP 404/410) are pruned, other errors are swallowed.
 */
function notifyNix(excludeUserId, nixerName, targetName) {
  let subs;
  try {
    subs = stmts.allPushSubs.all();
  } catch (e) {
    return; // never let push break the nix
  }
  subs = subs.filter((s) => s.user_id !== excludeUserId);
  if (!subs.length) return;

  const payload = {
    title: `${nixerName} nixed ${targetName}`,
    body: 'NIX scoreboard',
    icon: ICON,
    url: '/'
  };

  subs.forEach((row) => {
    const sub = { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } };
    sendOne(sub, payload).catch((err) => {
      const code = err && err.statusCode;
      if (code === 404 || code === 410) {
        try { stmts.delPushSub.run(row.endpoint); } catch (_) { /* ignore */ }
      }
    });
  });
}

module.exports = { publicKey: vapidKeys.publicKey, sendOne, notifyNix };
