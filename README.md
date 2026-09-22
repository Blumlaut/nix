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
  services/          domain logic: stats, streaks, progression, users, locations
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
| POST   | /api/nix       | yes       | record nix, body `{targetId, location?}` |
| GET    | /api/location/settings | yes | own `{enabled, located}`     |
| POST   | /api/location/settings | yes | set recording on/off, body `{enabled}` |
| DELETE | /api/location  | yes       | wipe every position the user recorded |
| GET    | /api/location/heatmap | yes | aggregated cells + pairs, `?range=&user=` |

## Location data (#13)
A nix can carry where it happened. Only the **nixer's** position is stored —
never the nixed target's — and only when the browser granted the geolocation
permission *and* the user has not switched recording off in Settings (checked
server-side; absence of a settings row means on). Recording is best-effort: a
denied, unavailable or too-imprecise fix never delays or rejects a nix.

`nix_locations` keeps coordinates rounded to 3 decimals (~110 m) — the client
never picks the precision — and the map on the statistics page only ever
serves aggregated cells, never a position: ~1.1 km cells once at least 2 nixes
from 2 distinct nixers back one (or 2 of one nixer's own when filtered to
them), and a ~11 km cell for anything thinner — down to a single fix — so a
lone nixer still shows up as a rough area. Each cell also carries the nixes
behind it (`nixer`, `target`, `at`), which is what the bubble's popup lists;
those pairs are already public on the board. The map draws one numbered
bubble per cell — sized by the count, dashed when the cell is only known to
~11 km — with Leaflet on OpenStreetMap raster tiles.
