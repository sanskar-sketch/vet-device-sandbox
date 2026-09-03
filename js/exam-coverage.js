/**
 * js/exam-coverage.js
 *
 * The rules for running an exam when not every instrument is available.
 *
 * Until now an exam was all-or-nothing: js/fusion-engine.js scores six body
 * systems and dereferenced all six modality analyses unconditionally, so one
 * missing or broken instrument meant no report at all. Real clinics don't
 * work that way — a machine goes into maintenance, a probe won't connect, a
 * clinic simply doesn't own a force plate — and none of that should stop a
 * vet getting a report on the systems that *were* measured.
 *
 * This module is the single source of truth for what a partial exam can and
 * cannot claim. It's deliberately plain data + pure functions with no DOM or
 * DB dependency so the staff UI, the fusion engine, the AI assessment and
 * the Node-side regression tests all decide coverage the same way.
 *
 * ── The rules ──────────────────────────────────────────────────────────────
 *  1. A body system is SCOREABLE only if at least one of its PRIMARY
 *     modalities was captured. Supporting modalities sharpen a score; they
 *     can't carry one on their own. Kidneys without bloodwork is not a
 *     kidney assessment, however good the ultrasound was.
 *  2. A system that isn't scoreable is OMITTED from the report — not scored,
 *     not shown as "normal", not guessed. Absence of evidence is reported as
 *     absence of evidence, and the report says which instrument was missing.
 *  3. An exam may be submitted for vet review once MIN_SYSTEMS_FOR_REPORT of
 *     the six systems are scoreable. Below that it isn't a screening exam,
 *     it's a spot check, and a vet shouldn't be asked to sign it as one.
 *  4. Why a modality is absent doesn't change the maths — not owned, in
 *     maintenance, offline, or failed mid-capture all land in the same
 *     place — but it IS carried through to the report so the vet and the
 *     owner can see whether to rebook.
 */

/* Which instruments bear on which body system. Mirrors the signal lists in
   js/fusion-engine.js's runFusion() — if a modality is added to a system
   there, add it here too or the system will be scored from evidence this
   file doesn't know it has. */
const SYSTEM_MODALITIES = {
  skin:            { primary: ['thermal', 'structural'], supporting: ['ultrasound'] },
  heart:           { primary: ['cardiac'],               supporting: ['ultrasound'] },
  musculoskeletal: { primary: ['gait', 'structural'],    supporting: ['thermal', 'blood'] },
  liver:           { primary: ['blood'],                 supporting: ['ultrasound'] },
  kidneys:         { primary: ['blood'],                 supporting: ['ultrasound'] },
  movement:        { primary: ['gait'],                  supporting: ['structural'] }
};

const ALL_SYSTEM_KEYS = Object.keys(SYSTEM_MODALITIES);
const ALL_MODULE_KEYS = ['thermal', 'ultrasound', 'cardiac', 'blood', 'gait', 'structural'];

/* Rule 3's floor. Three of six is the point where a report still reads as a
   multi-system screen rather than a single-instrument spot check: no single
   instrument reaches it on its own (bloodwork, the broadest, scores two), so
   clearing the floor always means at least two instruments contributed. */
const MIN_SYSTEMS_FOR_REPORT = 3;

const MODULE_LABELS = {
  thermal: 'Thermal Imaging', ultrasound: 'Ultrasound', cardiac: 'Cardiac Analysis',
  blood: 'Blood Biomarkers', gait: 'Gait Analysis', structural: 'Structural Imaging'
};

const SYSTEM_LABELS_COVERAGE = {
  skin: 'Skin & Coat', heart: 'Heart', musculoskeletal: 'Bones & Joints',
  liver: 'Liver', kidneys: 'Kidneys', movement: 'Movement'
};

/** Human-readable reason a module wasn't captured, for the report and the UI. */
const UNAVAILABLE_REASONS = {
  not_configured: 'not registered at this clinic',
  maintenance:    'in maintenance',
  offline:        'marked offline',
  not_detected:   'did not respond to hardware detection',
  capture_failed: 'failed during capture',
  skipped:        'skipped'
};

function reasonText(reason) {
  return UNAVAILABLE_REASONS[reason] || 'unavailable';
}

/**
 * Works out what a given set of captured modules can support.
 *
 * @param {string[]} capturedKeys      modules that produced an analysis
 * @param {Object<string,string>} [reasons]  moduleKey → why it's missing
 * @returns {{
 *   captured: string[], missing: string[], missingDetail: Array<{key,label,reason,reasonText}>,
 *   systems: Object<string,{scoreable:boolean, from:string[], missingPrimary:string[]}>,
 *   scoreable: string[], unscoreable: Array<{key,label,needs:string[],needsLabels:string[]}>,
 *   complete: boolean, sufficient: boolean, shortfall: number,
 *   unlockedBy: Array<{key,label,systems:string[]}>
 * }}
 */
function examCoverage(capturedKeys, reasons = {}) {
  const captured = ALL_MODULE_KEYS.filter(k => capturedKeys.includes(k));
  const missing = ALL_MODULE_KEYS.filter(k => !captured.includes(k));
  const has = k => captured.includes(k);

  const systems = {};
  const scoreable = [];
  const unscoreable = [];

  for (const key of ALL_SYSTEM_KEYS) {
    const { primary, supporting } = SYSTEM_MODALITIES[key];
    const from = [...primary, ...supporting].filter(has);
    const hasPrimary = primary.some(has);
    systems[key] = { scoreable: hasPrimary, from, missingPrimary: primary.filter(k => !has(k)) };
    if (hasPrimary) scoreable.push(key);
    else unscoreable.push({
      key,
      label: SYSTEM_LABELS_COVERAGE[key],
      needs: primary,
      needsLabels: primary.map(k => MODULE_LABELS[k])
    });
  }

  // Which single missing instrument would unlock the most — this is what the
  // UI tells staff to fix first when an exam falls under the floor.
  const unlockedBy = missing
    .map(k => ({
      key: k,
      label: MODULE_LABELS[k],
      systems: unscoreable.filter(u => u.needs.includes(k)).map(u => u.key)
    }))
    .filter(u => u.systems.length)
    .sort((a, b) => b.systems.length - a.systems.length);

  return {
    captured,
    missing,
    missingDetail: missing.map(k => ({
      key: k, label: MODULE_LABELS[k],
      reason: reasons[k] || 'skipped', reasonText: reasonText(reasons[k])
    })),
    systems,
    scoreable,
    unscoreable,
    complete: missing.length === 0,
    sufficient: scoreable.length >= MIN_SYSTEMS_FOR_REPORT,
    shortfall: Math.max(0, MIN_SYSTEMS_FOR_REPORT - scoreable.length),
    unlockedBy
  };
}

/** One-line summary used on the report, the PDF and the staff panel alike. */
function coverageSummary(cov) {
  if (cov.complete) return 'Full exam — all six instruments captured, all six body systems assessed.';
  const instruments = `${cov.captured.length} of 6 instruments`;
  const systemsText = `${cov.scoreable.length} of 6 body systems assessed`;
  const notDone = cov.unscoreable.map(u => u.label).join(', ');
  return `Partial exam — ${instruments} captured, ${systemsText}.`
    + (notDone ? ` Not assessed: ${notDone}.` : '');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SYSTEM_MODALITIES, ALL_SYSTEM_KEYS, ALL_MODULE_KEYS, MIN_SYSTEMS_FOR_REPORT,
    MODULE_LABELS, SYSTEM_LABELS_COVERAGE, UNAVAILABLE_REASONS,
    examCoverage, coverageSummary, reasonText
  };
}
