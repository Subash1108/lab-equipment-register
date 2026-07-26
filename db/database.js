/**
 * db/database.js
 * ---------------
 * Thin wrapper around sql.js (a pure-JavaScript / WebAssembly build of
 * SQLite). We use sql.js instead of a native SQLite binding so the project
 * installs with a plain `npm install` on any machine, with no C++ build
 * toolchain required.
 *
 * sql.js keeps the whole database in memory. To make data durable across
 * restarts we persist the in-memory database to a single binary file
 * (data/lab.sqlite) after every write, and load that file back in on boot.
 *
 * All queries elsewhere in this project go through db.run() / db.get() /
 * db.all(), which use bound parameters ("?") rather than string
 * concatenation -- this is what prevents SQL injection (see Task 2 / 4).
 */

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DB_FILE = path.join(__dirname, '..', 'data', 'lab.sqlite');

let SQL = null;   // sql.js module
let db = null;    // live database instance

/** Load sql.js (WASM) and open the database file if it exists, or create a fresh one. */
async function connect() {
  if (db) return db;

  SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE)) {
    const fileBuffer = fs.readFileSync(DB_FILE);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
  return db;
}

/** Write the current in-memory database out to disk. Call after any write. */
function persist() {
  if (!db) return;
  const data = db.export();
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, Buffer.from(data));
}

/** Run a write statement (INSERT/UPDATE/DDL) with bound parameters. */
function run(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  stmt.step();
  stmt.free();
  persist();
}

/** Return the first matching row (or undefined) for a SELECT, using bound parameters. */
function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let row;
  if (stmt.step()) {
    row = stmt.getAsObject();
  }
  stmt.free();
  return row;
}

/** Return all matching rows for a SELECT, using bound parameters. */
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

module.exports = { connect, run, get, all, persist, DB_FILE };
