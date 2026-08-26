'use strict';

/**
 * Discord OAuth (passport-discord) + auth routes.
 *
 * Flow:
 *   /auth/discord            -> redirect to Discord
 *   /auth/discord/callback   -> code exchange, then:
 *       - user has a display name  -> "/"
 *       - user has no name yet     -> "/setup"
 *   /logout                  -> destroy session
 */

const express = require('express');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const { stmts } = require('../lib/db');

const BASE_URL = (process.env.BASE_URL || 'http://localhost').replace(/\/$/, '');

const router = express.Router();

function toSessionUser(row) {
  if (!row) return null;
  return { id: row.id, discordId: row.discord_id, name: row.name };
}

function configurePassport() {
  passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: `${BASE_URL}/auth/discord/callback`,
    scope: ['identify']
  }, (accessToken, refreshToken, profile, done) => {
    // accessToken/refreshToken unused — we only need the user's Discord ID.
    const row = stmts.userByDiscord.get(String(profile.id));
    done(null, row ? toSessionUser(row) : { id: null, discordId: String(profile.id), name: null });
  }));

  passport.serializeUser((user, done) => done(null, user.discordId));

  passport.deserializeUser((discordId, done) => {
    const row = stmts.userByDiscord.get(discordId);
    done(null, row ? toSessionUser(row) : { id: null, discordId, name: null });
  });
}

router.get('/auth/discord',
  passport.authenticate('discord', { scope: ['identify'] })
);

router.get('/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/?auth=failed' }),
  (req, res) => res.redirect(req.user && req.user.name ? '/' : '/setup')
);

router.get('/logout', (req, res) => {
  const done = () => res.redirect('/');
  if (req.user) req.logout(done);
  else done();
  if (req.session) req.session.destroy(done);
});

module.exports = { router, configurePassport };
