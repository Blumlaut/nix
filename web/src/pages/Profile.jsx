import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, LinearProgress } from '@mui/material';
import { api } from '../api';
import { timeAgo } from '../util';
import UserAvatar from '../components/UserAvatar';

export default function Profile() {
  const { id } = useParams();
  const [p, setP] = useState(null);
  const [error, setError] = useState(null);
  const [claimed, setClaimed] = useState({});

  useEffect(() => {
    if (!id || Number.isNaN(Number(id))) { setError('Invalid user'); return; }
    api(`/api/users/${id}`).then((r) => {
      if (!r || r.status >= 400) setError('User not found');
      else setP(r.data);
    });
  }, [id]);

  if (error) return <div className="error">{error}</div>;
  if (!p) return null;

  const cos = p.cosmetics || {};
  const net = p.stats.given - p.stats.received;
  document.title = `${p.user.name} — NIX Scoreboard`;

  return (
    <>
      <div className="card prof-header">
        <div className="prof-ident">
          <UserAvatar name={p.user.name} src={p.user.avatar_url || null} size={56} sx={{ fontSize: '1.6rem', fontWeight: 700 }} />
          <div className="prof-info">
            <h1 className="prof-name">
              {p.user.name}
              {cos.title && <span className="bp-title-display">{cos.title}</span>}
              {cos.badge === 'legend' && <span className="legend-badge">🏆</span>}
            </h1>
            <div className="prof-sub">
              Lvl {p.xp.level} · {p.xp.totalXp} XP · Member since {p.user.created_at ? p.user.created_at.slice(0, 10) : '—'}
            </div>
          </div>
        </div>
        <div className="prof-stats">
          <div className="ps"><span className="ps-v">{p.stats.given}</span><span className="ps-l">⚔️ given</span></div>
          <div className="ps"><span className="ps-v">{p.stats.received}</span><span className="ps-l">🛡️ got</span></div>
          <div className="ps"><span className={`ps-v ${net > 0 ? 'pos' : net < 0 ? 'neg' : ''}`}>{net > 0 ? '+' : ''}{net}</span><span className="ps-l">net</span></div>
        </div>
      </div>

      <div className="prof-cols">
        <div className="prof-col prof-col-l">
          {p.nemesis && <NemesisCard nemesis={p.nemesis} />}
          {p.topTargets?.length > 0 && (
            <section className="card prof-section">
              <h2>🎯 Top Targets</h2>
              <ul className="list prof-list">
                {p.topTargets.map((t) => (
                  <li key={t.uid}><Link to={`/user/${t.uid}`}>{t.name}</Link><span className="n">{t.n}</span></li>
                ))}
              </ul>
            </section>
          )}
          {p.recentActivity?.length > 0 && <RecentActivity activity={p.recentActivity} uid={p.user.id} name={p.user.name} />}
        </div>

        <div className="prof-col prof-col-r">
          {p.battlepass?.tiers && (
            <Battlepass bp={p.battlepass} claimed={claimed} onClaim={(tier) => {
              api(`/api/battlepass/claim/${tier}`, { method: 'POST' }).then((r) => {
                if (r && r.status < 400) setClaimed((c) => ({ ...c, [tier]: true }));
              });
            }} />
          )}
          <section className="card prof-section">
            <h2>🏅 Achievements</h2>
            <Achievements />
          </section>
        </div>
      </div>
    </>
  );
}

function NemesisCard({ nemesis }) {
  const dominating = nemesis.revenge >= nemesis.timesNixedYou && nemesis.timesNixedYou > 0;
  return (
    <section className="card prof-section">
      <h2>💀 Nemesis</h2>
      <div className="nem-card">
        <Link className="nem-name" to={`/user/${nemesis.nemesisId}`}>{nemesis.username}</Link>
        <div className="nem-bar">
          <div className="nem-bar-track">
            <div className="nem-bar-fill" style={{ width: `${nemesis.timesNixedYou > 0 ? (nemesis.revenge / nemesis.timesNixedYou * 50) : 0}%` }} />
            <div className="nem-bar-mid" />
          </div>
          <div className="nem-bar-labels">
            <span>{nemesis.timesNixedYou}× nixed you</span>
            <span>you: {nemesis.revenge}×</span>
          </div>
        </div>
        {dominating
          ? <span className="nem-dom">⚔️ You dominate</span>
          : <span className="nem-hint">Nix back for 2× XP</span>}
      </div>
    </section>
  );
}

function RecentActivity({ activity, uid, name }) {
  return (
    <section className="card prof-section">
      <h2>📋 Recent</h2>
      <ul className="feed prof-feed">
        {activity.map((a) => {
          const isGiver = a.nid === uid;
          const otherId = isGiver ? a.tid : a.nid;
          const otherName = isGiver ? a.target : a.nixer;
          return (
            <li key={a.id}>
              <span className="pair">
                {isGiver
                  ? <><b>{name}</b> nixed <Link className="feed-user" to={`/user/${otherId}`}>{otherName}</Link></>
                  : <><Link className="feed-user" to={`/user/${otherId}`}>{otherName}</Link> nixed <b>{name}</b></>}
              </span>
              <time>{timeAgo(a.created_at)}</time>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Battlepass({ bp, claimed, onClaim }) {
  const maxTier = bp.tiers.length;
  const pct = bp.level >= maxTier ? 100 : Math.round(bp.levelProgress * 100);
  return (
    <section className="card prof-section">
      <h2>🎮 Battlepass</h2>
      <div className="bp-bar-wrap">
        <LinearProgress variant="determinate" value={pct} />
        <span className="bp-bar-label">Level {bp.level} / {maxTier}</span>
      </div>
      <div className="bp-list">
        {bp.tiers.map((t) => {
          const isClaimed = t.claimed || claimed[t.tier];
          const st = isClaimed ? 'bp-claimed' : t.unlocked ? 'bp-unlocked' : 'bp-locked';
          const icon = t.reward === 'title' ? '✦' : t.reward === 'border' ? '▐' : '🏆';
          return (
            <div className={`bp-item ${st}`} key={t.tier}>
              <span className="bp-item-num">{t.tier}</span>
              <span className="bp-item-name">{t.name}</span>
              <span className="bp-item-reward">{icon} {t.value}</span>
              {t.unlocked && !isClaimed
                ? <Button className="bp-claim" variant="contained" size="small" onClick={() => onClaim(t.tier)}>Claim</Button>
                : isClaimed ? <span className="bp-check">✓</span> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Achievements() {
  const [ach, setAch] = useState(null);
  useEffect(() => {
    api('/api/achievements').then((r) => {
      if (r && r.status < 400) setAch(r.data);
    });
  }, []);
  if (!ach) return null;
  const unlocked = ach.filter((a) => a.unlocked).length;
  return (
    <>
      <span className="ach-count">({unlocked}/{ach.length})</span>
      <div className="ach-grid">
        {ach.map((a) => (
          <div className={`ach ${a.unlocked ? 'ach-on' : 'ach-off'}`} key={a.key} title={`${a.name}: ${a.description}`}>
            <span className="ach-ic">{a.icon}</span>
            <span className="ach-nm">{a.name}</span>
          </div>
        ))}
      </div>
    </>
  );
}
