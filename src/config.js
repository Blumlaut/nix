'use strict';

const path = require('path');

/**
 * Central configuration. All environment variables are read here so the rest
 * of the app deals with a single typed `config` object instead of scattered
 * `process.env` lookups.
 */
function load() {
  const config = {
    port: Number(process.env.PORT || 8080),
    host: process.env.HOST || '127.0.0.1',
    baseUrl: (process.env.BASE_URL || 'http://localhost').replace(/\/+$/, ''),
    sessionSecret: process.env.SESSION_SECRET || 'insecure-dev-secret-change-me',
    discordClientId: process.env.DISCORD_CLIENT_ID,
    discordClientSecret: process.env.DISCORD_CLIENT_SECRET,
    dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'nix.sqlite'),
    // Cookie lifetime for sessions, in milliseconds.
    sessionTtlMs: 1000 * 60 * 60 * 24 * 30,
  };

  const devSecret = 'insecure-dev-secret-change-me';
  if (!config.discordClientId || !config.discordClientSecret) {
    console.warn('[nix] WARNING: DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET not set — login will fail until .env is filled in');
  }
  if (config.sessionSecret === devSecret) {
    console.warn('[nix] WARNING: SESSION_SECRET not set — set a long random value in .env');
  }

  return config;
}

module.exports = { load };
