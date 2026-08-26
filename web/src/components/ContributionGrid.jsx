import { fmtFull } from './dateFmt';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Mon', '', 'Wed', '', 'Fri', '', ''];

/**
 * GitHub-style contribution grid for the user's trailing-12-month nixes.
 * Anchored to the server's "today" so viewer clock skew can't blank it.
 */
export default function ContributionGrid({ data }) {
  const endStr = data.end || new Date().toISOString().slice(0, 10);
  const end = Date.parse(`${endStr}T00:00:00Z`);
  if (Number.isNaN(end)) return null;

  let start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 364);
  while (start.getUTCDay() !== 0) start.setUTCDate(start.getUTCDate() - 1);

  const days = [];
  const cur = new Date(start);
  while (cur.getTime() <= end) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  const maxN = Math.max(0, ...days.map((d) => data.map[d] || 0));
  const levelOf = (n) => {
    if (n === 0) return 0;
    if (maxN <= 1) return 1;
    return Math.min(4, 1 + Math.floor((n / maxN) * 4));
  };

  const weeks = [];
  const months = [];
  let prevMonth = -1;
  for (let i = 0; i < days.length; i += 7) {
    const week = days.slice(i, i + 7);
    const m = Number(week[0].slice(5, 7));
    months.push(m !== prevMonth ? MONTHS[m - 1] : '');
    prevMonth = m;
    weeks.push(week);
  }

  return (
    <div className="contrib-wrap">
      <div className="contrib-weekdays" aria-hidden="true">
        {WEEKDAYS.map((l, i) => <span key={i}>{l}</span>)}
      </div>
      <div className="contrib-canvas">
        <div className="contrib-months" aria-hidden="true">
          {months.map((m, i) => <span key={i}>{m}</span>)}
        </div>
        <div className="contrib-grid" aria-label="Your nixes per day over the last year">
          {weeks.map((week, wi) => (
            <div className="cweek" key={wi}>
              {week.map((d) => {
                const n = data.map[d] || 0;
                return <span className={`cday lvl-${levelOf(n)}`} key={d} title={`${fmtFull(d)}: ${n} nix${n === 1 ? '' : 'es'}`} />;
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
