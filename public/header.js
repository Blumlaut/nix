'use strict';
(function () {
  var header = document.getElementById('app-header');
  if (!header) return;

  header.innerHTML =
    '<header>' +
    '<a class="brand" href="/">NIX<span>.scoreboard</span></a>' +
    '<nav class="nav">' +
    '  <a href="/">Board</a>' +
    '  <a href="/stats">Stats</a>' +
    '  <a href="/forum">Forum</a>' +
    '  <a href="/rules">Rules</a>' +
    '  <a href="/changelog">Changelog</a>' +
    '</nav>' +
    '<div class="hdr-right">' +
    '  <button class="theme-toggle" id="theme-toggle" title="Toggle theme" aria-label="Toggle theme"></button>' +
    '  <div class="avatar-wrap" id="avatar-wrap">' +
    '    <button class="avatar-btn" id="avatar-btn" aria-haspopup="true" aria-expanded="false">' +
    '      <span class="avatar-letter" id="avatar-letter">?</span>' +
    '    </button>' +
    '    <div class="avatar-dd" id="avatar-dd" role="menu" hidden>' +
    '      <div class="dd-user"><b id="dd-name">…</b><span class="dd-level" id="dd-level"></span></div>' +
    '      <a href="#" role="menuitem" id="dd-profile">Profile</a>' +
    '      <a href="/settings" role="menuitem">Settings</a>' +
    '      <hr class="dd-sep">' +
    '      <a href="/logout" role="menuitem" class="dd-logout">Logout</a>' +
    '    </div>' +
    '  </div>' +
    '</div>' +
    '</header>';

  // active nav
  var path = window.location.pathname;
  header.querySelectorAll('nav a').forEach(function (a) {
    var href = a.getAttribute('href');
    if (href === '/' ? path === '/' : path.indexOf(href) === 0) a.classList.add('active');
  });

  // populate avatar from /api/me
  fetch('/api/me', { credentials: 'same-origin' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (me) {
      if (!me || !me.name) return;
      document.getElementById('avatar-letter').textContent = me.name[0].toUpperCase();
      document.getElementById('dd-name').textContent = me.name;
      var pp = document.getElementById('dd-profile');
      pp.href = '/user/' + me.id;
    })
    .catch(function () {});

  // dropdown toggle
  var btn = document.getElementById('avatar-btn');
  var dd = document.getElementById('avatar-dd');
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    var open = dd.hasAttribute('hidden');
    if (open) { dd.removeAttribute('hidden'); btn.setAttribute('aria-expanded', 'true'); }
    else { dd.setAttribute('hidden', ''); btn.setAttribute('aria-expanded', 'false'); }
  });
  document.addEventListener('click', function () {
    if (!dd.hasAttribute('hidden')) { dd.setAttribute('hidden', ''); btn.setAttribute('aria-expanded', 'false'); }
  });
  dd.addEventListener('click', function (e) { e.stopPropagation(); });
  // close on Escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !dd.hasAttribute('hidden')) { dd.setAttribute('hidden', ''); btn.setAttribute('aria-expanded', 'false'); btn.focus(); }
  });
})();
