/**
 * db/init.js
 * ----------
 * Task 1 (sample data) + Task 2 (hashed credentials) setup script.
 *
 * Run with: npm run seed
 *
 * What it does:
 *  1. Creates the `users` and `equipment_issues` tables (drops old ones first,
 *     so this script is safe to re-run while developing).
 *  2. Creates three demo accounts -- passwords are hashed with bcrypt before
 *     they ever touch the database. The plaintext passwords below are ONLY
 *     for you to log in with during testing/demo; they are never stored.
 *  3. Inserts ~40 equipment issue records, including three deliberate
 *     "awkward" cases described in the assessment brief:
 *       - a record with a missing value      (record #7,  condition unrecorded)
 *       - two very similar holder names       (records #14 & #15, "Dinesh Kumar"
 *                                               vs "Dinesh Kummar")
 *       - a record with nothing related to it (record #40, junk/orphan entry)
 */

const bcrypt = require('bcryptjs');
const database = require('./database');

// ---------------------------------------------------------------------------
// Field reference (also documented in README.md):
//   record_id         INTEGER  auto-incrementing primary key
//   equipment_id       TEXT     short asset code, e.g. "OSC-04"
//   equipment_name      TEXT     human-readable name, e.g. "Oscilloscope"
//   issued_to          TEXT     name of the student/staff who took the item
//   issue_date          TEXT     ISO date (YYYY-MM-DD) the item left the lab
//   return_date         TEXT|NULL  ISO date returned, or NULL if still out
//   condition            TEXT|NULL  'Good' | 'Damaged' | 'Needs Cleaning' | NULL
//                                 (NULL = not recorded -- an awkward case)
//   next_service_date TEXT|NULL  ISO date the item is next due for
//                                 calibration/service, or NULL if not tracked
//   logged_by          TEXT     username of the technician who logged the
//                                 entry (used to enforce "own records only")
// ---------------------------------------------------------------------------

const BCRYPT_ROUNDS = 12;

async function main() {
  await database.connect();

  database.run(`DROP TABLE IF EXISTS equipment_issues`);
  database.run(`DROP TABLE IF EXISTS users`);

  database.run(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('technician','incharge'))
    )
  `);

  database.run(`
    CREATE TABLE equipment_issues (
      record_id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id TEXT,
      equipment_name TEXT,
      issued_to TEXT,
      issue_date TEXT,
      return_date TEXT,
      condition TEXT,
      next_service_date TEXT,
      logged_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // --- Users -----------------------------------------------------------
  // Demo login credentials (plaintext shown here only so you can log in;
  // only the bcrypt hash is ever written to the database):
  //   ravi.tech   / TechPass123!   (lab technician)
  //   meena.tech  / TechPass456!   (lab technician)
  //   arjun.incharge / InchargePass789!  (lab in-charge)
  const demoUsers = [
    { username: 'ravi.tech', password: 'TechPass123!', full_name: 'Ravi S (Lab Technician)', role: 'technician' },
    { username: 'meena.tech', password: 'TechPass456!', full_name: 'Meena K (Lab Technician)', role: 'technician' },
    { username: 'arjun.incharge', password: 'InchargePass789!', full_name: 'Arjun P (Lab In-Charge)', role: 'incharge' },
  ];

  for (const u of demoUsers) {
    const hash = await bcrypt.hash(u.password, BCRYPT_ROUNDS);
    database.run(
      `INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)`,
      [u.username, hash, u.full_name, u.role]
    );
  }

  // --- Equipment issue records ------------------------------------------
  const equipmentTypes = [
    ['MUL-01', 'Digital Multimeter'],
    ['OSC-02', 'Oscilloscope'],
    ['MIC-03', 'Compound Microscope'],
    ['SPC-04', 'UV-Vis Spectrophotometer'],
    ['CEN-05', 'Bench Centrifuge'],
    ['CAL-06', 'Digital Vernier Caliper'],
    ['FGN-07', 'Function Generator'],
    ['PHM-08', 'Digital pH Meter'],
    ['AUT-09', 'Autoclave'],
    ['SOL-10', 'Soldering Station'],
    ['PWS-11', 'DC Power Supply'],
    ['THM-12', 'Infrared Thermometer'],
  ];

  const holders = [
    'Aishwarya R', 'Karthik M', 'Divya S', 'Naveen Kumar', 'Priya S',
    'Bala Murugan', 'Gokul V', 'Hema Latha', 'Suresh Babu', 'Anitha P',
    'Vignesh T', 'Kavya N', 'Mohammed Aslam', 'Dinesh Kumar', 'Dinesh Kummar', // <- similar-name pair
    'Sowmya R', 'Praveen Raj', 'Lakshmi Priya', 'Yuvaraj S', 'Nandhini K',
  ];

  const conditions = ['Good', 'Good', 'Good', 'Needs Cleaning', 'Damaged'];

  // Helper to shift a base date by N days, formatted YYYY-MM-DD.
  const baseDate = new Date('2026-07-24'); // "today" per project context
  function shiftDate(days) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  const technicianUsernames = ['ravi.tech', 'meena.tech'];
  const records = [];

  // Generate 39 "normal-ish" records with some variety, then add 1 pure
  // junk/orphan record at the end (record #40) as the third awkward case.
  for (let i = 0; i < 39; i++) {
    const [equipment_id, equipment_name] = equipmentTypes[i % equipmentTypes.length];
    const issued_to = holders[i % holders.length];
    const issueOffset = -(10 + i * 3);             // issued between ~10 and ~127 days ago
    const issue_date = shiftDate(issueOffset);

    // Roughly a third of items are still out (no return date yet).
    const stillOut = i % 3 === 0;
    const return_date = stillOut ? null : shiftDate(issueOffset + 3 + (i % 5));

    // Service dates: mix of overdue (past), due soon, and comfortably future.
    let next_service_date;
    if (i % 7 === 0) {
      next_service_date = shiftDate(-(5 + i));         // overdue -> should trigger a warning
    } else if (i % 5 === 0) {
      next_service_date = shiftDate(3 + i);             // due soon
    } else {
      next_service_date = shiftDate(60 + i * 2);        // comfortably in the future
    }

    // Awkward case #1: record #7 (index 6) has an unrecorded condition.
    const condition = (i === 6) ? null : conditions[i % conditions.length];

    // Awkward case #2 is baked in via the holders list at i === 13 and i === 14
    // ("Dinesh Kumar" vs "Dinesh Kummar"), so no special-casing needed here.

    const logged_by = technicianUsernames[i % technicianUsernames.length];

    records.push({
      equipment_id, equipment_name, issued_to, issue_date, return_date,
      condition, next_service_date, logged_by,
    });
  }

  // Awkward case #3: a record with nothing meaningfully related to it --
  // a junk / orphan entry a technician might create by mistake, used to
  // test that search and the UI handle sparse data without breaking.
  records.push({
    equipment_id: 'UNK-00',
    equipment_name: 'Unidentified / Unlabeled Item',
    issued_to: null,
    issue_date: null,
    return_date: null,
    condition: null,
    next_service_date: null,
    logged_by: 'ravi.tech',
  });

  for (const r of records) {
    database.run(
      `INSERT INTO equipment_issues
        (equipment_id, equipment_name, issued_to, issue_date, return_date, condition, next_service_date, logged_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.equipment_id, r.equipment_name, r.issued_to, r.issue_date, r.return_date, r.condition, r.next_service_date, r.logged_by]
    );
  }

  console.log(`Seeded ${demoUsers.length} users and ${records.length} equipment records.`);
  console.log(`Database file: ${database.DB_FILE}`);
  console.log('\nDemo login credentials:');
  demoUsers.forEach(u => console.log(`  ${u.username} / ${u.password}  (${u.role})`));
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
