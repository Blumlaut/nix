'use strict';

/**
 * Changelog page — renders the app's recent git history, grouped by date.
 */
(function () {
  const list = document.querySelector('#cl-list');

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  }[c]));

  function fmtDate(iso) {
    const d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function render(commits) {
    const byDate = new Map();
    for (const c of commits) {
      if (!byDate.has(c.date)) byDate.set(c.date, []);
      byDate.get(c.date).push(c);
    }
    let html = '';
    for (const [date, entries] of byDate) {
      html += `<h2 class="cl-date">${esc(fmtDate(date))}</h2><ul class="cl-group">`;
      for (const c of entries) {
        const body = c.body ? `<p class="cl-body">${esc(c.body)}</p>` : '';
        html += `<li class="cl-entry"><h3 class="cl-subject">${esc(c.subject)}</h3>${body}<div class="cl-meta"><span class="cl-hash">${esc(c.hash.slice(0, 7))}</span></div></li>`;
      }
      html += '</ul>';
    }
    list.innerHTML = html;
    document.querySelector('.page-foot')?.classList.add('visible');
  }

  async function init() {
    try {
      const res = await fetch('/api/changelog', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!data.commits || !data.commits.length) {
        list.innerHTML = '<p class="cl-loading">No commits yet.</p>';
        return;
      }
      render(data.commits);
    } catch (e) {
      list.innerHTML = '<p class="cl-loading">Could not load the changelog. Try refreshing.</p>';
    }
  }

  init();
})();
