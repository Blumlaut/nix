'use strict';

/**
 * E2E: the profile level overview.
 *
 * The ladder spans every level (1-500) and must scroll inside its card
 * instead of stretching the page, open at the player's own level, and show
 * XP numbers that add up to the level it displays.
 * Run: npm run test:e2e
 */

const assert = require('node:assert');
const { test } = require('node:test');
const { withApp, mockAuth, ME } = require('./harness');

const XP_PER_LEVEL = 200;
const MAX_LEVEL = 500;

// Same catalog as src/services/progression.js: tier N unlocks at level N.
const TIERS = [
  [1, 'Rookie', 'title', 'Rookie'],
  [2, 'Blue Border', 'border', 'blue'],
  [3, 'Nix Apprentice', 'title', 'Nix Apprentice'],
  [4, 'Purple Border', 'border', 'purple'],
  [5, 'Nix Adept', 'title', 'Nix Adept'],
  [6, 'Gold Border', 'border', 'gold'],
  [7, 'Nix Master', 'title', 'Nix Master'],
  [8, 'Rainbow Border', 'border', 'rainbow'],
  [9, 'Nix Grandmaster', 'title', 'Nix Grandmaster'],
  [10, 'Nix Legend', 'badge', 'legend'],
  [11, 'Nix Overlord', 'title', 'Nix Overlord'],
  [12, 'Emerald Border', 'border', 'emerald'],
  [13, 'Nix Sovereign', 'title', 'Nix Sovereign'],
  [14, 'Platinum Border', 'border', 'platinum'],
  [15, 'Nix Immortal', 'title', 'Nix Immortal'],
  [16, 'Nix Mythic', 'badge', 'mythic'],
];

// Level 14 with 2,770 XP → 170/200 into the level (the state from the issue).
const TOTAL_XP = 2770;
const LEVEL = Math.floor(TOTAL_XP / XP_PER_LEVEL) + 1;

function profile() {
  const levelXp = TOTAL_XP % XP_PER_LEVEL;
  const achievements = Array.from({ length: 30 }, (_, i) => ({
    key: `ach_${i}`,
    name: `Achievement ${i}`,
    description: `Description ${i}`,
    icon: '🏅',
    category: 'nixing',
    unlocked: i % 2 === 0,
  }));
  for (const lvl of [15, 25, 175]) {
    achievements.push({
      key: `lvl_${lvl}`,
      name: `Milestone ${lvl}`,
      description: `Reach level ${lvl}`,
      icon: '✨',
      category: 'level',
      unlocked: lvl <= LEVEL,
    });
  }
  return {
    user: { id: 1, discord_id: '1', name: 'TestUser', avatar_url: null, created_at: '2025-01-02 10:00:00' },
    stats: { given: 120, received: 40 },
    xp: {
      totalXp: TOTAL_XP,
      level: LEVEL,
      levelXp,
      xpPerLevel: XP_PER_LEVEL,
      maxLevel: MAX_LEVEL,
      levelProgress: levelXp / XP_PER_LEVEL,
    },
    achievements,
    nemesis: null,
    cosmetics: { title: 'Rookie', border: null, badge: null },
    topTargets: [],
    recentActivity: [],
    isMe: true,
    battlepass: {
      totalXp: TOTAL_XP,
      level: LEVEL,
      levelXp,
      xpPerLevel: XP_PER_LEVEL,
      maxLevel: MAX_LEVEL,
      levelProgress: levelXp / XP_PER_LEVEL,
      tiers: TIERS.map(([tier, name, reward, value]) => ({
        tier,
        name,
        xp: (tier - 1) * XP_PER_LEVEL,
        reward,
        value,
        unlocked: tier <= LEVEL,
        claimed: tier <= 10,
      })),
      highestTier: LEVEL,
      activeTitle: 'Rookie',
      activeBorder: null,
      activeBadge: null,
    },
  };
}

test('profile level overview: all levels, scrollable, opened at the player level', withApp(async (ctx) => {
  const page = await ctx.newPage();
  await mockAuth(page);
  await page.route('**/api/users/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(profile()),
  }));
  await page.goto(`${ctx.url}/user/1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.bp-scroll', { timeout: 10_000 });

  const m = await page.evaluate(() => {
    const rect = (el) => {
      const b = el.getBoundingClientRect();
      return { top: b.top, bottom: b.bottom, height: b.height };
    };
    const box = document.querySelector('.bp-scroll');
    const rows = [...document.querySelectorAll('.bp-scroll .bp-item')];
    const ach = document.querySelector('.ach-scroll');
    return {
      box: rect(box),
      scrollHeight: box.scrollHeight,
      scrollTop: box.scrollTop,
      rows: rows.length,
      level14: rows[13].textContent,
      level15: rows[14].textContent,
      current: rows.findIndex((r) => r.classList.contains('bp-current')) + 1,
      currentRect: rect(rows[13]),
      label: document.querySelector('.bp-bar-label').textContent,
      sub: document.querySelector('.prof-sub').textContent,
      achScrolls: ach.scrollHeight > ach.clientHeight,
      docHeight: document.documentElement.scrollHeight,
    };
  });

  // Every level is in the overview, not just the reward tiers.
  assert.equal(m.rows, MAX_LEVEL, 'one ladder row per level');
  assert.ok(m.level14.includes('2,600 XP'), `level 14 row shows its XP floor: ${m.level14}`);
  assert.ok(m.level15.includes('2,800 XP'), `level 15 row shows its XP floor: ${m.level15}`);

  // It scrolls inside the card instead of growing the page.
  assert.ok(m.scrollHeight > m.box.height + 200, 'ladder overflows its box (scrollable)');
  assert.ok(m.box.height <= 320, `ladder is height-capped (${m.box.height}px)`);

  // ...and it opens where the player actually is.
  assert.equal(m.current, LEVEL, 'current level row is marked');
  assert.ok(m.scrollTop > 0, 'ladder is scrolled to the current level');
  assert.ok(
    m.currentRect.top >= m.box.top - 1 && m.currentRect.bottom <= m.box.bottom + 1,
    'current level row is visible inside the box'
  );

  // The XP readouts agree with the level they describe.
  assert.ok(m.label.includes(`Level ${LEVEL} / ${MAX_LEVEL}`), m.label);
  assert.ok(m.label.includes(`170 / ${XP_PER_LEVEL} XP to level 15`), m.label);
  assert.ok(m.sub.includes(`Lvl ${LEVEL} / ${MAX_LEVEL}`), m.sub);
  assert.ok(m.sub.includes('2,770 XP'), m.sub);

  // The achievement catalog scrolls too — it grows with every new achievement.
  assert.ok(m.achScrolls, 'achievements scroll inside their card');
  assert.ok(m.docHeight < 2400, `profile page stays short (${m.docHeight}px)`);
}));
