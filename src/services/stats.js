'use strict';

/**
 * Aggregate statistics for the stats dashboard: per-day/per-bucket nix
 * counts, cumulative totals and high-level summary numbers.
 */

const DAY_MS = 86400000;

function listDates(start, end) {
  const out = [];
  const t0 = Date.parse(`${start}T00:00:00Z`);
  const t1 = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(t0) || Number.isNaN(t1) || t0 > t1) return out;
  for (let t = t0; t <= t1; t += DAY_MS) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

function bucketFor(range) {
  if (range === '7d') return '1h';
  if (range === '30d') return '6h';
  return '1d';
}

function listBuckets(start, end, hours) {
  const pad = (x) => String(x).padStart(2, '0');
  const fmt = (t) => {
    const dt = new Date(t);
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())} ${pad(dt.getUTCHours())}:00`;
  };
  const toMs = (s) => Date.parse(`${s.slice(0, 16).replace(' ', 'T')}:00Z`);
  const step = hours * 3600000;
  const out = [];
  for (let t = toMs(start); t <= toMs(end); t += step) out.push(fmt(t));
  return out;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {import('../db/queries')} q
 */
function createStatsService(db, q) {
  function getStats(range) {
    const today = q.today.get().d;
    let start;
    if (range === 'all') {
      start = q.minNixDate.get().d || today;
    } else {
      const days = Math.max(1, Number(String(range).replace('d', '')) || 30);
      start = q.dateAt.get(`-${days - 1} days`).d;
    }

    const bucket = bucketFor(range);
    const dayRows = q.dailyCounts.all(start, today);
    const byDay = new Map(dayRows.map((r) => [r.d, r.n]));

    let perDay;
    if (bucket === '1d') {
      perDay = listDates(start, today).map((d) => ({ d, n: byDay.get(d) || 0 }));
    } else {
      // printf('%02d') keeps the hour zero-padded so the SQL bucket keys
      // match the labels listBuckets() produces on the JS side ('00:00',
      // not '0:00' — which silently dropped the 00:00-06:00 bucket).
      const key = bucket === '1h'
        ? "strftime('%Y-%m-%d %H:00', created_at)"
        : "strftime('%Y-%m-%d', created_at) || ' ' || printf('%02d', CAST(strftime('%H', created_at) AS INTEGER) / 6 * 6) || ':00'";
      const nowIso = q.nowIso.get().t;
      const rows = db.prepare(
        `SELECT ${key} AS d, COUNT(*) AS n FROM nixes WHERE datetime(created_at) BETWEEN ? AND ? GROUP BY d`
      ).all(`${start} 00:00:00`, nowIso);
      const byB = new Map(rows.map((r) => [r.d, r.n]));
      perDay = listBuckets(`${start} 00:00`, nowIso, bucket === '1h' ? 1 : 6)
        .map((d) => ({ d, n: byB.get(d) || 0 }));
    }

    const before = range === 'all' ? 0 : q.nixesBefore.get(start).c;
    let running = before;
    const cumulative = perDay.map((p) => ({ d: p.d, c: (running += p.n) }));

    const totalAll = q.totalNixes.get().c;
    const players = q.playerCount.get().c;
    const inRange = perDay.reduce((s, p) => s + p.n, 0);
    const daysInRange = range === 'all'
      ? listDates(start, today).length
      : Math.max(1, Number(String(range).replace('d', '')) || 1);
    const avgPerDay = daysInRange ? Math.round((inRange / daysInRange) * 10) / 10 : 0;

    let busiest = null;
    for (const p of dayRows) {
      if (!busiest || p.n > busiest.n) busiest = { d: p.d, n: p.n };
    }
    if (busiest && busiest.n === 0) busiest = null;

    const first = q.minNixDate.get().d;
    const last = q.maxNixDate.get().d;

    return {
      range,
      bucket,
      start,
      end: today,
      perDay,
      cumulative,
      summary: { totalAll, players, inRange, avgPerDay, busiest, first, last },
    };
  }

  function myNixCalendar(userId) {
    const rows = q.myCalendar.all(userId);
    const map = {};
    let total = 0;
    for (const r of rows) {
      map[r.d] = r.n;
      total += r.n;
    }
    return { map, total, end: q.today.get().d };
  }

  return { getStats, myNixCalendar };
}

module.exports = { createStatsService };
