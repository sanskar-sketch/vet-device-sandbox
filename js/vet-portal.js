/* js/vet-portal.js — logic for vet/index.html */
/* SYSTEM_LABELS, riskClass(), scoreColor() come from report-view.js, loaded first. */

/* ── Shared helpers ────────────────────────────────────────────────────── */
// Only these breed keys have a real illustration under /assets/breeds/ — the
// 220 breeds added later from js/breed-directory.js don't, so anything else
// falls back to the paw icon instead of a broken <img>.
const BREED_CUSTOM_ART_KEYS = new Set([
  "labrador", "golden_retriever", "german_shepherd", "beagle", "poodle",
  "siamese", "persian", "maine_coon", "ragdoll", "british_shorthair"
]);
function petThumb(pet, size) {
  size = size || 44;
  return pet && pet.breed_key && BREED_CUSTOM_ART_KEYS.has(pet.breed_key)
    ? `<img class="phc-thumb" style="width:${size}px;height:${size}px;" src="/assets/breeds/${pet.breed_key}.webp" alt="${pet.name}">`
    : `<div class="phc-fallback" style="width:${size}px;height:${size}px;">🐾</div>`;
}
function petBreedMeta(pet) {
  return `${pet.breed ? ' · ' + pet.breed : ''}${pet.breed_group ? ' · ' + pet.breed_group : ''}${pet.breed_size ? ' · ' + pet.breed_size : ''}`;
}

/* ── State ─────────────────────────────────────────────────────────────── */
let currentUser   = null;
let currentExam   = null;     // exam open in the review/sign view
let historyPets   = [];       // distinct pets with signed exams
let historyExams  = [];       // all signed exams (loaded once)
let activePet     = null;     // pet open in per-patient view
let checkedIds    = [];       // up to 2 exam IDs for comparison

/* ── Tab switching ─────────────────────────────────────────────────────── */
const TABS = ['queue', 'history', 'profile'];
function showTab(name) {
  TABS.forEach(t => {
    document.getElementById('tab-' + t).style.display = t === name ? 'block' : 'none';
    document.querySelector(`.tab-btn[data-tab="${t}"]`).classList.toggle('active', t === name);
  });
}
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.getAttribute('data-tab');
    showTab(tab);
    if (tab === 'history') loadHistory();
    if (tab === 'profile' && currentUser) populateProfile(currentUser);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   TAB 1 — Pending Review queue
   ══════════════════════════════════════════════════════════════════════════ */
function showQueueView(id) {
  ['view-queue','view-exam'].forEach(v =>
    document.getElementById(v).style.display = v === id ? 'block' : 'none');
}

async function loadQueue() {
  const el = document.getElementById('queue-list');
  const badge = document.getElementById('queue-badge');
  el.innerHTML = '<span class="text-muted">Loading…</span>';
  try {
    const res = await fetch('/api/exams?status=awaiting_review', { credentials: 'same-origin' });
    const exams = await res.json();

    if (exams.length) {
      badge.textContent = exams.length;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }

    if (!exams.length) {
      el.innerHTML = '<span class="text-muted">Nothing pending — the queue is clear.</span>';
      return;
    }
    el.innerHTML = exams.map(e => `
      <div class="queue-item" data-exam-id="${e.id}">
        <div>
          <div class="qi-name">${e.pet ? e.pet.name : 'Unknown'}
            <span class="text-muted">· ${e.pet ? e.pet.species : ''}${e.pet && e.pet.breed ? ' · ' + e.pet.breed : ''}</span>
          </div>
          <div class="qi-meta">Overall score ${e.report.overall_health_score}/100 · submitted ${new Date(e.created_at).toLocaleString()}
            ${e.assigned_vet_name ? ' · <span style="color:var(--blue-light);">Sent to you for review</span>' : ' · <span class="text-dim">Unassigned — open queue</span>'}
          </div>
        </div>
        <span class="status-pill status-pending">● Awaiting review</span>
      </div>`).join('');
    el.querySelectorAll('.queue-item').forEach(item =>
      item.addEventListener('click', () => openExamForReview(item.getAttribute('data-exam-id')))
    );
  } catch {
    el.innerHTML = '<span class="text-muted">Could not load the queue — is the backend running?</span>';
  }
}

async function openExamForReview(id) {
  const res = await fetch('/api/exams/' + id, { credentials: 'same-origin' });
  if (!res.ok) return;
  currentExam = await res.json();
  renderExamDetail();
  showQueueView('view-exam');
  window.scrollTo({ top: 0 });
}

function renderExamDetail() {
  const container = document.getElementById('exam-report-content');
  const signPanel = document.getElementById('sign-panel');
  renderReport(container, currentExam.report, {
    editable: currentExam.status === 'awaiting_review',
    signedBanner: currentExam.status === 'signed'
      ? { vetName: currentExam.signed_by_name || (currentUser && currentUser.name), signedAt: currentExam.signed_at, notes: currentExam.vet_notes }
      : null,
    aiNarrativeHtml: currentExam.ai_narrative
      ? currentExam.ai_narrative.split('\n').filter(p => p.trim()).map(p => '<p>' + p + '</p>').join('')
      : null,
    onOverride: async (systemKey, level, reason) => {
      const r = await fetch('/api/exams/' + currentExam.id + '/override', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ system_key: systemKey, level, reason })
      });
      if (!r.ok) { alert((await r.json()).error || 'Override failed'); return; }
      currentExam = await r.json();
      renderExamDetail();
    }
  });
  signPanel.style.display = currentExam.status === 'awaiting_review' ? 'flex' : 'none';
  document.getElementById('sign-status').textContent = '';
  document.getElementById('vet-notes').value = '';
}

document.getElementById('btn-back-to-queue').addEventListener('click', () => {
  showQueueView('view-queue');
  currentExam = null;
  loadQueue();
});

document.getElementById('btn-sign').addEventListener('click', async () => {
  if (!currentExam) return;
  const btn = document.getElementById('btn-sign');
  const statusEl = document.getElementById('sign-status');
  btn.disabled = true; btn.textContent = 'Signing…';
  try {
    const res = await fetch('/api/exams/' + currentExam.id + '/sign', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ vet_notes: document.getElementById('vet-notes').value.trim() })
    });
    if (!res.ok) throw new Error((await res.json()).error || 'sign failed');
    statusEl.style.color = '#3fb950';
    statusEl.textContent = '✓ Signed and released to the owner.';
    btn.textContent = 'Signed ✓';
    currentExam = await res.json();
    renderExamDetail();
    loadQueue();
  } catch (e) {
    statusEl.style.color = 'var(--red)';
    statusEl.textContent = 'Could not sign: ' + e.message;
    btn.disabled = false; btn.textContent = 'Sign & Release to Owner';
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   TAB 2 — Patient History (signed exams, per-patient, with comparison)
   ══════════════════════════════════════════════════════════════════════════ */
const HIST_VIEWS = ['view-patients','view-pet-exams','view-history-report','view-history-compare'];
function showHistView(id) {
  HIST_VIEWS.forEach(v =>
    document.getElementById(v).style.display = v === id ? 'block' : 'none');
  window.scrollTo({ top: 0 });
}

async function loadHistory() {
  const el = document.getElementById('patient-list');
  el.innerHTML = '<span class="text-muted">Loading…</span>';
  try {
    // Fetch all signed exams
    const res = await fetch('/api/exams?status=signed', { credentials: 'same-origin' });
    historyExams = await res.json();

    // Deduplicate pets
    const petMap = new Map();
    historyExams.forEach(e => {
      if (e.pet && !petMap.has(e.pet.id)) petMap.set(e.pet.id, e.pet);
    });
    historyPets = Array.from(petMap.values());

    if (!historyPets.length) {
      el.innerHTML = '<span class="text-muted">No signed exams yet.</span>';
      return;
    }

    el.innerHTML = historyPets.map(pet => {
      const count = historyExams.filter(e => e.pet_id === pet.id).length;
      return `
        <div class="pet-history-card" data-pet-id="${pet.id}">
          ${petThumb(pet)}
          <div style="flex:1;">
            <div class="phc-name">${pet.name}</div>
            <div class="phc-meta">${pet.species}${petBreedMeta(pet)}
              ${pet.age_years != null ? ' · ' + pet.age_years + ' yrs' : ''}
              ${pet.weight_kg  != null ? ' · ' + pet.weight_kg  + ' kg' : ''}
            </div>
            <div style="font-size:11.5px;color:var(--blue-light);margin-top:3px;">${count} signed report${count !== 1 ? 's' : ''}</div>
          </div>
          <div class="phc-right">›</div>
        </div>`;
    }).join('');

    el.querySelectorAll('.pet-history-card').forEach(card =>
      card.addEventListener('click', () => {
        const pet = historyPets.find(p => String(p.id) === card.getAttribute('data-pet-id'));
        openPetHistory(pet);
      })
    );
  } catch {
    el.innerHTML = '<span class="text-muted">Could not load — is the backend running?</span>';
  }
}

function openPetHistory(pet) {
  activePet  = pet;
  checkedIds = [];
  const petExams = historyExams.filter(e => e.pet_id === pet.id);

  // Banner
  document.getElementById('pet-exams-banner').innerHTML = `
    <div class="detail-pet-banner">
      ${petThumb(pet)}
      <div>
        <div class="dpb-name">${pet.name}</div>
        <div class="dpb-meta">${pet.species}${petBreedMeta(pet)}
          ${pet.age_years != null ? ' · ' + pet.age_years + ' yrs' : ''}
          ${pet.weight_kg  != null ? ' · ' + pet.weight_kg  + ' kg' : ''}
        </div>
      </div>
    </div>
    <div class="owner-info-card" id="pet-owner-info"><span class="text-muted">Loading owner details…</span></div>`;

  loadPetOwnerInfo(pet.id);

  document.getElementById('pet-exams-label').textContent =
    petExams.length === 1 ? '1 Signed Report' : petExams.length + ' Signed Reports';

  renderPetExamList(petExams);
  updateVetCompareBar();
  showHistView('view-pet-exams');
}

async function loadPetOwnerInfo(petId) {
  const el = document.getElementById('pet-owner-info');
  try {
    const res = await fetch(`/api/pets/${petId}`, { credentials: 'same-origin' });
    const pet = await res.json();
    if (!el) return;
    if (!pet.owner) { el.innerHTML = '<div class="oic-row text-muted">No owner on file.</div>'; return; }
    el.innerHTML = pet.owner.registered
      ? `<div class="oic-row"><b>Owner</b> ${pet.owner.name}</div>
         <div class="oic-row"><b>Email</b> ${pet.owner.email}</div>
         <div class="oic-row"><b>Phone</b> ${pet.owner.phone || '—'}</div>
         <div class="oic-row"><b>Address</b> ${pet.owner.address || '—'}</div>`
      : `<div class="oic-row"><b>Owner</b> Not yet registered on the portal</div>
         <div class="oic-row"><b>Intake email</b> ${pet.owner.email}</div>`;
  } catch {
    if (el) el.innerHTML = '<div class="oic-row text-muted">Could not load owner details.</div>';
  }
}

function renderPetExamList(petExams) {
  const el = document.getElementById('pet-exams-list');
  const canCompare = petExams.length >= 2;

  el.innerHTML = petExams.map(e => {
    const score = e.report.overall_health_score;
    const checked = checkedIds.includes(e.id);
    return `
      <div class="detail-exam-row" data-exam-id="${e.id}">
        <div class="der-left">
          ${canCompare ? `<input type="checkbox" class="der-checkbox" data-check-id="${e.id}" ${checked ? 'checked' : ''} title="Select to compare">` : ''}
          <div class="der-score" style="color:${scoreColor(score)}">${score}</div>
          <div class="der-meta">
            <span style="font-size:13px;font-weight:600;">Overall score /100</span>
            <span class="der-date">Signed ${new Date(e.signed_at).toLocaleDateString()}</span>
            ${e.signed_by_name ? `<span class="der-vet">By ${e.signed_by_name}</span>` : ''}
            <span class="der-vet" style="color:${e.status==='signed'?'#3fb950':'var(--orange)'}">● ${e.status === 'signed' ? 'Signed' : 'Awaiting review'}</span>
          </div>
        </div>
        <button class="btn btn-secondary btn-view-hist" data-exam-id="${e.id}" style="font-size:12px;padding:5px 12px;">View report</button>
      </div>`;
  }).join('');

  el.querySelectorAll('.btn-view-hist').forEach(btn =>
    btn.addEventListener('click', ev => {
      ev.stopPropagation();
      openHistoryReport(btn.getAttribute('data-exam-id'));
    })
  );

  if (canCompare) {
    el.querySelectorAll('.der-checkbox').forEach(cb =>
      cb.addEventListener('change', () => {
        const id = Number(cb.getAttribute('data-check-id'));
        if (cb.checked) {
          if (checkedIds.length >= 2) { cb.checked = false; return; }
          checkedIds.push(id);
        } else {
          checkedIds = checkedIds.filter(x => x !== id);
        }
        updateVetCompareBar();
      })
    );
  }
}

function updateVetCompareBar() {
  const bar  = document.getElementById('vet-compare-bar');
  const hint = document.getElementById('vet-compare-hint');
  const n = checkedIds.length;
  if (n === 0) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  document.getElementById('btn-vet-compare-go').disabled = n < 2;
  hint.innerHTML = n === 1
    ? '<b>1</b> selected — select one more to compare'
    : '<b>2</b> reports selected';
}

function openHistoryReport(id) {
  const exam = historyExams.find(e => String(e.id) === String(id));
  if (!exam) return;
  const container = document.getElementById('history-report-content');
  renderReport(container, exam.report, {
    editable: false,
    signedBanner: exam.status === 'signed'
      ? { vetName: exam.signed_by_name || '', signedAt: exam.signed_at, notes: exam.vet_notes }
      : null,
    aiNarrativeHtml: exam.ai_narrative
      ? exam.ai_narrative.split('\n').filter(p => p.trim()).map(p => '<p>' + p + '</p>').join('')
      : null,
    showRawJson: false
  });
  showHistView('view-history-report');
}

/* ── Comparison view ───────────────────────────────────────────────────── */
function openComparison(idA, idB) {
  const examA = historyExams.find(e => e.id === idA);
  const examB = historyExams.find(e => e.id === idB);
  if (!examA || !examB) return;

  const [older, newer] = new Date(examA.signed_at || examA.created_at) <= new Date(examB.signed_at || examB.created_at)
    ? [examA, examB] : [examB, examA];

  const scoreDelta = newer.report.overall_health_score - older.report.overall_health_score;
  const dClass = scoreDelta > 0 ? 'pos' : scoreDelta < 0 ? 'neg' : 'neu';
  const dLabel = scoreDelta > 0 ? '▲ +' + scoreDelta : scoreDelta < 0 ? '▼ ' + scoreDelta : '— no change';

  const headers = `
    <div class="compare-header-grid">
      <div class="compare-col-header">
        <div class="cch-label">Earlier exam</div>
        <div class="cch-score" style="color:${scoreColor(older.report.overall_health_score)}">${older.report.overall_health_score}<span style="font-size:16px;color:var(--text-dim);font-weight:400;"> /100</span></div>
        <div class="cch-date">${new Date(older.signed_at || older.created_at).toLocaleDateString()}</div>
        ${older.signed_by_name ? '<div class="cch-vet">By ' + older.signed_by_name + '</div>' : ''}
        <div class="cch-vet" style="color:${older.status==='signed'?'#3fb950':'var(--orange)'}">● ${older.status === 'signed' ? 'Signed' : 'Awaiting review'}</div>
      </div>
      <div class="compare-col-header">
        <div class="cch-label">Later exam</div>
        <div class="cch-score" style="color:${scoreColor(newer.report.overall_health_score)}">${newer.report.overall_health_score}<span style="font-size:16px;color:var(--text-dim);font-weight:400;"> /100</span></div>
        <div class="cch-date">${new Date(newer.signed_at || newer.created_at).toLocaleDateString()}</div>
        ${newer.signed_by_name ? '<div class="cch-vet">By ' + newer.signed_by_name + '</div>' : ''}
        <div class="cch-vet" style="color:${newer.status==='signed'?'#3fb950':'var(--orange)'}">● ${newer.status === 'signed' ? 'Signed' : 'Awaiting review'}</div>
        <div class="compare-score-delta ${dClass}">${dLabel}</div>
      </div>
    </div>`;

  const levels = ['Low Risk', 'Moderate Risk', 'High Risk'];

  const olderRows = Object.entries(SYSTEM_LABELS).map(([key, label]) => {
    const s = older.report.systems[key]; if (!s) return '';
    return `<div class="compare-row ${riskClass(s.level)}">
      <div class="cr-top"><span class="cr-name">${label}</span><span class="risk-badge ${riskClass(s.level)}">${s.level}</span></div>
      <div class="cr-finding">${older.report.key_findings[key] || ''}</div>
      <div class="cr-confidence">Confidence ${s.confidence}%</div>
    </div>`;
  }).join('');

  const newerRows = Object.entries(SYSTEM_LABELS).map(([key, label]) => {
    const sN = newer.report.systems[key]; if (!sN) return '';
    const sO = older.report.systems[key];
    let delta = '';
    if (sO) {
      const diff = levels.indexOf(sN.level) - levels.indexOf(sO.level);
      if (diff < 0) delta = '<span class="delta-badge delta-better">▲ improved</span>';
      else if (diff > 0) delta = '<span class="delta-badge delta-worse">▼ worsened</span>';
    }
    return `<div class="compare-row ${riskClass(sN.level)}">
      <div class="cr-top"><span class="cr-name">${label}${delta}</span><span class="risk-badge ${riskClass(sN.level)}">${sN.level}</span></div>
      <div class="cr-finding">${newer.report.key_findings[key] || ''}</div>
      <div class="cr-confidence">Confidence ${sN.confidence}%</div>
    </div>`;
  }).join('');

  document.getElementById('history-compare-content').innerHTML = `
    <div style="margin-bottom:12px;">
      <div class="panel-title" style="font-size:18px;">${activePet ? activePet.name + ' · ' : ''}Report Comparison</div>
      <div class="panel-sub">Older exam on the left, newer on the right. Improved / worsened badges show risk-level changes.</div>
    </div>
    ${headers}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">
      <div class="detail-section-title">Earlier exam</div>
      <div class="detail-section-title">Later exam</div>
    </div>
    <div class="compare-systems-grid">
      <div class="compare-system-col">${olderRows}</div>
      <div class="compare-system-col">${newerRows}</div>
    </div>`;

  showHistView('view-history-compare');
}

/* ── History navigation wiring ─────────────────────────────────────────── */
document.getElementById('btn-back-to-patients').addEventListener('click', () => {
  activePet  = null;
  checkedIds = [];
  showHistView('view-patients');
});
document.getElementById('btn-back-to-pet-exams').addEventListener('click', () => showHistView('view-pet-exams'));
document.getElementById('btn-back-from-compare').addEventListener('click', () => showHistView('view-pet-exams'));

document.getElementById('btn-vet-compare-clear').addEventListener('click', () => {
  checkedIds = [];
  const petExams = historyExams.filter(e => e.pet_id === activePet.id);
  renderPetExamList(petExams);
  updateVetCompareBar();
});
document.getElementById('btn-vet-compare-go').addEventListener('click', () => {
  if (checkedIds.length === 2) openComparison(checkedIds[0], checkedIds[1]);
});

/* ══════════════════════════════════════════════════════════════════════════
   TAB 3 — My Profile
   ══════════════════════════════════════════════════════════════════════════ */
function populateProfile(user) {
  document.getElementById('prof-name').value     = user.name        || '';
  document.getElementById('prof-email').value    = user.email       || '';
  document.getElementById('prof-phone').value    = user.phone       || '';
  document.getElementById('prof-specialty').value= user.specialty   || '';
  document.getElementById('prof-clinic').value   = user.clinic_name || '';
  document.getElementById('profile-status').textContent = '';
}

document.getElementById('btn-save-profile').addEventListener('click', async () => {
  const btn      = document.getElementById('btn-save-profile');
  const statusEl = document.getElementById('profile-status');
  const payload  = {
    name:        document.getElementById('prof-name').value.trim(),
    phone:       document.getElementById('prof-phone').value.trim(),
    specialty:   document.getElementById('prof-specialty').value.trim(),
    clinic_name: document.getElementById('prof-clinic').value.trim(),
  };
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const res = await fetch('/api/auth/profile', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error((await res.json()).error || 'save failed');
    const updated = await res.json();
    currentUser = updated;
    statusEl.style.color = '#3fb950';
    statusEl.textContent = '✓ Profile saved.';
  } catch (e) {
    statusEl.style.color = 'var(--red)';
    statusEl.textContent = e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Save changes';
  }
});

/* ── Boot ──────────────────────────────────────────────────────────────── */
AuthGuard.requireRole('vet').then(user => {
  if (!user) return;
  currentUser = user;
  AuthGuard.renderStrip(user, '#auth-strip-mount');
  loadQueue();
});
