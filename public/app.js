'use strict';
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', ...opts });
  if (res.status === 401) { location.href = '/auth/discord'; return null; }
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function timeAgo(isoUtc) {
  const t = Date.parse(isoUtc.replace(' ','T')+'Z');
  const s = Math.max(0, Math.floor((Date.now()-t)/1000));
  if (s < 60) return s+'s ago';
  if (s < 3600) return Math.floor(s/60)+'m ago';
  if (s < 86400) return Math.floor(s/3600)+'h ago';
  if (s < 30*86400) return Math.floor(s/86400)+'d ago';
  if (s < 365*86400) return Math.floor(s/(30*86400))+'mo ago';
  return Math.floor(s/(365*86400))+'y ago';
}

function renderCountedList(el, rows, fmt, emptyMsg) {
  el.innerHTML = rows.length ? rows.map(fmt).join('') : `<li class="empty">${esc(emptyMsg||'Nothing here yet.')}</li>`;
}

const RECENT_PAGE = 10;
const RECENT_CAP = 100;
let recentRows = [];
let recentTotal = 0;
let moreLoading = false;
let meId = 0;

function upsertRecent(rows) {
  const byId = new Map(recentRows.map((r) => [r.id, r]));
  for (const r of rows) byId.set(r.id, r);
  recentRows = [...byId.values()].sort((a, b) => b.id - a.id).slice(0, RECENT_CAP);
}

function renderRecent() {
  const rec = $('#recent');
  rec.innerHTML = recentRows.length
    ? recentRows.map((r) =>
        `<li><span class="pair"><a href="/user/${r.nixerUid}" class="feed-user"><b>${esc(r.nixer)}</b></a> <span class="verb">nixed</span> <a href="/user/${r.targetUid}" class="feed-user"><b>${esc(r.target)}</b></a></span><time datetime="${r.created_at}" title="${new Date(r.created_at).toLocaleString()}">${timeAgo(r.created_at)}</time>${r.nixerId === meId ? `<button class="undo-btn" data-nix-id="${r.id}" title="Undo nix">&times;</button>` : `<button class="undo-btn ghost" aria-hidden="true" tabindex="-1">&times;</button>`}</li>`).join('')
    : '<li class="empty">No nixes yet. Go claim one.</li>';
  const btn = $('#recent-more');
  if (btn) btn.hidden = recentRows.length >= Math.min(recentTotal, RECENT_CAP);
}

async function loadMoreRecent() {
  if (moreLoading) return;
  moreLoading = true;
  const btn = $('#recent-more');
  if (btn) btn.disabled = true;
  try {
    const page = Math.floor(recentRows.length / RECENT_PAGE) + 1;
    const r = await api(`/api/nixes?limit=${RECENT_PAGE}&page=${page}`);
    if (!r || r.status >= 400) return;
    upsertRecent(r.data.items);
    recentTotal = r.data.total;
    renderRecent();
  } finally {
    moreLoading = false;
    if (btn) btn.disabled = false;
  }
}

let lastRefresh = null;

function updateRefreshLabel() {
  const el = $('#last-refreshed');
  if (!el) return;
  if (!lastRefresh) { el.textContent = ''; return; }
  const s = Math.max(0, Math.floor((Date.now() - lastRefresh) / 1000));
  if (s < 3) el.textContent = 'Updated just now';
  else if (s < 60) el.textContent = `Updated ${s}s ago`;
  else el.textContent = `Updated ${Math.floor(s/60)}m ago`;
}

function renderBoard(d) {
  meId = d.me.id;
  const targets = d.targets.filter((t) => t.id !== d.me.id);
  const sel = $('#nix-target');
  const cur = sel.value;
  sel.innerHTML = targets.length
    ? targets.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')
    : '<option value="">No other players yet</option>';
  sel.disabled = targets.length === 0;
  if (cur && sel.querySelector(`option[value="${cur}"]`)) sel.value = cur;

  renderCountedList($('#leaderboard'), d.leaderboard,
    (r) => {
      const titleTag = r.title ? `<span class="bp-title">${esc(r.title)}</span>` : '';
      const borderCls = r.border ? ` border-${r.border}` : '';
      return `<li class="user-row${borderCls}">
        <a href="/user/${r.uid}" class="user-link"><span class="uname">${esc(r.name)}</span>${titleTag}</a>
        <span class="user-meta">L${r.level}</span>
        <span class="user-nixes"><span class="nix-given">⚔️ ${r.n}</span><span class="nix-sep">·</span><span class="nix-received">🛡️ ${r.received}</span></span>
      </li>`;
    });

  renderCountedList($('#most-nixed'), d.mostNixed,
    (r) => `<li><a href="/user/${r.uid}" class="feed-user">${esc(r.name)}</a><span class="n">${r.n}</span></li>`);

  renderCountedList($('#top-pairs'), d.topPairs,
    (r) => `<li><span class="pair"><a href="/user/${r.auid}" class="feed-user"><b>${esc(r.nixer)}</b></a> <span class="verb">nixed</span> <a href="/user/${r.buid}" class="feed-user"><b>${esc(r.target)}</b></a></span><span class="n">${r.n}</span></li>`);

  renderCountedList($('#streaks'), d.streaks,
    (r) => `<li><a href="/user/${r.id}" class="feed-user">${esc(r.name)}</a><span class="n">🔥 ${r.streak}</span></li>`,
    "Nobody's on a streak right now.");

  upsertRecent(d.recent);
  recentTotal = d.recentTotal ?? recentTotal;
  renderRecent();
  loadNemesis();
}

async function loadNemesis() {
  const banner = $('#nemesis-banner');
  if (!banner || !meId) return;
  try {
    const r = await api('/api/nemesis');
    if (!r || r.status >= 400) { banner.classList.add('hidden'); return; }
    const nem = r.data;
    if (!nem) { banner.classList.add('hidden'); return; }
    const dom = nem.revenge >= nem.timesNixedYou && nem.timesNixedYou > 0;
    banner.classList.remove('hidden');
    banner.innerHTML =
      `<div class="nemesis-inner">
        <span class="nemesis-label">💀 Your Nemesis</span>
        <a class="nemesis-name" href="/user/${nem.nemesisId}">${esc(nem.username)}</a>
        <span class="nemesis-score ${dom ? 'dominating' : 'outnumbered'}">${nem.timesNixedYou} nixes vs your ${nem.revenge} revenge</span>
        ${dom ? '<span class="nemesis-dominating">⚔️ You dominate!</span>' : '<span class="nemesis-hint">Nix them back for 2× XP!</span>'}
      </div>`;
  } catch (e) { /* silent */ }
}

let undoPending = null;

function openUndoModal(id, btn) {
  const row = recentRows.find((r) => r.id === id);
  $('#undo-modal-msg').textContent = row
    ? `Revoke "${row.nixer} nixed ${row.target}"? This removes it from the board and can't be undone.`
    : `This removes the nix from the board and can't be undone.`;
  undoPending = { id, btn };
  $('#undo-modal').classList.remove('hidden');
  $('#undo-cancel').focus();
}

function closeUndoModal() {
  const modal = $('#undo-modal');
  if (modal) modal.classList.add('hidden');
  if (undoPending && undoPending.btn) undoPending.btn.focus();
  undoPending = null;
}

async function undoNix(id, btn) {
  if (btn) { btn.disabled = true; btn.style.opacity = '.4'; }
  const r = await api(`/api/nix/${id}`, { method: 'DELETE' });
  if (!r) return;
  if (r.status >= 400) {
    if (btn) { btn.disabled = false; btn.style.opacity = ''; }
    return;
  }
  await loadBoard();
}

let pollTimer = null;
let loading = false;

async function loadBoard() {
  if (loading) return;
  loading = true;
  try {
    const r = await api('/api/board');
    if (!r || r.status === 409) return;
    if (r.status >= 400) return;
    renderBoard(r.data);
    lastRefresh = Date.now();
    updateRefreshLabel();
    $('#board-view').classList.remove('hidden');
    $('#setup-view').classList.add('hidden');
    document.querySelector('.page-foot')?.classList.add('visible');
  } finally {
    loading = false;
  }
}

function showSetup() {
  $('#setup-view').classList.remove('hidden');
  $('#board-view').classList.add('hidden');
  document.querySelector('.page-foot')?.classList.add('visible');
}

async function submitSetupName() {
  const input = $('#setup-name');
  const err = $('#setup-err');
  err.textContent = '';
  const r = await api('/api/me/name', { method: 'POST', body: JSON.stringify({ name: input.value }) });
  if (r.status === 409 && r.data.error === 'name_taken') { err.textContent = 'That name is already taken.'; return; }
  if (r.status >= 400) { err.textContent = 'Could not save name.'; return; }
  input.value = '';
  await loadBoard();
}

async function init() {
  const r = await api('/api/me');
  if (!r) return;
  if (!r.data.name) { showSetup(); return; }
  await loadBoard();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (!$('#board-view').classList.contains('hidden')) loadBoard();
  }, 20000);
  setInterval(() => {
    if (!$('#board-view').classList.contains('hidden')) updateRefreshLabel();
  }, 5000);
}

document.addEventListener('DOMContentLoaded', () => {
  $('#setup-form').addEventListener('submit', (e) => { e.preventDefault(); submitSetupName(); });
  $('#refresh-btn').addEventListener('click', loadBoard);
  $('#recent-more').addEventListener('click', loadMoreRecent);

  $('#nix-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const targetId = Number($('#nix-target').value);
    const msg = $('#nix-msg');
    if (!targetId) return;
    msg.textContent = '';
    const r = await api('/api/nix', { method: 'POST', body: JSON.stringify({ targetId }) });
    if (r.status === 400 && r.data.error === 'cannot_nix_self') {
      msg.textContent = "You can't nix yourself.";
      return;
    }
    if (r.status >= 400) { msg.textContent = 'Failed to record nix.'; return; }
    if (r.data.xp && r.data.xp.revenge) {
      msg.textContent = `⚔️ Revenge nix! +${r.data.xp.giverXp} XP (2× bonus)`;
      msg.className = 'ok';
    } else if (r.data.xp) {
      msg.textContent = `Nix recorded. +${r.data.xp.giverXp} XP`;
      msg.className = 'ok';
    } else {
      msg.textContent = 'Nix recorded.';
      msg.className = 'muted';
    }
    if (r.data.achievements && r.data.achievements.giver && r.data.achievements.giver.length) {
      msg.textContent += ' 🏅 Achievement unlocked!';
    }
    setTimeout(() => { msg.textContent = ''; msg.className = 'muted'; }, 4000);
    await loadBoard();
  });

  $('#recent').addEventListener('click', (e) => {
    const btn = e.target.closest('.undo-btn');
    if (!btn || !btn.dataset.nixId) return;
    openUndoModal(Number(btn.dataset.nixId), btn);
  });

  const undoModal = $('#undo-modal');
  $('#undo-confirm').addEventListener('click', () => {
    if (!undoPending) return;
    const { id, btn } = undoPending;
    undoPending = null;
    undoModal.classList.add('hidden');
    undoNix(id, btn);
  });
  $('#undo-cancel').addEventListener('click', closeUndoModal);
  undoModal.addEventListener('click', (e) => { if (e.target === undoModal) closeUndoModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !undoModal.classList.contains('hidden')) closeUndoModal();
  });

  init();
});
