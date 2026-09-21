'use strict';

/**
 * Where nixes happen (#13).
 *
 * Only the *nixer's* position is stored, never the nixed target's, and only
 * when two things are true: the browser granted the geolocation permission
 * (the client sends nothing otherwise) and the user has not switched
 * recording off in their settings. Recording is best-effort by design — a
 * nix is never rejected, delayed or reshaped because of location.
 *
 * Privacy: the raw fix never leaves this module. Coordinates are rounded to
 * ~110 m before they are written, the heatmap publishes ~1.1 km cells, and a
 * cell is only served if several independent nixes back it.
 */

// ~110 m at the equator — as precise as a location gets, in the database or
// out of it. The client never picks the precision.
const STORE_DECIMALS = 3;
// Published cell size: ~1.1 km. Coarse enough that a cell holds many nixes.
const CELL_DECIMALS = 2;
// A fix this bad says nothing useful about where the nix happened.
const MAX_ACCURACY_M = 200;
// k-anonymity floor: a cell needs this many nixes, from this many distinct
// nixers, before it is published.
const MIN_CELL_NIXES = 3;
const MIN_CELL_NIXERS = 3;
const RANGES = new Set(['7d', '30d', '90d', 'all']);
const DEFAULT_RANGE = '30d';

const round = (value, decimals) => Number(value.toFixed(decimals));

/**
 * Validate and coarsen a client-supplied fix.
 * @returns {{lat: number, lon: number, accuracy: number|null}|null}
 */
function parseFix(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const lat = Number(raw.lat);
  const lon = Number(raw.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  const accuracy = Number(raw.accuracy);
  const acc = Number.isFinite(accuracy) && accuracy > 0 ? Math.round(accuracy) : null;
  if (acc !== null && acc > MAX_ACCURACY_M) return null;

  return { lat: round(lat, STORE_DECIMALS), lon: round(lon, STORE_DECIMALS), accuracy: acc };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {import('../db/queries')} q
 */
function createLocationsService(db, q) {
  /** Recording is opt-out: no settings row means "on" (the browser gate). */
  function isEnabled(userId) {
    const row = q.locationSettings.get(userId);
    return !row || row.enabled === 1;
  }

  function setEnabled(userId, enabled) {
    q.upsertLocationSettings.run(userId, enabled ? 1 : 0);
    return isEnabled(userId);
  }

  /** Attach a fix to a freshly created nix. Returns whether one was stored. */
  function recordForNix(nixId, userId, raw) {
    if (!isEnabled(userId)) return false;
    const fix = parseFix(raw);
    if (!fix) return false;
    q.insertNixLocation.run(nixId, userId, fix.lat, fix.lon, fix.accuracy);
    return true;
  }

  /** Delete everything this user ever recorded. */
  function forget(userId) {
    return q.deleteUserLocations.run(userId).changes;
  }

  // 'Nd' means "today plus the N-1 days before it", exactly like the stats
  // dashboard, so the map matches the range toggle above it.
  function daysOffset(range) {
    if (range === 'all') return null;
    const days = Math.max(1, Number(range.replace('d', '')) || 30);
    return `-${days - 1} days`;
  }

  function scope(columnPrefix, { offset, userId }) {
    const conds = [];
    const params = {};
    if (offset) {
      conds.push(`${columnPrefix}created_at >= date('now', @offset)`);
      params.offset = offset;
    }
    if (userId) {
      conds.push(`${columnPrefix}nixer_id = @userId`);
      params.userId = userId;
    }
    return { where: conds.length ? `WHERE ${conds.join(' AND ')}` : '', params };
  }

  /**
   * Aggregated heat cells for the signed-in board.
   * @param {{range?: string, userId?: number|null}} opts
   */
  function heatmap({ range, userId = null } = {}) {
    const r = RANGES.has(range) ? range : DEFAULT_RANGE;
    const offset = daysOffset(r);

    const located = scope('nl.', { offset, userId });
    const all = scope('', { offset, userId });

    // Filtered to one nixer, the distinct-nixer floor can never pass, so the
    // floor falls back to that nixer's own nix count in the cell.
    const minNixers = userId ? 1 : MIN_CELL_NIXERS;

    const cells = db.prepare(`
      SELECT ROUND(nl.lat, ${CELL_DECIMALS}) AS lat,
             ROUND(nl.lon, ${CELL_DECIMALS}) AS lon,
             COUNT(*) AS n,
             COUNT(DISTINCT nl.nixer_id) AS nixers
      FROM nix_locations nl
      ${located.where}
      GROUP BY ROUND(nl.lat, ${CELL_DECIMALS}), ROUND(nl.lon, ${CELL_DECIMALS})
      HAVING COUNT(*) >= @minNixes AND COUNT(DISTINCT nl.nixer_id) >= @minNixers
      ORDER BY n DESC, lat ASC, lon ASC
    `).all({ ...located.params, minNixes: MIN_CELL_NIXES, minNixers });

    // Coverage: how much of the selected range even carries a location.
    const totals = db.prepare(`
      SELECT (SELECT COUNT(*) FROM nix_locations nl ${located.where}) AS located,
             (SELECT COUNT(*) FROM nixes ${all.where}) AS nixes
    `).get({ ...located.params, ...all.params });

    return {
      range: r,
      // Grid geometry, so the client never has to guess the cell size.
      cellDegrees: 10 ** -CELL_DECIMALS,
      minCellNixes: MIN_CELL_NIXES,
      minCellNixers: minNixers,
      located: totals.located,
      nixes: totals.nixes,
      cells: cells.map((c) => ({ lat: c.lat, lon: c.lon, n: c.n, nixers: c.nixers })),
      users: q.locatedNixers.all(),
    };
  }

  return { isEnabled, setEnabled, recordForNix, forget, heatmap, parseFix };
}

module.exports = { createLocationsService, parseFix };
