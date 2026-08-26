import { useEffect, useState } from 'react';
import { api } from '../api';
import ContributionGrid from '../components/ContributionGrid';
import { fmtFull, fmtShort, fmtShortB, fmtFullB, rangeLabel } from '../components/dateFmt';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import {
  ResponsiveContainer,
  BarChart as RBarChart,
  Bar,
  Cell,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

const RANGES = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
  { key: 'all', label: 'All' },
];

const TOOLTIP_STYLE = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text)',
  fontSize: '.78rem',
  fontVariantNumeric: 'tabular-nums',
};

// First / middle / last axis labels, matching the old hand-rolled charts.
function edgeLabels(items) {
  if (items.length === 1) return [items[0]];
  if (items.length === 2) return [items[0], items[1]];
  return [items[0], items[Math.floor(items.length / 2)], items[items.length - 1]];
}

export default function Stats() {
  const [range, setRange] = useState('30d');
  const [data, setData] = useState(null);
  const [contrib, setContrib] = useState(null);

  useEffect(() => {
    api(`/api/stats?range=${range}`).then((r) => {
      if (r && r.status < 400) setData(r.data);
    });
  }, [range]);

  useEffect(() => {
    api('/api/me/nix-calendar').then((r) => {
      if (r && r.status < 400) setContrib(r.data);
    });
  }, []);

  const chartTitle = { '1h': 'Nixes per hour', '6h': 'Nixes per 6 hours', '1d': 'Nixes per day' }[data?.bucket] || 'Nixes per day';

  const barData = (data?.perDay || []).map((p) => ({ ...p, label: fmtShortB(p.d, data.bucket) }));
  const lineData = (data?.cumulative || []).map((p) => ({ ...p, label: fmtShortB(p.d, data.bucket) }));
  const maxC = Math.max(1, ...lineData.map((p) => p.c));

  // Tooltip label: the full bucket date (e.g. "Mar 2, 2025" or "Mar 2, 2025 14:00").
  const fullLabel = (_l, payload) => (payload?.[0]?.payload?.d ? fmtFullB(payload[0].payload.d, data?.bucket) : '');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Statistics</h1>
          <p>Nixes over time.</p>
        </div>
        <ToggleButtonGroup
          size="small"
          value={range}
          exclusive
          onChange={(e, v) => { if (v !== null) setRange(v); }}
          aria-label="Time range"
        >
          {RANGES.map((r) => (
            <ToggleButton key={r.key} value={r.key}>
              {r.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </div>

      {contrib && (
        <section className="card contrib-block">
          <div className="contrib-head">
            <h2><span className="contrib-count">{contrib.total}</span> nixes in the last year</h2>
            <p className="sub">Your nixing activity · last 12 months</p>
          </div>
          <div className="contrib-scroll">
            <ContributionGrid data={contrib} />
          </div>
          <div className="contrib-foot" aria-hidden="true">
            <span className="contrib-legend-label">Less</span>
            <span className="contrib-legend-squares">
              <i className="lvl-0" /><i className="lvl-1" /><i className="lvl-2" /><i className="lvl-3" /><i className="lvl-4" />
            </span>
            <span className="contrib-legend-label">More</span>
          </div>
        </section>
      )}

      {data && (
        <>
          <div className="stats-grid">
            <Tile k="Nixes" v={data.summary.totalAll} sub="all time" />
            <Tile k="Players" v={data.summary.players} sub="tracked" />
            <Tile k="Avg / day" v={data.summary.avgPerDay} sub={rangeLabel(range)} />
            <Tile
              k="Busiest day"
              v={data.summary.busiest ? data.summary.busiest.n : 0}
              sub={data.summary.busiest ? fmtFull(data.summary.busiest.d) : rangeLabel(range)}
            />
            <Tile
              k="Highest streak"
              v={data.summary.highestStreak ? data.summary.highestStreak.n : 0}
              sub={data.summary.highestStreak ? `${data.summary.highestStreak.name} · all time` : 'no streaks yet'}
            />
          </div>

          <div className="card chart-block">
            <h2>Nix streaks</h2>
            <p className="sub">Who is on a streak against whom — only the target can break it</p>
            <table className="streak-table">
              <thead>
                <tr><th>Player</th><th>Against</th><th className="num">Streak</th><th className="num">Best</th></tr>
              </thead>
              <tbody>
                {data.streakTable?.length ? data.streakTable.map((r, i) => (
                  <tr key={i}>
                    <td>{r.name}</td>
                    <td>{r.against}</td>
                    <td className="num">🔥 {r.streak}</td>
                    <td className="num">{r.best}</td>
                  </tr>
                )) : (
                  <tr><td colSpan="4" className="empty">Nobody's on a streak right now.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="card chart-block">
            <h2>{chartTitle}</h2>
            <p className="sub">{data.summary.inRange} nixes · {fmtShort(data.start)} – {fmtShort(data.end)}</p>
            {barData.length ? (
              <div className="chart">
                <ResponsiveContainer width="100%" height={220}>
                  <RBarChart data={barData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.4} />
                    <XAxis dataKey="label" hide />
                    <YAxis hide />
                    <Tooltip
                      cursor={{ fill: 'var(--surface-2)', opacity: 0.5 }}
                      contentStyle={TOOLTIP_STYLE}
                      labelStyle={{ color: 'var(--text-2)', marginBottom: 4 }}
                      itemStyle={{ color: 'var(--text)', padding: 0 }}
                      labelFormatter={fullLabel}
                      formatter={(v) => [v, 'nixes']}
                    />
                    <Bar dataKey="n" name="Nixes" fill="#3d5afe" radius={[3, 3, 0, 0]}>
                      {barData.map((p) => (
                        <Cell key={p.d} fill={p.n > 0 ? '#3d5afe' : 'var(--border)'} opacity={p.n > 0 ? 1 : 0.5} />
                      ))}
                    </Bar>
                  </RBarChart>
                </ResponsiveContainer>
                <div className="xlabels">
                  {edgeLabels(barData).map((p, i) => <span key={i}>{p.label}</span>)}
                </div>
              </div>
            ) : (
              <p className="empty">No data for this range.</p>
            )}
          </div>

          <div className="card chart-block">
            <h2>Cumulative nixes</h2>
            <p className="sub">{data.summary.first ? `First nix on ${fmtFull(data.summary.first)}` : 'No nixes recorded yet.'}</p>
            {lineData.length ? (
              <div className="chart">
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={lineData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.4} />
                    <XAxis dataKey="label" hide />
                    <YAxis
                      domain={[0, maxC]}
                      ticks={[0, maxC]}
                      width={40}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: 'var(--text-2)', fontFamily: 'inherit' }}
                    />
                    <Tooltip
                      cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
                      contentStyle={TOOLTIP_STYLE}
                      labelStyle={{ color: 'var(--text-2)', marginBottom: 4 }}
                      itemStyle={{ color: 'var(--text)', padding: 0 }}
                      labelFormatter={fullLabel}
                      formatter={(v) => [v, 'nixes']}
                    />
                    <Area type="monotone" dataKey="c" fill="url(#cumGrad)" stroke="none" tooltipType="none" isAnimationActive={false} />
                    <Line type="monotone" dataKey="c" name="Cumulative nixes" stroke="var(--accent)" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
                <div className="xlabels">
                  {edgeLabels(lineData).map((p, i) => <span key={i}>{p.label}</span>)}
                </div>
              </div>
            ) : (
              <p className="empty">No data for this range.</p>
            )}
          </div>
        </>
      )}
    </>
  );
}

function Tile({ k, v, sub }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      <div className="s">{sub}</div>
    </div>
  );
}
