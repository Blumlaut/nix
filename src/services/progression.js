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
const MAX_LEVEL = 500;

// Level milestones spread across the whole 1-500 ladder: dense early on
// where players actually spend their time, then wider spacing towards the
// (very long-term) top. Unlocked in checkAchievements via `lvl_<n>` keys.
const LEVEL_MILESTONES = [
  5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 125, 150, 175, 200, 225, 250, 275,
  300, 325, 350, 375, 400, 425, 450, 475, 500,
];

/** Longest run of consecutive calendar days (input: sorted `YYYY-MM-DD`). */
function longestDayRun(days) {
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of days) {
    const t = Date.parse(`${d}T00:00:00Z`);
    run = prev !== null && t - prev === 86400000 ? run + 1 : 1;
    prev = t;
    if (run > best) best = run;
  }
  return best;
}

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
  { tier: 11, name: 'Nix Overlord', xp: 2000, reward: 'title', value: 'Nix Overlord' },
  { tier: 12, name: 'Emerald Border', xp: 2200, reward: 'border', value: 'emerald' },
  { tier: 13, name: 'Nix Sovereign', xp: 2400, reward: 'title', value: 'Nix Sovereign' },
  { tier: 14, name: 'Platinum Border', xp: 2600, reward: 'border', value: 'platinum' },
  { tier: 15, name: 'Nix Immortal', xp: 2800, reward: 'title', value: 'Nix Immortal' },
  { tier: 16, name: 'Nix Mythic', xp: 3000, reward: 'badge', value: 'mythic' },
];

function createProgressionService(db, q) {
  function levelFromXp(xp) {
    return Math.min(Math.floor(xp / XP_PER_LEVEL) + 1, MAX_LEVEL);
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
      return {
        totalXp: 0,
        level: 1,
        levelXp: 0,
        xpPerLevel: XP_PER_LEVEL,
        maxLevel: MAX_LEVEL,
        levelProgress: 0,
      };
    }
    const level = levelFromXp(row.total_xp);
    // XP inside the current level — every other XP display is derived from
    // it, so total XP, level and the progress bar can never disagree.
    const levelXp = level >= MAX_LEVEL ? XP_PER_LEVEL : row.total_xp % XP_PER_LEVEL;
    return {
      totalXp: row.total_xp,
      level,
      levelXp,
      xpPerLevel: XP_PER_LEVEL,
      maxLevel: MAX_LEVEL,
      levelProgress: level >= MAX_LEVEL ? 1 : levelXp / XP_PER_LEVEL,
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
    if (given >= 250) tryUnlock('nix_250');
    if (given >= 500) tryUnlock('nix_500');
    if (given >= 750) tryUnlock('nix_750');
    if (given >= 1000) tryUnlock('nix_1000');
    if (received >= 1) tryUnlock('first_received');
    if (received >= 10) tryUnlock('received_10');
    if (received >= 25) tryUnlock('received_25');
    if (received >= 50) tryUnlock('received_50');
    if (received >= 100) tryUnlock('received_100');
    if (received >= 250) tryUnlock('received_250');
    if (received >= 500) tryUnlock('received_500');
    if (uniqueNixed >= 5) tryUnlock('social_butterfly');
    if (uniqueNixed >= 10) tryUnlock('unique_10');
    if (uniqueNixed >= 25) tryUnlock('unique_25');

    const busiest = q.userMaxPerDay.get(userId)?.n || 0;
    if (busiest >= 3) tryUnlock('hat_trick');
    if (busiest >= 5) tryUnlock('rampage');
    if (busiest >= 10) tryUnlock('bloodbath');

    // Nixing days (distinct days + the longest consecutive run through them).
    const days = q.userNixDays.all(userId).map((r) => r.d);
    if (days.length >= 10) tryUnlock('days_10');
    if (days.length >= 50) tryUnlock('days_50');
    if (days.length >= 100) tryUnlock('days_100');
    if (longestDayRun(days) >= 7) tryUnlock('week_7');

    const favorite = q.userMaxPerTarget.get(userId);
    if (favorite && favorite.n >= 25) tryUnlock('duo_25');
    if (favorite && favorite.n >= 50) tryUnlock('duo_50');

    const nem = getNemesis(userId);
    if (nem && nem.timesNixedYou >= 3) tryUnlock('nemesis');
    if (nem && nem.timesNixedYou >= 5) tryUnlock('nemesis_5');
    if (nem && nem.revenge >= 10) tryUnlock('revenge_10');

    const top = q.topNixedUser.get();
    if (top && top.nixed_id === userId && received >= 2) tryUnlock('top_dog');

    const first = q.userFirstNix.get(userId, userId).d;
    const last = q.userLastNix.get(userId, userId).d;
    if (first && last) {
      const d1 = new Date(`${first.replace(' ', 'T')}Z`);
      const d2 = new Date(`${last.replace(' ', 'T')}Z`);
      const span = d2 - d1;
      if (span >= 30 * 86400000) tryUnlock('veteran');
      if (span >= 100 * 86400000) tryUnlock('veteran_100');
    }

    const level = getUserXp(userId).level;
    for (const milestone of LEVEL_MILESTONES) {
      if (level >= milestone) tryUnlock(`lvl_${milestone}`);
    }

    const claims = q.bpClaimCount.get(userId).n;
    if (claims >= 5) tryUnlock('claim_5');
    if (claims >= BP_TIERS.length) tryUnlock('claim_all');

    // Effective cosmetics (explicit choice, otherwise the highest claimed
    // tier per category) — claiming the tiers is enough to wear a full set.
    const cos = getUserCosmetics(userId);
    if (cos.title && cos.border && cos.badge) tryUnlock('cosmetics_all');

    // The count query sees everything unlocked above (each insert commits),
    // so meta achievements that this pass reaches unlock with it.
    const total = q.countUserAch.get(userId).n;
    if (total >= 5) tryUnlock('collector');
    if (total >= 10) tryUnlock('collector_10');
    if (total >= 25) tryUnlock('collector_25');
    if (total >= 50) tryUnlock('collector_50');
    if (total >= q.countAllAch.get().n) tryUnlock('completionist');

    return unlocked;
  }

  /**
   * Check a user's achievements and award the standard XP for every newly
   * unlocked one. Idempotent — safe to call on profile load so that nixes
   * made before the achievements existed are unlocked retroactively.
   */
  function syncAchievements(userId) {
    const unlocked = checkAchievements(userId);
    if (unlocked.length) awardXp(userId, unlocked.length * XP_ACH);
    return unlocked;
  }

  /**
   * Run the retroactive pass for every user once at boot. Nixes made before
   * an achievement (or before a whole achievement batch) existed never ran a
   * check, so the achievement XP — and with it the level shown on the board,
   * in the header and on a profile — could differ per view until each user
   * happened to open their own profile page.
   */
  function syncAchievementsForAll() {
    let unlocked = 0;
    for (const u of q.allUsers.all()) unlocked += syncAchievements(u.id).length;
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
      levelXp: xp.levelXp,
      xpPerLevel: XP_PER_LEVEL,
      maxLevel: MAX_LEVEL,
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
    syncAchievements,
    syncAchievementsForAll,
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
  LEVEL_MILESTONES,
  XP_GIVEN,
  XP_RECEIVED,
  XP_ACH,
  XP_DAILY,
  XP_PER_LEVEL,
  MAX_LEVEL,
};
