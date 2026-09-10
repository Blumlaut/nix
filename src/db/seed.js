'use strict';

/**
 * Achievement catalog. Seeded once on startup via `INSERT OR IGNORE` so
 * existing installs keep their rows and new installs get the definitions.
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
