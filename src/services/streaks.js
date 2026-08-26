'use strict';

/**
 * Streak calculations.
 *
 * A "streak" is a run of consecutive nixes by the same person (or, for pairs,
 * the same nixer→target). Any intervening nix by another player resets the
 * current streak. `best` tracks the longest run ever recorded.
 */
function createStreaksService(db, q) {
  function getStreaks() {
    const rows = q.allNixPairs.all();
    const current = {};
    const best = {};
    for (const r of rows) {
      current[r.nixed_id] = 0; // the target breaks the nixer's streak
      current[r.nixer_id] = (current[r.nixer_id] || 0) + 1;
      if (current[r.nixer_id] > (best[r.nixer_id] || 0)) best[r.nixer_id] = current[r.nixer_id];
    }
    return { current, best };
  }

  function getStreakPairs() {
    const rows = q.allNixPairs.all();
    const current = {};
    const best = {};
    for (const r of rows) {
      const ab = `${r.nixer_id}:${r.nixed_id}`;
      const ba = `${r.nixed_id}:${r.nixer_id}`;
      current[ba] = 0;
      current[ab] = (current[ab] || 0) + 1;
      if (current[ab] > (best[ab] || 0)) best[ab] = current[ab];
    }
    return { current, best };
  }

  return { getStreaks, getStreakPairs };
}

module.exports = { createStreaksService };
