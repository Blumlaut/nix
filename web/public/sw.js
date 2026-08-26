'use strict';

const ICON = '/icon-192.png';

// A push arrives -> show a system notification.
self.addEventListener('push', (event) => {
  let data = { title: 'NIX scoreboard', body: 'Someone just got nixed.', icon: ICON, url: '/' };
  try {
    if (event.data) {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') data = Object.assign(data, parsed);
    }
  } catch (e) { /* keep defaults if payload is unexpected */ }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body || '',
      icon: data.icon || ICON,
      badge: ICON,
      data: { url: data.url || '/' }
    })
  );
});

// Clicking the notification focuses an open tab (or opens a new one) at the board.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) { w.navigate(url); return w.focus(); }
      }
      return self.clients.openWindow(url);
    }).catch(() => self.clients.openWindow(url))
  );
});
