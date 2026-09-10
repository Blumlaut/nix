/** Time formatting for the UTC timestamps the API returns. */
export function timeAgo(isoUtc) {
  const t = Date.parse(isoUtc.replace(' ', 'T') + 'Z');
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 30 * 86400) return `${Math.floor(s / 86400)}d ago`;
  if (s < 365 * 86400) return `${Math.floor(s / (30 * 86400))}mo ago`;
  return `${Math.floor(s / (365 * 86400))}y ago`;
}

/**
 * K/D for the net balance board: "kills" (nixes given) over "deaths" (nixes
 * received). No deaths yet → ∞ (infinite K/D); no nixes at all → —.
 */
export function kdRatio(given, received) {
  if (!received) return given ? '∞' : '—';
  return String(Number((given / received).toFixed(2)));
}

export function fmtLocal(isoUtc) {
  const t = Date.parse(isoUtc.replace(' ', 'T') + 'Z');
  return new Date(t).toLocaleString();
}
