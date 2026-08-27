'use strict';

/**
 * Progression system: nemesis, XP/levels, achievements and the battle
 * pass (tiers unlock by level / total XP). All thresholds and constants
 * live here.
 */

const XP_GIVEN = 50;
const XP_RECEIVED = 20;
const XP_ACH = 100;
const XP_DAILY = 10;
const XP_PER_LEVEL = 200;

// `xp` is a total-XP threshold; with 200 XP per level, tier N unlocks at
// level N.
const BP_TIERS = [
  { tier: 1, name: 'Rookie', xp: 0, reward: 'title', value: 'Rookie' },
  { tier: 2, name: 'Blue Border', xp: 200, reward: 'border', value: 'blue' },
  { tier: 3, name: 'Nix Apprentice', xp: 400, reward: 'title', value: 'Nix Apprentice' },
  { tier: 4, name: 'Purple Border', xp: 600, reward: 'border', value: 'purple' },
  { tier: 5, name: 'Nix Adept', xp: 800, reward: 'title', value: 'Nix Adept' },
  { tier: 6, name: 'Gold Border', xp: 1000, reward: 'border', value: 'gold' },
  { tier: 7, name: 'Nix Master', xp: 1200, reward: 'title', value: 'Nix Master' },
  { tier: 8, name: 'Rainbow Border', xp: 1400, reward: 'border', value: 'rainbow' },
  { tier: 9, name: 'Nix Grandmaster', xp: 1600, reward: 'title', value: 'Nix Grandmaster' },
  { tier: 10, name: 'Nix Legend', xp: 1800, reward: 'badge', value: 'legend' },
];

function createProgressionService(db, q) {
  function levelFromXp(xp) {
    return Math.floor(xp / XP_PER_LEVEL) + 1;
  }

  // ── Nemesis ─────────────────────────────────────────────────────────────
  function getNemesis(userId) {
    const row = q.nemesis.get(userId);
    if (!row) return null;
    const revenge = q.nixCountBetween.get(userId, row.uid).n;
    return {
      nemesisId: row.uid,
      username: row.name,
      timesNixedYou: row.n,
      revenge,
    };
  }

  // ── XP / levels ─────────────────────────────────────────────────────────
  function getUserXp(userId) {
    const row = q.xpByUser.get(userId);
    if (!row) {
      q.insertXp.run(userId);
      return { totalXp: 0, level: 1, levelProgress: 0 };
    }
    return {
      totalXp: row.total_xp,
      level: levelFromXp(row.total_xp),
      levelProgress: (row.total_xp % XP_PER_LEVEL) / XP_PER_LEVEL,
    };
  }

  function awardXp(userId, amount) {
    q.awardXp.run(userId, amount);
  }

  function awardNixXp(giverId, receiverId) {
    let giver = XP_GIVEN;
    let receiver = XP_RECEIVED;
    let revenge = false;
    const nem = getNemesis(giverId);
    if (nem && nem.nemesisId === receiverId) {
      giver *= 2;
      revenge = true;
      unlockAch(giverId, 'revenge');
    }
    if (giver) awardXp(giverId, giver);
    if (receiver) awardXp(receiverId, receiver);
    return { giverXp: giver, receiverXp: receiver, revenge };
  }

  // ── Achievements ────────────────────────────────────────────────────────
  function unlockAch(userId, key) {
    const ach = q.achievementByKey.get(key);
    if (!ach) return false;
    if (q.hasAchievement.get(userId, key)) return false;
    q.unlockAchievement.run(userId, ach.id);
    return true;
  }

  function checkAchievements(userId) {
    const given = q.userGiven.get(userId).n;
    const received = q.userReceived.get(userId).n;
    const uniqueNixed = q.userUniqueTargets.get(userId).n;
    const unlocked = [];
    const tryUnlock = (key) => {
      if (unlockAch(userId, key)) unlocked.push(key);
    };

    if (given >= 1) tryUnlock('first_nix');
    if (given >= 10) tryUnlock('nix_10');
    if (given >= 25) tryUnlock('nix_25');
    if (given >= 50) tryUnlock('nix_50');
    if (given >= 100) tryUnlock('nix_100');
    if (received >= 1) tryUnlock('first_received');
    if (received >= 10) tryUnlock('received_10');
    if (received >= 25) tryUnlock('received_25');
    if (uniqueNixed >= 5) tryUnlock('social_butterfly');

    const nem = getNemesis(userId);
    if (nem && nem.timesNixedYou >= 3) tryUnlock('nemesis');

    const top = q.topNixedUser.get();
    if (top && top.nixed_id === userId && received >= 2) tryUnlock('top_dog');

    const first = q.userFirstNix.get(userId, userId).d;
    const last = q.userLastNix.get(userId, userId).d;
    if (first && last) {
      const d1 = new Date(`${first.replace(' ', 'T')}Z`);
      const d2 = new Date(`${last.replace(' ', 'T')}Z`);
      if (d2 - d1 >= 30 * 86400000) tryUnlock('veteran');
    }

    const total = q.countUserAch.get(userId).n;
    if (total >= 5) tryUnlock('collector');
    if (total >= q.countAllAch.get().n) tryUnlock('completionist');

    return unlocked;
  }

  // ── Battle pass / cosmetics ─────────────────────────────────────────────
  function getBattlepass(userId) {
    const xp = getUserXp(userId);
    const claims = new Set(q.bpClaims.all(userId).map((c) => c.tier));
    const tiers = BP_TIERS.map((t) => ({
      ...t,
      unlocked: xp.totalXp >= t.xp,
      claimed: claims.has(t.tier),
    }));
    const highest = tiers.filter((t) => t.unlocked).pop();
    const active = getUserCosmetics(userId);
    return {
      totalXp: xp.totalXp,
      level: xp.level,
      levelProgress: xp.levelProgress,
      tiers,
      highestTier: highest ? highest.tier : 0,
      activeTitle: active.title,
      activeBorder: active.border,
      activeBadge: active.badge,
    };
  }

  /**
   * The cosmetics a user actually displays. An explicit choice (see
   * setActiveCosmetic) wins; otherwise the highest claimed tier per category
   * is used, so existing users keep their current look.
   */
  function getUserCosmetics(userId) {
    const claims = q.bpClaims.all(userId);
    if (!claims.length) return { title: null, border: null, badge: null };
    const tiers = BP_TIERS.map((t) => ({
      ...t,
      claimed: new Set(claims.map((c) => c.tier)).has(t.tier),
    }));
    const auto = cosmeticsFromClaims(tiers);
    const sel = q.userCosmetics.get(userId) || {};
    return {
      title: sel.title || auto.title,
      border: sel.border || auto.border,
      badge: sel.badge || auto.badge,
    };
  }

  function cosmeticsFromClaims(tiers) {
    let title = null;
    let border = null;
    let badge = null;
    for (const t of tiers) {
      if (!t.claimed) continue;
      if (t.reward === 'title') title = t.value;
      if (t.reward === 'border') border = t.value;
      if (t.reward === 'badge') badge = t.value;
    }
    return { title, border, badge };
  }

  /**
   * Switch which unlocked cosmetic is shown, per category ('title' | 'border'
   * | 'badge'). `value` must be a reward the user has actually claimed, or
   * null to drop the explicit choice (falls back to the highest claimed).
   */
  function setActiveCosmetic(userId, kind, value) {
    if (!['title', 'border', 'badge'].includes(kind)) return { error: 'invalid kind' };
    const claimedTiers = new Set(q.bpClaims.all(userId).map((c) => c.tier));
    if (value !== null) {
      const tier = BP_TIERS.find((t) => t.reward === kind && t.value === value);
      if (!tier || !claimedTiers.has(tier.tier)) return { error: 'not unlocked' };
    }
    const cur = q.userCosmetics.get(userId) || {};
    const next = {
      title: kind === 'title' ? value : cur.title ?? null,
      border: kind === 'border' ? value : cur.border ?? null,
      badge: kind === 'badge' ? value : cur.badge ?? null,
    };
    q.upsertUserCosmetics.run(userId, next.title, next.border, next.badge);
    return { ok: true, cosmetics: getUserCosmetics(userId) };
  }

  function claimBpTier(userId, tier) {
    const xp = getUserXp(userId);
    const t = BP_TIERS.find((c) => c.tier === tier);
    if (!t) return { error: 'invalid tier' };
    if (xp.totalXp < t.xp) return { error: 'not unlocked yet' };
    if (q.bpClaimExists.get(userId, tier)) return { error: 'already claimed' };
    q.bpClaim.run(userId, tier);
    return { ok: true };
  }

  return {
    getNemesis,
    getUserXp,
    awardXp,
    awardNixXp,
    checkAchievements,
    unlockAch,
    getBattlepass,
    getUserCosmetics,
    setActiveCosmetic,
    claimBpTier,
    levelFromXp,
  };
}

module.exports = {
  createProgressionService,
  BP_TIERS,
  XP_GIVEN,
  XP_RECEIVED,
  XP_ACH,
  XP_DAILY,
  XP_PER_LEVEL,
};
