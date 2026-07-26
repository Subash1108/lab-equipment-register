/**
 * routes/equipment.js
 * --------------------
 * Core register logic: issue/return records, "still out" flags, and
 * service/calibration overdue warnings.
 *
 * Task 3 (permissions, enforced here on the server):
 *   - technician: sees and edits only the records they personally logged
 *     (equipment_issues.logged_by === their own username)
 *   - incharge:   sees and edits every record
 *   - nobody, of any role, can delete a record. Deletion is not just
 *     hidden in the UI -- there is no route that performs it -- so the
 *     issue/return history stays intact as evidence.
 *
 * Every query below uses bound "?" parameters, never string concatenation.
 */

const express = require('express');
const db = require('../db/database');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

const TODAY = () => new Date().toISOString().slice(0, 10);

function scopeToRole(session) {
  // technicians only ever query their own logged_by value; in-charge gets
  // no filter (sees everything). This scoping is decided server-side from
  // the session, never from anything the client sends.
  return session.user.role === 'technician' ? session.user.username : null;
}

/**
 * GET /api/equipment
 * Optional query params: q (search text), status ('out'|'returned'), overdue ('1')
 */
router.get('/', requireLogin, (req, res) => {
  const ownerFilter = scopeToRole(req.session);
  const { q, status, overdue } = req.query;

  let sql = 'SELECT * FROM equipment_issues WHERE 1=1';
  const params = [];

  if (ownerFilter) {
    sql += ' AND logged_by = ?';
    params.push(ownerFilter);
  }

  if (q && typeof q === 'string' && q.trim().length > 0) {
    // Awkward cases (missing values, near-duplicate names, junk rows) all
    // flow through this same LIKE search, bound as a parameter.
    const like = `%${q.trim()}%`;
    sql += ` AND (
      equipment_id LIKE ? OR
      equipment_name LIKE ? OR
      issued_to LIKE ?
    )`;
    params.push(like, like, like);
  }

  if (status === 'out') {
    sql += ' AND return_date IS NULL';
  } else if (status === 'returned') {
    sql += ' AND return_date IS NOT NULL';
  }

  if (overdue === '1') {
    sql += ' AND next_service_date IS NOT NULL AND next_service_date < ?';
    params.push(TODAY());
  }

  sql += ' ORDER BY record_id DESC';

  const rows = db.all(sql, params);
  res.json({ records: rows, today: TODAY() });
});

/**
 * GET /api/equipment/alerts
 * Items still out, and items whose service/calibration date has passed.
 */
router.get('/alerts', requireLogin, (req, res) => {
  const ownerFilter = scopeToRole(req.session);
  const today = TODAY();

  let stillOutSql = 'SELECT * FROM equipment_issues WHERE return_date IS NULL';
  let overdueSql = 'SELECT * FROM equipment_issues WHERE next_service_date IS NOT NULL AND next_service_date < ?';
  const stillOutParams = [];
  const overdueParams = [today];

  if (ownerFilter) {
    stillOutSql += ' AND logged_by = ?';
    stillOutParams.push(ownerFilter);
    overdueSql += ' AND logged_by = ?';
    overdueParams.push(ownerFilter);
  }

  const stillOut = db.all(stillOutSql, stillOutParams);
  const overdueService = db.all(overdueSql, overdueParams);

  res.json({ stillOut, overdueService, today });
});

/**
 * POST /api/equipment
 * Log a new issue. logged_by is always taken from the session, never from
 * the request body, so nobody can log an entry under someone else's name.
 */
router.post('/', requireLogin, (req, res) => {
  const { equipment_id, equipment_name, issued_to, issue_date, condition, next_service_date } = req.body || {};

  if (!equipment_id || !equipment_name || !issued_to || !issue_date) {
    return res.status(400).json({ error: 'equipment_id, equipment_name, issued_to and issue_date are required.' });
  }
  if (String(equipment_id).length > 50 || String(equipment_name).length > 200 || String(issued_to).length > 200) {
    return res.status(400).json({ error: 'One or more fields are too long.' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issue_date)) {
    return res.status(400).json({ error: 'issue_date must be in YYYY-MM-DD format.' });
  }

  db.run(
    `INSERT INTO equipment_issues
      (equipment_id, equipment_name, issued_to, issue_date, return_date, condition, next_service_date, logged_by)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
    [equipment_id, equipment_name, issued_to, issue_date, condition || null, next_service_date || null, req.session.user.username]
  );

  res.status(201).json({ ok: true });
});

/**
 * PUT /api/equipment/:id/return
 * Mark an item returned. Technicians may only update records they logged;
 * the in-charge may update any record. Checked here, server-side.
 */
router.put('/:id/return', requireLogin, (req, res) => {
  const recordId = Number(req.params.id);
  if (!Number.isInteger(recordId)) {
    return res.status(400).json({ error: 'Invalid record id.' });
  }

  const record = db.get('SELECT * FROM equipment_issues WHERE record_id = ?', [recordId]);
  if (!record) {
    return res.status(404).json({ error: 'Record not found.' });
  }

  if (req.session.user.role === 'technician' && record.logged_by !== req.session.user.username) {
    return res.status(403).json({ error: 'You may only update records you logged yourself.' });
  }

  const { return_date, condition } = req.body || {};
  if (!return_date || !/^\d{4}-\d{2}-\d{2}$/.test(return_date)) {
    return res.status(400).json({ error: 'return_date must be in YYYY-MM-DD format.' });
  }

  db.run(
    'UPDATE equipment_issues SET return_date = ?, condition = ? WHERE record_id = ?',
    [return_date, condition || record.condition, recordId]
  );

  res.json({ ok: true });
});

/**
 * DELETE /api/equipment/:id
 * Deliberately unimplemented for everyone, including the in-charge. Past
 * records are evidence and must not be quietly removable by whoever made
 * the mistake -- so there is no code path here that deletes a row.
 */
router.delete('/:id', requireLogin, (req, res) => {
  res.status(403).json({ error: 'Deletion is disabled. Equipment records are permanent once logged.' });
});

module.exports = router;
