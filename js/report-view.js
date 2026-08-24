/**
 * js/report-view.js
 *
 * The fusion report renderer, lifted out of the wizard so the Vet and
 * Owner portals can render the exact same report card the staff flow
 * always has — same score ring, same system cards, same reasoning detail.
 * Pure function of the data it's given: nothing here reads page-global
 * state, so any page can drop it in as long as it has js/utils.js loaded
 * (for jsonHighlight) and css/report.css linked.
 *
 * renderReport(container, report, opts) — opts:
 *   editable          bool    — show a "Override risk level" control per system (vet, pre-sign only)
 *   onOverride        fn      — async (systemKey, level, reason) => void, called on override submit
 *   aiNarrativeHtml   string  — pre-rendered narrative HTML to show immediately (already-saved exam)
 *   fetchLiveNarrative bool   — POST /api/ai-narrative for a fresh summary (staff, pre-save only)
 *   signedBanner      object  — { vetName, signedAt, notes } | null
 *   correctionBanner  object  — { note, correctedAt } | null — shown when the
 *                               signing vet corrected this report after
 *                               release (see exams-api.js notify-correction)
 *   showRawJson       bool    — default true
 *   petPhotoUrl       string  — the pet's uploaded photo (e.g. /api/pets/{id}/photo),
 *                               if any — shown next to the score ring
 *   simplified        bool    — owner-facing view: plain-language labels, no
 *                               clinical jargon, instrument names, confidence
 *                               percentages or weighting maths (default false)
 */
const SYSTEM_LABELS = { skin: 'Skin', heart: 'Heart', musculoskeletal: 'Musculoskeletal', liver: 'Liver', kidneys: 'Kidneys', movement: 'Movement' };

/* Owner-facing equivalents. Staff and vets want the clinical term; an owner
   reading this at home is better served by the everyday one. */
const SYSTEM_LABELS_SIMPLE = {
  skin: 'Skin & Coat', heart: 'Heart', musculoskeletal: 'Bones & Joints',
  liver: 'Liver', kidneys: 'Kidneys', movement: 'Walking & Movement'
};
/* "Moderate Risk" reads as alarming out of clinical context; these say what
   the owner should actually do about it. */
const LEVEL_LABELS_SIMPLE = {
  'Low Risk': 'Looks healthy',
  'Moderate Risk': 'Worth keeping an eye on',
  'High Risk': 'Needs attention'
};

function riskClass(level) {
  return level === 'Low Risk' ? 'risk-low' : level === 'Moderate Risk' ? 'risk-moderate' : 'risk-high';
}

function levelLabel(level, simplified) {
  return simplified ? (LEVEL_LABELS_SIMPLE[level] || level) : level;
}

function scoreBand(score) {
  if (score >= 75) return 'Overall, things look good.';
  if (score >= 50) return 'Overall, a few things are worth watching.';
  return 'Overall, some findings need follow-up.';
}

function scoreColor(score) {
  return score >= 75 ? 'var(--accent-hover)' : score >= 50 ? 'var(--orange)' : 'var(--red)';
}

function reportHeroHTML(report, opts = {}) {
  const color = scoreColor(report.overall_health_score);
  const circumference = 2 * Math.PI * 42;
  const offset = circumference * (1 - report.overall_health_score / 100);
  // petPhotoUrl comes from the live pet record (opts, set by the caller),
  // not from the frozen report JSON — a photo uploaded after this exam was
  // generated should still show up when the report is viewed later.
  const photoHTML = opts.petPhotoUrl
    ? `<img class="report-hero-photo" src="${opts.petPhotoUrl}" alt="${report.patient.name || 'Patient'}">`
    : '';
  return `
    <div class="report-hero">
      ${photoHTML}
      <div class="score-ring">
        <svg viewBox="0 0 100 100">
          <circle class="score-ring-bg" cx="50" cy="50" r="42"></circle>
          <circle class="score-ring-fg" cx="50" cy="50" r="42" style="stroke:${color};stroke-dasharray:${circumference};stroke-dashoffset:${offset};"></circle>
        </svg>
        <span class="score-ring-value" style="color:${color}">${report.overall_health_score}</span>
      </div>
      <div class="meta">
        <h2>${report.patient.name || 'Patient'} · ${report.patient.species}${report.patient.breed ? ' · ' + report.patient.breed : ''}</h2>
        <p>${report.patient.age_years ?? '?'} yrs · ${report.patient.weight_kg ?? '?'} kg · Overall Health Score · Generated ${new Date(report.generated_at).toLocaleString()}</p>
      </div>
    </div>`;
}

function reportActionsHTML() {
  return `
    <div class="report-actions">
      <button type="button" class="btn btn-secondary" data-download-pdf>⬇ Download PDF</button>
    </div>`;
}

function signedBannerHTML(signed) {
  if (!signed) return '';
  return `
    <div class="signed-banner">
      <span class="signed-icon">✅</span>
      <span>Signed by <b>${signed.vetName}</b> on ${new Date(signed.signedAt).toLocaleString()}
        ${signed.notes ? `<span class="signed-notes">${signed.notes}</span>` : ''}
      </span>
    </div>`;
}

function correctionBannerHTML(correction) {
  if (!correction || !correction.note) return '';
  return `
    <div class="correction-banner">
      <span class="correction-icon">✏️</span>
      <span>This report was corrected on ${new Date(correction.correctedAt).toLocaleDateString()} after signing.
        <span class="correction-note">${correction.note}</span>
      </span>
    </div>`;
}

function overrideBlockHTML(key, system, editable) {
  if (system.vet_override) {
    return `<div class="sc-override-note"><b>Vet override:</b> ${system.vet_override.previous_level} → ${system.level} — ${system.vet_override.reason}</div>`;
  }
  if (!editable) return '';
  const options = ['Low Risk', 'Moderate Risk', 'High Risk']
    .map(l => `<option value="${l}" ${l === system.level ? 'selected' : ''}>${l}</option>`).join('');
  return `
    <button type="button" class="sc-override-toggle" data-override-toggle="${key}">Override risk level</button>
    <div class="sc-override-form" id="override-form-${key}">
      <select data-override-level="${key}">${options}</select>
      <textarea data-override-reason="${key}" placeholder="Reason for this override (required — recorded on the audit trail)"></textarea>
      <button type="button" data-override-submit="${key}">Save override</button>
    </div>`;
}

function reportSystemsHTML(report, opts) {
  const simple = !!opts.simplified;
  const labels = simple ? SYSTEM_LABELS_SIMPLE : SYSTEM_LABELS;
  return `<div class="system-grid">` + Object.entries(labels).map(([key, label]) => {
    const s = report.systems[key];
    if (!s) return '';

    // Owners get the headline finding and the plain-language explanation.
    // Instrument names, confidence percentages and per-signal weighting are
    // review tools for the clinic, not decision-useful for an owner — they
    // mainly invite misreading a number out of context.
    const detail = simple
      ? `<details class="sc-reasoning">
          <summary>What we looked at</summary>
          <p class="sc-why-text">${s.reasoning}</p>
        </details>`
      : `<div class="sc-confidence">Confidence ${s.confidence}% · ${s.modalities.join(', ')}</div>
        <details class="sc-reasoning">
          <summary>Clinical reasoning</summary>
          <div class="sc-section-label">Screened for</div>
          <ul class="result-bullets">${(s.screened_for || []).map(c => `<li>${c}</li>`).join('')}</ul>
          <div class="sc-section-label">Evidence</div>
          <ul class="result-bullets">${s.signals.map(sig => `<li>${sig.modality} — ${sig.note} <b>(${sig.contributionPct}% weight)</b></li>`).join('')}</ul>
          <div class="sc-section-label">Why this score</div>
          <p class="sc-why-text">${s.reasoning}</p>
        </details>`;

    return `
      <div class="system-card ${riskClass(s.level)}">
        <div class="sc-top">
          <span class="sc-name">${label}</span>
          <span class="risk-badge ${riskClass(s.level)}">${levelLabel(s.level, simple)}</span>
        </div>
        <div class="sc-finding">${report.key_findings[key] || ''}</div>
        ${detail}
        ${overrideBlockHTML(key, s, opts.editable)}
      </div>`;
  }).join('') + `</div>`;
}

/* Sets expectations before the owner reads any number: this was reviewed by
   a real vet, and the score is a screening summary rather than a diagnosis. */
function ownerIntroHTML(report) {
  return `
    <div class="owner-intro">
      <p><b>${scoreBand(report.overall_health_score)}</b> This is a summary of ${report.patient.name || 'your pet'}'s
      check-up, reviewed and signed off by your vet. Each card below covers one part of
      your pet's health.</p>
      <p class="owner-intro-note">The score is a general wellbeing indicator out of 100 — it is not a diagnosis.
      If anything here is unclear or worrying, your vet is the best person to ask.</p>
    </div>`;
}

function reportRecosHTML(report, opts = {}) {
  return `
    <div class="card-header" style="background:none;border:none;padding:0 0 10px;">${opts.simplified ? 'What happens next' : 'Recommendations'}</div>
    <ul class="reco-list">${report.recommendations.map(r => `<li>${r}</li>`).join('')}</ul>`;
}

function reportRawJsonHTML(report) {
  return `
    <details style="margin-top:24px;">
      <summary style="cursor:pointer;color:var(--text-muted);font-size:12px;">Raw Fusion JSON</summary>
      <pre class="code-block" style="margin-top:8px;border:1px solid var(--border);border-radius:var(--radius);height:auto;max-height:400px;">${jsonHighlight(report)}</pre>
    </details>`;
}

function aiSummaryHTML(opts) {
  if (opts.aiNarrativeHtml) {
    return `
      <div class="ai-summary-card ai-live" id="ai-summary-card">
        <div class="ai-summary-head"><span class="ai-badge">✦ AI</span> Clinical Summary</div>
        <div class="ai-summary-body" id="ai-summary-body">${opts.aiNarrativeHtml}</div>
      </div>`;
  }
  if (opts.fetchLiveNarrative) {
    return `
      <div class="ai-summary-card" id="ai-summary-card">
        <div class="ai-summary-head"><span class="ai-badge">✦ AI</span> Clinical Summary</div>
        <div class="ai-summary-body" id="ai-summary-body">
          <span class="text-muted">Synthesizing findings across all systems…</span>
        </div>
      </div>`;
  }
  return '';
}

/** Same live-generation path the wizard always used, generalized to any container. */
async function loadAiNarrativeInto(report) {
  const body = document.getElementById('ai-summary-body');
  const card = document.getElementById('ai-summary-card');
  try {
    const res = await fetch('/api/ai-narrative', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report)
    });
    if (!res.ok) throw new Error('unavailable');
    const data = await res.json();
    if (!body || !card) return; // user navigated away before this resolved

    if (data.narrative) {
      body.innerHTML = data.narrative.split('\n').filter(p => p.trim()).map(p => `<p>${p}</p>`).join('');
      card.classList.add('ai-live');
      return data.narrative;
    } else if (data.reason === 'no_api_key') {
      body.innerHTML = `<span class="text-muted">Backend is running but no <code>OPENAI_API_KEY</code> is set — showing the rule-based report only.</span>`;
    } else {
      body.innerHTML = `<span class="text-muted">AI summary unavailable (${data.message || data.reason || 'error'}) — showing the rule-based report only.</span>`;
    }
  } catch {
    if (card) card.style.display = 'none';
  }
  return null;
}

function wireOverrideControls(container, report, opts) {
  if (!opts.editable || !opts.onOverride) return;
  container.querySelectorAll('[data-override-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-override-toggle');
      document.getElementById(`override-form-${key}`).classList.toggle('open');
    });
  });
  container.querySelectorAll('[data-override-submit]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.getAttribute('data-override-submit');
      const level = container.querySelector(`[data-override-level="${key}"]`).value;
      const reason = container.querySelector(`[data-override-reason="${key}"]`).value.trim();
      if (!reason) { alert('A reason is required for the audit trail.'); return; }
      btn.disabled = true;
      btn.textContent = 'Saving…';
      try {
        await opts.onOverride(key, level, reason);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save override';
      }
    });
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   PDF export — opens a clean, self-contained, print-optimized document in
   a new tab and triggers the browser's print dialog ("Save as PDF" gives a
   real vector PDF, no extra library needed). Same underlying report data
   every role already sees on screen, so an owner's PDF is always the
   vet-signed version (they never have access to an unsigned exam), while
   staff/vet/admin can export any report state they can view, draft or
   signed, with full clinical detail either way.
   ═══════════════════════════════════════════════════════════════════════ */
function pdfRiskClass(level) {
  return level === 'Low Risk' ? 'risk-low' : level === 'Moderate Risk' ? 'risk-moderate' : 'risk-high';
}

function pdfSystemBlock(key, label, report, simplified) {
  const s = report.systems[key];
  if (!s) return '';
  const override = s.vet_override
    ? `<div class="pdf-override-note"><b>Vet override:</b> ${s.vet_override.previous_level} → ${s.level} — ${s.vet_override.reason}</div>`
    : '';
  // Owner-facing PDF mirrors the mailed report (server/lib/report-pdf.js):
  // plain-language risk label, headline finding + reasoning only — no
  // instrument names, confidence percentages or per-signal weighting.
  const detail = simplified
    ? `<div class="pdf-subhead">What we looked at</div>
       <p class="pdf-reasoning">${s.reasoning}</p>`
    : `<div class="pdf-subhead">Screened for</div>
       <ul class="pdf-list">${(s.screened_for || []).map(c => `<li>${c}</li>`).join('') || '<li>—</li>'}</ul>
       <div class="pdf-subhead">Evidence (confidence ${s.confidence}% · ${s.modalities.join(', ')})</div>
       <ul class="pdf-list">${s.signals.map(sig => `<li>${sig.modality} — ${sig.note} (${sig.contributionPct}% weight)</li>`).join('')}</ul>
       <div class="pdf-subhead">Clinical reasoning</div>
       <p class="pdf-reasoning">${s.reasoning}</p>`;
  return `
    <div class="pdf-system ${pdfRiskClass(s.level)}">
      <div class="pdf-system-top">
        <span class="pdf-system-name">${label}</span>
        <span class="pdf-risk-badge">${levelLabel(s.level, simplified)}</span>
      </div>
      <div class="pdf-finding">${report.key_findings[key] || ''}</div>
      ${detail}
      ${override}
    </div>`;
}

function buildReportPdfHtml(report, opts) {
  const p = report.patient || {};
  const simplified = !!opts.simplified;
  const generated = report.generated_at ? new Date(report.generated_at).toLocaleString() : '';
  const signed = opts.signedBanner;
  const signedBlock = signed ? `
    <div class="pdf-signed-banner">
      ✅ Signed by <b>${signed.vetName}</b> on ${new Date(signed.signedAt).toLocaleString()}
      ${signed.notes ? `<div style="margin-top:4px;">${signed.notes}</div>` : ''}
    </div>` : `
    <div class="pdf-draft-banner">This copy is a pre-review draft — it has not yet been signed by a vet.</div>`;
  const aiBlock = opts.aiNarrativeHtml ? `
    <div class="pdf-section-title">${simplified ? 'Summary' : 'AI Clinical Summary'}</div>
    <div class="pdf-ai">${opts.aiNarrativeHtml}</div>` : '';
  // Same disclaimer wording as the mailed PDF (server/lib/report-pdf.js) —
  // sets expectations before the owner reads any number.
  const disclaimerBlock = simplified ? `
    <p style="font-size:11px;color:#8798a1;margin:-10px 0 20px;">This is a wellbeing indicator, not a diagnosis.
      If anything here is unclear or worrying, your vet is the best person to ask.</p>` : '';
  const photoBlock = opts.petPhotoUrl
    ? `<img src="${opts.petPhotoUrl}" alt="" style="width:64px;height:64px;border-radius:10px;object-fit:cover;border:1px solid #d8e5e2;margin-left:auto;">` : '';

  const labels = simplified ? SYSTEM_LABELS_SIMPLE : SYSTEM_LABELS;
  const systems = Object.entries(labels).map(([key, label]) => pdfSystemBlock(key, label, report, simplified)).join('');
  const recos = (report.recommendations || []).map(r => `<li>${r}</li>`).join('');

  return `<!doctype html>
<html><head><meta charset="utf-8">
<title>Vitarus Report — ${p.name || 'Patient'}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", sans-serif; color: #1a2230; background: #fff; margin: 0; padding: 40px 46px; }
  .pdf-header { display: flex; align-items: center; gap: 16px; border-bottom: 3px solid #0a2f4e; padding-bottom: 16px; margin-bottom: 22px; }
  .pdf-header img { height: 54px; }
  .pdf-brand-name { font-size: 22px; font-weight: 800; color: #0a2f4e; letter-spacing: .3px; }
  .pdf-brand-sub { font-size: 11px; color: #6b7686; letter-spacing: .5px; text-transform: uppercase; margin-top: 2px; }
  .pdf-meta-row { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px 24px; margin-bottom: 20px; font-size: 12.5px; color: #40495a; }
  .pdf-score-block { display: flex; align-items: center; gap: 22px; background: #f3f7f9; border: 1px solid #dde3e8; border-radius: 10px; padding: 18px 22px; margin-bottom: 22px; }
  .pdf-score-value { font-size: 44px; font-weight: 800; color: #0a2f4e; }
  .pdf-score-label { font-size: 12px; color: #6b7686; }
  .pdf-signed-banner { background: #eafaf3; border: 1px solid #b7e4cc; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 12.5px; color: #1c6b41; }
  .pdf-draft-banner { background: #fdf2df; border: 1px solid #f0dca0; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 12.5px; color: #8a5c10; }
  .pdf-section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: #0a2f4e; border-bottom: 2px solid #e2e8ee; padding-bottom: 6px; margin: 26px 0 14px; }
  .pdf-ai { font-size: 12.5px; line-height: 1.6; color: #333; background: #f8fafb; border: 1px solid #e2e8ee; border-radius: 8px; padding: 14px 16px; }
  .pdf-system { border: 1px solid #dde3e8; border-radius: 8px; padding: 14px 16px; margin-bottom: 12px; page-break-inside: avoid; border-left: 5px solid #ccc; }
  .pdf-system.risk-low { border-left-color: #2e9e5b; }
  .pdf-system.risk-moderate { border-left-color: #c98a1f; }
  .pdf-system.risk-high { border-left-color: #c2372e; }
  .pdf-system-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .pdf-system-name { font-weight: 700; font-size: 14px; }
  .pdf-risk-badge { font-size: 10.5px; font-weight: 700; padding: 3px 10px; border-radius: 10px; background: #eee; }
  .risk-low .pdf-risk-badge { background: #e4f7ec; color: #1c6b41; }
  .risk-moderate .pdf-risk-badge { background: #fdf2df; color: #8a5c10; }
  .risk-high .pdf-risk-badge { background: #fbe8e6; color: #9c2b23; }
  .pdf-finding { font-size: 12.5px; margin-bottom: 8px; }
  .pdf-subhead { font-size: 10.5px; font-weight: 700; text-transform: uppercase; color: #7a8593; margin: 8px 0 4px; }
  .pdf-list { margin: 0 0 6px 18px; padding: 0; font-size: 11.5px; color: #333; }
  .pdf-reasoning { font-size: 11.5px; color: #333; line-height: 1.55; margin: 0; }
  .pdf-override-note { margin-top: 8px; font-size: 11px; background: #fff7e0; border: 1px solid #f0dca0; border-radius: 6px; padding: 8px 10px; color: #6b5000; }
  .pdf-recos { font-size: 12.5px; margin: 0 0 0 18px; color: #333; }
  .pdf-footer { margin-top: 32px; padding-top: 14px; border-top: 1px solid #e2e8ee; font-size: 10px; color: #99a2b0; }
  @page { margin: 16mm 15mm; }
  @media print { a { color: inherit; text-decoration: none; } }
</style></head>
<body>
  <div class="pdf-header">
    <img src="/assets/brand/logo-icon.png" alt="Vitarus">
    <div>
      <div class="pdf-brand-name">Vitarus</div>
      <div class="pdf-brand-sub">Multi-Modal Veterinary Diagnostic Report</div>
    </div>
    ${photoBlock}
  </div>

  <div class="pdf-meta-row">
    <div><b>${p.name || 'Patient'}</b> · ${p.species || ''}${p.breed ? ' · ' + p.breed : ''}${p.age_years != null ? ' · ' + p.age_years + ' yrs' : ''}${p.weight_kg != null ? ' · ' + p.weight_kg + ' kg' : ''}</div>
    <div>Generated ${generated}</div>
  </div>

  <div class="pdf-score-block">
    <div class="pdf-score-value">${report.overall_health_score}</div>
    <div class="pdf-score-label">Overall Health Score<br>/100</div>
  </div>
  ${disclaimerBlock}

  ${signedBlock}
  ${aiBlock}

  <div class="pdf-section-title">${simplified ? 'By System' : 'Per-System Findings'}</div>
  ${systems}

  <div class="pdf-section-title">${simplified ? 'What Happens Next' : 'Recommendations'}</div>
  <ul class="pdf-recos">${recos}</ul>

  <div class="pdf-footer">
    Vitarus · Multi-Modal Veterinary Diagnostic Platform — this report was generated from six non-sedated
    diagnostic instruments and, where signed above, reviewed and released by a licensed veterinarian.
  </div>

  <script>
    window.onload = function () {
      window.focus();
      setTimeout(function () { window.print(); }, 150);
    };
  </script>
</body></html>`;
}

function downloadReportPDF(report, opts) {
  const win = window.open('', '_blank');
  if (!win) { alert('Please allow pop-ups to download the PDF.'); return; }
  win.document.open();
  win.document.write(buildReportPdfHtml(report, opts));
  win.document.close();
}

function renderReport(container, report, opts = {}) {
  const showRawJson = opts.showRawJson !== false;
  container.innerHTML =
    reportActionsHTML() +
    reportHeroHTML(report, opts) +
    signedBannerHTML(opts.signedBanner) +
    correctionBannerHTML(opts.correctionBanner) +
    (opts.simplified ? ownerIntroHTML(report) : '') +
    aiSummaryHTML(opts) +
    reportSystemsHTML(report, opts) +
    reportRecosHTML(report, opts) +
    (showRawJson ? reportRawJsonHTML(report) : '');

  wireOverrideControls(container, report, opts);
  wireReportActions(container, report, opts);
  if (opts.fetchLiveNarrative) loadAiNarrativeInto(report);
}

function wireReportActions(container, report, opts) {
  const btn = container.querySelector('[data-download-pdf]');
  if (!btn) return;
  btn.addEventListener('click', () => downloadReportPDF(report, opts));
}
