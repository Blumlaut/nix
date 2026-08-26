# NIX Scoreboard

Scoreboard for the office "nix" game. Say someone's name to get their
attention; if they don't answer with "nix", you nix them. This app tracks
who nixed whom.

## Stack
- Node.js (Express 4)
- Discord OAuth2 (passport-discord, `identify` scope)
- SQLite (better-sqlite3, WAL) — single file at `data/nix.sqlite`
- Custom SQLite session store (sessions survive restarts)
- systemd service `nix-scoreboard`
- Frontend: single vanilla-JS page in `public/`

## Layout
```
server.js          entrypoint
lib/db.js          schema + prepared statements
lib/sessionStore.js
routes/auth.js     Discord OAuth + /logout
routes/api.js      /api/me, /api/me/name, /api/board, /api/nix
public/            frontend (index.html, app.js, style.css)
data/              sqlite db (gitignored)
```

## Running
```bash
cp .env.example .env   # fill in Discord creds + SESSION_SECRET
npm install
npm start
```

## Deploy (nix.zap.cloud)
- Service: `/etc/systemd/system/nix-scoreboard.service`
  - `systemctl status|restart|journalctl -u nix-scoreboard`
- Served at `https://nix.zap.cloud` behind Cloudflare (Flexible mode,
  app listens on plain HTTP :80, trusts one proxy hop).
- Discord OAuth redirect URI: `https://nix.zap.cloud/auth/discord/callback`

## API
| Method | Path           | Needs name | Description                          |
|--------|----------------|-----------|--------------------------------------|
| GET    | /api/me        | no        | current user `{id, discordId, name}` |
| POST   | /api/me/name   | no        | create/update own display name       |
| GET    | /api/board     | yes       | leaderboard + pairs + recent in one  |
| POST   | /api/nix       | yes       | record nix, body `{targetId}`        |
