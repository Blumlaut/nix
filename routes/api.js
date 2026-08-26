'use strict';
const express = require('express');
const {
  stmts, getStats, myNixCalendar, getStreaks, getStreakPairs,
  getNemesis, getUserStats, getProfile,
  checkAchievements, getUserXp, awardXp, awardNixXp,
  getBattlepass, claimBpTier, getUserCosmetics,
  castVote,
  XP_GIVEN, XP_RECEIVED, XP_ACH, XP_DAILY,
} = require('../lib/db');
const push = require('../lib/push');
const { execFile } = require('child_process');
const path = require('path');

const router = express.Router();
const NAME_RE = /^[\p{L}\p{N} ._'&+-]{1,32}$/u;

function normalizeName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().replace(/\s+/g, ' ');
  return NAME_RE.test(name) ? name : null;
}
function requireSession(needName) {
  return (req, res, next) => {
    if (!(req.isAuthenticated && req.isAuthenticated()) || !req.user)
      return res.status(401).json({ error: 'not_authenticated' });
    if (needName && !req.user.id)
      return res.status(409).json({ error: 'name_required' });
    next();
  };
}

router.get('/me', requireSession(false), (req, res) => {
  res.json({ id: req.user.id, discordId: req.user.discordId, name: req.user.name || null });
});

router.post('/me/name', requireSession(false), (req, res) => {
  const name = normalizeName(req.body && req.body.name);
  if (!name) return res.status(400).json({ error: 'invalid_name' });
  const ci = name.toLowerCase();
  const clash = stmts.userByNameCi.get(ci);
  if (clash && clash.discord_id !== req.user.discordId)
    return res.status(409).json({ error: 'name_taken' });
  if (req.user.id) stmts.updateName.run(name, ci, req.user.id);
  else stmts.insertUser.run(req.user.discordId, name, ci);
  res.json({ ok: true, name });
});

const RECENT_PAGE = 10;

router.get('/board', requireSession(true), (req, res) => {
  const TOP = 3;
  const allUsers = stmts.allUsers.all();
  const nameById = new Map(allUsers.map((u) => [u.id, u.name]));
  const { current } = getStreaks();
  const streaks = Object.entries(current)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))
    .slice(0, TOP)
    .map(([id, streak]) => ({ id: Number(id), name: nameById.get(Number(id)), streak }));
  const lbRows = stmts.leaderboard.all(TOP).map(r => {
    const recv = stmts.userReceived.get(r.uid).n;
    const xpRow = stmts.xpByUser.get(r.uid);
    const level = xpRow ? Math.floor(xpRow.total_xp / 200) + 1 : 1;
    const cos = getUserCosmetics(r.uid);
    return { uid: r.uid, name: r.name, n: r.n, received: recv, level, title: cos.title, border: cos.border };
  });
  const mostN = stmts.mostNixed.all(TOP).map(r => ({ uid: r.uid, name: r.name, n: r.n }));
  const pairs = stmts.topPairs.all(TOP).map(r => ({ auid: r.auid, buid: r.buid, nixer: r.nixer, target: r.target, n: r.n }));
  res.json({
    me: { id: req.user.id, name: req.user.name },
    targets: allUsers.map((u) => ({ id: u.id, name: u.name })),
    leaderboard: lbRows, mostNixed: mostN, topPairs: pairs, streaks,
    recent: stmts.recent.all(RECENT_PAGE, 0),
    recentTotal: stmts.recentCount.get().n
  });
});

router.get('/nixes', requireSession(true), (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || RECENT_PAGE, 1), 50);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  res.json({ items: stmts.recent.all(limit, (page - 1) * limit), total: stmts.recentCount.get().n, page, limit });
});

router.post('/nix', requireSession(true), (req, res) => {
  const targetId = Number(req.body && req.body.targetId);
  if (!Number.isInteger(targetId)) return res.status(400).json({ error: 'invalid_target' });
  const target = stmts.userById.get(targetId);
  if (!target) return res.status(404).json({ error: 'target_not_found' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'cannot_nix_self' });
  stmts.insertNix.run(req.user.id, targetId);
  const xpResult = awardNixXp(req.user.id, targetId);
  const giverAch = checkAchievements(req.user.id);
  const recvAch = checkAchievements(targetId);
  if (giverAch.length) awardXp(req.user.id, giverAch.length * XP_ACH);
  if (recvAch.length) awardXp(targetId, recvAch.length * XP_ACH);
  push.notifyNix(req.user.id, req.user.name, target.name);
  res.json({ ok: true, xp: xpResult, achievements: { giver: giverAch, receiver: recvAch } });
});

router.delete('/nix/:id', requireSession(true), (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' });
  const nix = stmts.nixById.get(id);
  if (!nix) return res.status(404).json({ error: 'nix_not_found' });
  if (nix.nixer_id !== req.user.id) return res.status(403).json({ error: 'not_your_nix' });
  stmts.deleteNix.run(id, req.user.id);
  res.json({ ok: true });
});

router.get('/stats', requireSession(true), (req, res) => {
  const range = ['7d','30d','90d','all'].includes(req.query.range) ? req.query.range : '30d';
  const data = getStats(range);
  const { best } = getStreaks();
  const nameById = new Map(stmts.allUsers.all().map((u) => [u.id, u.name]));
  let top = null;
  for (const [id, n] of Object.entries(best)) {
    if (!top || n > top.n) top = { id: Number(id), name: nameById.get(Number(id)), n };
  }
  data.summary.highestStreak = top;
  const pairs = getStreakPairs();
  data.streakTable = Object.entries(pairs.current)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      const [aa, ab] = a[0].split(':').map(Number);
      const [ba, bb] = b[0].split(':').map(Number);
      return aa - ba || ab - bb;
    })
    .map(([key, streak]) => {
      const [aId, bId] = key.split(':').map(Number);
      return { id: aId, name: nameById.get(aId), againstId: bId, against: nameById.get(bId), streak, best: pairs.best[key] || streak };
    });
  res.json(data);
});

router.get('/me/nix-calendar', requireSession(true), (req, res) => {
  res.json(myNixCalendar(req.user.id));
});

router.get('/changelog', (req, res) => {
  execFile('git',
    ['log','-n','200','--date=short','--pretty=format:%x1e%H%x1f%ad%x1f%an%x1f%s%x1f%b'],
    { cwd: path.join(__dirname, '..'), maxBuffer: 4*1024*1024, timeout: 5000 },
    (err, stdout) => {
      if (err) return res.status(500).json({ error: 'git_failed' });
      const commits = stdout.split('\x1e').map((r) => r.replace(/^\s+/,'')).filter(Boolean)
        .map((r) => {
          const [hash, date, , subject, body] = r.split('\x1f');
          return { hash, date, subject, body: (body||'').trim() };
        });
      res.json({ commits });
    });
});

router.get('/push/public-key', (req, res) => { res.json({ publicKey: push.publicKey }); });

router.post('/push/subscribe', requireSession(true), (req, res) => {
  const s = req.body && req.body.subscription;
  if (!s || !s.endpoint || !s.keys || !s.keys.p256dh || !s.keys.auth)
    return res.status(400).json({ error: 'invalid_subscription' });
  const ua = (req.headers['user-agent']||'').slice(0,300);
  stmts.upsertPushSub.run(req.user.id, s.endpoint, s.keys.p256dh, s.keys.auth, ua);
  res.json({ ok: true });
});

router.post('/push/unsubscribe', requireSession(true), (req, res) => {
  const endpoint = req.body && req.body.endpoint;
  if (endpoint) stmts.delPushSub.run(endpoint);
  else stmts.delPushSubsForUser.run(req.user.id);
  res.json({ ok: true });
});

router.get('/nemesis', requireSession(true), (req, res) => {
  res.json(getNemesis(req.user.id));
});

router.get('/achievements', requireSession(true), (req, res) => {
  const all = stmts.allAchievements.all();
  const mine = new Set(stmts.userAchievements.all(req.user.id).map(a => a.key));
  res.json(all.map(a => ({
    key: a.key, name: a.name, description: a.description,
    icon: a.icon, category: a.category, unlocked: mine.has(a.key),
  })));
});

router.get('/xp', requireSession(true), (req, res) => {
  res.json(getUserXp(req.user.id));
});

router.get('/battlepass', requireSession(true), (req, res) => {
  res.json(getBattlepass(req.user.id));
});
router.post('/battlepass/claim/:tier', requireSession(true), (req, res) => {
  const tier = Number(req.params.tier);
  if (!Number.isInteger(tier) || tier < 1 || tier > 10)
    return res.status(400).json({ error: 'invalid tier' });
  const result = claimBpTier(req.user.id, tier);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

router.get('/users/:id', (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) return res.status(404).json({ error: 'not found' });
  const profile = getProfile(userId);
  if (!profile) return res.status(404).json({ error: 'user not found' });
  if (req.isAuthenticated() && req.user.id) {
    const myNem = getNemesis(req.user.id);
    profile.myNemesis = myNem;
    profile.isMyNemesis = myNem && myNem.nemesisId === userId;
  }
  res.json(profile);
});

router.get('/forum/threads', (req, res) => {
  const threads = stmts.listThreads.all(50);
  if (req.isAuthenticated() && req.user.id) {
    const myVotes = stmts.userVotes.all(req.user.id);
    const voteMap = {};
    for (const v of myVotes) voteMap[`${v.target_type}:${v.target_id}`] = v.direction;
    for (const t of threads) t.myVote = voteMap['thread:' + t.id] || 0;
  }
  res.json(threads);
});

router.post('/forum/threads', requireSession(true), (req, res) => {
  const title = String((req.body && req.body.title) || '').trim().slice(0, 200);
  const body  = String((req.body && req.body.body)  || '').trim().slice(0, 5000);
  if (title.length < 3) return res.status(400).json({ error: 'title too short' });
  if (body.length < 3)  return res.status(400).json({ error: 'body too short' });
  const info = stmts.createThread.run(req.user.id, title, body);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.get('/forum/threads/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'not found' });
  const thread = stmts.getThread.get(id);
  if (!thread) return res.status(404).json({ error: 'thread not found' });
  thread.replies = stmts.getReplies.all(id);
  if (req.isAuthenticated() && req.user.id) {
    const myVotes = stmts.userVotes.all(req.user.id);
    const voteMap = {};
    for (const v of myVotes) voteMap[`${v.target_type}:${v.target_id}`] = v.direction;
    thread.myVote = voteMap['thread:' + id] || 0;
    for (const r of thread.replies) r.myVote = voteMap['reply:' + r.id] || 0;
  }
  res.json(thread);
});

router.post('/forum/threads/:id/reply', requireSession(true), (req, res) => {
  const threadId = Number(req.params.id);
  if (!Number.isInteger(threadId)) return res.status(400).json({ error: 'bad thread id' });
  const body = String((req.body && req.body.body) || '').trim().slice(0, 5000);
  if (body.length < 2) return res.status(400).json({ error: 'reply too short' });
  const thread = stmts.getThread.get(threadId);
  if (!thread) return res.status(404).json({ error: 'thread not found' });
  const info = stmts.createReply.run(threadId, req.user.id, body);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.post('/forum/vote', requireSession(true), (req, res) => {
  const { targetType, targetId, direction } = req.body || {};
  if (!['thread','reply'].includes(targetType)) return res.status(400).json({ error: 'invalid target type' });
  const tid = Number(targetId);
  if (!Number.isInteger(tid)) return res.status(400).json({ error: 'invalid target id' });
  const result = castVote(req.user.id, targetType, tid, direction);
  res.json(result);
});

module.exports = router;
