'use strict';

/**
 * Authentication middleware.
 *
 * - `requireSession` gates an endpoint behind a valid login.
 * - `requireName` additionally requires the user to have picked a display
 *   name (their local `users.id` is set).
 */
function requireSession(needName) {
  return (req, res, next) => {
    if (!(req.isAuthenticated && req.isAuthenticated()) || !req.user) {
      return res.status(401).json({ error: 'not_authenticated' });
    }
    if (needName && !req.user.id) {
      return res.status(409).json({ error: 'name_required' });
    }
    return next();
  };
}

module.exports = { requireSession };
