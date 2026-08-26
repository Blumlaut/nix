'use strict';

/**
 * Forum voting logic. A vote can be up (+1) or down (-1); voting again on the
 * same item toggles: same direction removes the vote, opposite flips it.
 */
function createForumService(db, q) {
  function castVote(userId, targetType, targetId, direction) {
    direction = direction === 1 ? 1 : -1;
    const existing = q.voteGet.get(userId, targetType, targetId);
    if (existing) {
      if (existing.direction === direction) {
        q.voteDelete.run(userId, targetType, targetId);
      } else {
        q.voteUpdate.run(direction, userId, targetType, targetId);
      }
    } else {
      q.voteInsert.run(userId, targetType, targetId, direction);
    }
    const row = q.voteScore.get(targetType, targetId);
    return {
      voted: existing && existing.direction === direction ? 0 : direction,
      score: row.s,
    };
  }

  /** Map the current user's votes onto a list of rows (threads or replies). */
  function attachMyVotes(userId, items, type) {
    const voteMap = {};
    for (const v of q.userVotes.all(userId)) {
      voteMap[`${v.target_type}:${v.target_id}`] = v.direction;
    }
    for (const item of items) {
      item.myVote = voteMap[`${type}:${item.id}`] || 0;
    }
    return items;
  }

  return { castVote, attachMyVotes };
}

module.exports = { createForumService };
