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
   */
  function getProfile(userId, progression) {
    const user = q.userById.get(userId);
    if (!user) return null;

    return {
      user,
      stats: getUserStats(userId),
      xp: progression.getUserXp(userId),
      achievements: q.userAchievements.all(userId),
      nemesis: progression.getNemesis(userId),
      cosmetics: progression.getUserCosmetics(userId),
      battlepass: progression.getBattlepass(userId),
      topTargets: q.userTopTargets.all(userId),
      recentActivity: q.userRecentActivity.all(userId, userId),
    };
  }

  return { getUserStats, getProfile };
}

module.exports = { createUsersService };
