import { useEffect, useState } from 'react';
import { api } from '../api';

function fmtDate(iso) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d)) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Changelog() {
  const [commits, setCommits] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api('/api/changelog').then((r) => {
      if (!r || r.status >= 400 || !r.data.commits?.length) setError(true);
      else setCommits(r.data.commits);
    });
  }, []);

  if (error) return <p className="cl-loading">Could not load the changelog. Try refreshing.</p>;
  if (!commits) return <p className="cl-loading">Loading…</p>;

  const byDate = new Map();
  for (const c of commits) {
    if (!byDate.has(c.date)) byDate.set(c.date, []);
    byDate.get(c.date).push(c);
  }

  return (
    <main style={{ maxWidth: '760px' }}>
      <div className="page-head">
        <div>
          <h1>Changelog</h1>
          <p>Every change to the scoreboard, straight from the git log.</p>
        </div>
      </div>
      <section className="card">
        <div className="cl-list">
          {[...byDate.entries()].map(([date, entries]) => (
            <div key={date}>
              <h2 className="cl-date">{fmtDate(date)}</h2>
              <ul className="cl-group">
                {entries.map((c, i) => (
                  <li className="cl-entry" key={i}>
                    <h3 className="cl-subject">{c.subject}</h3>
                    {c.body && <p className="cl-body">{c.body}</p>}
                    <div className="cl-meta"><span className="cl-hash">{c.hash.slice(0, 7)}</span></div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
