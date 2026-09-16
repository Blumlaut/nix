'use strict';

/**
 * Achievement catalog. Seeded once on startup via `INSERT OR IGNORE` so
 * existing installs keep their rows and new installs get the definitions:
 * achievements are spread over the whole 500-level ladder (every ~25 levels
 * plus the wider gaps up top), the nix/received ladders, daily and long-term
 * activity, rivalries and the nixpass itself.
 */
const ACHIEVEMENTS = [
  [1, 'first_nix', 'First Blood', 'Give your first nix', '⚡', 'nixing'],
  [2, 'first_received', 'Famous', 'Receive your first nix', '⭐', 'receiving'],
  [3, 'nix_10', 'Getting Warm', 'Give 10 nixes', '🔥', 'nixing'],
  [4, 'nix_25', 'Serial Nixer', 'Give 25 nixes', '💥', 'nixing'],
  [5, 'nix_50', 'Nix Machine', 'Give 50 nixes', '⚙️', 'nixing'],
  [6, 'nix_100', 'Centurion', 'Give 100 nixes', '🏛️', 'nixing'],
  [7, 'received_10', 'Notorious', 'Get nixed 10 times', '👀', 'receiving'],
  [8, 'received_25', 'Villain', 'Get nixed 25 times', '😈', 'receiving'],
  [9, 'social_butterfly', 'Social Butterfly', 'Nix 5 different users', '🦋', 'social'],
  [10, 'nemesis', 'Nemesis', 'Get nixed 3+ times by the same user', '💀', 'nemesis'],
  [11, 'revenge', 'Revenge', 'Nix your current nemesis', '⚔️', 'nemesis'],
  [12, 'top_dog', 'Top Dog', 'Be the #1 most-nixed user', '👑', 'prestige'],
  [13, 'collector', 'Collector', 'Unlock 5 achievements', '🎒', 'meta'],
  [14, 'veteran', 'Veteran', 'Have nixes spanning 30+ days', '📅', 'meta'],
  [15, 'completionist', 'Completionist', 'Unlock every achievement', '🏆', 'meta'],
  [16, 'nix_250', 'Unstoppable', 'Give 250 nixes', '🌋', 'nixing'],
  [17, 'nix_500', 'Extinction Event', 'Give 500 nixes', '☄️', 'nixing'],
  [18, 'received_50', 'Infamous', 'Get nixed 50 times', '🎯', 'receiving'],
  [19, 'received_100', 'Living Target', 'Get nixed 100 times', '🩹', 'receiving'],
  [20, 'unique_10', 'Networker', 'Nix 10 different users', '🕸️', 'social'],
  [21, 'unique_25', 'Influencer', 'Nix 25 different users', '📣', 'social'],
  [22, 'nemesis_5', 'Arch Nemesis', 'Get nixed 5+ times by the same user', '☠️', 'nemesis'],
  [23, 'rampage', 'Rampage', 'Nix 5 people in a single day', '🌪️', 'activity'],
  [24, 'collector_10', 'Archivist', 'Unlock 10 achievements', '🗃️', 'meta'],
  [25, 'veteran_100', 'Old Guard', 'Have nixes spanning 100+ days', '🗿', 'meta'],
  [26, 'lvl_5', 'First Steps', 'Reach level 5', '🌱', 'level'],
  [27, 'lvl_10', 'Regular', 'Reach level 10', '🥉', 'level'],
  [28, 'lvl_20', 'Getting Serious', 'Reach level 20', '🥈', 'level'],
  [29, 'lvl_30', 'Devoted', 'Reach level 30', '🥇', 'level'],
  [30, 'lvl_40', 'Hardened', 'Reach level 40', '🎖️', 'level'],
  [31, 'lvl_50', 'Half Century', 'Reach level 50', '🏅', 'level'],
  [32, 'lvl_75', 'Seasoned', 'Reach level 75', '🍂', 'level'],
  [33, 'lvl_100', 'Triple Digits', 'Reach level 100', '💯', 'level'],
  [34, 'lvl_125', 'Relentless', 'Reach level 125', '♨️', 'level'],
  [35, 'lvl_150', 'Elite', 'Reach level 150', '⚜️', 'level'],
  [36, 'lvl_200', 'Double Century', 'Reach level 200', '🏵️', 'level'],
  [37, 'lvl_250', 'Ascendant', 'Reach level 250', '✨', 'level'],
  [38, 'lvl_300', 'Titan', 'Reach level 300', '🗡️', 'level'],
  [39, 'lvl_350', 'Colossus', 'Reach level 350', '🏔️', 'level'],
  [40, 'lvl_400', 'Mythical', 'Reach level 400', '🐉', 'level'],
  [41, 'lvl_450', 'Transcendent', 'Reach level 450', '🌌', 'level'],
  [42, 'lvl_500', 'Nix Deity', 'Reach the maximum level 500', '👑', 'level'],
  [43, 'nix_750', 'Nix Tsunami', 'Give 750 nixes', '🌊', 'nixing'],
  [44, 'nix_1000', 'Nixpocalypse', 'Give 1000 nixes', '🧨', 'nixing'],
  [45, 'received_250', 'Punching Bag', 'Get nixed 250 times', '🥊', 'receiving'],
  [46, 'received_500', 'Unkillable', 'Get nixed 500 times', '🛡️', 'receiving'],
  [47, 'hat_trick', 'Hat Trick', 'Nix 3 people in a single day', '🎩', 'activity'],
  [48, 'bloodbath', 'Bloodbath', 'Nix 10 people in a single day', '🩸', 'activity'],
  [49, 'days_10', 'Consistent', 'Nix on 10 different days', '📆', 'activity'],
  [50, 'days_50', 'Ritual', 'Nix on 50 different days', '🗓️', 'activity'],
  [51, 'days_100', 'Inevitable', 'Nix on 100 different days', '⏳', 'activity'],
  [52, 'week_7', 'Weekly Warrior', 'Nix on 7 days in a row', '⛓️', 'activity'],
  [53, 'duo_25', 'Dynamic Duo', 'Nix the same person 25 times', '🤝', 'nemesis'],
  [54, 'duo_50', 'Obsessed', 'Nix the same person 50 times', '🧲', 'nemesis'],
  [55, 'revenge_10', 'Grudge Holder', 'Nix your nemesis 10 times', '🪓', 'nemesis'],
  [56, 'claim_5', 'Fashionista', 'Claim 5 nixpass tiers', '💅', 'meta'],
  [57, 'claim_all', 'Full Wardrobe', 'Claim every nixpass tier', '🧥', 'meta'],
  [58, 'cosmetics_all', 'Dressed to Impress', 'Show a title, a border and a badge at once', '🕶️', 'meta'],
  [59, 'collector_25', 'Curator', 'Unlock 25 achievements', '🗂️', 'meta'],
  [60, 'collector_50', 'Hoarder', 'Unlock 50 achievements', '📚', 'meta'],
  [61, 'lvl_15', 'Warming Up', 'Reach level 15', '☕', 'level'],
  [62, 'lvl_25', 'On a Roll', 'Reach level 25', '🎳', 'level'],
  [63, 'lvl_175', 'Warlord', 'Reach level 175', '🪖', 'level'],
  [64, 'lvl_225', 'Overachiever', 'Reach level 225', '📈', 'level'],
  [65, 'lvl_275', 'Untouchable', 'Reach level 275', '🌀', 'level'],
  [66, 'lvl_325', 'Juggernaut', 'Reach level 325', '🚂', 'level'],
  [67, 'lvl_375', 'Leviathan', 'Reach level 375', '🐋', 'level'],
  [68, 'lvl_425', 'Starforged', 'Reach level 425', '🌠', 'level'],
  [69, 'lvl_475', 'Eternal', 'Reach level 475', '⏱️', 'level'],
  [70, 'first_of_week', 'Early Bird', 'Give the first nix of a week', '🐦', 'activity'],
];

/**
 * Insert the achievement catalog. Idempotent; safe to run on every boot.
 * @param {import('better-sqlite3').Database} db
 */
function seedAchievements(db) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO achievements (id, key, name, description, icon, category)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const run = db.transaction((rows) => rows.forEach((row) => insert.run(...row)));
  run(ACHIEVEMENTS);
}

module.exports = { ACHIEVEMENTS, seedAchievements };
