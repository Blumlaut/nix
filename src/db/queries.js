'use strict';

/**
 * All prepared statements, grouped by domain. Prepared once at startup and
 * reused for the life of the process (better-sqlite3's main performance win).
 */
function prepareAll(db) {
  return {
    // ── users ─────────────────────────────────────────────────────────────
    userByDiscord: db.prepare('SELECT * FROM users WHERE discord_id = ?'),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    userByNameCi: db.prepare('SELECT * FROM users WHERE name_ci = ?'),
    insertUser: db.prepare('INSERT INTO users (discord_id, name, name_ci, avatar_url) VALUES (?, ?, ?, ?)'),
    updateName: db.prepare("UPDATE users SET name = ?, name_ci = ?, updated_at = datetime('now') WHERE id = ?"),
    updateAvatar: db.prepare("UPDATE users SET avatar_url = ?, updated_at = datetime('now') WHERE id = ?"),
    allUsers: db.prepare('SELECT id, discord_id, name, avatar_url FROM users ORDER BY name_ci ASC'),

    // ── nixes ─────────────────────────────────────────────────────────────
    insertNix: db.prepare('INSERT INTO nixes (nixer_id, nixed_id) VALUES (?, ?)'),
    nixById: db.prepare('SELECT id, nixer_id FROM nixes WHERE id = ?'),
    deleteNix: db.prepare('DELETE FROM nixes WHERE id = ? AND nixer_id = ?'),
    leaderboard: db.prepare(`
      SELECT u.id AS uid, u.name AS name, u.avatar_url AS avatar, COUNT(*) AS n
      FROM nixes nx JOIN users u ON u.id = nx.nixer_id
      GROUP BY nx.nixer_id ORDER BY n DESC, u.name_ci ASC LIMIT ?`),
    mostNixed: db.prepare(`
      SELECT u.id AS uid, u.name AS name, u.avatar_url AS avatar, COUNT(*) AS n
      FROM nixes nx JOIN users u ON u.id = nx.nixed_id
      GROUP BY nx.nixed_id ORDER BY n DESC, u.name_ci ASC LIMIT ?`),
    topPairs: db.prepare(`
      SELECT a.id AS auid, a.name AS nixer, a.avatar_url AS aAvatar,
             b.id AS buid, b.name AS target, b.avatar_url AS bAvatar, COUNT(*) AS n
      FROM nixes nx JOIN users a ON a.id = nx.nixer_id JOIN users b ON b.id = nx.nixed_id
      GROUP BY nx.nixer_id, nx.nixed_id
      ORDER BY n DESC, a.name_ci ASC, b.name_ci ASC LIMIT ?`),
    recent: db.prepare(`
      SELECT nx.id AS id, a.name AS nixer, b.name AS target,
             a.id AS nixerUid, b.id AS targetUid,
             nx.created_at AS created_at, nx.nixer_id AS nixerId
      FROM nixes nx JOIN users a ON a.id = nx.nixer_id JOIN users b ON b.id = nx.nixed_id
      ORDER BY nx.id DESC LIMIT ? OFFSET ?`),
    recentCount: db.prepare('SELECT COUNT(*) AS n FROM nixes'),

    // ── per-user nix stats ────────────────────────────────────────────────
    myCalendar: db.prepare(`
      SELECT date(created_at) AS d, COUNT(*) AS n FROM nixes
      WHERE nixer_id = ? AND date(created_at) >= date('now', '-371 days') GROUP BY d`),
    nemesis: db.prepare(`
      SELECT a.id AS uid, a.name AS name, COUNT(*) AS n
      FROM nixes nx JOIN users a ON a.id = nx.nixer_id
      WHERE nx.nixed_id = ? GROUP BY nx.nixer_id
      ORDER BY n DESC, a.name_ci ASC LIMIT 1`),
    nixCountBetween: db.prepare('SELECT COUNT(*) AS n FROM nixes WHERE nixer_id = ? AND nixed_id = ?'),
    userGiven: db.prepare('SELECT COUNT(*) AS n FROM nixes WHERE nixer_id = ?'),
    userReceived: db.prepare('SELECT COUNT(*) AS n FROM nixes WHERE nixed_id = ?'),
    userFirstNix: db.prepare('SELECT MIN(created_at) AS d FROM nixes WHERE nixer_id = ? OR nixed_id = ?'),
    userLastNix: db.prepare('SELECT MAX(created_at) AS d FROM nixes WHERE nixer_id = ? OR nixed_id = ?'),
    userUniqueTargets: db.prepare('SELECT COUNT(DISTINCT nixed_id) AS n FROM nixes WHERE nixer_id = ?'),
    userTopTargets: db.prepare(`
      SELECT b.id AS uid, b.name AS name, COUNT(*) AS n
      FROM nixes nx JOIN users b ON b.id = nx.nixed_id
      WHERE nx.nixer_id = ? GROUP BY nx.nixed_id ORDER BY n DESC LIMIT 5`),
    userRecentActivity: db.prepare(`
      SELECT nx.id, nx.nixer_id AS nid, nx.nixed_id AS tid, nx.created_at,
             a.name AS nixer, b.name AS target
      FROM nixes nx JOIN users a ON a.id = nx.nixer_id JOIN users b ON b.id = nx.nixed_id
      WHERE nx.nixer_id = ? OR nx.nixed_id = ? ORDER BY nx.id DESC LIMIT 10`),
    topNixedUser: db.prepare('SELECT nixed_id FROM nixes GROUP BY nixed_id ORDER BY COUNT(*) DESC LIMIT 1'),

    // ── push subscriptions ────────────────────────────────────────────────
    upsertPushSub: db.prepare(`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET
        user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`),
    allPushSubs: db.prepare('SELECT user_id, endpoint, p256dh, auth FROM push_subscriptions'),
    delPushSub: db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?'),
    delPushSubsForUser: db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?'),

    // ── achievements ──────────────────────────────────────────────────────
    allAchievements: db.prepare('SELECT * FROM achievements ORDER BY id'),
    achievementByKey: db.prepare('SELECT * FROM achievements WHERE key = ?'),
    userAchievements: db.prepare(`
      SELECT a.*, ua.unlocked_at FROM user_achievements ua
      JOIN achievements a ON a.id = ua.achievement_id
      WHERE ua.user_id = ? ORDER BY ua.unlocked_at DESC`),
    hasAchievement: db.prepare(`
      SELECT 1 FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id
      WHERE ua.user_id = ? AND a.key = ?`),
    unlockAchievement: db.prepare('INSERT OR IGNORE INTO user_achievements (user_id, achievement_id) VALUES (?, ?)'),
    countUserAch: db.prepare('SELECT COUNT(*) AS n FROM user_achievements WHERE user_id = ?'),
    countAllAch: db.prepare('SELECT COUNT(*) AS n FROM achievements'),

    // ── XP / battle pass ──────────────────────────────────────────────────
    xpByUser: db.prepare('SELECT * FROM user_xp WHERE user_id = ?'),
    insertXp: db.prepare('INSERT INTO user_xp (user_id) VALUES (?)'),
    awardXp: db.prepare(`
      INSERT INTO user_xp (user_id, total_xp) VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        total_xp = total_xp + excluded.total_xp`),
    bpClaims: db.prepare('SELECT tier FROM bp_claims WHERE user_id = ?'),
    bpClaim: db.prepare('INSERT INTO bp_claims (user_id, tier) VALUES (?, ?)'),
    bpClaimExists: db.prepare('SELECT 1 FROM bp_claims WHERE user_id = ? AND tier = ?'),
    userCosmetics: db.prepare('SELECT title, border, badge FROM user_cosmetics WHERE user_id = ?'),
    upsertUserCosmetics: db.prepare(`
      INSERT INTO user_cosmetics (user_id, title, border, badge) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        title = excluded.title,
        border = excluded.border,
        badge = excluded.badge`),

    // ── misc stats ────────────────────────────────────────────────────────
    today: db.prepare("SELECT date('now') AS d"),
    nowIso: db.prepare("SELECT datetime('now') AS t"),
    minNixDate: db.prepare('SELECT min(date(created_at)) AS d FROM nixes'),
    maxNixDate: db.prepare('SELECT max(date(created_at)) AS d FROM nixes'),
    dateAt: db.prepare("SELECT date('now', ?) AS d"),
    totalNixes: db.prepare('SELECT COUNT(*) AS c FROM nixes'),
    playerCount: db.prepare('SELECT COUNT(*) AS c FROM users'),
    nixesBefore: db.prepare('SELECT COUNT(*) AS c FROM nixes WHERE date(created_at) < ?'),
    dailyCounts: db.prepare('SELECT date(created_at) AS d, COUNT(*) AS n FROM nixes WHERE date(created_at) BETWEEN ? AND ? GROUP BY d'),
    nixesBetween: db.prepare('SELECT COUNT(*) AS c FROM nixes WHERE datetime(created_at) BETWEEN ? AND ?'),
    allNixPairs: db.prepare('SELECT nixer_id, nixed_id FROM nixes ORDER BY id ASC'),
  };
}

module.exports = { prepareAll };
