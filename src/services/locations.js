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
 * ~110 m before they are written, and the map publishes ~1.1 km cells backed
 * by more than one nixer — anything thinner is only served as a ~11 km area
 * (a lone fix included), never as a single position.
 *
 * A published cell also carries who nixed whom inside it, so the map can name
 * the pairs behind a bubble. Those pairs are already public on the board; the
 * location attached to them is never finer than the cell.
 */

// ~110 m at the equator — as precise as a location gets, in the database or
// out of it. The client never picks the precision.
const STORE_DECIMALS = 3;
// Published cell size: ~1.1 km. Coarse enough that a cell holds many nixes.
const CELL_DECIMALS = 2;
// Fallback cell size: ~11 km. What a lone nixer's fixes are published as.
const COARSE_CELL_DECIMALS = 1;
// Pairs listed per cell. The cell keeps counting the rest of its nixes.
const PAIRS_LIMIT = 100;
// A fix this bad says nothing useful about where the nix happened.
const MAX_ACCURACY_M = 200;
// Floor for a published fine cell: this many nixes from this many distinct
// nixers. The coarse grid only needs one fix, which is where a lone nixer's
// nixes land — a city-sized area, not a position.
const MIN_CELL_NIXES = 2;
const MIN_CELL_NIXERS = 2;
const COARSE_MIN_CELL_NIXES = 1;
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
 * Fill in the nixes behind each published cell. The cell keys are computed by
 * SQLite's own ROUND, so they line up with the aggregation exactly; a fix
 * belongs to its fine cell when that cell is published, otherwise to the
 * coarse one it falls back into.
 */
function attachPairs(cells, located, db) {
  if (!cells.length) return;
  const index = new Map(cells.map((c) => [`${c.degrees}:${c.lat}:${c.lon}`, c]));
  const fineKey = (lat, lon) => `${10 ** -CELL_DECIMALS}:${lat}:${lon}`;
  const coarseKey = (lat, lon) => `${10 ** -COARSE_CELL_DECIMALS}:${lat}:${lon}`;

  const rows = db.prepare(`
    SELECT ROUND(nl.lat, ${CELL_DECIMALS}) AS flat,
           ROUND(nl.lon, ${CELL_DECIMALS}) AS flon,
           ROUND(nl.lat, ${COARSE_CELL_DECIMALS}) AS clat,
           ROUND(nl.lon, ${COARSE_CELL_DECIMALS}) AS clon,
           u.name AS nixer,
           t.name AS target,
           n.created_at AS at
    FROM nix_locations nl
    JOIN nixes n ON n.id = nl.nix_id
    JOIN users u ON u.id = nl.nixer_id
    JOIN users t ON t.id = n.nixed_id
    ${located.where}
    ORDER BY n.created_at DESC, n.id DESC
  `).all(located.params);

  for (const row of rows) {
    const cell = index.get(fineKey(row.flat, row.flon)) || index.get(coarseKey(row.clat, row.clon));
    if (!cell || cell.pairs.length >= PAIRS_LIMIT) continue;
    cell.pairs.push({ nixer: row.nixer, target: row.target, at: row.at });
  }
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
    return { conds, where: conds.length ? `WHERE ${conds.join(' AND ')}` : '', params };
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

    const params = { ...located.params, minNixes: MIN_CELL_NIXES, minNixers };

    const cells = db.prepare(`
      SELECT ROUND(nl.lat, ${CELL_DECIMALS}) AS lat,
             ROUND(nl.lon, ${CELL_DECIMALS}) AS lon,
             COUNT(*) AS n,
             COUNT(DISTINCT nl.nixer_id) AS nixers
      FROM nix_locations nl
      ${located.where}
      GROUP BY ROUND(nl.lat, ${CELL_DECIMALS}), ROUND(nl.lon, ${CELL_DECIMALS})
      HAVING COUNT(*) >= @minNixes AND COUNT(DISTINCT nl.nixer_id) >= @minNixers
    `).all(params).map((c) => ({ ...c, degrees: 10 ** -CELL_DECIMALS, pairs: [] }));

    // Whatever the fine grid could not publish is retried once at ~11 km, so
    // one nixer's fixes are shown as a rough area instead of not at all.
    const coarse = db.prepare(`
      WITH fine AS (
        SELECT ROUND(nl.lat, ${CELL_DECIMALS}) AS lat, ROUND(nl.lon, ${CELL_DECIMALS}) AS lon
        FROM nix_locations nl
        ${located.where}
        GROUP BY ROUND(nl.lat, ${CELL_DECIMALS}), ROUND(nl.lon, ${CELL_DECIMALS})
        HAVING COUNT(*) >= @minNixes AND COUNT(DISTINCT nl.nixer_id) >= @minNixers
      )
      SELECT ROUND(nl.lat, ${COARSE_CELL_DECIMALS}) AS lat,
             ROUND(nl.lon, ${COARSE_CELL_DECIMALS}) AS lon,
             COUNT(*) AS n,
             COUNT(DISTINCT nl.nixer_id) AS nixers
      FROM nix_locations nl
      WHERE ${[
        ...located.conds,
        `NOT EXISTS (SELECT 1 FROM fine f
          WHERE f.lat = ROUND(nl.lat, ${CELL_DECIMALS})
            AND f.lon = ROUND(nl.lon, ${CELL_DECIMALS}))`,
      ].join(' AND ')}
      GROUP BY ROUND(nl.lat, ${COARSE_CELL_DECIMALS}), ROUND(nl.lon, ${COARSE_CELL_DECIMALS})
      HAVING COUNT(*) >= @coarseMinNixes
    `).all({ ...params, coarseMinNixes: COARSE_MIN_CELL_NIXES })
      .map((c) => ({ ...c, degrees: 10 ** -COARSE_CELL_DECIMALS, pairs: [] }));

    const published = [...cells, ...coarse]
      .sort((a, b) => b.n - a.n || a.lat - b.lat || a.lon - b.lon);

    attachPairs(published, located, db);

    // Coverage: how much of the selected range even carries a location.
    const totals = db.prepare(`
      SELECT (SELECT COUNT(*) FROM nix_locations nl ${located.where}) AS located,
             (SELECT COUNT(*) FROM nixes ${all.where}) AS nixes
    `).get({ ...located.params, ...all.params });

    return {
      range: r,
      // Grid geometry, so the client never has to guess the cell size.
      cellDegrees: 10 ** -CELL_DECIMALS,
      coarseCellDegrees: 10 ** -COARSE_CELL_DECIMALS,
      minCellNixes: MIN_CELL_NIXES,
      minCellNixers: minNixers,
      coarseMinCellNixes: COARSE_MIN_CELL_NIXES,
      located: totals.located,
      nixes: totals.nixes,
      cells: published,
      users: q.locatedNixers.all(),
    };
  }

  return { isEnabled, setEnabled, recordForNix, forget, heatmap, parseFix };
}

module.exports = { createLocationsService, parseFix };
