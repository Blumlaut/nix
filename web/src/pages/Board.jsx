import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { timeAgo, fmtLocal } from '../util';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  TextField,
} from '@mui/material';

const RECENT_PAGE = 10;
const RECENT_CAP = 100;
const POLL_MS = 20000;

function CountedList({ rows, empty, render }) {
  if (!rows.length) return <li className="empty">{empty}</li>;
  return rows.map((r, i) => <li key={i}>{render(r)}</li>);
}

export default function Board() {
  const [me, setMe] = useState(null);
  const [setup, setSetup] = useState(false);
  const [board, setBoard] = useState(null);
  const [recent, setRecent] = useState([]);
  const [recentTotal, setRecentTotal] = useState(0);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [nixMsg, setNixMsg] = useState({ text: '', cls: 'muted' });
  const [modal, setModal] = useState(null); // { id, label }
  const loadingRef = useRef(false);
  const moreLoadingRef = useRef(false);

  const upsertRecent = useCallback((rows) => {
    setRecent((prev) => {
      const byId = new Map(prev.map((r) => [r.id, r]));
      for (const r of rows) byId.set(r.id, r);
      return [...byId.values()].sort((a, b) => b.id - a.id).slice(0, RECENT_CAP);
    });
  }, []);

  const loadBoard = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const r = await api('/api/board');
      if (!r || r.status === 409) { if (r && r.status === 409) setSetup(true); return; }
      if (r.status >= 400) return;
      setBoard(r.data);
      setMe(r.data.me);
      upsertRecent(r.data.recent);
      setRecentTotal(r.data.recentTotal ?? 0);
      setLastRefresh(Date.now());
    } finally {
      loadingRef.current = false;
    }
  }, [upsertRecent]);

  const loadMore = useCallback(async () => {
    if (moreLoadingRef.current) return;
    moreLoadingRef.current = true;
    try {
      const page = Math.floor(recent.length / RECENT_PAGE) + 1;
      const r = await api(`/api/nixes?limit=${RECENT_PAGE}&page=${page}`);
      if (!r || r.status >= 400) return;
      upsertRecent(r.data.items);
      setRecentTotal(r.data.total);
    } finally {
      moreLoadingRef.current = false;
    }
  }, [recent.length, upsertRecent]);

  useEffect(() => { loadBoard(); }, [loadBoard]);

  useEffect(() => {
    const timer = setInterval(loadBoard, POLL_MS);
    return () => clearInterval(timer);
  }, [loadBoard]);

  if (setup || (me && !me.id)) {
    return <Setup onSaved={() => { setSetup(false); loadBoard(); }} />;
  }

  if (!board) return null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Board</h1>
          <p>Who is doing the nixing.</p>
        </div>
        <div className="head-actions">
          <span className="refresh-note">{refreshLabel(lastRefresh)}</span>
          <Button variant="outlined" type="button" onClick={loadBoard}>Refresh</Button>
        </div>
      </div>

      <NemesisBanner />

      <div className="card report">
        <h2>Report a nix</h2>
        <NixForm me={me} board={board} onResult={(msg) => setNixMsg(msg)} onNixed={loadBoard} />
      </div>

      <div className="grid">
        <div className="card">
          <h2>Top nixers</h2>
          <ol className="list">
            <CountedList
              rows={board.leaderboard}
              empty="No users yet."
              render={(r) => (
                <li className={`user-row${r.border ? ` border-${r.border}` : ''}`}>
                  <Link className="user-link" to={`/user/${r.uid}`}>
                    <span className="uname">{r.name}</span>
                    {r.title && <span className="bp-title">{r.title}</span>}
                  </Link>
                  <span className="user-meta">L{r.level}</span>
                  <span className="user-nixes">
                    <span className="nix-given">⚔️ {r.n}</span>
                    <span className="nix-sep">·</span>
                    <span className="nix-received">🛡️ {r.received}</span>
                  </span>
                </li>
              )}
            />
          </ol>
        </div>
        <div className="card">
          <h2>Most nixed</h2>
          <ol className="list">
            <CountedList
              rows={board.mostNixed}
              empty="No nixes yet."
              render={(r) => (
                <li><Link className="feed-user" to={`/user/${r.uid}`}>{r.name}</Link><span className="n">{r.n}</span></li>
              )}
            />
          </ol>
        </div>
        <div className="card">
          <h2>Top pairs</h2>
          <ol className="list">
            <CountedList
              rows={board.topPairs}
              empty="No nixes yet."
              render={(r) => (
                <li>
                  <span className="pair">
                    <Link className="feed-user" to={`/user/${r.auid}`}><b>{r.nixer}</b></Link>
                    {' '}<span className="verb">nixed</span>{' '}
                    <Link className="feed-user" to={`/user/${r.buid}`}><b>{r.target}</b></Link>
                  </span>
                  <span className="n">{r.n}</span>
                </li>
              )}
            />
          </ol>
        </div>
        <div className="card">
          <h2>🔥 On a streak</h2>
          <ol className="list">
            <CountedList
              rows={board.streaks}
              empty="Nobody's on a streak right now."
              render={(r) => (
                <li><Link className="feed-user" to={`/user/${r.id}`}>{r.name}</Link><span className="n">🔥 {r.streak}</span></li>
              )}
            />
          </ol>
        </div>
      </div>

      <div className="card">
        <h2>Recent nixes</h2>
        <ul className="feed">
          {recent.length ? recent.map((r) => (
            <li key={r.id}>
              <span className="pair">
                <Link className="feed-user" to={`/user/${r.nixerUid}`}><b>{r.nixer}</b></Link>
                {' '}<span className="verb">nixed</span>{' '}
                <Link className="feed-user" to={`/user/${r.targetUid}`}><b>{r.target}</b></Link>
              </span>
              <time dateTime={r.created_at} title={fmtLocal(r.created_at)}>{timeAgo(r.created_at)}</time>
              {r.nixerId === me?.id ? (
                <button className="undo-btn" type="button" title="Undo nix" onClick={() => setModal({
                  id: r.id,
                  label: `Revoke "${r.nixer} nixed ${r.target}"? This removes it from the board and can't be undone.`,
                })}>&times;</button>
              ) : (
                <button className="undo-btn ghost" type="button" tabIndex="-1" aria-hidden="true">&times;</button>
              )}
            </li>
          )) : <li className="empty">No nixes yet. Go claim one.</li>}
        </ul>
        {recent.length < Math.min(recentTotal, RECENT_CAP) && (
          <Button variant="outlined" type="button" onClick={loadMore}>Load more</Button>
        )}
      </div>

      {modal && (
        <Dialog open onClose={() => setModal(null)}>
          <DialogTitle>Revoke this nix?</DialogTitle>
          <DialogContent>
            <p className="muted">{modal.label}</p>
          </DialogContent>
          <DialogActions>
            <Button type="button" onClick={() => setModal(null)}>Keep it</Button>
            <Button
              type="button"
              color="error"
              variant="contained"
              onClick={async () => {
                await api(`/api/nix/${modal.id}`, { method: 'DELETE' });
                setModal(null);
                loadBoard();
              }}
            >Revoke nix</Button>
          </DialogActions>
        </Dialog>
      )}

      <Snackbar
        open={Boolean(nixMsg.text)}
        autoHideDuration={4000}
        onClose={() => setNixMsg({ text: '', cls: 'muted' })}
      >
        <Alert
          className={nixMsg.cls}
          severity={nixMsg.cls === 'ok' ? 'success' : 'info'}
          onClose={() => setNixMsg({ text: '', cls: 'muted' })}
        >
          {nixMsg.text}
        </Alert>
      </Snackbar>
    </>
  );
}

function refreshLabel(ts) {
  if (!ts) return '';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 3) return 'Updated just now';
  if (s < 60) return `Updated ${s}s ago`;
  return `Updated ${Math.floor(s / 60)}m ago`;
}

function NixForm({ me, board, onNixed, onResult }) {
  const targets = board.targets.filter((t) => t.id !== me.id);
  const [target, setTarget] = useState('');

  async function submit(e) {
    e.preventDefault();
    const targetId = Number(target);
    if (!targetId) return;
    const r = await api('/api/nix', { method: 'POST', body: JSON.stringify({ targetId }) });
    if (r.status === 400 && r.data.error === 'cannot_nix_self') { onResult({ text: "You can't nix yourself.", cls: 'muted' }); return; }
    if (r.status >= 400) { onResult({ text: 'Failed to record nix.', cls: 'muted' }); return; }
    let text;
    let cls = 'muted';
    if (r.data.xp && r.data.xp.revenge) { text = `⚔️ Revenge nix! +${r.data.xp.giverXp} XP (2× bonus)`; cls = 'ok'; }
    else if (r.data.xp) { text = `Nix recorded. +${r.data.xp.giverXp} XP`; cls = 'ok'; }
    else { text = 'Nix recorded.'; }
    if (r.data.achievements?.giver?.length) text += ' 🏅 Achievement unlocked!';
    onResult({ text, cls });
    setTimeout(() => onResult({ text: '', cls: 'muted' }), 4000);
    onNixed();
  }

  return (
    <form className="row" onSubmit={submit}>
      <FormControl size="small" sx={{ minWidth: 180 }}>
        <InputLabel id="nix-target-label">Target</InputLabel>
        <Select
          labelId="nix-target-label"
          id="nix-target"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          label="Target"
          disabled={!targets.length}
          inputProps={{ 'aria-label': 'Choose someone to nix' }}
        >
          <MenuItem value="" disabled>Choose…</MenuItem>
          {targets.map((t) => <MenuItem key={t.id} value={String(t.id)}>{t.name}</MenuItem>)}
        </Select>
      </FormControl>
      <Button variant="contained" type="submit" disabled={!targets.length}>I nixed them</Button>
    </form>
  );
}

function NemesisBanner() {
  const [nem, setNem] = useState(null);
  useEffect(() => {
    api('/api/nemesis').then((r) => {
      if (r && r.status < 400) setNem(r.data);
    });
  }, []);
  if (!nem) return null;
  const dominating = nem.revenge >= nem.timesNixedYou && nem.timesNixedYou > 0;
  return (
    <div className="nemesis-banner">
      <div className="nemesis-inner">
        <span className="nemesis-label">💀 Your Nemesis</span>
        <Link className="nemesis-name" to={`/user/${nem.nemesisId}`}>{nem.username}</Link>
        <span className={`nemesis-score ${dominating ? 'dominating' : 'outnumbered'}`}>
          {nem.timesNixedYou} nixes vs your {nem.revenge} revenge
        </span>
        {dominating
          ? <span className="nemesis-dominating">⚔️ You dominate!</span>
          : <span className="nemesis-hint">Nix them back for 2× XP!</span>}
      </div>
    </div>
  );
}

function Setup({ onSaved }) {
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault();
    setErr('');
    const r = await api('/api/me/name', { method: 'POST', body: JSON.stringify({ name: e.target.name.value }) });
    if (r.status === 409 && r.data.error === 'name_taken') { setErr('That name is already taken.'); return; }
    if (r.status >= 400) { setErr('Could not save name.'); return; }
    onSaved();
  }
  return (
    <section className="card">
      <h1>Pick your nix name</h1>
      <p className="muted">This is the name that shows on the board — not your Discord name.</p>
      <form className="row" onSubmit={submit}>
        <TextField
          name="name"
          type="text"
          placeholder="e.g. Alex"
          autoComplete="off"
          required
          size="small"
          slotProps={{ htmlInput: { maxLength: 32 } }}
        />
        <Button variant="contained" type="submit">Set name</Button>
      </form>
      <p className="error">{err}</p>
    </section>
  );
}
