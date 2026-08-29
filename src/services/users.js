'use strict';

/**
 * Per-user stats and the full public profile used by the profile page.
 */
function createUsersService(db, q) {
  function getUserStats(userId) {
    return {
      given: q.userGiven.get(userId).n,
      received: q.userReceived.get(userId).n,
      firstNix: q.userFirstNix.get(userId, userId).d,
      lastNix: q.userLastNix.get(userId, userId).d,
      uniqueNixed: q.userUniqueTargets.get(userId).n,
    };
  }

  /**
   * Assemble everything shown on a profile page.
   * @param {import('./progression')} progression
   * @param {{ isMe?: boolean }} [opts] the battlepass (tiers, claims, claim
   *   buttons) is private — only included for the profile owner themselves.
   */
  /**
   * Full achievement catalog for a user, each entry flagged `unlocked`. The
   * profile page renders locked entries dimmed, so the catalog (not just the
   * unlocked rows) must come with the profile — and it must be the profiled
   * user's unlocks, not the viewer's.
   */
  function getAchievements(userId) {
    const mine = new Set(q.userAchievements.all(userId).map((a) => a.key));
    return q.allAchievements.all().map((a) => ({
      key: a.key,
      name: a.name,
      description: a.description,
      icon: a.icon,
      category: a.category,
      unlocked: mine.has(a.key),
    }));
  }

  function getProfile(userId, progression, { isMe = false } = {}) {
    const user = q.userById.get(userId);
    if (!user) return null;

    return {
      user,
      stats: getUserStats(userId),
      xp: progression.getUserXp(userId),
      achievements: getAchievements(userId),
      nemesis: progression.getNemesis(userId),
      cosmetics: progression.getUserCosmetics(userId),
      ...(isMe ? { battlepass: progression.getBattlepass(userId) } : {}),
      topTargets: q.userTopTargets.all(userId),
      recentActivity: q.userRecentActivity.all(userId, userId),
    };
  }

  return { getUserStats, getAchievements, getProfile };
}

module.exports = { createUsersService };
