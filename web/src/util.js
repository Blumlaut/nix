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

export function fmtLocal(isoUtc) {
  const t = Date.parse(isoUtc.replace(' ', 'T') + 'Z');
  return new Date(t).toLocaleString();
}
