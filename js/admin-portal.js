/* js/admin-portal.js — logic for admin/index.html */

let currentUser = null;
let allUsers    = [];
let allExams    = [];
let allLabs     = [];
let currentLab  = null;

/* ── Tab switching ─────────────────────────────────────────────────────── */
const TABS = ['overview', 'labs', 'users', 'exams', 'accounts', 'super'];
function showTab(name) {
  TABS.forEach(t => {
    const el = document.getElementById('tab-' + t);
    if (el) el.style.display = t === name ? 'block' : 'none';
    const btn = document.querySelector(`.tab-btn[data-tab="${t}"]`);
    if (btn) btn.classList.toggle('active', t === name);
  });
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.getAttribute('data-tab');
    showTab(tab);
    if (tab === 'labs') loadLabs();
    if (tab === 'users' && !allUsers.length) loadAllUsers();
    if (tab === 'exams' && !allExams.length) loadAllExams();
    if (tab === 'accounts') loadClinicAccounts();
    if (tab === 'super') loadSuperStats();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   TAB 1 — Overview
   ══════════════════════════════════════════════════════════════════════════ */
async function loadOverview() {
  const statGrid = document.getElementById('stat-grid');
  const roleStrip = document.getElementById('role-strip');
  const activityBody = document.getElementById('activity-body');
  try {
    const res = await fetch('/api/admin/stats', { credentials: 'same-origin' });
    const s = await res.json();

    statGrid.innerHTML = `
      <div class="stat-tile"><div class="st-value">${s.pet_count}</div><div class="st-label">Pets registered</div></div>
      <div class="stat-tile"><div class="st-value">${s.exam_count}</div><div class="st-label">Exams total</div></div>
      <div class="stat-tile"><div class="st-value">${s.awaiting_review_count}</div><div class="st-label">Awaiting review</div></div>
      <div class="stat-tile"><div class="st-value">${s.signed_count}</div><div class="st-label">Signed</div></div>
      <div class="stat-tile"><div class="st-value">${s.average_overall_health_score ?? '—'}</div><div class="st-label">Avg. health score</div></div>
    `;

    roleStrip.innerHTML = Object.entries(s.users_by_role).map(([role, n]) =>
      `<span class="tag">${role}: ${n}</span>`).join('') || `<span class="text-muted">No accounts yet.</span>`;

    activityBody.innerHTML = s.recent_exams.length
      ? s.recent_exams.map(e => `
          <tr>
            <td>${e.pet_name}</td>
            <td>${e.species}</td>
            <td><span class="status-pill ${e.status === 'signed' ? 'status-200' : 'status-pending'}">● ${e.status === 'signed' ? 'Signed' : 'Awaiting review'}</span></td>
            <td class="text-muted">${new Date(e.created_at).toLocaleString()}</td>
            <td class="text-muted">${e.signed_at ? new Date(e.signed_at).toLocaleString() : '—'}</td>
          </tr>`).join('')
      : `<tr><td colspan="5" class="text-muted" style="padding:14px;">No exams yet.</td></tr>`;
  } catch {
    statGrid.innerHTML = `<span class="text-muted">Could not load — is the backend running?</span>`;
  }

  loadOverviewLabStatus();
}

async function loadOverviewLabStatus() {
  const el = document.getElementById('overview-lab-status');
  if (!el) return;
  try {
    const res = await fetch('/api/labs', { credentials: 'same-origin' });
    const labs = await res.json();
    el.innerHTML = labs.length ? labs.map(lab => `
      <div class="overview-lab-card">
        <div class="olc-head">
          <span class="olc-name">${lab.name}</span>
          <span class="olc-machine-icons">${lab.machines.map(m => `<span title="${m.name}">${machineIcon(m.machine_type)}</span>`).join('') || '—'}</span>
        </div>
        ${labStatusBarHTML(lab)}
      </div>`).join('') : '<span class="text-muted">No labs yet.</span>';
  } catch {
    el.innerHTML = '<span class="text-muted">Could not load lab status.</span>';
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB — Labs
   super_admin: browse every lab, create new ones, open any lab to manage it.
   admin: dropped straight into their own lab, no list/create UI.
   ══════════════════════════════════════════════════════════════════════════ */
const MACHINE_STATES = ['operational', 'maintenance', 'offline'];

const MACHINE_ICONS = {
  lidar: '🎥', ultrasound: '🔊', bioacoustic: '💓',
  force_plate: '🐾', thermal: '🌡️', blood_chem: '🩸'
};
function machineIcon(type) { return MACHINE_ICONS[type] || '🔧'; }

/** Segmented operational/maintenance/offline status bar + legend for one lab's machines. */
function labStatusBarHTML(lab) {
  const counts = { operational: 0, maintenance: 0, offline: 0 };
  lab.machines.forEach(m => { if (counts[m.state] != null) counts[m.state]++; });
  const total = lab.machines.length;

  if (!total) return '<div class="text-muted" style="font-size:11.5px;">No machines on record.</div>';

  const segs = MACHINE_STATES.map(s => counts[s]
    ? `<div class="lsb-seg lsb-${s}" style="flex:${counts[s]};" title="${counts[s]} ${s}"></div>` : '').join('');
  const legend = MACHINE_STATES.filter(s => counts[s]).map(s =>
    `<span class="lsb-legend-item"><span class="lsb-dot lsb-${s}"></span>${counts[s]} ${s}</span>`).join('');

  return `
    <div class="lab-status-bar">${segs}</div>
    <div class="lab-status-legend">${legend}</div>`;
}

async function loadLabs() {
  const listView   = document.getElementById('labs-list-view');
  const detailView = document.getElementById('lab-detail-view');
  const cardsEl    = document.getElementById('labs-cards');

  try {
    const res = await fetch('/api/labs', { credentials: 'same-origin' });
    allLabs = await res.json();

    if (currentUser.role === 'super_admin') {
      listView.style.display = 'block';
      detailView.style.display = 'none';
      cardsEl.innerHTML = allLabs.length
        ? allLabs.map(lab => `
            <div class="lab-card" data-lab-id="${lab.id}">
              <div class="lc-name">${lab.name}</div>
              <div class="lc-address">${lab.address || 'No address on file'}</div>
              <div class="lc-stats">
                <span><b>${lab.staff.length}</b> staff</span>
                <span><b>${lab.doctors.length}</b> doctors</span>
                <span><b>${lab.machines.length}</b> machines</span>
              </div>
              ${labStatusBarHTML(lab)}
            </div>`).join('')
        : '<span class="text-muted">No labs yet — create the first one above.</span>';
      cardsEl.querySelectorAll('.lab-card').forEach(card => {
        card.addEventListener('click', () => openLabDetail(Number(card.getAttribute('data-lab-id'))));
      });
    } else {
      // admin: exactly one lab (or none if not yet assigned)
      listView.style.display = 'none';
      detailView.style.display = 'block';
      if (allLabs.length) {
        renderLabDetail(allLabs[0]);
      } else {
        document.getElementById('lab-detail-content').innerHTML =
          '<span class="text-muted">You are not yet assigned to a lab — ask a super admin to assign you one.</span>';
      }
    }
  } catch {
    cardsEl.innerHTML = '<span class="text-muted">Could not load labs — is the backend running?</span>';
  }
}

async function openLabDetail(labId) {
  try {
    const res = await fetch(`/api/labs/${labId}`, { credentials: 'same-origin' });
    if (!res.ok) return;
    currentLab = await res.json();
    document.getElementById('labs-list-view').style.display = 'none';
    document.getElementById('lab-detail-view').style.display = 'block';
    renderLabDetail(currentLab);
  } catch {}
}

function machineStateOptions(selected) {
  return MACHINE_STATES.map(s => `<option value="${s}" ${s === selected ? 'selected' : ''}>${s}</option>`).join('');
}

function renderLabDetail(lab) {
  currentLab = lab;
  const backBtn = currentUser.role === 'super_admin'
    ? '<button class="btn btn-secondary" id="btn-lab-back" style="margin-bottom:16px;">← Back to all labs</button>'
    : '';

  document.getElementById('lab-detail-content').innerHTML = `
    ${backBtn}
    <div class="panel-title">${lab.name}</div>
    <div class="panel-sub">${lab.address || 'No address on file'}</div>

    <div class="card section-block" style="margin-top:0;">
      <div class="card-header">Lab info</div>
      <div class="card-body">
        <div class="lab-info-grid">
          <div class="form-group"><label>Lab name</label><input type="text" id="lab-edit-name" value="${lab.name}"></div>
          <div class="form-group"><label>Address</label><input type="text" id="lab-edit-address" value="${lab.address || ''}"></div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <button class="btn btn-primary" id="btn-save-lab">Save changes</button>
          <span id="lab-save-status" class="text-muted" style="font-size:12.5px;"></span>
        </div>
      </div>
    </div>

    <div class="card section-block">
      <div class="card-header">Staff (${lab.staff.length})</div>
      <div class="card-body" style="padding:0;">
        <table class="data-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Phone</th></tr></thead>
          <tbody>${lab.staff.length ? lab.staff.map(s => `
            <tr><td>${s.name}</td><td class="text-muted">${s.email}</td><td><span class="tag">${s.role}</span></td><td class="text-muted">${s.phone || '—'}</td></tr>
          `).join('') : '<tr><td colspan="4" class="text-muted" style="padding:14px;">No staff assigned yet.</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div class="card section-block">
      <div class="card-header">Doctors assigned (${lab.doctors.length})</div>
      <div class="card-body" style="padding:0;">
        <table class="data-table">
          <thead><tr><th>Name</th><th>Email</th><th>Specialty</th><th>Phone</th></tr></thead>
          <tbody>${lab.doctors.length ? lab.doctors.map(d => `
            <tr><td>${d.name}</td><td class="text-muted">${d.email}</td><td class="text-muted">${d.specialty || '—'}</td><td class="text-muted">${d.phone || '—'}</td></tr>
          `).join('') : '<tr><td colspan="4" class="text-muted" style="padding:14px;">No doctors assigned yet.</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div class="card section-block">
      <div class="card-header">Machines (${lab.machines.length})</div>
      <div class="card-body">
        <div style="margin-bottom:14px;">${labStatusBarHTML(lab)}</div>
        <div id="machines-list">${lab.machines.length ? lab.machines.map(m => `
          <div class="machine-row" data-machine-id="${m.id}">
            <div><span class="mr-icon">${machineIcon(m.machine_type)}</span><span class="mr-name">${m.name}</span>${m.machine_type ? `<span class="mr-type">${m.machine_type}</span>` : ''}</div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="state-pill state-${m.state}">${m.state}</span>
              <select class="machine-state-select" data-machine-id="${m.id}">${machineStateOptions(m.state)}</select>
              <button class="btn btn-secondary btn-remove-machine" data-machine-id="${m.id}" style="font-size:11px;padding:4px 9px;">Remove</button>
            </div>
          </div>`).join('') : '<span class="text-muted">No machines on record yet.</span>'}
        </div>

        <div class="create-account-grid" style="margin-top:16px;">
          <div class="form-group"><label>Machine name</label><input type="text" id="new-machine-name" placeholder="e.g. Orbbec LiDAR Scanner"></div>
          <div class="form-group"><label>Type</label><input type="text" id="new-machine-type" placeholder="e.g. lidar"></div>
          <div class="form-group"><label>State</label>
            <select id="new-machine-state">${machineStateOptions('operational')}</select>
          </div>
        </div>
        <div class="text-muted" id="add-machine-status" style="min-height:16px;margin-top:8px;"></div>
        <button class="btn btn-primary" id="btn-add-machine" style="margin-top:6px;">Add machine</button>
      </div>
    </div>
  `;

  const back = document.getElementById('btn-lab-back');
  if (back) back.addEventListener('click', () => {
    document.getElementById('lab-detail-view').style.display = 'none';
    document.getElementById('labs-list-view').style.display = 'block';
    currentLab = null;
  });

  document.getElementById('btn-save-lab').addEventListener('click', () => saveLabInfo(lab.id));
  document.getElementById('btn-add-machine').addEventListener('click', () => addMachine(lab.id));

  document.querySelectorAll('.machine-state-select').forEach(sel => {
    sel.addEventListener('change', () => updateMachineState(Number(sel.getAttribute('data-machine-id')), sel.value, lab.id));
  });
  document.querySelectorAll('.btn-remove-machine').forEach(btn => {
    btn.addEventListener('click', () => removeMachine(Number(btn.getAttribute('data-machine-id')), lab.id));
  });
}

async function saveLabInfo(labId) {
  const btn = document.getElementById('btn-save-lab');
  const statusEl = document.getElementById('lab-save-status');
  const name = document.getElementById('lab-edit-name').value.trim();
  const address = document.getElementById('lab-edit-address').value.trim();
  if (!name) { statusEl.style.color = 'var(--red)'; statusEl.textContent = 'Lab name is required.'; return; }

  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const res = await fetch(`/api/labs/${labId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ name, address })
    });
    if (!res.ok) throw new Error((await res.json()).error || 'save failed');
    const updated = await res.json();
    statusEl.style.color = '#3fb950';
    statusEl.textContent = '✓ Saved.';
    renderLabDetail(updated);
  } catch (e) {
    statusEl.style.color = 'var(--red)';
    statusEl.textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save changes';
  }
}

async function addMachine(labId) {
  const btn = document.getElementById('btn-add-machine');
  const statusEl = document.getElementById('add-machine-status');
  const name = document.getElementById('new-machine-name').value.trim();
  const machine_type = document.getElementById('new-machine-type').value.trim();
  const state = document.getElementById('new-machine-state').value;
  if (!name) { statusEl.style.color = 'var(--red)'; statusEl.textContent = 'Machine name is required.'; return; }

  btn.disabled = true; btn.textContent = 'Adding…';
  try {
    const res = await fetch(`/api/labs/${labId}/machines`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ name, machine_type, state })
    });
    if (!res.ok) throw new Error((await res.json()).error || 'could not add machine');
    const labRes = await fetch(`/api/labs/${labId}`, { credentials: 'same-origin' });
    renderLabDetail(await labRes.json());
  } catch (e) {
    statusEl.style.color = 'var(--red)';
    statusEl.textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add machine';
  }
}

async function updateMachineState(machineId, state, labId) {
  try {
    const res = await fetch(`/api/labs/machines/${machineId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ state })
    });
    if (!res.ok) throw new Error((await res.json()).error || 'could not update machine');
    const labRes = await fetch(`/api/labs/${labId}`, { credentials: 'same-origin' });
    renderLabDetail(await labRes.json());
  } catch (e) {
    alert(e.message);
  }
}

async function removeMachine(machineId, labId) {
  try {
    const res = await fetch(`/api/labs/machines/${machineId}`, { method: 'DELETE', credentials: 'same-origin' });
    if (!res.ok) throw new Error((await res.json()).error || 'could not remove machine');
    const labRes = await fetch(`/api/labs/${labId}`, { credentials: 'same-origin' });
    renderLabDetail(await labRes.json());
  } catch (e) {
    alert(e.message);
  }
}

document.getElementById('btn-create-lab').addEventListener('click', async () => {
  const name    = document.getElementById('new-lab-name').value.trim();
  const address = document.getElementById('new-lab-address').value.trim();
  const statusEl = document.getElementById('create-lab-status');
  const btn = document.getElementById('btn-create-lab');
  if (!name) { statusEl.style.color = 'var(--red)'; statusEl.textContent = 'Lab name is required.'; return; }

  btn.disabled = true; btn.textContent = 'Creating…';
  try {
    const res = await fetch('/api/labs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ name, address })
    });
    if (!res.ok) throw new Error((await res.json()).error || 'could not create lab');
    document.getElementById('new-lab-name').value = '';
    document.getElementById('new-lab-address').value = '';
    statusEl.style.color = '#3fb950';
    statusEl.textContent = `${name} created.`;
    loadLabs();
    populateNewUserLabOptions();
  } catch (e) {
    statusEl.style.color = 'var(--red)';
    statusEl.textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create lab';
  }
});

async function populateNewUserLabOptions() {
  if (currentUser.role !== 'super_admin') return;
  try {
    const res = await fetch('/api/labs', { credentials: 'same-origin' });
    const labs = await res.json();
    const sel = document.getElementById('new-user-lab');
    sel.innerHTML = labs.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
  } catch {}
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB 2 — All Users
   ══════════════════════════════════════════════════════════════════════════ */
async function loadAllUsers() {
  const el = document.getElementById('users-body');
  el.innerHTML = '<tr><td colspan="9" class="text-muted" style="padding:14px;">Loading…</td></tr>';
  try {
    const res = await fetch('/api/admin/users-full', { credentials: 'same-origin' });
    allUsers = await res.json();

    if (!allUsers.length) {
      el.innerHTML = '<tr><td colspan="9" class="text-muted" style="padding:14px;">No users yet.</td></tr>';
      return;
    }

    el.innerHTML = allUsers.map(u => `
      <tr>
        <td>${u.name}</td>
        <td class="text-muted">${u.email}</td>
        <td><span class="tag">${u.role}</span></td>
        <td class="text-muted">${u.phone || '—'}</td>
        <td class="text-muted">${u.specialty || '—'}</td>
        <td class="text-muted">${u.clinic_name || '—'}</td>
        <td class="text-muted">${u.address || '—'}</td>
        <td class="text-muted">${u.pet_count != null ? u.pet_count : '—'}</td>
        <td class="text-muted">${new Date(u.created_at).toLocaleDateString()}</td>
      </tr>`).join('');
  } catch {
    el.innerHTML = '<tr><td colspan="9" class="text-muted" style="padding:14px;">Could not load.</td></tr>';
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB 3 — All Exams
   ══════════════════════════════════════════════════════════════════════════ */
async function loadAllExams() {
  const el = document.getElementById('exams-body');
  el.innerHTML = '<tr><td colspan="9" class="text-muted" style="padding:14px;">Loading…</td></tr>';
  try {
    const res = await fetch('/api/admin/exams-full', { credentials: 'same-origin' });
    allExams = await res.json();

    if (!allExams.length) {
      el.innerHTML = '<tr><td colspan="9" class="text-muted" style="padding:14px;">No exams yet.</td></tr>';
      return;
    }

    el.innerHTML = allExams.map(e => `
      <tr>
        <td class="text-muted">#${e.id}</td>
        <td>${e.pet ? `<span class="view-pet-link" data-pet-id="${e.pet.id}">${e.pet.name}</span>` : '—'}</td>
        <td class="text-muted">${e.pet ? e.pet.species : '—'}</td>
        <td class="text-muted">${e.pet && e.pet.owner_email ? e.pet.owner_email : '—'}</td>
        <td><span class="status-pill ${e.status === 'signed' ? 'status-200' : 'status-pending'}">● ${e.status === 'signed' ? 'Signed' : 'Awaiting'}</span></td>
        <td>${e.report.overall_health_score}/100</td>
        <td class="text-muted">${new Date(e.created_at).toLocaleString()}</td>
        <td class="text-muted">${e.signed_by_name || '—'}</td>
        <td class="text-muted">${e.signed_at ? new Date(e.signed_at).toLocaleString() : '—'}</td>
      </tr>`).join('');
    el.querySelectorAll('.view-pet-link').forEach(link =>
      link.addEventListener('click', () => openPatientModal(link.getAttribute('data-pet-id')))
    );
  } catch {
    el.innerHTML = '<tr><td colspan="9" class="text-muted" style="padding:14px;">Could not load.</td></tr>';
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Patient / owner detail modal (accessible from All Exams)
   ══════════════════════════════════════════════════════════════════════════ */
async function openPatientModal(petId) {
  const el = document.getElementById('patient-modal-content');
  el.innerHTML = '<span class="text-muted">Loading…</span>';
  document.getElementById('patient-modal-overlay').style.display = 'flex';

  try {
    const [petRes, examsRes] = await Promise.all([
      fetch(`/api/pets/${petId}`, { credentials: 'same-origin' }),
      fetch(`/api/exams/by-pet/${petId}`, { credentials: 'same-origin' })
    ]);
    const pet = await petRes.json();
    const exams = await examsRes.json();

    const ownerBlock = pet.owner
      ? (pet.owner.registered
          ? `<div class="oic-row"><b>Owner</b> ${pet.owner.name}</div>
             <div class="oic-row"><b>Email</b> ${pet.owner.email}</div>
             <div class="oic-row"><b>Phone</b> ${pet.owner.phone || '—'}</div>
             <div class="oic-row"><b>Address</b> ${pet.owner.address || '—'}</div>`
          : `<div class="oic-row"><b>Owner</b> Not yet registered on the portal</div>
             <div class="oic-row"><b>Intake email</b> ${pet.owner.email}</div>`)
      : `<div class="oic-row text-muted">No owner on file.</div>`;

    el.innerHTML = `
      <div class="panel-title" style="font-size:18px;">${pet.name}</div>
      <div class="panel-sub">${pet.species}${pet.breed ? ' · ' + pet.breed : ''}${pet.breed_group ? ' · ' + pet.breed_group : ''}${pet.breed_size ? ' · ' + pet.breed_size : ''}${pet.sex ? ' · ' + pet.sex : ''}${pet.age_years != null ? ' · ' + pet.age_years + ' yrs' : ''}${pet.weight_kg != null ? ' · ' + pet.weight_kg + ' kg' : ''}${pet.microchip ? ' · chip ' + pet.microchip : ''}</div>
      <div class="owner-info-card">${ownerBlock}</div>
      <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-dim);margin-bottom:10px;">
        Report History (${exams.length})
      </div>
      ${exams.length ? exams.map(e => `
        <div class="exam-history-row">
          <span>Score <b>${e.report.overall_health_score}</b>/100 ${e.assigned_vet_name ? '· sent to ' + e.assigned_vet_name : ''}</span>
          <span class="status-pill ${e.status === 'signed' ? 'status-200' : 'status-pending'}">● ${e.status === 'signed' ? 'Signed ' + new Date(e.signed_at).toLocaleDateString() : 'Awaiting review'}</span>
        </div>`).join('') : '<span class="text-muted">No reports on file yet.</span>'}
    `;
  } catch {
    el.innerHTML = '<span class="text-muted">Could not load patient record.</span>';
  }
}

document.getElementById('btn-patient-modal-close').addEventListener('click', () => {
  document.getElementById('patient-modal-overlay').style.display = 'none';
});

/* ══════════════════════════════════════════════════════════════════════════
   TAB 4 — Clinic Accounts (create vet/staff/admin)
   ══════════════════════════════════════════════════════════════════════════ */
async function loadClinicAccounts() {
  const el = document.getElementById('clinic-accounts-body');
  el.innerHTML = '<tr><td colspan="4" class="text-muted" style="padding:14px;">Loading…</td></tr>';
  try {
    const res = await fetch('/api/auth/users', { credentials: 'same-origin' });
    const users = await res.json();
    el.innerHTML = users.length
      ? users.map(u => `
          <tr>
            <td>${u.name}</td>
            <td class="text-muted">${u.email}</td>
            <td><span class="tag">${u.role}</span></td>
            <td class="text-muted">${new Date(u.created_at).toLocaleString()}</td>
          </tr>`).join('')
      : '<tr><td colspan="4" class="text-muted" style="padding:14px;">No clinic accounts yet.</td></tr>';
  } catch {
    el.innerHTML = '<tr><td colspan="4" class="text-muted" style="padding:14px;">Could not load.</td></tr>';
  }
}

document.getElementById('btn-create-user').addEventListener('click', async () => {
  const name     = document.getElementById('new-user-name').value.trim();
  const email    = document.getElementById('new-user-email').value.trim();
  const password = document.getElementById('new-user-password').value;
  const role     = document.getElementById('new-user-role').value;
  const statusEl = document.getElementById('create-user-status');
  const btn      = document.getElementById('btn-create-user');

  if (!name || !email || !password) {
    statusEl.style.color = 'var(--red)';
    statusEl.textContent = 'Name, email, and password are all required.';
    return;
  }

  btn.disabled = true; btn.textContent = 'Creating…';
  try {
    const labSel = document.getElementById('new-user-lab');
    const payload = { name, email, password, role };
    if (currentUser.role === 'super_admin' && labSel.value) payload.lab_id = Number(labSel.value);

    const res = await fetch('/api/auth/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error((await res.json()).error || 'could not create account');
    document.getElementById('new-user-name').value = '';
    document.getElementById('new-user-email').value = '';
    document.getElementById('new-user-password').value = '';
    statusEl.style.color = '#3fb950';
    statusEl.textContent = `${name} (${role}) created.`;
    loadClinicAccounts();
    loadOverview();
  } catch (e) {
    statusEl.style.color = 'var(--red)';
    statusEl.textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create account';
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   TAB 5 — Super Admin (change roles + platform stats)
   ══════════════════════════════════════════════════════════════════════════ */
async function loadSuperStats() {
  try {
    const res = await fetch('/api/admin/stats', { credentials: 'same-origin' });
    const s = await res.json();
    const totalUsers = Object.values(s.users_by_role).reduce((a, b) => a + b, 0);
    document.getElementById('super-total-users').textContent = totalUsers;
    document.getElementById('super-total-pets').textContent  = s.pet_count;
    document.getElementById('super-total-exams').textContent = s.exam_count;
  } catch {
    document.getElementById('super-total-users').textContent = '—';
    document.getElementById('super-total-pets').textContent  = '—';
    document.getElementById('super-total-exams').textContent = '—';
  }
}

document.getElementById('btn-change-role').addEventListener('click', async () => {
  const email    = document.getElementById('super-user-email').value.trim();
  const newRole  = document.getElementById('super-new-role').value;
  const statusEl = document.getElementById('super-role-status');
  const btn      = document.getElementById('btn-change-role');

  if (!email) {
    statusEl.style.color = 'var(--red)';
    statusEl.textContent = 'Enter a user email.';
    return;
  }

  btn.disabled = true; btn.textContent = 'Changing…';
  try {
    // Find user by email
    const usersRes = await fetch('/api/admin/users-full', { credentials: 'same-origin' });
    const users = await usersRes.json();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) throw new Error('User not found with that email.');

    // Change role
    const res = await fetch(`/api/auth/users/${user.id}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ role: newRole })
    });
    if (!res.ok) throw new Error((await res.json()).error || 'could not change role');

    document.getElementById('super-user-email').value = '';
    statusEl.style.color = '#3fb950';
    statusEl.textContent = `✓ ${user.name} is now ${newRole}.`;
    allUsers = []; // invalidate cache
    loadOverview();
  } catch (e) {
    statusEl.style.color = 'var(--red)';
    statusEl.textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Change role';
  }
});

/* ── Boot ──────────────────────────────────────────────────────────────── */
AuthGuard.requireRole('admin', 'super_admin').then(user => {
  if (!user) return;
  currentUser = user;
  AuthGuard.renderStrip(user, '#auth-strip-mount');

  // Show super-admin tab + admin option in create-account if super_admin
  if (user.role === 'super_admin') {
    document.getElementById('tab-btn-super').style.display = 'block';
    document.getElementById('opt-admin').style.display = 'block';
    document.getElementById('tab-btn-labs').textContent = 'Labs';
    document.getElementById('new-user-lab-group').style.display = 'block';
    populateNewUserLabOptions();
  } else {
    document.getElementById('tab-btn-labs').textContent = 'My Lab';
  }

  loadOverview();
});
