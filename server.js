/**
 * server.js
 * ---------
 * Entry point. Wires up sessions, static frontend, and the API routes.
 */

require('dotenv').config({ quiet: true }); // suppress dotenv's promotional startup tip
const path = require('path');
const express = require('express');
const session = require('express-session');

const db = require('./db/database');
const authRoutes = require('./routes/auth');
const equipmentRoutes = require('./routes/equipment');

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-in-production-please';

async function main() {
  await db.connect(); // load (or create) the sql.js database before serving requests

  const app = express();

  app.use(express.json());
  app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 4, // 4 hours
    },
  }));

  app.use('/api/auth', authRoutes);
  app.use('/api/equipment', equipmentRoutes);

  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
  });

  app.listen(PORT, () => {
    console.log(`Lab Equipment Register running at http://localhost:${PORT}`);
  });
}

main().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
