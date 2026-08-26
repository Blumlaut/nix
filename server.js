'use strict';

require('dotenv').config();

const { load } = require('./src/config');
const { createApp } = require('./src/app');

const config = load();
const app = createApp(config);

app.listen(config.port, config.host, () => {
  console.log(`[nix] listening on ${config.host}:${config.port}`);
});
