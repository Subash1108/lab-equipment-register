# Lab Equipment Register

**SIH 2026 — Internal Practical Assessment** · Subash S · Reg 411724104054 · PSVPEC CSE

## The problem, in two lines

Lab instruments are issued against a paper signature with no reliable record
of who last had one, and service/calibration dates live on stickers that
fall off — so equipment goes missing without accountability, and gets used
past the point where its readings can be trusted.

## What this is

A small web app where lab technicians log every issue and return, and the
lab in-charge gets a clear view of what's still out and what's overdue for
service — replacing the paper register and the stickers with one system
that can't lose a page or peel off.

## Tech stack

- **Backend:** Node.js + Express
- **Database:** SQLite via [sql.js](https://sql.js.org) (a pure WebAssembly
  build of SQLite — chosen so `npm install` works on any machine with no C++
  build toolchain required; the whole database lives in one file,
  `data/lab.sqlite`)
- **Auth:** `bcryptjs` password hashing + `express-session`
- **Frontend:** plain HTML/CSS/JS (no framework, no build step)

## How to run it

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Create your environment file** (or just copy the example — the
   defaults work fine for local testing)
   ```bash
   cp .env.example .env
   ```
3. **Seed the database** — creates the tables, three demo accounts, and 40
   sample equipment records
   ```bash
   npm run seed
   ```
4. **Start the server**
   ```bash
   npm start
   ```
5. Open **http://localhost:3000** in your browser. The login page lists the
   demo accounts, or use these directly:

   | Username | Password | Role |
   |---|---|---|
   | `ravi.tech` | `TechPass123!` | Lab Technician |
   | `meena.tech` | `TechPass456!` | Lab Technician |
   | `arjun.incharge` | `InchargePass789!` | Lab In-Charge |

   Sign in as a technician to see only the records you've logged, or as the
   in-charge to see everything and the full overdue/still-out picture.

Re-running `npm run seed` at any point wipes and rebuilds the tables from
scratch, back to the same 40 sample records.

## What every field means

| Field | Meaning | Possible values |
|---|---|---|
| `record_id` | Auto-generated identifier for the issue record | integer, assigned by the database |
| `equipment_id` | Short asset code for the physical item | e.g. `OSC-02`; free text |
| `equipment_name` | Human-readable name of the item | e.g. `Oscilloscope`; free text |
| `issued_to` | Name of the student or staff member who took the item | free text; may be missing on a sparse/junk record |
| `issue_date` | Date the item left the lab | `YYYY-MM-DD` |
| `return_date` | Date the item came back | `YYYY-MM-DD`, or **empty if the item is still out** — this is what drives the "Still out" flag |
| `condition` | Condition noted at issue/return | `Good`, `Needs Cleaning`, `Damaged`, or **unrecorded** if nobody logged it |
| `next_service_date` | Date the item is next due for calibration/service | `YYYY-MM-DD`, or **empty if no service schedule is tracked** for that item |
| `logged_by` | Username of the technician who created the record | matches a `users.username`; used to enforce "own records only" (see below) |

`logged_by` isn't in the original field list from the brief — it was added
because Task 3 requires technicians to see only their own records, which
needs some field recording who logged each one.

### The three deliberate "awkward" cases (Task 1)

- **A missing value:** record #7 has no `condition` recorded.
- **Two very similar names:** holders **"Dinesh Kumar"** and **"Dinesh
  Kummar"** both appear, one letter apart — a realistic case of two
  different people, or one name misspelled once.
- **A record with nothing related to it:** record #40, equipment ID
  `UNK-00`, "Unidentified / Unlabeled Item" — every other field is empty, the
  kind of junk entry a technician might create by mistake.

The UI shows an italic placeholder ("not recorded", "not scheduled", "—")
rather than a blank cell wherever one of these values is missing, so a gap
in the data is never mistaken for a zero or a real answer.

## How the derived figures are calculated

Two numbers drive the alert cards at the top of the dashboard, computed
fresh on every load rather than stored:

- **Still out** = count of records where `return_date` is empty. This is the
  same condition used to show the "Still out" badge and to decide whether a
  record's "Mark returned" button appears at all.
- **Service overdue** = count of records where `next_service_date` is not
  empty **and** is earlier than today's date. Records with no service date
  tracked are excluded — not scheduled is different from overdue.

Both figures are scoped by role exactly like the record list itself: a
technician's counts only cover records they logged; the in-charge's counts
cover everything.

**Checked by hand:** with the seeded demo data on 2026-07-24, the overdue
count comes to 6 and the still-out count comes to 14. Both were verified
by reading through `db/init.js`'s generation logic by hand and confirmed
against the API's response — see the comments in that file for exactly
which records were expected to land in each bucket.

## Roles and permissions (Task 3)

- **Lab Technician:** can log new issues and mark returns, but only for
  records they logged themselves. Enforced server-side on every request —
  not just hidden in the interface — in `middleware/auth.js` and the
  ownership check in `routes/equipment.js`.
- **Lab In-Charge:** can see and update every record.
- **Nobody** can delete a record, regardless of role. There's no delete
  route that removes a row for anyone — past records stay as a permanent,
  tamper-proof history rather than something that can be tidied away.

## Security testing (Task 4)

See **[SECURITY_TESTS.md](./SECURITY_TESTS.md)** for the three attacks
attempted against the running app (SQL injection at login, inspecting the
stored password column, and calling a privileged action as an ordinary
user) and the exact results.

## What's not finished

- No password reset / "forgot password" flow — the three demo accounts are
  fixed via the seed script.
- No rate limiting on the login endpoint (a production version would add
  this to slow down brute-force attempts, on top of the bcrypt cost factor).
- No automated test suite — the checks in SECURITY_TESTS.md were run
  manually with curl; they'd be worth converting to a scripted test file
  for CI.
- No pagination on the records table — fine for a lab's real equipment
  count, but would need it at much larger scale.
