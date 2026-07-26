/**
 * middleware/auth.js
 * -------------------
 * Task 3 (permissions enforced server-side).
 *
 * Every protected route checks req.session on the SERVER, not just in the
 * browser UI. Hiding a button in the interface changes nothing if a request
 * can still be sent directly (e.g. with curl or devtools) -- so these checks
 * run on every request regardless of what the client claims.
 */

/** Require any logged-in user. */
function requireLogin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  next();
}

/** Require the lab in-charge role specifically. */
function requireIncharge(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  if (req.session.user.role !== 'incharge') {
    return res.status(403).json({ error: 'Lab in-charge access required for this action.' });
  }
  next();
}

module.exports = { requireLogin, requireIncharge };
