/**
 * js/fusion-engine.js
 *
 * "AI Fusion & Analytics Engine" — combines the per-modality AI outputs
 * (js/ai-analysis.js) into one integrated assessment instead of six
 * separate reports: organ-specific health scores, disease-risk levels,
 * confidence from cross-modality agreement, recommended next steps, and
 * a transparent evidence trail explaining *why* each score landed where
 * it did.
 */

/* js/exam-coverage.js is a plain global in the browser (loaded before this
   file); required explicitly under Node so the fusion engine stays runnable
   outside a page. The require() branch is never evaluated in the browser. */
const coverageLib = (typeof examCoverage !== 'undefined')
  ? { examCoverage, coverageSummary }
  : require('./exam-coverage.js');

function fusionClamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/** What each body system is actually being screened for — shown alongside the live evidence. */
const SCREENED_FOR = {
  skin: ["Tumours, cysts & surface lesions", "Allergic skin patterns & hot zones", "Black skin disease, coat abnormalities", "Mammary tumours, wound assessment"],
  heart: ["Arrhythmias & valve disease", "Dilated cardiomyopathy (DCM)", "Pericardial effusion & CHF", "Circulatory irregularities"],
  musculoskeletal: ["Arthritis & joint degeneration", "Hip dysplasia, ACL, fractures", "Tendon & ligament damage", "Lameness & posture disorders"],
  liver: ["Hepatic enzyme abnormalities (ALT, ALP, bilirubin)", "Liver masses & structural changes", "Synthetic / metabolic function"],
  kidneys: ["Kidney disease & insufficiency", "SDMA & creatinine trends", "Bladder stones, cystitis", "Fluid accumulation"],
  movement: ["Gait symmetry & weight distribution", "Lameness scoring", "Range of motion", "Rehabilitation progress tracking"]
};

/** Builds the plain-language "why this score" paragraph from ranked, weighted signals. */
function buildReasoning(ranked, score, level, confidence, modalityCount) {
  const parts = ranked.map(s => `${s.modality} — ${s.note} (${s.contributionPct}% weight)`);
  return `Composite score ${score}/100 → ${level}. Evidence: ${parts.join('; ')}. `
    + `Confidence ${confidence}% reflects agreement across ${modalityCount} contributing modalit${modalityCount === 1 ? 'y' : 'ies'}.`;
}

/**
 * Weighted combination of signals from multiple modalities into one system score.
 * @param {Array<{modality:string, value:number, weight:number, note:string}>} signals
 */
function fuseSystem(signals) {
  const totalWeight = signals.reduce((s, x) => s + x.weight, 0);
  const rawScore = signals.reduce((s, x) => s + x.value * x.weight, 0) / totalWeight;
  const score = Math.round(fusionClamp(rawScore, 0, 100));
  const level = score < 25 ? "Low Risk" : score < 55 ? "Moderate Risk" : "High Risk";

  // Confidence: how many modalities agree with the overall direction (elevated vs. not).
  const agreeing = signals.filter(s => score >= 50 ? s.value >= 40 : s.value < 60).length;
  const confidence = Math.round(fusionClamp(50 + (agreeing / signals.length) * 45 + rand(-3, 3, 0), 50, 97));

  // Weighted contribution of each signal to the final score — the actual reasoning trail.
  const weightedSum = signals.reduce((s, x) => s + x.value * x.weight, 0) || 1;
  const ranked = signals
    .map(s => ({ ...s, contributionPct: Math.round((s.value * s.weight) / weightedSum * 100) }))
    .sort((a, b) => b.contributionPct - a.contributionPct);

  const reasoning = buildReasoning(ranked, score, level, confidence, signals.length);

  return { score, level, confidence, modalities: [...new Set(signals.map(s => s.modality))], signals: ranked, reasoning };
}

/**
 * Recommended next steps, tagged with which system triggered them and how
 * urgent they are — `{text, system, urgency}` rather than a bare string, so
 * the owner-facing "What happens next" can group by urgency (today / soon /
 * routine) instead of one flat bullet list.
 *
 * Re-run on whatever the FINAL per-system levels turn out to be — called
 * once here from runFusion() for the local/rule-based path, and again by
 * staff/index.html's buildReport() after merging in the AI-scored levels
 * (if any), so recommendations always match the levels actually shown,
 * never a stale AI-generated list decoupled from them.
 */
function buildRecommendations(systems, coverage) {
  const items = [];
  const seen = new Set();
  const add = (text, system, urgency) => { if (!seen.has(text)) { seen.add(text); items.push({ text, system, urgency }); } };
  const tier = sys => sys.level === 'High Risk' ? 'today' : 'soon';
  // A system missing from `systems` was never assessed (partial exam — see
  // js/exam-coverage.js). It must not generate recommendations, and it must
  // not read as reassuring either; the "book the missing instrument" advice
  // is added from report.coverage below instead.
  const raised = key => systems[key] && systems[key].level !== 'Low Risk';
  const high = key => systems[key] && systems[key].level === 'High Risk';

  if (raised('musculoskeletal')) {
    add("Orthopedic radiographs", 'musculoskeletal', tier(systems.musculoskeletal));
    add("Joint supplements", 'musculoskeletal', 'soon');
  }
  if (high('musculoskeletal')) add("Orthopaedic consultation", 'musculoskeletal', 'today');
  if (raised('kidneys')) {
    add("Repeat bloods", 'kidneys', tier(systems.kidneys));
    add("Recommend SDMA repeat", 'kidneys', tier(systems.kidneys));
  }
  if (raised('liver')) add("Repeat liver panel in 2–4 weeks", 'liver', 'soon');
  if (raised('heart')) add("Recommend echocardiography", 'heart', tier(systems.heart));
  if (high('heart')) add("Cardiology referral", 'heart', 'today');
  if (raised('skin')) add("Dermatology evaluation", 'skin', tier(systems.skin));
  if (high('skin')) add("Biopsy of identified mass(es)", 'skin', 'today');
  if (raised('movement')) add("Physical rehabilitation / weight management plan", 'movement', tier(systems.movement));
  if (!items.length) add("Continue routine wellness monitoring — no acute findings in what was assessed", null, 'routine');

  // What a partial exam leaves open is itself a next step: the systems that
  // couldn't be scored are unknowns, not clean bills of health, so the
  // report says which instrument would close each gap.
  if (coverage && !coverage.complete) {
    for (const u of coverage.unscoreable) {
      add(`${u.label} not assessed — book ${u.needsLabels.join(' or ')} to complete this screen`, u.key, 'soon');
    }
  }

  return items;
}

/**
 * Builds a system's signal list from only the modalities that were actually
 * captured. Each entry declares which modality it needs; entries whose
 * modality is absent are dropped rather than dereferenced, so a partial
 * exam scores the systems it has evidence for instead of throwing.
 *
 * `fn` is lazy for exactly that reason — the note strings read values off
 * the analysis object, so they must not be evaluated for a modality that
 * isn't there.
 */
function collectSignals(a, entries) {
  return entries.filter(e => a[e.mod]).map(e => e.fn());
}

function runFusion(patient, a, opts = {}) {
  // a = { thermal, ultrasound, cardiac, blood, gait, structural } — any
  // subset. See js/exam-coverage.js for which systems each subset supports.
  const cov = coverageLib.examCoverage(Object.keys(a).filter(k => a[k]), opts.unavailableReasons || {});

  const skinSignals = collectSignals(a, [
    { mod: 'thermal', fn: () => ({ modality: "Thermal", value: a.thermal.inflammation_score, weight: 1,
      note: `inflammation score ${a.thermal.inflammation_score}/100` }) },
    { mod: 'structural', fn: () => ({ modality: "Structural", value: a.structural.surface_abnormality_detected ? 55 + a.structural.lesion_measurements.length * 12 : 8, weight: 1,
      note: a.structural.surface_abnormality_detected ? `${a.structural.lesion_measurements.length} surface lesion(s) detected` : "no surface lesions detected" }) },
    { mod: 'ultrasound', fn: () => ({ modality: "Ultrasound", value: a.ultrasound.tumour_probability_score, weight: 0.6,
      note: `${a.ultrasound.tumour_probability_score}% soft-tissue tumour probability` }) }
  ]);

  const heartSignals = collectSignals(a, [
    { mod: 'cardiac', fn: () => ({ modality: "Cardiac", value: a.cardiac.cardiac_risk_score, weight: 1.5,
      note: `${a.cardiac.rhythm_classification}, murmur ${a.cardiac.murmur_grade}, HR ${a.cardiac.heart_rate_bpm} bpm` }) },
    { mod: 'ultrasound', fn: () => ({ modality: "Ultrasound", value: a.ultrasound.fluid_detection ? 45 : 6, weight: 0.5,
      note: a.ultrasound.fluid_detection ? "fluid accumulation detected on scan" : "no fluid accumulation detected" }) },
    { mod: 'cardiac', fn: () => ({ modality: "Pulse Ox / NIBP", value: fusionClamp((a.cardiac.hypoxemia_flagged ? 45 : 5) + (a.cardiac.hypertension_flagged ? 35 : 5), 0, 100), weight: 0.6,
      note: `SpO2 ${a.cardiac.spo2_pct}%, BP ${a.cardiac.blood_pressure.systolic_mmhg}/${a.cardiac.blood_pressure.diastolic_mmhg} mmHg` }) }
  ]);

  const mskSignals = collectSignals(a, [
    { mod: 'thermal', fn: () => ({ modality: "Thermal", value: fusionClamp(a.thermal.thermal_asymmetry_map.max_delta_c * 25, 0, 100), weight: 1,
      note: `${a.thermal.thermal_asymmetry_map.max_delta_c}°C max limb asymmetry` }) },
    { mod: 'gait', fn: () => ({ modality: "Gait", value: a.gait.lameness_grade * 20, weight: 1.3,
      note: `lameness grade ${a.gait.lameness_grade}/5` }) },
    { mod: 'structural', fn: () => ({ modality: "Structural", value: fusionClamp(100 - a.structural.muscle_symmetry_pct, 0, 100), weight: 1,
      note: `${a.structural.muscle_symmetry_pct}% muscle symmetry` }) },
    { mod: 'blood', fn: () => ({ modality: "Blood", value: fusionClamp((100 - a.blood.organ_health_scores.hematology) * 0.6, 0, 100), weight: 0.5,
      note: `hematology/inflammatory panel score ${a.blood.organ_health_scores.hematology}/100` }) }
  ]);

  const liverFlagged = a.blood ? a.blood.disease_likelihood.filter(d => ["ALT", "ALP", "Total Bilirubin"].includes(d.analyte)) : [];
  const liverAbnormal = a.ultrasound ? a.ultrasound.organ_segmentation.find(o => o.organ === "Liver")?.abnormal : false;
  const liverSignals = collectSignals(a, [
    { mod: 'blood', fn: () => ({ modality: "Blood", value: fusionClamp(100 - a.blood.organ_health_scores.liver, 0, 100), weight: 1.5,
      note: liverFlagged.length ? `${liverFlagged.map(f => f.analyte).join(', ')} flagged on chemistry panel` : "liver panel within normal limits" }) },
    { mod: 'ultrasound', fn: () => ({ modality: "Ultrasound", value: liverAbnormal ? 55 : 6, weight: 1,
      note: liverAbnormal ? "liver echogenicity abnormal on scan" : "liver appears normal on ultrasound" }) }
  ]);

  const kidneyFlagged = a.blood ? a.blood.disease_likelihood.filter(d => ["BUN", "Creatinine"].includes(d.analyte)) : [];
  const kidneyAbnormal = a.ultrasound ? a.ultrasound.organ_segmentation.some(o => o.organ.includes("Kidney") && o.abnormal) : false;
  const kidneySignals = collectSignals(a, [
    { mod: 'blood', fn: () => ({ modality: "Blood", value: fusionClamp(100 - a.blood.organ_health_scores.kidney, 0, 100), weight: 1.5,
      note: kidneyFlagged.length ? `${kidneyFlagged.map(f => f.analyte).join(', ')} flagged on chemistry panel` : "kidney panel within normal limits" }) },
    { mod: 'ultrasound', fn: () => ({ modality: "Ultrasound", value: kidneyAbnormal ? 55 : 6, weight: 1,
      note: kidneyAbnormal ? "kidney echogenicity abnormal on scan" : "kidneys appear normal on ultrasound" }) }
  ]);

  const movementSignals = collectSignals(a, [
    { mod: 'gait', fn: () => ({ modality: "Gait", value: fusionClamp(100 - a.gait.mobility_score, 0, 100), weight: 1.5,
      note: `mobility score ${a.gait.mobility_score}/100, ${a.gait.gait_symmetry_pct}% gait symmetry` }) },
    { mod: 'structural', fn: () => ({ modality: "Structural", value: fusionClamp(100 - a.structural.muscle_symmetry_pct, 0, 100), weight: 0.5,
      note: `${a.structural.muscle_symmetry_pct}% muscle symmetry` }) }
  ]);

  // A system is built only where exam-coverage.js says the evidence carries
  // it. Unscoreable systems are omitted entirely rather than scored from
  // supporting evidence alone — the report renderers already skip a system
  // that isn't in report.systems, and reporting "not assessed" is honest in
  // a way that a confident-looking score from half the evidence is not.
  const signalsBySystem = {
    skin: skinSignals, heart: heartSignals, musculoskeletal: mskSignals,
    liver: liverSignals, kidneys: kidneySignals, movement: movementSignals
  };
  const systemsRaw = {};
  for (const key of cov.scoreable) {
    if (signalsBySystem[key].length) systemsRaw[key] = fuseSystem(signalsBySystem[key]);
  }

  const systems = Object.fromEntries(Object.entries(systemsRaw).map(([key, sys]) => [key, { ...sys, screened_for: SCREENED_FOR[key] }]));

  // Averaged over the systems actually assessed. On a partial exam this is
  // explicitly a score for what was measured, not for the whole animal —
  // report.coverage carries that caveat everywhere the number is shown.
  const assessed = Object.values(systems);
  const overallHealthScore = assessed.length
    ? Math.round(fusionClamp(100 - assessed.reduce((s, sys) => s + sys.score, 0) / assessed.length, 0, 100))
    : null;

  const recommendations = buildRecommendations(systems, cov);

  // Each headline reads only the modalities its own system was scored from,
  // so a missing instrument leaves that system out rather than throwing.
  const findingBuilders = {
    skin: () => {
      const notes = [];
      if (a.structural?.surface_abnormality_detected) notes.push(`${a.structural.lesion_measurements.length} surface lesion(s) detected`);
      if (a.thermal && a.thermal.inflammation_score >= 40) notes.push(`thermal inflammation score ${a.thermal.inflammation_score}/100`);
      if (a.thermal?.hotspots.length) notes.push(`${a.thermal.hotspots.length} thermal hotspot(s)`);
      return notes.length ? notes.join(' · ') : "No significant surface, coat, or thermal abnormalities";
    },
    heart: () => a.cardiac.murmur_grade !== "None"
      ? `Murmur grade ${a.cardiac.murmur_grade} · ${a.cardiac.rhythm_classification}`
      : `${a.cardiac.rhythm_classification} · HR ${a.cardiac.heart_rate_bpm} bpm`,
    musculoskeletal: () => {
      if (!a.gait) return `Scored without gait analysis${a.structural ? ` — ${a.structural.muscle_symmetry_pct}% muscle symmetry on imaging` : ''}`;
      return a.gait.suspected_limb
        ? `Possible ${a.gait.suspected_limb} involvement · lameness grade ${a.gait.lameness_grade}/5`
        : "No lameness or joint inflammation detected";
    },
    liver: () => systems.liver.level === "Low Risk"
      ? (a.blood ? "Liver panel within normal limits" : "No liver abnormality seen on ultrasound")
      : `Liver abnormalities${liverFlagged.length ? ` on bloodwork (${liverFlagged.map(f => f.analyte).join(', ')})` : ' on imaging'}`,
    kidneys: () => systems.kidneys.level === "Low Risk"
      ? (a.blood ? "Kidney panel within normal limits" : "No kidney abnormality seen on ultrasound")
      : `Kidney abnormalities${kidneyFlagged.length ? ` on bloodwork (${kidneyFlagged.map(f => f.analyte).join(', ')})` : ' on imaging'}`,
    movement: () => `${a.gait.gait_symmetry_pct}% gait symmetry · mobility score ${a.gait.mobility_score}/100`
  };
  const keyFindings = Object.fromEntries(
    Object.keys(systems).map(key => [key, findingBuilders[key]()])
  );

  return {
    patient,
    generated_at: nowISO(),
    overall_health_score: overallHealthScore,
    coverage: cov,
    systems,
    key_findings: keyFindings,
    recommendations,
    modality_data: a
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runFusion, buildRecommendations, fuseSystem, SCREENED_FOR };
}
