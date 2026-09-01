# NIX Scoreboard

Scoreboard for the office "nix" game. Say someone's name to get their
attention; if they don't answer with "nix", you nix them. This app tracks
who nixed whom.

## Stack
- **Backend:** Node.js (Express 4), `better-sqlite3` (WAL), `express-session`
  backed by `better-sqlite3-session-store`, Discord OAuth via `passport-discord`,
  `web-push` for notifications.
- **Frontend:** React 18 + Vite + React Router, **MUI** for UI components and
  **Recharts** for charts. Compiled to `web/dist/` by `npm run build`.
- Single SQLite file at `data/nix.sqlite` (schema owned by `src/db/schema.js`).

## Layout
```
server.js            entrypoint (boots the app)
src/
  app.js             Express app assembly (API + auth + SPA static serving)
  config.js          all environment configuration
  db/
    index.js         opens connection, applies schema, seeds achievements
    schema.js        authoritative, idempotent SQLite schema
    seed.js          achievement catalog seed
    queries.js       prepared statements, grouped by domain
  services/          domain logic: stats, streaks, progression, users
  middleware/        auth (requireSession), errors
  routes/            auth (Discord OAuth), api (/api/*)
  push.js            web push (VAPID + fan-out)
  lib/validate.js    shared input validation
web/
  vite.config.mjs    frontend build + dev proxy config
  index.html         SPA shell
  src/               React source (pages, components)
  public/            static assets copied to dist (sw.js, icon, style.css)
  dist/              build output (gitignored, created by npm run build)
test/                backend service tests (node:test)
```

## Running (development)
```bash
cp .env.example .env   # fill in Discord creds + SESSION_SECRET
npm install
npm run dev            # Express on :8080 + Vite dev server on :5173 (HMR)
```
`npm run dev` runs both processes via `concurrently`. The Vite dev server
proxies `/api` and `/auth` to Express, so you browse `http://localhost:5173`.

## Running (production)
```bash
npm ci
npm run build          # compiles the React frontend into web/dist
npm start              # serves the built frontend + API on :8080
```

## Deploy (nix.zap.cloud)
- CI: `.github/workflows/deploy.yml` runs on every push to `main` — it pulls,
  `npm ci`, `npm run build`, prunes dev deps, then restarts the systemd service.
- Service: `/etc/systemd/system/nix-scoreboard.service`
  - `systemctl status|restart|journalctl -u nix-scoreboard`
- Served at `https://nix.zap.cloud` behind Cloudflare (Flexible mode, app
  listens on plain HTTP, trusts one proxy hop).
- Discord OAuth redirect URI: `https://nix.zap.cloud/auth/discord/callback`

## API
| Method | Path           | Needs name | Description                          |
|--------|----------------|-----------|--------------------------------------|
| GET    | /api/me        | no        | current user `{id, discordId, name}` |
| POST   | /api/me/name   | no        | create/update own display name       |
| GET    | /api/board     | yes       | leaderboard + pairs + recent in one  |
| POST   | /api/nix       | yes       | record nix, body `{targetId}`        |
