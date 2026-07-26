/**
 * public/js/app.js
 * -----------------
 * Dashboard behaviour: session check, loading/empty/error states for every
 * fetch, search + filters, issuing new equipment, and marking returns.
 *
 * Note on permissions: this file only ever HIDES controls a technician
 * shouldn't see (e.g. it doesn't try to render a "return" button on a
 * record logged by someone else). That's a UX nicety, not the security
 * boundary -- the real enforcement lives on the server (middleware/auth.js
 * and the ownership checks in routes/equipment.js), because a hidden
 * button can't stop a direct request to the API.
 */

let currentUser = null;
let currentRecords = [];

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(d) {
  return d ? d : null;
}

async function init() {
  const sessionRes = await fetch('/api/auth/session');
  const sessionData = await sessionRes.json();

  if (!sessionData.loggedIn) {
    window.location.href = '/login.html';
    return;
  }
  currentUser = sessionData.user;

  document.getElementById('userName').textContent = currentUser.full_name;
  document.getElementById('footnoteRole').textContent = `${currentUser.full_name} (${currentUser.role})`;
  const rolePill = document.getElementById('rolePill');
  rolePill.textContent = currentUser.role === 'incharge' ? 'Lab In-Charge' : 'Lab Technician';
  document.getElementById('scopeLabel').textContent = currentUser.role === 'incharge'
    ? 'Viewing all equipment records'
    : 'Viewing records you logged';

  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('newRecordBtn').addEventListener('click', openIssueModal);
  document.getElementById('cancelIssueBtn').addEventListener('click', closeIssueModal);
  document.getElementById('issueForm').addEventListener('submit', submitIssue);
  document.getElementById('cancelReturnBtn').addEventListener('click', closeReturnModal);
  document.getElementById('returnForm').addEventListener('submit', submitReturn);

  document.getElementById('searchInput').addEventListener('input', debounce(loadRecords, 250));
  document.getElementById('statusFilter').addEventListener('change', loadRecords);
  document.getElementById('overdueFilter').addEventListener('change', loadRecords);

  loadAlerts();
  loadRecords();
}

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
}

async function loadAlerts() {
  try {
    const res = await fetch('/api/equipment/alerts');
    if (!res.ok) throw new Error('alerts request failed');
    const data = await res.json();
    document.getElementById('stillOutCount').textContent = data.stillOut.length;
    document.getElementById('overdueCount').textContent = data.overdueService.length;
  } catch (err) {
    document.getElementById('stillOutCount').textContent = '–';
    document.getElementById('overdueCount').textContent = '–';
  }
}

async function loadRecords() {
  const wrap = document.getElementById('tableWrap');
  wrap.innerHTML = '<div class="loading-state">Loading records…</div>';

  const q = document.getElementById('searchInput').value.trim();
  const status = document.getElementById('statusFilter').value;
  const overdue = document.getElementById('overdueFilter').value;

  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  if (overdue) params.set('overdue', overdue);

  try {
    const res = await fetch('/api/equipment?' + params.toString());
    if (res.status === 401) { window.location.href = '/login.html'; return; }
    if (!res.ok) throw new Error('request failed');
    const data = await res.json();
    currentRecords = data.records;
    renderTable(data.records, data.today);
  } catch (err) {
    wrap.innerHTML = '<div class="error-state">Could not load equipment records. Check your connection and try again.</div>';
  }
}

function renderTable(records, today) {
  const wrap = document.getElementById('tableWrap');

  if (!records || records.length === 0) {
    wrap.innerHTML = '<div class="empty-state">No matching records. Try a different search, or log a new issue with "+ Issue equipment".</div>';
    return;
  }

  const showLoggedBy = currentUser.role === 'incharge';

  let html = '<table><thead><tr>';
  html += '<th>Equipment</th><th>Issued to</th><th>Issue date</th><th>Return date</th><th>Condition</th><th>Next service</th>';
  if (showLoggedBy) html += '<th>Logged by</th>';
  html += '<th></th></tr></thead><tbody>';

  for (const r of records) {
    const isOut = !r.return_date;
    const isOverdue = r.next_service_date && r.next_service_date < today;
    const canReturn = isOut && (currentUser.role === 'incharge' || r.logged_by === currentUser.username);

    html += '<tr>';
    html += `<td><span class="asset-tag">${escapeHtml(r.equipment_id || '—')}</span><div style="margin-top:3px; font-size:12.5px; color:var(--ink-soft);">${escapeHtml(r.equipment_name) || '<span class="empty-value">unnamed item</span>'}</div></td>`;
    html += `<td>${r.issued_to ? escapeHtml(r.issued_to) : '<span class="empty-value">not recorded</span>'}</td>`;
    html += `<td>${r.issue_date ? escapeHtml(r.issue_date) : '<span class="empty-value">—</span>'}</td>`;
    html += `<td>${isOut ? '<span class="badge out">Still out</span>' : escapeHtml(r.return_date)}</td>`;
    html += `<td>${r.condition ? escapeHtml(r.condition) : '<span class="badge unrecorded">not recorded</span>'}</td>`;
    html += `<td>${r.next_service_date ? `<span class="${isOverdue ? 'badge overdue' : ''}">${escapeHtml(r.next_service_date)}</span>` : '<span class="empty-value">not scheduled</span>'}</td>`;
    if (showLoggedBy) html += `<td class="mono" style="font-size:12px; color:var(--ink-soft);">${escapeHtml(r.logged_by || '—')}</td>`;
    html += `<td class="row-actions">${canReturn ? `<button class="btn-secondary" data-return-id="${r.record_id}">Mark returned</button>` : ''}</td>`;
    html += '</tr>';
  }

  html += '</tbody></table>';
  wrap.innerHTML = html;

  wrap.querySelectorAll('[data-return-id]').forEach(btn => {
    btn.addEventListener('click', () => openReturnModal(Number(btn.dataset.returnId)));
  });
}

// ---------- Issue new equipment ----------

function openIssueModal() {
  document.getElementById('issueForm').reset();
  document.getElementById('issueError').classList.remove('visible');
  document.getElementById('f_issue_date').valueAsDate = new Date();
  document.getElementById('issueModalBackdrop').classList.add('open');
}
function closeIssueModal() {
  document.getElementById('issueModalBackdrop').classList.remove('open');
}

async function submitIssue(e) {
  e.preventDefault();
  const errorBox = document.getElementById('issueError');
  errorBox.classList.remove('visible');

  const payload = {
    equipment_id: document.getElementById('f_equipment_id').value.trim(),
    equipment_name: document.getElementById('f_equipment_name').value.trim(),
    issued_to: document.getElementById('f_issued_to').value.trim(),
    issue_date: document.getElementById('f_issue_date').value,
    next_service_date: document.getElementById('f_next_service_date').value || null,
  };

  try {
    const res = await fetch('/api/equipment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      errorBox.textContent = data.error || 'Could not log this record.';
      errorBox.classList.add('visible');
      return;
    }
    closeIssueModal();
    loadAlerts();
    loadRecords();
  } catch (err) {
    errorBox.textContent = 'Could not reach the server. Please try again.';
    errorBox.classList.add('visible');
  }
}

// ---------- Mark returned ----------

let returnTargetId = null;

function openReturnModal(recordId) {
  const record = currentRecords.find(r => r.record_id === recordId);
  if (!record) return;
  returnTargetId = recordId;
  document.getElementById('returnModalSub').textContent =
    `${record.equipment_name || record.equipment_id} — issued to ${record.issued_to || 'unrecorded holder'}`;
  document.getElementById('r_return_date').valueAsDate = new Date();
  document.getElementById('r_condition').value = 'Good';
  document.getElementById('returnError').classList.remove('visible');
  document.getElementById('returnModalBackdrop').classList.add('open');
}
function closeReturnModal() {
  document.getElementById('returnModalBackdrop').classList.remove('open');
  returnTargetId = null;
}

async function submitReturn(e) {
  e.preventDefault();
  const errorBox = document.getElementById('returnError');
  errorBox.classList.remove('visible');

  const payload = {
    return_date: document.getElementById('r_return_date').value,
    condition: document.getElementById('r_condition').value,
  };

  try {
    const res = await fetch(`/api/equipment/${returnTargetId}/return`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      errorBox.textContent = data.error || 'Could not update this record.';
      errorBox.classList.add('visible');
      return;
    }
    closeReturnModal();
    loadAlerts();
    loadRecords();
  } catch (err) {
    errorBox.textContent = 'Could not reach the server. Please try again.';
    errorBox.classList.add('visible');
  }
}

init();
