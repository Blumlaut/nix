'use strict';

/**
 * Colour theme toggle.
 * Initial theme is set by an inline <head> script (before paint) to avoid a
 * flash. This module wires the header button, persists the choice and
 * follows the OS preference until the user explicitly picks a theme.
 */
(function () {
  const KEY = 'theme';
  const root = document.documentElement;

  const MOON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  const SUN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';

  function current() { return root.dataset.theme === 'dark' ? 'dark' : 'light'; }
  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function save(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  function syncIcon() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const dark = current() === 'dark';
    btn.innerHTML = dark ? SUN : MOON;
    btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#theme-toggle');
    if (!btn) return;
    const next = current() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    save(next);
    syncIcon();
  });

  // Follow the OS preference, but only until the user makes an explicit choice.
  try {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (stored() !== 'light' && stored() !== 'dark') {
        root.dataset.theme = e.matches ? 'dark' : 'light';
      }
      syncIcon();
    });
  } catch (e) { /* older browser — fine */ }

  syncIcon();
})();

/* Aurora pointer parallax — fine-pointer desktops only, motion-safe. */
(function () {
  const aurora = document.querySelector('.aurora');
  if (!aurora) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  let tx = 0, ty = 0, cx = 0, cy = 0, raf = null;
  function tick() {
    cx += (tx - cx) * 0.045;
    cy += (ty - cy) * 0.045;
    aurora.style.transform = 'translate3d(' + cx.toFixed(2) + 'px,' + cy.toFixed(2) + 'px,0)';
    raf = (Math.abs(tx - cx) > 0.15 || Math.abs(ty - cy) > 0.15) ? requestAnimationFrame(tick) : null;
  }
  window.addEventListener('pointermove', (e) => {
    tx = (e.clientX / window.innerWidth - 0.5) * 28;
    ty = (e.clientY / window.innerHeight - 0.5) * 20;
    if (!raf) raf = requestAnimationFrame(tick);
  }, { passive: true });
})();
