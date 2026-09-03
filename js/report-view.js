/**
 * js/report-view.js
 *
 * The fusion report renderer, lifted out of the wizard so the Vet and
 * Owner portals can render the exact same report card the staff flow
 * always has — same score ring, same system cards, same reasoning detail.
 * Pure function of the data it's given: nothing here reads page-global
 * state, so any page can drop it in as long as it has js/utils.js loaded
 * (for jsonHighlight) and css/report.css linked. The owner-facing
 * (simplified) path additionally uses js/vet-knowledge-base.js's
 * getReferenceRanges for the weight/breed data-quality check — guarded so
 * a page that doesn't load it (the vet portal never renders simplified)
 * just skips that one check instead of throwing.
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
 *   showRawJson       bool    — default true (clinical view only — the owner
 *                               path never shows it, simplified or not)
 *   petPhotoUrl       string  — the pet's uploaded photo (e.g. /api/pets/{id}/photo),
 *                               if any — shown next to the score ring
 *   simplified        bool    — owner-facing view: leads with the single
 *                               biggest concern and what to do about it,
 *                               plain-language labels, structured metric
 *                               tables instead of prose, confidence badges
 *                               instead of raw percentages, urgency-grouped
 *                               action plan (default false — clinical view)
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
const STATUS_ICON = { 'Low Risk': '🟢', 'Moderate Risk': '🟡', 'High Risk': '🔴' };

/* Recommendations changed shape from plain strings to {text, system,
   urgency} (see js/fusion-engine.js buildRecommendations) so "what happens
   next" can be grouped by urgency — but exams signed before that change
   still have the old string[] frozen in their stored report_json, so every
   read site normalizes through these two rather than assuming the new shape. */
function recoText(r) { return typeof r === 'string' ? r : r.text; }
function recoUrgency(r) { return typeof r === 'string' ? null : r.urgency; }

const URGENCY_META = {
  today:   { label: 'Today',           icon: '🔴', cls: 'urgency-today' },
  soon:    { label: 'Follow up soon',  icon: '🟠', cls: 'urgency-soon' },
  routine: { label: 'Routine',         icon: '🟢', cls: 'urgency-routine' }
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

/* Confidence % → a plain label instead of a raw number or an internal
   "grade" — a vet-facing evidence grade (A-D) can leak into an AI-written
   reasoning string (see server/lib/ai-assessment.js's prompt), and "Grade D"
   reads to an owner like the pet failed something. This badge is what's
   shown prominently instead; the raw reasoning text still exists, just
   moved into the collapsed "Technical details" section. */
function confidenceBadge(pct) {
  if (typeof pct !== 'number') return null;
  if (pct >= 85) return { label: 'High confidence', cls: 'conf-high' };
  if (pct >= 65) return { label: 'Moderate confidence', cls: 'conf-moderate' };
  return { label: 'Screening-level evidence', cls: 'conf-screening' };
}

function systemUrgency(level) {
  return level === 'High Risk' ? 'today' : level === 'Moderate Risk' ? 'soon' : 'routine';
}

/** Every scored system, worst-first — the backbone of the owner summary. */
function rankedSystems(report, labels) {
  const order = { 'High Risk': 3, 'Moderate Risk': 2, 'Low Risk': 1 };
  return Object.entries(labels)
    .map(([key, label]) => ({ key, label, s: report.systems[key] }))
    .filter(e => e.s)
    .sort((a, b) => (order[b.s.level] - order[a.s.level]) || (b.s.score - a.s.score));
}

/**
 * Deterministic, not AI-generated — a data-quality check belongs on every
 * report regardless of whether the AI narrative is configured. Reuses the
 * same species/breed/age-resolved lookup ai-analysis.js scores against, so
 * "markedly above breed-typical" here always agrees with what actually
 * happened to the score. Guarded: getReferenceRanges only loads on pages
 * that include js/vet-knowledge-base.js (owner/staff — the vet portal never
 * renders simplified, so it never needs this).
 */
function dataQualityFlags(report) {
  const p = report.patient || {};
  const flags = [];
  if (p.breedKey && p.weight_kg != null && typeof getReferenceRanges === 'function') {
    try {
      const ranges = getReferenceRanges(p.species, p.breedKey, p.age_years, p.weight_kg);
      if (ranges.weight_status && ranges.weight_status !== 'within breed-typical range' && ranges.expected_weight_range_kg) {
        flags.push(`Recorded weight <b>${p.weight_kg} kg</b> is ${ranges.weight_status} for ${ranges.breed_label || p.breed || 'the recorded breed'}
          (typically ${ranges.expected_weight_range_kg[0]}–${ranges.expected_weight_range_kg[1]} kg). Please verify the weight and breed
          before interpreting weight-dependent findings — this is not corrected automatically.`);
      }
    } catch { /* KB not loaded on this page, or a lookup miss — never block rendering over this */ }
  }
  return flags;
}

function scoreRingHTML(score) {
  const color = scoreColor(score);
  const circumference = 2 * Math.PI * 42;
  const offset = circumference * (1 - score / 100);
  return `
    <div class="score-ring">
      <svg viewBox="0 0 100 100">
        <circle class="score-ring-bg" cx="50" cy="50" r="42"></circle>
        <circle class="score-ring-fg" cx="50" cy="50" r="42" style="stroke:${color};stroke-dasharray:${circumference};stroke-dashoffset:${offset};"></circle>
      </svg>
      <span class="score-ring-value" style="color:${color}">${score}</span>
    </div>`;
}

/* Clinical view: score front and center, as staff/vet already expect. */
function reportHeroHTML(report, opts = {}) {
  const photoHTML = opts.petPhotoUrl
    ? `<img class="report-hero-photo" src="${opts.petPhotoUrl}" alt="${report.patient.name || 'Patient'}">`
    : '';
  return `
    <div class="report-hero">
      ${photoHTML}
      ${scoreRingHTML(report.overall_health_score)}
      <div class="meta">
        <h2>${report.patient.name || 'Patient'} · ${report.patient.species}${report.patient.breed ? ' · ' + report.patient.breed : ''}</h2>
        <p>${report.patient.age_years ?? '?'} yrs · ${report.patient.weight_kg ?? '?'} kg · Overall Health Score · Generated ${new Date(report.generated_at).toLocaleString()}</p>
      </div>
    </div>`;
}

/* Owner view: lean identity strip, no score yet — the score gets its own
   explained section further down (scoreExplainerHTML), after the owner
   already knows what actually matters. */
function patientHeaderHTML(report, opts = {}) {
  const p = report.patient || {};
  const photoHTML = opts.petPhotoUrl
    ? `<img class="ph-photo" src="${opts.petPhotoUrl}" alt="${p.name || 'Patient'}">`
    : '';
  const flagged = dataQualityFlags(report).length > 0;
  return `
    <div class="patient-header">
      ${photoHTML}
      <div class="ph-meta">
        <h2>${p.name || 'Patient'}</h2>
        <p>${p.species || ''}${p.breed ? ' · ' + p.breed : ''}${p.age_years != null ? ' · ' + p.age_years + ' yrs' : ''}${p.weight_kg != null ? ' · ' + p.weight_kg + ' kg' : ''}${flagged ? ' <span class="ph-warn-badge">⚠️ verify info below</span>' : ''}</p>
        <p class="ph-generated">Generated ${new Date(report.generated_at).toLocaleString()}</p>
      </div>
    </div>`;
}

function dataQualityHTML(report) {
  const flags = dataQualityFlags(report);
  if (!flags.length) return '';
  return `
    <div class="dataqual-banner">
      <div class="dq-head">⚠️ Please verify patient information</div>
      ${flags.map(f => `<p>${f}</p>`).join('')}
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
      <span>Prepared by the Vitarus platform · reviewed and released by <b>${signed.vetName}</b> on ${new Date(signed.signedAt).toLocaleString()}
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

/* ═══════════════════════════════════════════════════════════════════════
   Owner summary — leads with the single biggest concern (or a clean bill
   of health), not the score. Deliberately shows only the headline finding
   (report.key_findings), never the raw AI reasoning text here — that can
   contain clinical shorthand (evidence grades, instrument thresholds) that
   belongs in each system's collapsed "Technical details", not the first
   thing an owner reads.
   ═══════════════════════════════════════════════════════════════════════ */
function ownerPriorityHTML(report) {
  const ranked = rankedSystems(report, SYSTEM_LABELS_SIMPLE);
  const top = ranked[0];

  if (!top || top.s.level === 'Low Risk') {
    return `
      <div class="priority-banner priority-good">
        <div class="priority-kicker">🟢 OVERALL</div>
        <div class="priority-headline">${report.patient.name || 'Your pet'}'s results look good overall</div>
        <p class="priority-sub">No system needed follow-up this visit — see the findings below for the full picture.</p>
      </div>`;
  }

  const urgency = systemUrgency(top.s.level);
  const meta = URGENCY_META[urgency];
  const others = ranked.filter(e => e.key !== top.key && e.s.level !== 'Low Risk');

  return `
    <div class="priority-banner ${meta.cls}">
      <div class="priority-kicker">${meta.icon} PRIORITY — ${meta.label.toUpperCase()}</div>
      <div class="priority-headline">${top.label}</div>
      <p class="priority-sub">${report.key_findings[top.key] || ''}</p>
    </div>
    ${others.length ? `
      <div class="other-findings">
        <div class="of-heading">Other findings</div>
        ${others.map(e => {
          const om = URGENCY_META[systemUrgency(e.s.level)];
          return `
            <div class="of-row">
              <span class="of-icon">${om.icon}</span>
              <div><b>${e.label}</b> — ${report.key_findings[e.key] || ''}</div>
            </div>`;
        }).join('')}
      </div>` : ''}`;
}

function bottomLineHTML(report) {
  const ranked = rankedSystems(report, SYSTEM_LABELS_SIMPLE);
  const top = ranked[0];
  if (!top || top.s.level === 'Low Risk') {
    return `<p class="bottom-line"><b>Bottom line:</b> No significant concerns were identified this visit.</p>`;
  }
  const concerns = ranked.filter(e => e.s.level !== 'Low Risk');
  const reassuring = ranked.filter(e => e.s.level === 'Low Risk');
  const otherCount = concerns.length - 1;
  return `<p class="bottom-line"><b>Bottom line:</b> The most important finding is ${top.label.toLowerCase()}
    (${LEVEL_LABELS_SIMPLE[top.s.level].toLowerCase()}).
    ${otherCount > 0 ? `${otherCount} other area${otherCount > 1 ? 's' : ''} also need${otherCount === 1 ? 's' : ''} follow-up, ` : ''}
    ${reassuring.length ? `while ${reassuring.length} area${reassuring.length > 1 ? 's look' : ' looks'} reassuring.` : ''}</p>`;
}

function legendHTML() {
  return `
    <div class="report-legend">
      <div class="legend-title">How to read this report</div>
      <div class="legend-row"><span>🟢</span><div><b>Looks healthy</b> — no significant abnormality identified.</div></div>
      <div class="legend-row"><span>🟡</span><div><b>Worth keeping an eye on</b> — a finding was detected that may need monitoring or confirmation.</div></div>
      <div class="legend-row"><span>🔴</span><div><b>Needs attention</b> — a significant abnormality was identified and veterinary follow-up is recommended.</div></div>
    </div>`;
}

/* De-emphasized, explained score: the ring is the same one the clinical
   view uses, but it now arrives after the owner already knows what matters,
   with an explicit "not a diagnosis" line and a per-system breakdown of
   what actually drove the number — answering "why is it 42?" instead of
   just asserting it. */
function scoreExplainerHTML(report) {
  const ranked = rankedSystems(report, SYSTEM_LABELS_SIMPLE);
  const rows = ranked.map(e => `
    <div class="score-contrib-row">
      <span class="scr-icon">${STATUS_ICON[e.s.level]}</span>
      <span class="scr-label">${e.label}</span>
      <span class="scr-status ${riskClass(e.s.level)}">${LEVEL_LABELS_SIMPLE[e.s.level]}</span>
    </div>`).join('');
  return `
    <div class="score-explainer">
      <div class="score-explainer-head">
        ${scoreRingHTML(report.overall_health_score)}
        <div class="se-text">
          <div class="se-title">Vitarus Screening Score</div>
          <p class="se-note">A composite screening indicator based on the available measurements. It does not represent
            a probability of disease or a veterinary diagnosis. If anything here is unclear or worrying, your vet is the
            best person to ask.</p>
        </div>
      </div>
      <div class="score-contrib-table">${rows}</div>
    </div>`;
}

function reassuringHTML(report) {
  const ranked = rankedSystems(report, SYSTEM_LABELS_SIMPLE).filter(e => e.s.level === 'Low Risk');
  if (!ranked.length) return '';
  return `
    <div class="reassuring-box">
      <div class="reassuring-head">🟢 What's reassuring</div>
      ${ranked.map(e => `<div class="reassuring-row"><b>${e.label}:</b> ${report.key_findings[e.key] || ''}</div>`).join('')}
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

/* ═══════════════════════════════════════════════════════════════════════
   Machine Readings — the raw per-instrument values behind each system's
   score, shown next to the reference range that actually decided whether
   each one was flagged (js/vet-knowledge-base.js's species/breed/age-aware
   getReferenceRanges, via js/ai-analysis.js). Pulled from report.modality_data
   (js/fusion-engine.js's runFusion() passes the raw analyze* output straight
   through under that key) rather than re-deriving anything here. Promoted
   to always-visible (not just inside a collapsed technical section) for
   both clinical and owner views — numbers as scannable rows, not prose.

   Deliberately limited to values with a real, KB-backed (or published
   veterinary-standard, e.g. the Levine murmur scale) reference to compare
   against — the synthetic 0-100 composite scores (inflammation_score,
   mobility_score, etc.) already have a home in the system's own score/level
   and aren't given a fabricated "normal range" here.
   ═══════════════════════════════════════════════════════════════════════ */
function fmtStatNum(v) {
  return typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : v;
}

function statFlag(value, lo, hi) {
  if (typeof value !== 'number') return null;
  if (lo != null && value < lo) return 'low';
  if (hi != null && value > hi) return 'high';
  if (lo != null || hi != null) return 'normal';
  return null;
}

function statRowHTML({ label, value, unit = '', lo, hi, rangeText }) {
  if (value == null) return '';
  const flag = statFlag(value, lo, hi);
  const range = rangeText || (lo != null && hi != null ? `${fmtStatNum(lo)}–${fmtStatNum(hi)} ${unit}`.trim()
    : hi != null ? `≤ ${fmtStatNum(hi)} ${unit}`.trim()
    : lo != null ? `≥ ${fmtStatNum(lo)} ${unit}`.trim()
    : '—');
  return `
    <div class="stat-row">
      <span class="stat-label">${label}</span>
      <span class="stat-value">${fmtStatNum(value)}${unit ? ' ' + unit : ''}</span>
      <span class="stat-range">Normal: ${range}</span>
      ${flag ? `<span class="stat-flag stat-flag-${flag}">${flag === 'high' ? 'High' : flag === 'low' ? 'Low' : 'Normal'}</span>` : ''}
    </div>`;
}

// A handful of raw lab/instrument abbreviations get a plain-language
// parenthetical in owner (simple) mode — kept, not removed, since the
// clinical term is still useful to have in front of a vet later.
const PLAIN_STAT_LABELS = {
  'QTc interval': 'QTc interval (electrical timing of the heartbeat)',
  'SpO₂': 'Blood oxygen (SpO₂)',
  'BUN': 'BUN (kidney-related blood marker)',
  'ALT': 'ALT (liver enzyme)',
  'ALP': 'ALP (liver enzyme)',
  'Creatinine': 'Creatinine (kidney marker)',
  'Total Bilirubin': 'Bilirubin (liver marker)'
};
function lbl(clinical, simple) {
  return simple && PLAIN_STAT_LABELS[clinical] ? PLAIN_STAT_LABELS[clinical] : clinical;
}

function bloodRowsHTML(md, names, simple) {
  if (!md.blood || !md.blood.analytes) return '';
  return names.map(name => {
    const a = md.blood.analytes.find(x => x.name === name);
    if (!a) return '';
    const [lo, hi] = a.reference_range || [];
    return statRowHTML({ label: lbl(a.name, simple), value: a.value, unit: a.unit, lo, hi });
  }).join('');
}

const SYSTEM_STAT_ROWS = {
  skin: (md, simple) => (md.thermal ? [
    statRowHTML({ label: 'Max limb thermal asymmetry', value: md.thermal.thermal_asymmetry_map?.max_delta_c, unit: '°C', hi: md.thermal.thermal_asymmetry_map?.tolerance_c }),
    statRowHTML({ label: 'Core temperature (thermal)', value: md.thermal.heat_index_c, unit: '°C', lo: md.thermal.core_temp_normal_range_c?.[0], hi: md.thermal.core_temp_normal_range_c?.[1] })
  ].join('') : ''),
  heart: (md, simple) => (md.cardiac ? [
    statRowHTML({ label: 'Heart rate', value: md.cardiac.heart_rate_bpm, unit: 'bpm', lo: md.cardiac.heart_rate_normal_range_bpm?.[0], hi: md.cardiac.heart_rate_normal_range_bpm?.[1] }),
    statRowHTML({ label: lbl('QTc interval', simple), value: md.cardiac.qtc_interval_ms, unit: 'ms', hi: md.cardiac.qtc_interval_normal_max_ms }),
    statRowHTML({ label: lbl('SpO₂', simple), value: md.cardiac.spo2_pct, unit: '%', lo: md.cardiac.spo2_normal_min_pct }),
    statRowHTML({ label: 'Systolic blood pressure', value: md.cardiac.blood_pressure?.systolic_mmhg, unit: 'mmHg', hi: md.cardiac.blood_pressure?.systolic_normal_max_mmhg,
      rangeText: md.cardiac.blood_pressure?.systolic_normal_max_mmhg != null ? `≤ ${fmtStatNum(md.cardiac.blood_pressure.systolic_normal_max_mmhg)} mmHg (ACVIM: ${(md.cardiac.blood_pressure.acvim_stage || '').replace(/_/g, ' ')})` : undefined }),
    statRowHTML({ label: 'Murmur grade', value: md.cardiac.murmur_grade, rangeText: 'None (Levine I–VI scale)' })
  ].join('') : ''),
  musculoskeletal: (md, simple) => [
    md.gait ? statRowHTML({ label: 'Lameness grade', value: md.gait.lameness_grade, rangeText: md.gait.lameness_scale }) : '',
    md.thermal ? statRowHTML({ label: 'Max limb thermal asymmetry', value: md.thermal.thermal_asymmetry_map?.max_delta_c, unit: '°C', hi: md.thermal.thermal_asymmetry_map?.tolerance_c }) : '',
    md.structural ? statRowHTML({ label: 'Body condition score', value: md.structural.body_condition_score, rangeText: md.structural.body_condition_scale }) : ''
  ].join(''),
  liver: (md, simple) => bloodRowsHTML(md, ['ALT', 'ALP', 'Total Bilirubin'], simple),
  kidneys: (md, simple) => bloodRowsHTML(md, ['BUN', 'Creatinine'], simple),
  movement: (md, simple) => (md.gait ? [
    statRowHTML({ label: 'Gait symmetry', value: md.gait.gait_symmetry_pct, unit: '%', lo: md.gait.gait_symmetry_normal_min_pct })
  ].join('') : '')
};

function machineStatsHTML(key, report, simple) {
  const md = report.modality_data;
  if (!md) return '';
  const build = SYSTEM_STAT_ROWS[key];
  const rows = build ? build(md, simple) : '';
  if (!rows.trim()) return '';
  return `<div class="stat-table">${rows}</div>`;
}

/* Per-system card, reordered per the redesign: status → what this means
   (the one-line key finding) → measured values → confidence → collapsed
   technical detail (screened-for, evidence trail, full reasoning text —
   which can legitimately include clinical shorthand not meant for the
   headline). Same structure for clinical and owner views; only the labels,
   confidence display and how much sits inside "Technical details" differ. */
function reportSystemsHTML(report, opts) {
  const simple = !!opts.simplified;
  const labels = simple ? SYSTEM_LABELS_SIMPLE : SYSTEM_LABELS;
  return `<div class="system-grid">` + Object.entries(labels).map(([key, label]) => {
    const s = report.systems[key];
    if (!s) return '';

    const conf = confidenceBadge(s.confidence);
    const stats = machineStatsHTML(key, report, simple);

    const technical = simple
      ? `<details class="sc-reasoning">
          <summary>Technical details</summary>
          <p class="sc-why-text">${s.reasoning}</p>
        </details>`
      : `<details class="sc-reasoning">
          <summary>Technical details</summary>
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
        ${stats}
        ${conf ? `<div class="confidence-badge ${conf.cls}">${conf.label}</div>` : ''}
        ${technical}
        ${overrideBlockHTML(key, s, opts.editable)}
      </div>`;
  }).join('') + `</div>`;
}

const MEDIA_KIND_META = { video: { icon: '🎥', label: 'Video note' }, audio: { icon: '🎙️', label: 'Audio note' } };

/* Staff-submitted video/audio, analyzed server-side (server/lib/media-analysis.js)
   into a plain-text clinical observation. Narrative supporting evidence, not
   one of the six scored systems — shown as its own section, same in both
   clinical and owner views since it's already plain language either way. */
function mediaNotesHTML(report) {
  const notes = report.media_notes;
  if (!notes || !notes.length) return '';
  return `
    <div class="detail-section-title" style="margin:24px 0 12px;">Video &amp; Audio Notes</div>
    <div class="media-notes-list">
      ${notes.map(n => {
        const meta = MEDIA_KIND_META[n.kind] || { icon: '📎', label: 'Note' };
        return `
          <div class="media-note-card">
            <div class="mn-top">
              <span class="mn-icon">${meta.icon}</span>
              <span class="mn-label">${meta.label}</span>
              ${n.filename ? `<span class="mn-filename">${n.filename}</span>` : ''}
            </div>
            <p class="mn-analysis">${n.analysis}</p>
            ${n.transcript ? `<details class="mn-transcript"><summary>Transcript</summary><p>${n.transcript}</p></details>` : ''}
          </div>`;
      }).join('')}
    </div>`;
}

/* Urgency-grouped action plan — replaces a single flat bullet list with
   Today / Follow up soon / Routine sections, so the reader doesn't have to
   guess which of ten bullets is actually time-sensitive. Old exams whose
   recommendations are still plain strings (pre-urgency-tagging) fall back
   to the "soon" bucket — a safe middle default, never silently dropped. */
function actionPlanHTML(report, opts = {}) {
  const recos = report.recommendations || [];
  const groups = { today: [], soon: [], routine: [] };
  recos.forEach(r => {
    const u = recoUrgency(r) || 'soon';
    (groups[u] || groups.soon).push(recoText(r));
  });

  const section = (key, meta) => {
    const items = groups[key];
    if (!items.length) return '';
    return `
      <div class="action-group ${meta.cls}">
        <div class="ag-head">${meta.icon} ${meta.label.toUpperCase()}</div>
        <ul class="action-list">${items.map(t => `<li>${t}</li>`).join('')}</ul>
      </div>`;
  };

  return `
    <div class="card-header" style="background:none;border:none;padding:0 0 10px;">${opts.simplified ? 'What happens next' : 'Recommendations'}</div>
    ${section('today', URGENCY_META.today)}
    ${section('soon', URGENCY_META.soon)}
    ${section('routine', URGENCY_META.routine)}`;
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
    const body = `<div class="ai-summary-body" id="ai-summary-body">${opts.aiNarrativeHtml}</div>`;
    // Owner view: this is the vet-oriented technical narrative (can mention
    // instrument thresholds/evidence grades) — collapsed and clearly
    // labeled as optional, not the loud second thing the owner reads.
    if (opts.simplified) {
      return `
        <details class="ai-summary-card ai-live" id="ai-summary-card">
          <summary class="ai-summary-head"><span class="ai-badge">✦ AI</span> Vet's technical notes (optional)</summary>
          ${body}
        </details>`;
    }
    return `
      <div class="ai-summary-card ai-live" id="ai-summary-card">
        <div class="ai-summary-head"><span class="ai-badge">✦ AI</span> Clinical Summary</div>
        ${body}
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
   signed, with full clinical detail either way. Mirrors the same
   priority-first structure as the web view for owners (simplified:true);
   server/lib/report-pdf.js is the equivalent for the emailed copy.
   ═══════════════════════════════════════════════════════════════════════ */
function pdfRiskClass(level) {
  return level === 'Low Risk' ? 'risk-low' : level === 'Moderate Risk' ? 'risk-moderate' : 'risk-high';
}

function pdfStatRowsHTML(key, report, simplified) {
  const md = report.modality_data;
  if (!md) return '';
  const build = SYSTEM_STAT_ROWS[key];
  const rows = build ? build(md, simplified) : '';
  return rows; // same .stat-row markup as the web view — styled by the PDF's own <style> block below
}


function pdfCoverageNoticeHTML(report, simplified) {
  const cov = report.coverage;
  if (!cov || cov.complete) return '';
  const notAssessed = cov.unscoreable.map(u => u.label).join(', ');
  return `<div class="pdf-coverage-notice">
    <b>${simplified ? `Partial check-up — ${cov.scoreable.length} of 6 areas examined` : `Partial exam — ${cov.scoreable.length} of 6 body systems assessed`}</b><br>
    Unavailable: ${cov.missingDetail.map(m => `${m.label} (${m.reasonText})`).join(', ')}.
    Not assessed: ${notAssessed} — not examined this visit, not found normal.
  </div>`;
}

function pdfSystemBlock(key, label, report, simplified) {
  const s = report.systems[key];
  if (!s) return '';
  const override = s.vet_override
    ? `<div class="pdf-override-note"><b>Vet override:</b> ${s.vet_override.previous_level} → ${s.level} — ${s.vet_override.reason}</div>`
    : '';
  const conf = confidenceBadge(s.confidence);
  const stats = pdfStatRowsHTML(key, report, simplified);
  const detail = simplified
    ? `<div class="pdf-subhead">What we looked at</div>
       <p class="pdf-reasoning">${s.reasoning}</p>`
    : `<div class="pdf-subhead">Screened for</div>
       <ul class="pdf-list">${(s.screened_for || []).map(c => `<li>${c}</li>`).join('') || '<li>—</li>'}</ul>
       <div class="pdf-subhead">Evidence</div>
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
      ${stats ? `<div class="pdf-stat-table">${stats}</div>` : ''}
      ${conf ? `<div class="pdf-conf-badge pdf-${conf.cls}">${conf.label}</div>` : ''}
      ${detail}
      ${override}
    </div>`;
}

function pdfMediaNotesHTML(report) {
  const notes = report.media_notes;
  if (!notes || !notes.length) return '';
  return notes.map(n => {
    const meta = MEDIA_KIND_META[n.kind] || { icon: '📎', label: 'Note' };
    return `<div class="pdf-media-note"><b>${meta.icon} ${meta.label}${n.filename ? ' — ' + n.filename : ''}</b><p>${n.analysis}</p></div>`;
  }).join('');
}

function pdfActionPlanHTML(report) {
  const groups = { today: [], soon: [], routine: [] };
  (report.recommendations || []).forEach(r => {
    const u = recoUrgency(r) || 'soon';
    (groups[u] || groups.soon).push(recoText(r));
  });
  const section = (key, meta) => groups[key].length ? `
    <div class="pdf-action-group">
      <div class="pdf-action-head pdf-${meta.cls}">${meta.icon} ${meta.label.toUpperCase()}</div>
      <ul class="pdf-recos">${groups[key].map(t => `<li>${t}</li>`).join('')}</ul>
    </div>` : '';
  return section('today', URGENCY_META.today) + section('soon', URGENCY_META.soon) + section('routine', URGENCY_META.routine);
}

function pdfPriorityHTML(report) {
  const ranked = rankedSystems(report, SYSTEM_LABELS_SIMPLE);
  const top = ranked[0];
  if (!top || top.s.level === 'Low Risk') {
    return `<div class="pdf-priority pdf-priority-good">🟢 <b>${report.patient?.name || 'Your pet'}'s results look good overall.</b> No system needed follow-up this visit.</div>`;
  }
  const meta = URGENCY_META[systemUrgency(top.s.level)];
  const others = ranked.filter(e => e.key !== top.key && e.s.level !== 'Low Risk');
  return `
    <div class="pdf-priority pdf-${meta.cls}">
      <div class="pdf-priority-kicker">${meta.icon} PRIORITY — ${meta.label.toUpperCase()}</div>
      <div class="pdf-priority-headline">${top.label}</div>
      <p>${report.key_findings[top.key] || ''}</p>
    </div>
    ${others.length ? `<div class="pdf-other-findings">${others.map(e => {
      const om = URGENCY_META[systemUrgency(e.s.level)];
      return `<div class="pdf-of-row">${om.icon} <b>${e.label}:</b> ${report.key_findings[e.key] || ''}</div>`;
    }).join('')}</div>` : ''}`;
}

function pdfDataQualityHTML(report) {
  const flags = dataQualityFlags(report);
  if (!flags.length) return '';
  return `<div class="pdf-dataqual">⚠️ <b>Please verify patient information</b>${flags.map(f => `<p>${f}</p>`).join('')}</div>`;
}

function buildReportPdfHtml(report, opts) {
  const p = report.patient || {};
  const simplified = !!opts.simplified;
  const generated = report.generated_at ? new Date(report.generated_at).toLocaleString() : '';
  const signed = opts.signedBanner;
  const signedBlock = signed ? `
    <div class="pdf-signed-banner">
      ✅ Prepared by the Vitarus platform · reviewed and released by <b>${signed.vetName}</b> on ${new Date(signed.signedAt).toLocaleString()}
      ${signed.notes ? `<div style="margin-top:4px;">${signed.notes}</div>` : ''}
    </div>` : `
    <div class="pdf-draft-banner">This copy is a pre-review draft — it has not yet been signed by a vet.</div>`;
  const aiBlock = opts.aiNarrativeHtml ? `
    <div class="pdf-section-title">${simplified ? "Vet's technical notes (optional)" : 'AI Clinical Summary'}</div>
    <div class="pdf-ai">${opts.aiNarrativeHtml}</div>` : '';
  const photoBlock = opts.petPhotoUrl
    ? `<img src="${opts.petPhotoUrl}" alt="" style="width:64px;height:64px;border-radius:10px;object-fit:cover;border:1px solid #d8e5e2;margin-left:auto;">` : '';

  const labels = simplified ? SYSTEM_LABELS_SIMPLE : SYSTEM_LABELS;
  const systems = Object.entries(labels).map(([key, label]) => pdfSystemBlock(key, label, report, simplified)).join('');

  const summaryBlock = simplified ? `
    ${pdfDataQualityHTML(report)}
    ${pdfPriorityHTML(report)}
    <p class="pdf-bottom-line"><b>Bottom line:</b> ${bottomLineText(report)}</p>
    <div class="pdf-score-block">
      <div class="pdf-score-value">${report.overall_health_score}</div>
      <div class="pdf-score-label">Vitarus Screening Score<br>/100</div>
    </div>
    <p style="font-size:11px;color:#8798a1;margin:-10px 0 20px;">A composite screening indicator based on the available
      measurements. It does not represent a probability of disease or a veterinary diagnosis.</p>` : `
    <div class="pdf-score-block">
      <div class="pdf-score-value">${report.overall_health_score}</div>
      <div class="pdf-score-label">Overall Health Score<br>/100</div>
    </div>`;

  return `<!doctype html>
<html><head><meta charset="utf-8">
<title>Vitarus Report — ${p.name || 'Patient'}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", sans-serif; color: #1a2230; background: #fff; margin: 0; padding: 40px 46px; }
  .pdf-header { display: flex; align-items: center; gap: 18px; border-bottom: 3px solid #123a5c; padding-bottom: 16px; margin-bottom: 22px; }
  /* Targeted by class, not a bare .pdf-header img selector — the pet photo
     is an img in this header too, and must not inherit the logo's sizing. */
  .pdf-logo { width: 170px; height: auto; }
  .pdf-brand-sub { font-size: 11px; color: #6b7686; letter-spacing: .5px; text-transform: uppercase; padding-left: 18px; border-left: 1px solid #dbe4ec; }
  .pdf-meta-row { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px 24px; margin-bottom: 20px; font-size: 12.5px; color: #40495a; }
  .pdf-dataqual { background: #fdf2df; border: 1px solid #f0dca0; border-radius: 8px; padding: 12px 16px; margin-bottom: 18px; font-size: 12.5px; color: #6b5000; }
  .pdf-coverage-notice { background: #eef4fb; border: 1px solid #bcd3ea; border-left: 4px solid #3f6f9f; border-radius: 8px; padding: 12px 16px; margin-bottom: 18px; font-size: 12.5px; color: #1a3a5c; line-height: 1.55; }
  .pdf-dataqual p { margin: 4px 0 0; }
  .pdf-priority { border-radius: 10px; padding: 16px 20px; margin-bottom: 14px; page-break-inside: avoid; }
  .pdf-priority-today, .pdf-urgency-today { background: #fbe8e6; border: 1px solid #f0b8b3; }
  .pdf-priority-soon, .pdf-urgency-soon { background: #fdf2df; border: 1px solid #f0dca0; }
  .pdf-priority-good, .pdf-urgency-routine { background: #eafaf3; border: 1px solid #b7e4cc; }
  .pdf-priority-kicker { font-size: 10.5px; font-weight: 800; letter-spacing: .5px; margin-bottom: 4px; }
  .pdf-priority-headline { font-size: 17px; font-weight: 800; color: #123a5c; margin-bottom: 4px; }
  .pdf-priority p { font-size: 12.5px; margin: 0; }
  .pdf-other-findings { margin-bottom: 18px; }
  .pdf-of-row { font-size: 12px; padding: 6px 0; border-bottom: 1px dashed #e2e8ee; }
  .pdf-bottom-line { font-size: 12.5px; background: #f3f7f9; border-radius: 8px; padding: 10px 14px; margin: 4px 0 18px; }
  .pdf-score-block { display: flex; align-items: center; gap: 22px; background: #f3f7f9; border: 1px solid #dde3e8; border-radius: 10px; padding: 18px 22px; margin-bottom: 8px; }
  .pdf-score-value { font-size: 44px; font-weight: 800; color: #123a5c; }
  .pdf-score-label { font-size: 12px; color: #6b7686; }
  .pdf-signed-banner { background: #eafaf3; border: 1px solid #b7e4cc; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 12.5px; color: #1c6b41; }
  .pdf-draft-banner { background: #fdf2df; border: 1px solid #f0dca0; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 12.5px; color: #8a5c10; }
  .pdf-section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: #123a5c; border-bottom: 2px solid #e2e8ee; padding-bottom: 6px; margin: 26px 0 14px; }
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
  .pdf-stat-table { margin-bottom: 8px; }
  .pdf-conf-badge { display: inline-block; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 8px; margin-bottom: 6px; }
  .pdf-conf-high { background: #e4f7ec; color: #1c6b41; }
  .pdf-conf-moderate { background: #fdf2df; color: #8a5c10; }
  .pdf-conf-screening { background: #eef1f4; color: #5c6773; }
  .pdf-subhead { font-size: 10.5px; font-weight: 700; text-transform: uppercase; color: #7a8593; margin: 8px 0 4px; }
  .pdf-list { margin: 0 0 6px 18px; padding: 0; font-size: 11.5px; color: #333; }
  .pdf-reasoning { font-size: 11.5px; color: #333; line-height: 1.55; margin: 0; }
  .pdf-override-note { margin-top: 8px; font-size: 11px; background: #fff7e0; border: 1px solid #f0dca0; border-radius: 6px; padding: 8px 10px; color: #6b5000; }
  .pdf-recos { font-size: 12.5px; margin: 0 0 0 18px; color: #333; }
  .pdf-media-note { border: 1px solid #dde3e8; border-left: 4px solid #267ca2; border-radius: 8px; padding: 10px 14px; margin-bottom: 10px; }
  .pdf-media-note b { font-size: 12px; color: #123a5c; }
  .pdf-media-note p { font-size: 11.5px; color: #333; margin: 6px 0 0; line-height: 1.5; }
  .pdf-action-group { margin-bottom: 14px; }
  .pdf-action-head { display: inline-block; font-size: 10.5px; font-weight: 800; letter-spacing: .4px; padding: 3px 10px; border-radius: 8px; margin-bottom: 6px; }
  .pdf-footer { margin-top: 32px; padding-top: 14px; border-top: 1px solid #e2e8ee; font-size: 10px; color: #99a2b0; }
  .stat-row { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 8px; font-size: 11.5px; padding: 4px 0; border-bottom: 1px dashed #e2e8ee; }
  .stat-row:last-child { border-bottom: none; }
  .stat-label { color: #1a2230; font-weight: 600; flex: 1 1 auto; min-width: 120px; }
  .stat-value { font-family: monospace; color: #1a2230; }
  .stat-range { color: #7a8593; }
  .stat-flag { font-size: 9.5px; font-weight: 700; text-transform: uppercase; padding: 1px 6px; border-radius: 8px; margin-left: auto; }
  .stat-flag-normal { background: #e4f7ec; color: #1c6b41; }
  .stat-flag-high { background: #fbe8e6; color: #9c2b23; }
  .stat-flag-low { background: #fdf2df; color: #8a5c10; }
  @page { margin: 16mm 15mm; }
  @media print { a { color: inherit; text-decoration: none; } }
</style></head>
<body>
  <div class="pdf-header">
    <img class="pdf-logo" src="/assets/brand/vitarus-lockup.svg" alt="Vitarus — Animal Diagnostics">
    <div class="pdf-brand-sub">Multi-Modal Veterinary Diagnostic Report</div>
    ${photoBlock}
  </div>

  <div class="pdf-meta-row">
    <div><b>${p.name || 'Patient'}</b> · ${p.species || ''}${p.breed ? ' · ' + p.breed : ''}${p.age_years != null ? ' · ' + p.age_years + ' yrs' : ''}${p.weight_kg != null ? ' · ' + p.weight_kg + ' kg' : ''}</div>
    <div>Generated ${generated}</div>
  </div>

  ${signedBlock}
  ${pdfCoverageNoticeHTML(report, simplified)}
  ${summaryBlock}
  ${aiBlock}

  <div class="pdf-section-title">${simplified ? 'By System' : 'Per-System Findings'}</div>
  ${systems}

  ${report.media_notes && report.media_notes.length ? `
  <div class="pdf-section-title">Video &amp; Audio Notes</div>
  ${pdfMediaNotesHTML(report)}` : ''}

  <div class="pdf-section-title">${simplified ? 'What Happens Next' : 'Recommendations'}</div>
  ${pdfActionPlanHTML(report)}

  <div class="pdf-footer">
    Vitarus Animal Diagnostics · Multi-Modal Veterinary Diagnostic Platform — this report was generated from
    ${report.coverage && !report.coverage.complete ? `${report.coverage.captured.length} of 6` : 'six'} non-sedated
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

function bottomLineText(report) {
  const ranked = rankedSystems(report, SYSTEM_LABELS_SIMPLE);
  const top = ranked[0];
  if (!top || top.s.level === 'Low Risk') return 'No significant concerns were identified this visit.';
  const concerns = ranked.filter(e => e.s.level !== 'Low Risk');
  const reassuring = ranked.filter(e => e.s.level === 'Low Risk');
  const otherCount = concerns.length - 1;
  return `The most important finding is ${top.label.toLowerCase()} (${LEVEL_LABELS_SIMPLE[top.s.level].toLowerCase()}).`
    + (otherCount > 0 ? ` ${otherCount} other area${otherCount > 1 ? 's' : ''} also need${otherCount === 1 ? 's' : ''} follow-up,` : '')
    + (reassuring.length ? ` while ${reassuring.length} area${reassuring.length > 1 ? 's look' : ' looks'} reassuring.` : '');
}

function downloadReportPDF(report, opts) {
  const win = window.open('', '_blank');
  if (!win) { alert('Please allow pop-ups to download the PDF.'); return; }
  win.document.open();
  win.document.write(buildReportPdfHtml(report, opts));
  win.document.close();
}

/* ═══════════════════════════════════════════════════════════════════════
   Assembly — two structurally different layouts sharing every building
   block above. Clinical (simplified:false) keeps the score-first order
   staff/vet already know. Owner (simplified:true) leads with priority →
   bottom line → the explained score → findings → action plan, so the
   reader gets the answer before the analysis.
   ═══════════════════════════════════════════════════════════════════════ */
/* ── Partial-exam notice ───────────────────────────────────────────────────
   A report built from fewer than six instruments covers less than the whole
   animal, and both the vet signing it and the owner reading it need to know
   that before they read a single score. Systems with no evidence are absent
   from report.systems entirely (js/exam-coverage.js) — without this banner
   their absence would read as "nothing to report" rather than "not looked
   at", which is the single most dangerous way a partial exam can be
   misread. Older reports carry no coverage block and render unchanged. */
function coverageNoticeHTML(report, simple) {
  const cov = report.coverage;
  if (!cov || cov.complete) return '';
  const notAssessed = cov.unscoreable.map(u => u.label);
  const instruments = cov.missingDetail
    .map(m => `${m.label} <span class="cov-reason">(${m.reasonText})</span>`).join(', ');
  const heading = simple
    ? `This was a partial check-up — ${cov.scoreable.length} of 6 areas were examined`
    : `Partial exam — ${cov.scoreable.length} of 6 body systems assessed`;
  const body = simple
    ? `Some of the clinic's equipment wasn't available, so not everything could be checked this visit.
       <b>${notAssessed.join(' and ')}</b> ${notAssessed.length === 1 ? 'was' : 'were'} not examined —
       that isn't a clean result for ${notAssessed.length === 1 ? 'it' : 'them'}, it means ${notAssessed.length === 1 ? 'it' : 'they'} still ${notAssessed.length === 1 ? 'needs' : 'need'} checking.
       Ask your clinic about booking the remaining test${notAssessed.length === 1 ? '' : 's'}.`
    : `Instruments unavailable: ${instruments}.
       <b>Not assessed: ${notAssessed.join(', ')}</b> — absent from this report for want of evidence, not scored as normal.
       Findings below cover only the ${cov.scoreable.length} system${cov.scoreable.length === 1 ? '' : 's'} that were measured, and the overall score is the average of those alone.`;
  return `<div class="report-coverage-notice">
            <div class="rcn-title">${heading}</div>
            <p>${body}</p>
          </div>`;
}

function clinicalReportHTML(report, opts, showRawJson) {
  return reportActionsHTML() +
    reportHeroHTML(report, opts) +
    signedBannerHTML(opts.signedBanner) +
    correctionBannerHTML(opts.correctionBanner) +
    coverageNoticeHTML(report, false) +
    aiSummaryHTML(opts) +
    reportSystemsHTML(report, opts) +
    mediaNotesHTML(report) +
    actionPlanHTML(report, opts) +
    (showRawJson ? reportRawJsonHTML(report) : '');
}

function ownerReportHTML(report, opts) {
  return reportActionsHTML() +
    patientHeaderHTML(report, opts) +
    dataQualityHTML(report) +
    signedBannerHTML(opts.signedBanner) +
    correctionBannerHTML(opts.correctionBanner) +
    coverageNoticeHTML(report, true) +
    ownerPriorityHTML(report) +
    bottomLineHTML(report) +
    scoreExplainerHTML(report) +
    legendHTML() +
    aiSummaryHTML(opts) +
    reassuringHTML(report) +
    `<div class="detail-section-title" style="margin:28px 0 12px;">Findings by system</div>` +
    reportSystemsHTML(report, opts) +
    mediaNotesHTML(report) +
    `<div class="detail-section-title" style="margin:28px 0 12px;">Action plan</div>` +
    actionPlanHTML(report, opts);
}

function renderReport(container, report, opts = {}) {
  const showRawJson = opts.showRawJson !== false;
  container.innerHTML = opts.simplified
    ? ownerReportHTML(report, opts)
    : clinicalReportHTML(report, opts, showRawJson);

  wireOverrideControls(container, report, opts);
  wireReportActions(container, report, opts);
  if (opts.fetchLiveNarrative) loadAiNarrativeInto(report);
}

function wireReportActions(container, report, opts) {
  const btn = container.querySelector('[data-download-pdf]');
  if (!btn) return;
  btn.addEventListener('click', () => downloadReportPDF(report, opts));
}
