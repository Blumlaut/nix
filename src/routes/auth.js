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

function toSessionUser(row) {
  if (!row) return null;
  return { id: row.id, discordId: row.discord_id, name: row.name };
}

function configurePassport(config, queries) {
  passport.use(new DiscordStrategy(
    {
      clientID: config.discordClientId,
      clientSecret: config.discordClientSecret,
      callbackURL: `${config.baseUrl}/auth/discord/callback`,
      scope: ['identify'],
    },
    (accessToken, refreshToken, profile, done) => {
      // Tokens are unused — we only need the user's Discord ID.
      const row = queries.userByDiscord.get(String(profile.id));
      done(null, row ? toSessionUser(row) : { id: null, discordId: String(profile.id), name: null });
    }
  ));

  passport.serializeUser((user, done) => done(null, user.discordId));
  passport.deserializeUser((discordId, done) => {
    const row = queries.userByDiscord.get(discordId);
    done(null, row ? toSessionUser(row) : { id: null, discordId, name: null });
  });
}

function createAuthRouter(config, queries) {
  configurePassport(config, queries);
  const router = express.Router();

  router.get('/auth/discord', passport.authenticate('discord', { scope: ['identify'] }));

  router.get(
    '/auth/discord/callback',
    passport.authenticate('discord', { failureRedirect: '/?auth=failed' }),
    (req, res) => res.redirect(req.user && req.user.name ? '/' : '/setup')
  );

  router.get('/logout', (req, res) => {
    const redirect = () => res.redirect('/');
    // logout() clears req.user; session.destroy() clears the backing store.
    if (req.user) req.logout(() => {});
    if (req.session) req.session.destroy(() => redirect());
    else redirect();
  });

  return router;
}

module.exports = { createAuthRouter };
