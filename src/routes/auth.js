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

const { discordAvatarUrl } = require('../lib/discord');

function toSessionUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    discordId: row.discord_id,
    name: row.name,
    avatarUrl: row.avatar_url || null,
  };
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
      // Tokens are unused — we only need the Discord ID and avatar hash.
      const discordId = String(profile.id);
      const avatarUrl = discordAvatarUrl(discordId, profile.avatar || null);
      const row = queries.userByDiscord.get(discordId);
      if (row) {
        if ((row.avatar_url || null) !== avatarUrl) queries.updateAvatar.run(avatarUrl, row.id);
        return done(null, toSessionUser(queries.userByDiscord.get(discordId)));
      }
      // No row yet (user has no display name): carry the avatar in the
      // session until POST /api/me/name creates the row.
      done(null, { id: null, discordId, name: null, avatarUrl });
    }
  ));

  passport.serializeUser((user, done) =>
    done(null, { discordId: user.discordId, avatarUrl: user.avatarUrl || null }));
  passport.deserializeUser((payload, done) => {
    // Legacy sessions serialized a bare discordId string; new ones carry an
    // object so a not-yet-named user keeps their avatar across requests.
    const discordId = typeof payload === 'string' ? payload : payload.discordId;
    const pendingAvatar = typeof payload === 'string' ? null : payload.avatarUrl || null;
    const row = queries.userByDiscord.get(discordId);
    done(null, row ? toSessionUser(row) : { id: null, discordId, name: null, avatarUrl: pendingAvatar });
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
