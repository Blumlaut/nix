# AGENTS.md

See README.md for background/API. This is how to work in this repo.

## Commands
- Dev: `npm run dev` → browse :5173 (Vite, HMR; proxies /api, /auth to Express :8080)
- Build frontend: `npm run build` → `web/dist/`
- Unit tests: `npm test` (`node:test`)
- E2E: `npm run test:e2e` (Playwright, see below)

Express serves **`web/dist/`, not `web/src/`** — rebuild after frontend
changes, or test via Vite :5173.

## Map
- Backend CommonJS in `src/`: `app.js` (assembly), `config.js` (all env),
  `db/` (schema.js = append-only idempotent schema; queries.js = prepared
  statements), `services/` (domain logic; keep routes thin), `routes/`.
- Frontend ESM React in `web/src/`: MUI for controls, **all layout/theme in
  `web/public/style.css`** (CSS vars, `data-theme` light/dark). Don't use MUI
  styling for page layout.
- Auth: Discord OAuth. `web/src/api.js` does `window.location = '/auth/discord'`
  on **any 401**.

## E2E
`e2e/harness.js` boots the app in-process (ephemeral port, temp DB, dummy
creds) + headless chromium; no env/server setup. Add tests:

```js
const { test } = require('node:test'); // not global
const { withApp, goto } = require('./harness');
test('...', withApp(async (ctx) => {   // withApp returns a fn; app+browser per test
  const page = await goto(ctx, '/', 'header'); // (path, selector, viewport?)
}));
```

- `mockAuth(page)` fulfills session-gated endpoints with 200s — if the page
  under test needs a new one, add it, else the 401 redirects away.
- Wait on a selector, never `networkidle` (board polls forever).
- Layout assertions: use vertical overlap (`max(top) < min(bottom)`), not
  equal `tops`.

## Gotchas
- Process hangs after e2e if the app gains long-lived timers:
  session store's unref'd cleanup interval is already unref'd in the harness;
  keep-alive sockets need `closeAllConnections()` (harness does it).
- `data/`, `web/dist/`, `.env` are gitignored — never commit.
- No TS: backend CJS, frontend JSX/ESM. Tests: `node:test` + `node:assert`.
- Deploy = push to main → GH Actions → systemd; local build+tests are enough.
