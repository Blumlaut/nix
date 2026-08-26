'use strict';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>\"]/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
}[c]));

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function parseDate(d) { const [y, m, dd] = d.split('-').map(Number); return { y, m, dd }; }
function fmtShort(d) { const { m, dd } = parseDate(d); return `${MONTHS[m - 1]} ${dd}`; }
function fmtFull(d) { const { y, m, dd } = parseDate(d); return `${MONTHS[m - 1]} ${dd}, ${y}`; }
// Sub-day buckets carry 'YYYY-MM-DD HH:00'; daily buckets 'YYYY-MM-DD'.
function splitBucket(d) { return d.includes(' ') ? d.split(' ') : [d, null]; }
function fmtShortB(d, bucket) { const [date, hh] = splitBucket(d); return bucket === '1d' ? fmtShort(date) : `${fmtShort(date)} ${hh}:00`; }
function fmtFullB(d, bucket) { const [date, hh] = splitBucket(d); return bucket === '1d' ? fmtFull(date) : `${fmtFull(date)} ${hh}:00`; }
function rangeLabel(r) {
  return ({ '7d': 'last 7 days', '30d': 'last 30 days', '90d': 'last 90 days', 'all': 'all time' })[r] || r;
}

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

const state = { range: '30d' };

function renderSummary(s) {
  const tiles = [
    { k: 'Nixes', v: s.totalAll, sub: 'all time' },
    { k: 'Players', v: s.players, sub: 'tracked' },
    { k: 'Avg / day', v: s.avgPerDay, sub: rangeLabel(state.range) },
    { k: 'Busiest day', v: s.busiest ? s.busiest.n : 0, sub: s.busiest ? fmtFull(s.busiest.d) : rangeLabel(state.range) },
    { k: 'Highest streak', v: s.highestStreak ? s.highestStreak.n : 0, sub: s.highestStreak ? `${s.highestStreak.name} · all time` : 'no streaks yet' }
  ];
  $('#stats-grid').innerHTML = tiles.map((t) =>
    `<div class="stat"><div class="k">${esc(t.k)}</div><div class="v">${esc(t.v)}</div><div class="s">${esc(t.sub)}</div></div>`
  ).join('');
}

/** Per-pair streak table — only real streaks (>= 2). */
function renderStreakTable(rows) {
  const tbody = $('#streak-rows');
  if (!tbody) return;
  tbody.innerHTML = rows.length
    ? rows.map((r) =>
        `<tr><td>${esc(r.name)}</td><td>${esc(r.against)}</td>` +
        `<td class="num">🔥 ${r.streak}</td><td class="num">${r.best}</td></tr>`).join('')
    : '<tr><td colspan="4" class="empty">Nobody\'s on a streak right now.</td></tr>';
}

function edgeLabels(items) {
  if (items.length === 1) return [items[0]];
  if (items.length === 2) return [items[0], items[1]];
  return [items[0], items[Math.floor(items.length / 2)], items[items.length - 1]];
}

function renderBars(perDay, bucket) {
  const bars = $('#bars');
  const labels = $('#xlabels');
  if (!perDay.length) {
    bars.innerHTML = '<p class="empty">No data for this range.</p>';
    labels.innerHTML = '';
    return;
  }
  bars.classList.toggle('dense', perDay.length > 60);
  const maxN = Math.max(1, ...perDay.map((p) => p.n));
  bars.innerHTML = perDay.map((p) => {
    const pct = Math.round((p.n / maxN) * 100);
    const height = p.n > 0 ? Math.max(pct, 4) : 0;
    return `<div class="col${p.n ? '' : ' zero'}">
      <div class="tip">${fmtFullB(p.d, bucket)} · ${p.n}</div>
      <div class="bar" style="height:${height}%"></div>
    </div>`;
  }).join('');
  labels.innerHTML = edgeLabels(perDay).map((d) => `<span>${fmtShortB(d.d, bucket)}</span>`).join('');
}

function renderLine(cum, bucket) {
  const wrap = $('#line-wrap');
  const labels = $('#line-xlabels');
  if (!cum.length) {
    wrap.innerHTML = '<p class="empty">No data for this range.</p>';
    labels.innerHTML = '';
    return;
  }
  const W = 720, H = 240;
  const pad = { l: 34, r: 14, t: 18, b: 16 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const maxC = Math.max(1, ...cum.map((p) => p.c));
  const n = cum.length;
  const x = (i) => (n === 1 ? pad.l + iw / 2 : pad.l + (i / (n - 1)) * iw);
  const y = (c) => pad.t + (1 - c / maxC) * ih;
  const baseY = y(0);

  const pts = cum.map((p, i) => `${x(i).toFixed(1)},${y(p.c).toFixed(1)}`);
  const area = `M ${x(0).toFixed(1)},${baseY.toFixed(1)} L ` + pts.join(' L ') +
    ` L ${x(n - 1).toFixed(1)},${baseY.toFixed(1)} Z`;

  wrap.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Cumulative nixes over time">` +
    `<line class="gridline" x1="${pad.l}" y1="${y(maxC).toFixed(1)}" x2="${W - pad.r}" y2="${y(maxC).toFixed(1)}"/>` +
    `<line class="gridline" x1="${pad.l}" y1="${y(maxC / 2).toFixed(1)}" x2="${W - pad.r}" y2="${y(maxC / 2).toFixed(1)}"/>` +
    `<line class="gridline" x1="${pad.l}" y1="${baseY.toFixed(1)}" x2="${W - pad.r}" y2="${baseY.toFixed(1)}"/>` +
    `<text class="ylab" x="2" y="${(y(maxC) - 3).toFixed(1)}">${maxC}</text>` +
    `<text class="ylab" x="2" y="${(baseY + 12).toFixed(1)}">0</text>` +
    `<path class="area" d="${area}"/>` +
    `<polyline class="line" points="${pts.join(' ')}"/>` +
    `</svg>`;

  labels.innerHTML = edgeLabels(cum).map((d) => `<span>${fmtShortB(d.d, bucket)}</span>`).join('');
}

/** GitHub-style contribution grid for the current user's trailing-12-month nixes. */
function renderContrib(data) {
  const grid = $('#contrib-grid');
  const monthsEl = $('#contrib-months');
  const weekdaysEl = $('#contrib-weekdays');
  if (!grid) return;

  // Anchor the grid to the server's "today" so viewer clock skew can't blank it.
  const endStr = data.end || new Date().toISOString().slice(0, 10);
  const end = Date.parse(endStr + 'T00:00:00Z');
  if (Number.isNaN(end)) return;

  // Start = a Sunday, ~52 weeks before the end date.
  let start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 364);
  while (start.getUTCDay() !== 0) start.setUTCDate(start.getUTCDate() - 1);

  const days = [];
  const cur = new Date(start);
  while (cur.getTime() <= end) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  const maxN = Math.max(0, ...days.map((d) => data.map[d] || 0));
  const levelOf = (n) => {
    if (n === 0) return 0;
    if (maxN <= 1) return 1;
    return Math.min(4, 1 + Math.floor((n / maxN) * 4));
  };

  let weeksHtml = '';
  let monthHtml = '';
  let prevMonth = -1;
  for (let i = 0; i < days.length; i += 7) {
    const week = days.slice(i, i + 7);
    const m = Number(week[0].slice(5, 7));
    monthHtml += `<span>${m !== prevMonth ? MONTHS[m - 1] : ''}</span>`;
    prevMonth = m;
    weeksHtml += '<div class="cweek">' + week.map((d) => {
      const n = data.map[d] || 0;
      const lv = levelOf(n);
      return `<span class="cday lvl-${lv}" title="${fmtFull(d)}: ${n} nix${n === 1 ? '' : 'es'}"></span>`;
    }).join('') + '</div>';
  }

  grid.innerHTML = weeksHtml;
  monthsEl.innerHTML = monthHtml;
  weekdaysEl.innerHTML = ['Mon', '', 'Wed', '', 'Fri', '', ''].map((l) => `<span>${l}</span>`).join('');
  $('#contrib-total').textContent = data.total;
}

async function loadContrib() {
  const r = await api('/api/me/nix-calendar');
  if (!r) return; // 401 → redirecting to Discord
  if (r.status === 409) { location.href = '/'; return; } // pick a name first
  if (r.status >= 400) return;
  renderContrib(r.data);
}

async function loadStats() {
  const r = await api(`/api/stats?range=${state.range}`);
  if (!r) return; // 401 → redirecting to Discord
  if (r.status === 409) { location.href = '/'; return; } // pick a name first
  if (r.status >= 400) return;

  const d = r.data;
  renderSummary(d.summary);
  renderStreakTable(d.streakTable || []);

  $('#chart-title').textContent =
    ({ '1h': 'Nixes per hour', '6h': 'Nixes per 6 hours', '1d': 'Nixes per day' })[d.bucket] || 'Nixes per day';
  $('#perday-sub').textContent =
    `${d.summary.inRange} nixes · ${fmtShort(d.start)} – ${fmtShort(d.end)}`;
  renderBars(d.perDay, d.bucket);

  $('#cum-sub').textContent = d.summary.first
    ? `First nix on ${fmtFull(d.summary.first)}`
    : 'No nixes recorded yet.';
  renderLine(d.cumulative, d.bucket);
}

document.addEventListener('DOMContentLoaded', async () => {
  const seg = $('#range-seg');
  seg.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-range]');
    if (!btn) return;
    state.range = btn.dataset.range;
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
    loadStats();
  });

  const r = await api('/api/me');
  if (!r) return;
  if (!r.data.name) { location.href = '/'; return; }
  await loadStats();
  loadContrib();
  document.querySelector('.page-foot')?.classList.add('visible');
});
