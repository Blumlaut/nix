'use strict';
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function timeAgo(iso){const t=Date.parse(iso.replace(' ','T')+'Z'),s=Math.max(0,Math.floor((Date.now()-t)/1000));if(s<60)return s+'s ago';if(s<3600)return Math.floor(s/60)+'m ago';if(s<86400)return Math.floor(s/3600)+'h ago';return Math.floor(s/86400)+'d ago';}

function currentThreadId() {
  const m = location.pathname.match(/^\/forum\/thread\/(\d+)$/);
  return m ? Number(m[1]) : null;
}
function showList() {
  $('#thread-list-card').classList.remove('hidden');
  $('#new-thread-card').classList.add('hidden');
  $('#thread-detail-card').classList.add('hidden');
}
function showThread() {
  $('#thread-list-card').classList.add('hidden');
  $('#new-thread-card').classList.add('hidden');
  $('#thread-detail-card').classList.remove('hidden');
}

function votePill(type,id,score,myVote) {
  return `<span class="vote-pill" data-type="${type}" data-id="${id}">
    <button class="vote-btn up${myVote===1?' active':''}" data-dir="1" aria-label="Upvote">&#9650;</button>
    <span class="vote-score${score>0?' pos':score<0?' neg':''}">${score}</span>
    <button class="vote-btn down${myVote===-1?' active':''}" data-dir="-1" aria-label="Downvote">&#9660;</button>
  </span>`;
}

function applyVote(el, voted, score) {
  const pill = el.closest('.vote-pill');
  if (!pill) return;
  pill.querySelector('.vote-btn.up').classList.toggle('active', voted === 1);
  pill.querySelector('.vote-btn.down').classList.toggle('active', voted === -1);
  const sc = pill.querySelector('.vote-score');
  sc.textContent = score;
  sc.className = 'vote-score' + (score>0?' pos':score<0?' neg':'');
}

function wireVotes(container) {
  container.querySelectorAll('.vote-pill').forEach(pill => {
    pill.querySelectorAll('.vote-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        btn.disabled = true;
        const type = pill.dataset.type, id = +pill.dataset.id, dir = +btn.dataset.dir;
        try {
          const r = await fetch('/api/forum/vote', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({targetType:type,targetId:id,direction:dir})});
          if (!r.ok) return;
          const d = await r.json();
          applyVote(btn, d.voted, d.score);
        } finally { btn.disabled = false; }
      });
    });
  });
}

async function loadThreads() {
  showList();
  const list = $('#thread-list'), empty = $('#forum-empty');
  try {
    const r = await fetch('/api/forum/threads', {credentials:'same-origin'});
    if (!r.ok) throw new Error('load failed');
    const threads = await r.json();
    if (!threads.length) { list.classList.add('hidden'); empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden'); list.classList.remove('hidden');
    list.innerHTML = threads.map(t => `
      <li class="thread-row">
        <div class="thread-main">
          <a class="thread-title" href="/forum/thread/${t.id}" data-thread="${t.id}">${esc(t.title)}</a>
          <div class="thread-meta">
            <span class="thread-author">${esc(t.author)}</span>
            <span class="dot">·</span>
            <span class="thread-time">${timeAgo(t.created_at)}</span>
            <span class="dot">·</span>
            <span class="thread-replies">${t.reply_count} ${t.reply_count===1?'reply':'replies'}</span>
          </div>
        </div>
        ${votePill('thread', t.id, t.score, t.myVote||0)}
      </li>`).join('');
    list.querySelectorAll('.thread-row').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.closest('.vote-pill')) return;
        const a = row.querySelector('[data-thread]');
        if (a) openThread(+a.dataset.thread);
      });
    });
    wireVotes(list);
  } catch(err) { $('#forum-error').textContent = err.message; }
}

function openThread(id) {
  history.pushState({thread:id}, '', `/forum/thread/${id}`);
  loadThread(id);
}

async function loadThread(id) {
  showThread();
  try {
    const r = await fetch(`/api/forum/threads/${id}`, {credentials:'same-origin'});
    if (!r.ok) throw new Error('not found');
    const t = await r.json();
    const replies = t.replies.map(rep => `
      <div class="reply" id="reply-${rep.id}">
        <div class="reply-main">
          <div class="reply-head">
            <b class="reply-author">${esc(rep.author)}</b>
            <span class="dot">·</span>
            <span class="reply-time">${timeAgo(rep.created_at)}</span>
            <a class="reply-link" href="/forum/thread/${id}#reply-${rep.id}" title="Link to this reply" aria-label="Link to this reply">#</a>
          </div>
          <div class="reply-text">${esc(rep.body)}</div>
        </div>
        ${votePill('reply', rep.id, rep.score, rep.myVote||0)}
      </div>`).join('');

    $('#thread-detail').innerHTML = `
      <div class="td-back"><button class="btn btn-ghost" id="back-to-list">&larr; All threads</button></div>
      <article class="td-post">
        <div class="td-head">
          <h2 class="td-title">${esc(t.title)}</h2>
          ${votePill('thread', t.id, t.score, t.myVote||0)}
        </div>
        <div class="td-meta">
          <span class="thread-author">${esc(t.author)}</span>
          <span class="dot">·</span>
          <span class="thread-time">${timeAgo(t.created_at)}</span>
        </div>
        <div class="td-body">${esc(t.body)}</div>
      </article>
      <div class="td-replies">
        <h3 class="td-replies-h">${t.replies.length} ${t.replies.length===1?'Reply':'Replies'}</h3>
        ${replies || '<p class="td-no-replies">No replies yet.</p>'}
      </div>
      <form id="reply-form" class="td-reply-form">
        <textarea id="reply-body" placeholder="Write a reply…" rows="2" maxlength="5000" required></textarea>
        <div class="td-reply-actions"><button type="submit" class="btn">Reply</button></div>
      </form>`;

    $('#back-to-list').addEventListener('click', backToList);
    $('#reply-form').addEventListener('submit', async e => {
      e.preventDefault();
      const body = $('#reply-body').value.trim();
      if (body.length < 2) return;
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true;
      const r = await fetch(`/api/forum/threads/${id}/reply`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body})});
      btn.disabled = false;
      if (r.ok) loadThread(id);
    });
    wireVotes($('#thread-detail-card'));
    // deep-link to reply
    if (location.hash.startsWith('#reply-')) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) {
        el.scrollIntoView({behavior:'smooth', block:'center'});
        el.classList.add('reply-highlight');
        setTimeout(() => el.classList.remove('reply-highlight'), 2500);
      }
    }
    // copy link on # click
    $('#thread-detail-card').querySelectorAll('.reply-link').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        navigator.clipboard.writeText(a.href).then(() => {
          a.textContent = '✓';
          setTimeout(() => a.textContent = '#', 1200);
        }).catch(() => { location.hash = a.hash; });
      });
    });
  } catch(err) {
    backToList();
  }
}

function backToList() {
  history.pushState({thread:null}, '', '/forum');
  loadThreads();
}

document.addEventListener('DOMContentLoaded', () => {
  $('#new-thread-btn').addEventListener('click', () => {
    const card = $('#new-thread-card');
    const wasHidden = card.classList.contains('hidden');
    if (wasHidden) {
      card.classList.remove('hidden');
      $('#thread-list-card').classList.add('hidden');
      $('#thread-title').focus();
    } else {
      card.classList.add('hidden');
      showList();
    }
  });
  $('#cancel-thread').addEventListener('click', () => showList());
  $('#new-thread-form').addEventListener('submit', async e => {
    e.preventDefault();
    const title = $('#thread-title').value.trim(), body = $('#thread-body').value.trim();
    if (title.length < 3 || body.length < 3) { $('#thread-error').textContent = 'Title and body need at least 3 characters.'; return; }
    $('#thread-error').textContent = '';
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true;
    const r = await fetch('/api/forum/threads', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title, body})});
    btn.disabled = false;
    if (r.ok) {
      const d = await r.json();
      $('#thread-title').value = ''; $('#thread-body').value = '';
      openThread(d.id);
    } else {
      const d = await r.json();
      $('#thread-error').textContent = d.error || 'Failed to post';
    }
  });

  window.addEventListener('popstate', () => {
    const tid = currentThreadId();
    if (tid) loadThread(tid);
    else loadThreads();
  });

  const tid = currentThreadId();
  if (tid) loadThread(tid);
  else loadThreads();
});
