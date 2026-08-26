'use strict';

function notFound(req, res) {
  res.status(404).json({ error: 'not_found' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error('[nix] error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'internal_error' });
}

module.exports = { notFound, errorHandler };
