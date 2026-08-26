'use strict';

const express = require('express');
const { execFile } = require('child_process');
const path = require('path');

const { requireSession } = require('../middleware/auth');
const { normalizeName } = require('../lib/validate');

const RECENT_PAGE = 10;
const BOARD_TOP = 3;
const STREAK_TOP = 3;
const CHANGELOG_MAX = 200;
const PUSH_UA_MAX = 300;

/**
 * Build the /api router.
 * @param {object} deps
 * @param {object} deps.queries     prepared statements
 * @param {object} deps.stats       stats service
 * @param {object} deps.streaks     streaks service
 * @param {object} deps.progression progression service
 * @param {object} deps.users       users service
 * @param {object} deps.forum       forum service
 * @param {object} deps.push        push module
 * @param {object} deps.config      config
 */
function createApiRouter(deps) {
  const {
    queries, stats, streaks, progression, users, forum, push, config,
  } = deps;
  const router = express.Router();

  // ── Account ────────────────────────────────────────────────────────────
  router.get('/me', requireSession(false), (req, res) => {
    res.json({
      id: req.user.id,
      discordId: req.user.discordId,
      name: req.user.name || null,
    });
  });

  router.post('/me/name', requireSession(false), (req, res) => {
    const name = normalizeName(req.body && req.body.name);
    if (!name) return res.status(400).json({ error: 'invalid_name' });
    const ci = name.toLowerCase();
    const clash = queries.userByNameCi.get(ci);
    if (clash && clash.discord_id !== req.user.discordId) {
      return res.status(409).json({ error: 'name_taken' });
    }
    if (req.user.id) queries.updateName.run(name, ci, req.user.id);
    else queries.insertUser.run(req.user.discordId, name, ci);
    return res.json({ ok: true, name });
  });

  // ── Board ──────────────────────────────────────────────────────────────
  router.get('/board', requireSession(true), (req, res) => {
    const allUsers = queries.allUsers.all();
    const nameById = new Map(allUsers.map((u) => [u.id, u.name]));

    const { current } = streaks.getStreaks();
    const streakRows = Object.entries(current)
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))
      .slice(0, STREAK_TOP)
      .map(([id, streak]) => ({ id: Number(id), name: nameById.get(Number(id)), streak }));

    const leaderboard = queries.leaderboard.all(BOARD_TOP).map((r) => {
      const xp = progression.getUserXp(r.uid);
      const cosmetics = progression.getUserCosmetics(r.uid);
      return {
        uid: r.uid,
        name: r.name,
        n: r.n,
        received: queries.userReceived.get(r.uid).n,
        level: xp.level,
        title: cosmetics.title,
        border: cosmetics.border,
      };
    });

    res.json({
      me: { id: req.user.id, name: req.user.name },
      targets: allUsers.map((u) => ({ id: u.id, name: u.name })),
      leaderboard,
      mostNixed: queries.mostNixed.all(BOARD_TOP).map((r) => ({ uid: r.uid, name: r.name, n: r.n })),
      topPairs: queries.topPairs.all(BOARD_TOP).map((r) => ({
        auid: r.auid, buid: r.buid, nixer: r.nixer, target: r.target, n: r.n,
      })),
      streaks: streakRows,
      recent: queries.recent.all(RECENT_PAGE, 0),
      recentTotal: queries.recentCount.get().n,
    });
  });

  router.get('/nixes', requireSession(true), (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || RECENT_PAGE, 1), 50);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    res.json({
      items: queries.recent.all(limit, (page - 1) * limit),
      total: queries.recentCount.get().n,
      page,
      limit,
    });
  });

  router.post('/nix', requireSession(true), (req, res) => {
    const targetId = Number(req.body && req.body.targetId);
    if (!Number.isInteger(targetId)) return res.status(400).json({ error: 'invalid_target' });
    const target = queries.userById.get(targetId);
    if (!target) return res.status(404).json({ error: 'target_not_found' });
    if (target.id === req.user.id) return res.status(400).json({ error: 'cannot_nix_self' });

    queries.insertNix.run(req.user.id, targetId);
    const xp = progression.awardNixXp(req.user.id, targetId);
    const giverAch = progression.checkAchievements(req.user.id);
    const receiverAch = progression.checkAchievements(targetId);
    if (giverAch.length) progression.awardXp(req.user.id, giverAch.length * 100);
    if (receiverAch.length) progression.awardXp(targetId, receiverAch.length * 100);
    push.notifyNix(req.user.id, req.user.name, target.name);

    return res.json({ ok: true, xp, achievements: { giver: giverAch, receiver: receiverAch } });
  });

  router.delete('/nix/:id', requireSession(true), (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' });
    const nix = queries.nixById.get(id);
    if (!nix) return res.status(404).json({ error: 'nix_not_found' });
    if (nix.nixer_id !== req.user.id) return res.status(403).json({ error: 'not_your_nix' });
    queries.deleteNix.run(id, req.user.id);
    return res.json({ ok: true });
  });

  // ── Stats ──────────────────────────────────────────────────────────────
  router.get('/stats', requireSession(true), (req, res) => {
    const range = ['7d', '30d', '90d', 'all'].includes(req.query.range) ? req.query.range : '30d';
    const data = stats.getStats(range);

    const { best } = streaks.getStreaks();
    const nameById = new Map(queries.allUsers.all().map((u) => [u.id, u.name]));
    let top = null;
    for (const [id, n] of Object.entries(best)) {
      if (!top || n > top.n) top = { id: Number(id), name: nameById.get(Number(id)), n };
    }
    data.summary.highestStreak = top;

    const pairs = streaks.getStreakPairs();
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
        return {
          id: aId,
          name: nameById.get(aId),
          againstId: bId,
          against: nameById.get(bId),
          streak,
          best: pairs.best[key] || streak,
        };
      });

    return res.json(data);
  });

  router.get('/me/nix-calendar', requireSession(true), (req, res) => {
    res.json(stats.myNixCalendar(req.user.id));
  });

  // ── Changelog ──────────────────────────────────────────────────────────
  router.get('/changelog', (req, res) => {
    execFile(
      'git',
      ['log', `-n ${CHANGELOG_MAX}`, '--date=short', '--pretty=format:%x1e%H%x1f%ad%x1f%an%x1f%s%x1f%b'],
      { cwd: path.join(__dirname, '..', '..'), maxBuffer: 4 * 1024 * 1024, timeout: 5000 },
      (err, stdout) => {
        if (err) return res.status(500).json({ error: 'git_failed' });
        const commits = stdout
          .split('\x1e')
          .map((r) => r.replace(/^\s+/, ''))
          .filter(Boolean)
          .map((r) => {
            const [hash, date, , subject, body] = r.split('\x1f');
            return { hash, date, subject, body: (body || '').trim() };
          });
        return res.json({ commits });
      }
    );
  });

  // ── Push notifications ─────────────────────────────────────────────────
  router.get('/push/public-key', (req, res) => {
    res.json({ publicKey: push.publicKey });
  });

  router.post('/push/subscribe', requireSession(true), (req, res) => {
    const s = req.body && req.body.subscription;
    if (!s || !s.endpoint || !s.keys || !s.keys.p256dh || !s.keys.auth) {
      return res.status(400).json({ error: 'invalid_subscription' });
    }
    const ua = String(req.headers['user-agent'] || '').slice(0, PUSH_UA_MAX);
    queries.upsertPushSub.run(req.user.id, s.endpoint, s.keys.p256dh, s.keys.auth, ua);
    return res.json({ ok: true });
  });

  router.post('/push/unsubscribe', requireSession(true), (req, res) => {
    const endpoint = req.body && req.body.endpoint;
    if (endpoint) queries.delPushSub.run(endpoint);
    else queries.delPushSubsForUser.run(req.user.id);
    return res.json({ ok: true });
  });

  // ── Progression ────────────────────────────────────────────────────────
  router.get('/nemesis', requireSession(true), (req, res) => {
    res.json(progression.getNemesis(req.user.id));
  });

  router.get('/achievements', requireSession(true), (req, res) => {
    const all = queries.allAchievements.all();
    const mine = new Set(queries.userAchievements.all(req.user.id).map((a) => a.key));
    res.json(all.map((a) => ({
      key: a.key,
      name: a.name,
      description: a.description,
      icon: a.icon,
      category: a.category,
      unlocked: mine.has(a.key),
    })));
  });

  router.get('/xp', requireSession(true), (req, res) => {
    res.json(progression.getUserXp(req.user.id));
  });

  router.get('/battlepass', requireSession(true), (req, res) => {
    res.json(progression.getBattlepass(req.user.id));
  });

  router.post('/battlepass/claim/:tier', requireSession(true), (req, res) => {
    const tier = Number(req.params.tier);
    if (!Number.isInteger(tier) || tier < 1 || tier > 10) {
      return res.status(400).json({ error: 'invalid tier' });
    }
    const result = progression.claimBpTier(req.user.id, tier);
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  // ── Profiles ───────────────────────────────────────────────────────────
  router.get('/users/:id', (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) return res.status(404).json({ error: 'not found' });
    const profile = users.getProfile(userId, progression);
    if (!profile) return res.status(404).json({ error: 'user not found' });
    if (req.isAuthenticated() && req.user.id) {
      const myNemesis = progression.getNemesis(req.user.id);
      profile.myNemesis = myNemesis;
      profile.isMyNemesis = myNemesis && myNemesis.nemesisId === userId;
    }
    return res.json(profile);
  });

  // ── Forum ──────────────────────────────────────────────────────────────
  router.get('/forum/threads', (req, res) => {
    const threads = queries.listThreads.all(50);
    if (req.isAuthenticated() && req.user.id) {
      forum.attachMyVotes(req.user.id, threads, 'thread');
    }
    res.json(threads);
  });

  router.post('/forum/threads', requireSession(true), (req, res) => {
    const title = String((req.body && req.body.title) || '').trim().slice(0, 200);
    const body = String((req.body && req.body.body) || '').trim().slice(0, 5000);
    if (title.length < 3) return res.status(400).json({ error: 'title too short' });
    if (body.length < 3) return res.status(400).json({ error: 'body too short' });
    const info = queries.createThread.run(req.user.id, title, body);
    return res.status(201).json({ id: info.lastInsertRowid });
  });

  router.get('/forum/threads/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(404).json({ error: 'not found' });
    const thread = queries.getThread.get(id);
    if (!thread) return res.status(404).json({ error: 'thread not found' });
    thread.replies = queries.getReplies.all(id);
    if (req.isAuthenticated() && req.user.id) {
      forum.attachMyVotes(req.user.id, thread.replies, 'reply');
      thread.myVote = (
        queries.userVotes.all(req.user.id).find((v) => v.target_type === 'thread' && v.target_id === id) || {}
      ).direction || 0;
    }
    return res.json(thread);
  });

  router.post('/forum/threads/:id/reply', requireSession(true), (req, res) => {
    const threadId = Number(req.params.id);
    if (!Number.isInteger(threadId)) return res.status(400).json({ error: 'bad thread id' });
    const body = String((req.body && req.body.body) || '').trim().slice(0, 5000);
    if (body.length < 2) return res.status(400).json({ error: 'reply too short' });
    const thread = queries.getThread.get(threadId);
    if (!thread) return res.status(404).json({ error: 'thread not found' });
    const info = queries.createReply.run(threadId, req.user.id, body);
    return res.status(201).json({ id: info.lastInsertRowid });
  });

  router.post('/forum/vote', requireSession(true), (req, res) => {
    const { targetType, targetId, direction } = req.body || {};
    if (!['thread', 'reply'].includes(targetType)) return res.status(400).json({ error: 'invalid target type' });
    const tid = Number(targetId);
    if (!Number.isInteger(tid)) return res.status(400).json({ error: 'invalid target id' });
    res.json(forum.castVote(req.user.id, targetType, tid, direction));
  });

  return router;
}

module.exports = { createApiRouter };
