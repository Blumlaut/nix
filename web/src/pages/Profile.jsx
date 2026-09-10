import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, LinearProgress } from '@mui/material';
import { api } from '../api';
import { timeAgo } from '../util';
import UserAvatar from '../components/UserAvatar';

// Badge cosmetic value → shown emoji. Keep in step with BP_TIERS badges.
const BADGE_ICONS = { legend: '🏆', mythic: '💎', celestial: '🌟', eternal: '👑', phoenix: '🔥', deity: '🔱' };

// XP runs into six digits, so every XP number is grouped the same way.
const xp = (n) => Number(n).toLocaleString('en-US');

export default function Profile() {
  const { id } = useParams();
  const [p, setP] = useState(null);
  const [error, setError] = useState(null);
  const [claimed, setClaimed] = useState({});

  const load = useCallback(() => {
    if (!id || Number.isNaN(Number(id))) { setError('Invalid user'); return; }
    api(`/api/users/${id}`).then((r) => {
      if (!r || r.status >= 400) setError('User not found');
      else setP(r.data);
    });
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (error) return <div className="error">{error}</div>;
  if (!p) return null;

  const cos = p.cosmetics || {};
  const net = p.stats.given - p.stats.received;
  document.title = `${p.user.name} — NIX Scoreboard`;

  return (
    <>
      <div className={`card prof-header${cos.border ? ` border-${cos.border}` : ''}`}>
        <div className="prof-ident">
          <UserAvatar name={p.user.name} src={p.user.avatar_url || null} size={56} sx={{ fontSize: '1.6rem', fontWeight: 700 }} />
          <div className="prof-info">
            <h1 className="prof-name">
              {p.user.name}
              {cos.title && <span className="bp-title-display">{cos.title}</span>}
              {BADGE_ICONS[cos.badge] && <span className="legend-badge">{BADGE_ICONS[cos.badge]}</span>}
            </h1>
            <div className="prof-sub">
              Lvl {p.xp.level} / {p.xp.maxLevel} · {xp(p.xp.totalXp)} XP · Member since {p.user.created_at ? p.user.created_at.slice(0, 10) : '—'}
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
            <Nixpass bp={p.battlepass} achievements={p.achievements} claimed={claimed} onClaim={(tier) => {
              api(`/api/battlepass/claim/${tier}`, { method: 'POST' }).then((r) => {
                if (r && r.status < 400) {
                  setClaimed((c) => ({ ...c, [tier]: true }));
                  load(); // refresh active cosmetics (a new tier may auto-activate)
                }
              });
            }} />
          )}
          {p.isMe && p.battlepass?.tiers && (
            <Cosmetics bp={p.battlepass} claimed={claimed} cos={cos} onSet={(kind, value) => {
              api('/api/battlepass/cosmetics', { method: 'POST', body: JSON.stringify({ kind, value }) }).then((r) => {
                if (r && r.status < 400) load();
              });
            }} />
          )}
          <section className="card prof-section">
            <h2>🏅 Achievements</h2>
            <Achievements achievements={p.achievements} />
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
              <span className="pair prof-pair">
                <span className="pp-who">
                  {isGiver ? <b>{name}</b> : <Link className="feed-user" to={`/user/${otherId}`}>{otherName}</Link>}
                </span>
                <span className="verb">nixed</span>
                <span className="pp-who">
                  {isGiver ? <Link className="feed-user" to={`/user/${otherId}`}>{otherName}</Link> : <b>{name}</b>}
                </span>
              </span>
              <time>{timeAgo(a.created_at)}</time>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Nixpass({ bp, achievements, claimed, onClaim }) {
  const maxLevel = bp.maxLevel || bp.tiers.length;
  const xpPerLevel = bp.xpPerLevel || 200;
  const pct = bp.level >= maxLevel ? 100 : Math.round(bp.levelProgress * 100);
  // Tiers and level-milestone achievements are both keyed by the level they
  // unlock at, so one ladder row can show either (or both).
  const tierByLevel = new Map(bp.tiers.map((t) => [Math.round(t.xp / xpPerLevel) + 1, t]));
  const milestoneByLevel = new Map(
    (achievements || [])
      .filter((a) => a.key.startsWith('lvl_'))
      .map((a) => [Number(a.key.slice(4)), a])
  );
  const scroller = useRef(null);
  const currentRow = useRef(null);

  // The ladder spans all 500 levels: open it at the player's own level so
  // their progress is what they see first.
  useEffect(() => {
    const box = scroller.current;
    const row = currentRow.current;
    if (!box || !row) return;
    box.scrollTop = Math.max(0, row.offsetTop - (box.clientHeight - row.offsetHeight) / 2);
  }, [bp.level]);

  const levels = Array.from({ length: maxLevel }, (_, i) => i + 1);

  return (
    <section className="card prof-section">
      <h2>
        🎮 Nixpass
        <span className="bp-xp-total">{xp(bp.totalXp)} XP</span>
      </h2>
      <div className="bp-bar-wrap">
        <LinearProgress variant="determinate" value={pct} />
        <span className="bp-bar-label">
          Level {bp.level} / {maxLevel} ·{' '}
          {bp.level >= maxLevel ? 'max level reached' : `${xp(bp.levelXp)} / ${xp(xpPerLevel)} XP to level ${bp.level + 1}`}
        </span>
      </div>
      <div className="bp-scroll" ref={scroller} tabIndex={0} role="region" aria-label="Level overview">
        <div className="bp-list">
          {levels.map((l) => {
            const tier = tierByLevel.get(l);
            const ach = milestoneByLevel.get(l);
            const isClaimed = Boolean(tier && (tier.claimed || claimed[tier.tier]));
            const reached = l <= bp.level;
            const st = !reached ? 'bp-locked' : isClaimed ? 'bp-claimed' : tier ? 'bp-unlocked' : 'bp-reached';
            const threshold = `${xp((l - 1) * xpPerLevel)} XP`;
            return (
              <div
                className={`bp-item ${st}${l === bp.level ? ' bp-current' : ''}`}
                key={l}
                ref={l === bp.level ? currentRow : null}
                aria-label={`Level ${l}: ${threshold}${tier ? `, ${tier.name}` : ''}${ach ? `, ${ach.name}` : ''}`}
              >
                <span className="bp-item-num">{l}</span>
                <span className="bp-item-name">{tier ? tier.name : ''}</span>
                {ach && (
                  <span className="bp-item-ach" title={`${ach.name}: ${ach.description}`}>
                    <span className="bp-item-ach-ic">{ach.icon}</span>
                    <span className="bp-item-ach-nm">{ach.name}</span>
                  </span>
                )}
                <span className="bp-item-reward">{threshold}</span>
                <span className="bp-item-state">
                  {tier && tier.unlocked && !isClaimed
                    ? <Button className="bp-claim" variant="contained" size="small" onClick={() => onClaim(tier.tier)}>Claim</Button>
                    : isClaimed ? <span className="bp-check">✓</span> : null}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Cosmetics({ bp, claimed, cos, onSet }) {
  const tiers = bp.tiers.filter((t) => (t.claimed || claimed[t.tier]) && (t.reward === 'title' || t.reward === 'border'));
  if (!tiers.length) return null;
  const titles = tiers.filter((t) => t.reward === 'title');
  const borders = tiers.filter((t) => t.reward === 'border');
  return (
    <section className="card prof-section">
      <h2>🎨 Cosmetics</h2>
      <p className="cos-hint">Choose which of your unlocked titles and borders are shown.</p>
      {titles.length > 0 && (
        <div className="cos-row">
          <span className="cos-label">Title</span>
          <button type="button" className={`cos-chip none${cos.title === null ? ' active' : ''}`} onClick={() => onSet('title', null)}>None</button>
          {titles.map((t) => (
            <button key={t.tier} type="button" className={`cos-chip${cos.title === t.value ? ' active' : ''}`} onClick={() => onSet('title', t.value)}>
              ✦ {t.value}
            </button>
          ))}
        </div>
      )}
      {borders.length > 0 && (
        <div className="cos-row">
          <span className="cos-label">Border</span>
          <button type="button" className={`cos-chip none${cos.border === null ? ' active' : ''}`} onClick={() => onSet('border', null)}>None</button>
          {borders.map((t) => (
            <button key={t.tier} type="button" className={`cos-chip${cos.border === t.value ? ' active' : ''}`} onClick={() => onSet('border', t.value)}>
              <span className={`cos-dot ${t.value}`} />{t.name.replace(' Border', '')}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// Rendered from the profile payload: these are the profiled user's
// unlocks (the profile endpoint syncs them retroactively), not the viewer's.
function Achievements({ achievements: ach }) {
  if (!ach) return null;
  const unlocked = ach.filter((a) => a.unlocked).length;
  return (
    <>
      <span className="ach-count">({unlocked}/{ach.length})</span>
      <div className="ach-scroll">
        <div className="ach-grid">
          {ach.map((a) => (
            <div className={`ach ${a.unlocked ? 'ach-on' : 'ach-off'}`} key={a.key} title={`${a.name}: ${a.description}`}>
              <span className="ach-ic">{a.icon}</span>
              <span className="ach-nm">{a.name}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
