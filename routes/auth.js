/**
 * routes/auth.js
 * --------------
 * Task 2: login backed by bcrypt password hashes, parameterised queries,
 * server-side input validation, and generic failure messages that don't
 * reveal whether a username exists.
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');

const router = express.Router();

// A hash of a random, never-used password. When the submitted username
// doesn't exist we still run bcrypt.compare() against this dummy hash so
// that a "user not found" response takes roughly the same amount of time
// as a "wrong password" response -- this avoids leaking which usernames
// are valid via a timing side-channel.
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeOQ3Q3q3q3q3q3q3q3q3q3q3q3q3q3q3O';

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};

  // Server-side input validation -- never trust the client.
  if (typeof username !== 'string' || typeof password !== 'string' ||
      username.trim().length === 0 || password.length === 0 ||
      username.length > 100 || password.length > 200) {
    return res.status(400).json({ error: 'Invalid login request.' });
  }

  // Parameterised query -- the username is bound as a placeholder, never
  // concatenated into the SQL string, so crafted input like
  // `' OR '1'='1` cannot change the query's logic.
  const user = db.get('SELECT * FROM users WHERE username = ?', [username.trim()]);

  const hashToCheck = user ? user.password_hash : DUMMY_HASH;
  const passwordMatches = await bcrypt.compare(password, hashToCheck);

  if (!user || !passwordMatches) {
    // Generic message either way -- doesn't confirm whether the account exists.
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  // Regenerate the session on login to avoid session fixation.
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Login failed, please try again.' });
    req.session.user = { username: user.username, full_name: user.full_name, role: user.role };
    res.json({ ok: true, user: req.session.user });
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

router.get('/session', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ loggedIn: true, user: req.session.user });
  }
  res.json({ loggedIn: false });
});

module.exports = router;
