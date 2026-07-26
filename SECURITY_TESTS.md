# Security Tests — Task 4

This document records the three attacks the project defends against, and the
exact attempts made against the running application to test each one.

## Threats defended against

1. **SQL injection at login.** If the login query were built by concatenating
   the submitted username into a SQL string, crafted input could change the
   query's logic and let someone log in without a valid password, or dump
   data they shouldn't see.
2. **Plaintext password storage.** If passwords were stored as-is (or with a
   bare fast hash like MD5/SHA-1), a copy of the database would hand an
   attacker every user's real password immediately.
3. **Missing server-side authorization.** If a role check only hid buttons in
   the browser, anyone could still call a privileged action directly (via
   curl, devtools, etc.) and bypass it entirely.

## Attempt 1 — SQL injection via crafted login input

Two payloads were sent to `POST /api/auth/login`, both classic injection
attempts against the username field:

```
{"username": "' OR '1'='1", "password": "anything"}
{"username": "admin' -- ", "password": "x"}
```

**Result:** both returned `HTTP 401 {"error":"Invalid username or password."}`.
Neither logged in, and neither caused a database error. This is because
`routes/auth.js` binds the username as a parameter —
`db.get('SELECT * FROM users WHERE username = ?', [username])` — rather than
building the SQL string by concatenation. sql.js treats the whole input as a
literal value to compare, not as code, so the quote and dash characters have
no special effect on the query.

## Attempt 2 — Inspect what is actually stored in the password column

The database file was opened directly (bypassing the app entirely, as an
attacker with a copy of the file would) and the `users` table was read:

```
username         password_hash
ravi.tech        $2b$12$p7PmvnOjXjTx6kz8miVAqeFs0I8/bV9rPPpZCTo3h1NdKvrdYR5i6...
meena.tech       $2b$12$E.8NK5RAWLEAH7Sg3gyRwOGO9topO09BuJZI10phKlv9aUyFHbC6....
arjun.incharge   $2b$12$L3TYT4de/wJtsNxqczECSOzDr.mKzsPmMaeah1M.Ytwc9NuMB7OD...
```

**Result:** only bcrypt hashes (`$2b$12$...`, 12 salt rounds) are present —
never the plaintext password. Even with full read access to the database
file, the actual passwords aren't recoverable, only crackable at bcrypt's
deliberately slow rate, and each hash has its own random salt so identical
passwords wouldn't even produce matching hashes.

## Attempt 3 — Call a privileged action while logged in as an ordinary user

Three variations were tried against a logged-in **technician** session
(`ravi.tech`), which should only be able to act on records they logged
themselves, and never delete anything:

**3a — update a record belonging to a different technician.**
Found a record logged by `meena.tech`, then tried to mark it returned while
authenticated as `ravi.tech`:
```
PUT /api/equipment/34/return  (as ravi.tech, record logged by meena.tech)
→ HTTP 403 {"error":"You may only update records you logged yourself."}
```

**3b — call the API with no session at all.**
```
GET /api/equipment  (no cookie / not logged in)
→ HTTP 401 {"error":"Not logged in."}
```

**3c — attempt to delete a record (a destructive action nobody should have).**
```
DELETE /api/equipment/1  (as ravi.tech)
→ HTTP 403 {"error":"Deletion is disabled. Equipment records are permanent once logged."}
```

**Result:** all three were rejected with the correct status code, by checks in
`middleware/auth.js` and `routes/equipment.js` that run on every request
against `req.session` — not by anything hidden in the browser UI. The delete
route in particular doesn't just check a role: there is no code path that
deletes a row, for any role, so the record history can't be quietly edited
away by whoever made the mistake.

## How to re-run these tests yourself

With the server running (`npm start`), the commands above can be replayed
with `curl`. Log in first to get a session cookie for attempts 3a:

```bash
curl -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"ravi.tech","password":"TechPass123!"}'

curl -b cookies.txt -X PUT http://localhost:3000/api/equipment/34/return \
  -H "Content-Type: application/json" \
  -d '{"return_date":"2026-07-24","condition":"Good"}'
```
