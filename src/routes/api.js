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
 * @param {object} deps.push        push module
 * @param {object} deps.config      config
 */
function createApiRouter(deps) {
  const {
    queries, stats, streaks, progression, users, push, config,
  } = deps;
  const router = express.Router();

  // ── Account ────────────────────────────────────────────────────────────
  router.get('/me', requireSession(false), (req, res) => {
    res.json({
      id: req.user.id,
      discordId: req.user.discordId,
      name: req.user.name || null,
      avatar: req.user.avatarUrl || null,
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
    else queries.insertUser.run(req.user.discordId, name, ci, req.user.avatarUrl || null);
    return res.json({ ok: true, name });
  });

  // ── Board ──────────────────────────────────────────────────────────────
  // Attach each user's active border to a nix row so the feed can draw it.
  // Results are cached per request — a page of 10 rows touches at most 20 users.
  const withBorders = (rows) => {
    const borderByUser = new Map();
    const borderFor = (uid) => {
      if (!borderByUser.has(uid)) {
        borderByUser.set(uid, progression.getUserCosmetics(uid).border);
      }
      return borderByUser.get(uid);
    };
    return rows.map((r) => ({
      ...r,
      nixerBorder: borderFor(r.nixerUid),
      targetBorder: borderFor(r.targetUid),
    }));
  };

  router.get('/board', requireSession(true), (req, res) => {
    const allUsers = queries.allUsers.all();
    const nameById = new Map(allUsers.map((u) => [u.id, u.name]));

    const avatarById = new Map(allUsers.map((u) => [u.id, u.avatar_url]));

    // Active cosmetic border per user, cached for the request. Lets every
    // ranked card (not just Top nixers) paint unlocked border effects.
    const borderCache = new Map();
    const activeBorder = (uid) => {
      if (!borderCache.has(uid)) borderCache.set(uid, progression.getUserCosmetics(uid).border);
      return borderCache.get(uid);
    };

    const { current } = streaks.getStreaks();
    const streakRows = Object.entries(current)
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))
      .slice(0, STREAK_TOP)
      .map(([id, streak]) => ({ id: Number(id), name: nameById.get(Number(id)), avatar: avatarById.get(Number(id)) || null, streak, border: activeBorder(Number(id)) }));

    const leaderboard = queries.leaderboard.all(BOARD_TOP).map((r) => {
      const xp = progression.getUserXp(r.uid);
      const cosmetics = progression.getUserCosmetics(r.uid);
      return {
        uid: r.uid,
        name: r.name,
        avatar: r.avatar || null,
        n: r.n,
        received: queries.userReceived.get(r.uid).n,
        level: xp.level,
        title: cosmetics.title,
        border: cosmetics.border,
      };
    });

    res.json({
      me: { id: req.user.id, name: req.user.name, avatar: req.user.avatarUrl || null },
      targets: allUsers.map((u) => ({ id: u.id, name: u.name, avatar: u.avatar_url || null })),
      leaderboard,
      mostNixed: queries.mostNixed.all(BOARD_TOP).map((r) => ({ uid: r.uid, name: r.name, avatar: r.avatar || null, n: r.n, border: activeBorder(r.uid) })),
      topPairs: queries.topPairs.all(BOARD_TOP).map((r) => ({
        auid: r.auid, buid: r.buid, nixer: r.nixer, target: r.target,
        aAvatar: r.aAvatar || null, bAvatar: r.bAvatar || null, n: r.n,
        aBorder: activeBorder(r.auid), bBorder: activeBorder(r.buid),
      })),
      streaks: streakRows,
      recent: withBorders(queries.recent.all(RECENT_PAGE, 0)),
      recentTotal: queries.recentCount.get().n,
    });
  });

  router.get('/nixes', requireSession(true), (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || RECENT_PAGE, 1), 50);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    res.json({
      items: withBorders(queries.recent.all(limit, (page - 1) * limit)),
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
    const giverAch = progression.syncAchievements(req.user.id);
    const receiverAch = progression.syncAchievements(targetId);
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

  // Switch which unlocked title / border (or badge) is displayed.
  router.post('/battlepass/cosmetics', requireSession(true), (req, res) => {
    const { kind, value } = req.body || {};
    if (value !== null && (typeof value !== 'string' || !value.trim())) {
      return res.status(400).json({ error: 'invalid value' });
    }
    const result = progression.setActiveCosmetic(req.user.id, kind, value ?? null);
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  // ── Profiles ───────────────────────────────────────────────────────────
  router.get('/users/:id', (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) return res.status(404).json({ error: 'not found' });
    const isMe = Boolean(req.isAuthenticated() && req.user.id === userId);
    // Retroactive unlock: achievements for nixes made before the
    // achievements system (or since the last check) are applied here, so
    // the profile that is displayed is always current.
    progression.syncAchievements(userId);
    const profile = users.getProfile(userId, progression, { isMe });
    if (!profile) return res.status(404).json({ error: 'user not found' });
    profile.isMe = isMe;
    if (req.isAuthenticated() && req.user.id) {
      const myNemesis = progression.getNemesis(req.user.id);
      profile.myNemesis = myNemesis;
      profile.isMyNemesis = myNemesis && myNemesis.nemesisId === userId;
    }
    return res.json(profile);
  });

  return router;
}

module.exports = { createApiRouter };
