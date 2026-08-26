'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const passport = require('passport');

const SqliteSessionStore = require('./lib/sessionStore');
const { router: authRouter, configurePassport } = require('./routes/auth');
const apiRouter = require('./routes/api');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '127.0.0.1';
const SESSION_SECRET = process.env.SESSION_SECRET || 'insecure-dev-secret-change-me';

if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) {
  console.warn('[nix] WARNING: DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET not set — login will fail until .env is filled in');
}
if (SESSION_SECRET === 'insecure-dev-secret-change-me') {
  console.warn('[nix] WARNING: SESSION_SECRET not set — set a long random value in .env');
}

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  }
}));

app.use(session({
  store: new SqliteSessionStore(),
  name: 'nix.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: 'auto',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 30
  }
}));

app.use(passport.initialize());
app.use(passport.session());
configurePassport();

app.use(authRouter);
app.use('/api', apiRouter);

const publicDir = path.join(__dirname, 'public');
app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.get('/setup', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.get('/stats', (req, res) => res.sendFile(path.join(publicDir, 'stats.html')));
app.get('/settings', (req, res) => res.sendFile(path.join(publicDir, 'settings.html')));
app.get('/rules', (req, res) => res.sendFile(path.join(publicDir, 'rules.html')));
app.get('/changelog', (req, res) => res.sendFile(path.join(publicDir, 'changelog.html')));
app.get('/forum', (req, res) => res.sendFile(path.join(publicDir, 'forum.html')));
app.get('/forum/thread/:id', (req, res) => res.sendFile(path.join(publicDir, 'forum.html')));
app.get('/user/:id', (req, res) => res.sendFile(path.join(publicDir, 'profile.html')));
app.get('/nix', (req, res) => res.redirect('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));

app.listen(PORT, HOST, () => console.log(`[nix] listening on ${HOST}:${PORT}`));
