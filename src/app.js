'use strict';

const path = require('path');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const SqliteStore = require('better-sqlite3-session-store')(session);

const { open } = require('./db');
const { prepareAll } = require('./db/queries');
const { createStatsService } = require('./services/stats');
const { createStreaksService } = require('./services/streaks');
const { createProgressionService } = require('./services/progression');
const { createUsersService } = require('./services/users');
const { createForumService } = require('./services/forum');
const { createPush } = require('./push');
const { createAuthRouter } = require('./routes/auth');
const { createApiRouter } = require('./routes/api');
const { notFound, errorHandler } = require('./middleware/errors');

/**
 * Build the full Express application.
 * @param {import('./config')} config
 */
function createApp(config) {
  const db = open(config.dbPath);
  const queries = prepareAll(db);
  const dataDir = path.dirname(config.dbPath);

  const stats = createStatsService(db, queries);
  const streaks = createStreaksService(db, queries);
  const progression = createProgressionService(db, queries);
  const users = createUsersService(db, queries);
  const forum = createForumService(db, queries);
  const push = createPush(queries, dataDir);

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // Built React frontend (web/dist). Vite emits hashed asset filenames, so
  // immutable assets can be cached; index.html must be revalidated.
  const webDist = path.join(__dirname, '..', 'web', 'dist');
  app.use(express.static(webDist, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      }
    },
  }));

  app.use(session({
    store: new SqliteStore({ client: db }),
    name: 'nix.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: 'auto',
      sameSite: 'lax',
      maxAge: config.sessionTtlMs,
    },
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  app.use(createAuthRouter(config, queries));
  app.use('/api', createApiRouter({
    queries, stats, streaks, progression, users, forum, push, config,
  }));

  // Keep the classic /nix easter egg outside the SPA.
  app.get('/nix', (req, res) => res.redirect('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));

  // SPA fallback: any non-API/non-auth GET serves the React shell; the
  // client router resolves the path.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/auth')) return next();
    return res.sendFile(path.join(webDist, 'index.html'));
  });

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
