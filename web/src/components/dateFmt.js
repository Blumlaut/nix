/** Date label helpers shared by the stats charts. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseDate(d) {
  const [y, m, dd] = d.split('-').map(Number);
  return { y, m, dd };
}

export function fmtShort(d) {
  const { m, dd } = parseDate(d);
  return `${MONTHS[m - 1]} ${dd}`;
}

export function fmtFull(d) {
  const { y, m, dd } = parseDate(d);
  return `${MONTHS[m - 1]} ${dd}, ${y}`;
}

// Sub-day buckets carry 'YYYY-MM-DD HH:00'; daily buckets 'YYYY-MM-DD'.
function splitBucket(d) {
  return d.includes(' ') ? d.split(' ') : [d, null];
}

// Sub-day buckets arrive as 'YYYY-MM-DD HH:00' (already zero-padded);
// slice to HH:MM so we never emit '00:00:00'-style labels.
export function fmtShortB(d, bucket) {
  const [date, hh] = splitBucket(d);
  return bucket === '1d' || !hh ? fmtShort(date) : `${fmtShort(date)} ${hh.slice(0, 5)}`;
}

export function fmtFullB(d, bucket) {
  const [date, hh] = splitBucket(d);
  return bucket === '1d' || !hh ? fmtFull(date) : `${fmtFull(date)} ${hh.slice(0, 5)}`;
}

export function rangeLabel(r) {
  return ({ '7d': 'last 7 days', '30d': 'last 30 days', '90d': 'last 90 days', all: 'all time' })[r] || r;
}
