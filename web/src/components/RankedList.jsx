import { Link } from 'react-router-dom';
import UserAvatar from './UserAvatar';

/**
 * Board leaderboard building blocks. Every ranked card on the Board page
 * renders through these, so row markup and the "user-row" / "pair-row" classes
 * live in exactly one place. Alignment is set once in style.css
 * (.list li.user-row, .list li.pair-row) — a fix applies to every card at
 * once. Issues #3 and #9 were the same bug recurring because each card
 * hand-rolled its own rows and they drifted apart.
 */

/**
 * <ol class="list"> body: CSS rank counters (::before), and either one row per
 * item or the empty placeholder.
 * @param {Array}   rows
 * @param {string}  empty   placeholder text when rows is empty
 * @param {(row, index) => JSX} row   per-item row component (keyed by caller)
 */
export function RankedList({ rows, empty, row }) {
  return (
    <ol className="list">
      {rows.length ? rows.map(row) : <li className="empty">{empty}</li>}
    </ol>
  );
}

/**
 * Single-user ranked row: rank, avatar, name link (optional title pill), then
 * whatever trailing meta/values the card needs as children (level chip, counts…).
 */
export function UserListRow({ uid, name, avatar, title, border, size = 26, children }) {
  return (
    <li className={border ? `user-row border-${border}` : 'user-row'}>
      <UserAvatar name={name} src={avatar || null} size={size} />
      <Link className="user-link" to={`/user/${uid}`}>
        <span className="uname">{name}</span>
        {title ? <span className="bp-title">{title}</span> : null}
      </Link>
      {children}
    </li>
  );
}

/**
 * "A nixed B" row: two avatar+name units around a verb, count pinned right.
 * @param {{name: string, uid: string|number, avatar: ?string, border: ?string}} a
 * @param {{name: string, uid: string|number, avatar: ?string, border: ?string}} b
 */
export function PairListRow({ a, b, n }) {
  const user = (u) => (
    // Unlocked border cosmetics frame the avatar + name unit as one badge
    // (see .pair-user + .border-*); the transparent baseline border keeps
    // framed and unframed rows identically sized.
    <span className={u.border ? `pair-user border-${u.border}` : 'pair-user'}>
      <UserAvatar name={u.name} src={u.avatar || null} size={20} />
      <Link className="feed-user" to={`/user/${u.uid}`}><b>{u.name}</b></Link>
    </span>
  );
  return (
    <li className="pair-row">
      <span className="pair">
        {user(a)}
        <span className="verb">nixed</span>
        {user(b)}
      </span>
      <span className="n">💞 {n}</span>
    </li>
  );
}
