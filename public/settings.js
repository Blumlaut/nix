'use strict';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts
  });
  if (res.status === 401) { location.href = '/auth/discord'; return null; }
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// ---- Web Push ----
function pushSupported() {
  return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
}

function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const b64u = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from([...window.atob(b64u)].map((c) => c.charCodeAt(0)));
}

async function getPublicKey() {
  const r = await api('/api/push/public-key');
  return r && r.data && r.data.publicKey;
}

const pushBtn = $('#push-toggle');
const pushStatus = $('#push-status');
let swReg = null;
let isSubscribed = false;

function setPushStatus(msg, kind) {
  pushStatus.textContent = msg || '';
  pushStatus.className = kind || '';
}

function setPushState(subscribed, supported = true) {
  isSubscribed = subscribed;
  if (!supported) {
    pushBtn.textContent = 'Not supported in this browser';
    pushBtn.disabled = true;
    setPushStatus('This browser does not support Web Push.', 'error');
    return;
  }
  pushBtn.disabled = false;
  pushBtn.textContent = subscribed ? 'Disable nix notifications' : 'Enable nix notifications';
  setPushStatus(
    subscribed ? "You're subscribed — you'll get a push for every nix." : '',
    subscribed ? 'ok' : ''
  );
}

async function enablePush() {
  setPushStatus('Requesting browser permission…');
  let perm;
  try { perm = await Notification.requestPermission(); } catch (e) { perm = 'denied'; }
  if (perm !== 'granted') {
    setPushStatus(
      perm === 'denied'
        ? 'Permission denied. Turn on notifications for this site in your browser, then try again.'
        : 'Permission not granted.',
      'error'
    );
    return;
  }
  setPushStatus('Subscribing…');
  const publicKey = await getPublicKey();
  if (!publicKey) { setPushStatus('Could not fetch the push key.', 'error'); return; }
  try {
    let sub = await swReg.pushManager.getSubscription();
    if (!sub) {
      sub = await swReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
    }
    const res = await api('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription: sub.toJSON() })
    });
    if (!res || res.status >= 400) { setPushStatus('Could not save your subscription.', 'error'); return; }
    setPushState(true);
  } catch (e) {
    setPushStatus('Could not subscribe: ' + ((e && e.message) || e), 'error');
  }
}

async function disablePush() {
  setPushStatus('Disabling…');
  try {
    const sub = await swReg.pushManager.getSubscription();
    if (sub) {
      await api('/api/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    } else {
      await api('/api/push/unsubscribe', { method: 'POST', body: JSON.stringify({}) });
    }
    setPushState(false);
  } catch (e) {
    setPushStatus('Could not disable: ' + ((e && e.message) || e), 'error');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const r = await api('/api/me');
  if (!r) return; // 401 → redirected to Discord
  if (!r.data.name) { location.href = '/'; return; } // pick a name first

  $('#rename-name').value = r.data.name;
  document.querySelector('.page-foot')?.classList.add('visible');

  $('#rename-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#rename-name');
    const err = $('#rename-err');
    const ok = $('#rename-ok');
    err.textContent = '';
    ok.textContent = '';
    const res = await api('/api/me/name', {
      method: 'POST',
      body: JSON.stringify({ name: input.value })
    });
    if (res.status === 409 && res.data.error === 'name_taken') {
      err.textContent = 'That name is already taken.';
      return;
    }
    if (res.status >= 400) { err.textContent = 'Could not save name.'; return; }
    const _al=document.getElementById('avatar-letter');if(_al)_al.textContent=res.data.name[0].toUpperCase();const _dn=document.getElementById('dd-name');if(_dn)_dn.textContent=res.data.name;
    ok.textContent = 'Saved.';
    setTimeout(() => { ok.textContent = ''; }, 2500);
  });

  // Push notifications
  if (!pushSupported()) {
    setPushState(false, false);
    return;
  }
  try {
    swReg = await navigator.serviceWorker.register('/sw.js');
    const sub = await swReg.pushManager.getSubscription();
    setPushState(!!sub);
    pushBtn.addEventListener('click', () => { isSubscribed ? disablePush() : enablePush(); });
    // If the browser rotates the subscription, re-store it.
    swReg.pushManager.onsubscriptionchange = async () => {
      try {
        const cur = await swReg.pushManager.getSubscription();
        if (!cur) return;
        await api('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: cur.toJSON() }) });
      } catch (e) { /* best effort */ }
    };
  } catch (e) {
    setPushStatus('Could not start notifications: ' + ((e && e.message) || e), 'error');
  }
});
