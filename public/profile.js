'use strict';
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function timeAgo(isoUtc) {
  const t = Date.parse(isoUtc.replace(' ','T')+'Z'), s = Math.max(0, Math.floor((Date.now()-t)/1000));
  if (s<60) return s+'s ago'; if (s<3600) return Math.floor(s/60)+'m ago';
  if (s<86400) return Math.floor(s/3600)+'h ago'; return Math.floor(s/86400)+'d ago';
}

function renderProfile(p) {
  const cos = p.cosmetics || {};
  const initial = esc((p.user.name||'?')[0].toUpperCase());
  const net = p.stats.given - p.stats.received;
  const isMe = p.isViewer;

  document.title = p.user.name + ' — NIX Scoreboard';

  // ── Header card ──
  let html = `<div class="card prof-header">
    <div class="prof-ident">
      <span class="prof-avatar">${initial}</span>
      <div class="prof-info">
        <h1 class="prof-name">${esc(p.user.name)}
          ${cos.title ? `<span class="bp-title-display">${esc(cos.title)}</span>` : ''}
          ${cos.badge==='legend' ? '<span class="legend-badge">🏆</span>' : ''}
        </h1>
        <div class="prof-sub">Lvl ${p.xp.level} · ${p.xp.totalXp} XP · Member since ${p.user.created_at ? p.user.created_at.slice(0,10) : '—'}</div>
      </div>
    </div>
    <div class="prof-stats">
      <div class="ps"><span class="ps-v">${p.stats.given}</span><span class="ps-l">⚔️ given</span></div>
      <div class="ps"><span class="ps-v">${p.stats.received}</span><span class="ps-l">🛡️ got</span></div>
      <div class="ps"><span class="ps-v ${net>0?'pos':net<0?'neg':''}">${net>0?'+':''}${net}</span><span class="ps-l">net</span></div>
    </div>
  </div>`;

  // ── Two-column layout ──
  html += '<div class="prof-cols">';

  // Left column
  html += '<div class="prof-col prof-col-l">';

  if (p.nemesis) {
    const dom = p.nemesis.revenge >= p.nemesis.timesNixedYou && p.nemesis.timesNixedYou > 0;
    html += `<section class="card prof-section"><h2>💀 Nemesis</h2>
      <div class="nem-card">
        <a href="/user/${p.nemesis.nemesisId}" class="nem-name">${esc(p.nemesis.username)}</a>
        <div class="nem-bar">
          <div class="nem-bar-track">
            <div class="nem-bar-fill" style="width:${p.nemesis.timesNixedYou > 0 ? (p.nemesis.revenge / p.nemesis.timesNixedYou * 50) : 0}%"></div>
            <div class="nem-bar-mid"></div>
          </div>
          <div class="nem-bar-labels"><span>${p.nemesis.timesNixedYou}× nixed you</span><span>you: ${p.nemesis.revenge}×</span></div>
        </div>
        ${dom ? '<span class="nem-dom">⚔️ You dominate</span>' : '<span class="nem-hint">Nix back for 2× XP</span>'}
      </div>
    </section>`;
  }

  if (p.topTargets && p.topTargets.length) {
    html += `<section class="card prof-section"><h2>🎯 Top Targets</h2><ul class="list prof-list">`;
    for (const t of p.topTargets) html += `<li><a href="/user/${t.uid}">${esc(t.name)}</a><span class="n">${t.n}</span></li>`;
    html += `</ul></section>`;
  }

  if (p.recentActivity && p.recentActivity.length) {
    const uid = p.user.id;
    html += `<section class="card prof-section"><h2>📋 Recent</h2><ul class="feed prof-feed">`;
    for (const a of p.recentActivity) {
      const isGiver = a.nid === uid;
      const oId = isGiver ? a.tid : a.nid;
      const oName = isGiver ? a.target : a.nixer;
      const txt = isGiver
        ? `<b>${esc(p.user.name)}</b> nixed <a href="/user/${oId}" class="feed-user">${esc(oName)}</a>`
        : `<a href="/user/${oId}" class="feed-user">${esc(oName)}</a> nixed <b>${esc(p.user.name)}</b>`;
      html += `<li><span class="pair">${txt}</span><time>${timeAgo(a.created_at)}</time></li>`;
    }
    html += `</ul></section>`;
  }
  html += '</div>'; // end left col

  // Right column
  html += '<div class="prof-col prof-col-r">';

  if (p.battlepass && p.battlepass.tiers) {
    const bp = p.battlepass;
    const pct = Math.min(100, (bp.seasonXp / 1800) * 100);
    html += `<section class="card prof-section"><h2>🎮 Battlepass</h2>
      <div class="bp-bar-wrap"><div class="bp-bar"><div class="bp-bar-fill" style="width:${pct}%"></div></div>
      <span class="bp-bar-label">${bp.seasonXp} / 1800 XP</span></div>
      <div class="bp-list">`;
    for (const t of bp.tiers) {
      const st = t.claimed ? 'bp-claimed' : t.unlocked ? 'bp-unlocked' : 'bp-locked';
      const icon = t.reward==='title' ? '✦' : t.reward==='border' ? '▐' : '🏆';
      html += `<div class="bp-item ${st}">
        <span class="bp-item-num">${t.tier}</span>
        <span class="bp-item-name">${esc(t.name)}</span>
        <span class="bp-item-reward">${icon} ${esc(t.value)}</span>
        ${t.unlocked && !t.claimed ? `<button class="bp-claim" data-tier="${t.tier}">Claim</button>` : ''}
        ${t.claimed ? '<span class="bp-check">✓</span>' : ''}
      </div>`;
    }
    html += `</div></section>`;
  }

  html += `<section class="card prof-section"><h2>🏅 Achievements <span class="ach-count" id="ach-count"></span></h2>
    <div class="ach-grid" id="ach-grid"><span class="muted">Loading…</span></div>
  </section>`;

  html += '</div>'; // end right col
  html += '</div>'; // end cols

  $('#profile-content').innerHTML = html;
  loadAchievements();

  // claim buttons
  document.querySelectorAll('.bp-claim').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = '…';
      try {
        const r = await fetch(`/api/battlepass/claim/${btn.dataset.tier}`, { method: 'POST' });
        if (r.ok) {
          const item = btn.closest('.bp-item');
          item.classList.remove('bp-unlocked'); item.classList.add('bp-claimed');
          btn.outerHTML = '<span class="bp-check">✓</span>';
        } else { const d = await r.json(); alert(d.error||'Failed'); btn.disabled=false; btn.textContent='Claim'; }
      } catch(e) { alert(e.message); btn.disabled=false; btn.textContent='Claim'; }
    });
  });
}

async function loadAchievements() {
  const el = document.getElementById('ach-grid');
  if (!el) return;
  try {
    const r = await fetch('/api/achievements', { credentials: 'same-origin' });
    if (!r.ok) return;
    const all = await r.json();
    const unlocked = all.filter(a => a.unlocked).length;
    const cnt = document.getElementById('ach-count');
    if (cnt) cnt.textContent = `(${unlocked}/${all.length})`;
    el.innerHTML = all.map(a =>
      `<div class="ach ${a.unlocked?'ach-on':'ach-off'}" title="${esc(a.name)}: ${esc(a.description)}">
        <span class="ach-ic">${a.icon}</span><span class="ach-nm">${esc(a.name)}</span>
      </div>`).join('');
  } catch(e) { el.innerHTML = '<span class="muted">Failed to load</span>'; }
}

document.addEventListener('DOMContentLoaded', async () => {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const userId = parts.length===2 ? parts[1] : null;
  if (!userId || isNaN(Number(userId))) { $('#profile-error').textContent = 'Invalid user'; return; }
  try {
    const r = await fetch(`/api/users/${userId}`, { credentials: 'same-origin' });
    if (!r.ok) throw new Error('User not found');
    renderProfile(await r.json());
  } catch(err) {
    $('#profile-error').textContent = err.message;
    $('#profile-title').textContent = 'Not Found';
  }
});
