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

function runFusion(patient, a) {
  // a = { thermal, ultrasound, cardiac, blood, gait, structural }

  const skin = fuseSystem([
    { modality: "Thermal", value: a.thermal.inflammation_score, weight: 1,
      note: `inflammation score ${a.thermal.inflammation_score}/100` },
    { modality: "Structural", value: a.structural.surface_abnormality_detected ? 55 + a.structural.lesion_measurements.length * 12 : 8, weight: 1,
      note: a.structural.surface_abnormality_detected ? `${a.structural.lesion_measurements.length} surface lesion(s) detected` : "no surface lesions detected" },
    { modality: "Ultrasound", value: a.ultrasound.tumour_probability_score, weight: 0.6,
      note: `${a.ultrasound.tumour_probability_score}% soft-tissue tumour probability` }
  ]);

  const heart = fuseSystem([
    { modality: "Cardiac", value: a.cardiac.cardiac_risk_score, weight: 1.5,
      note: `${a.cardiac.rhythm_classification}, murmur ${a.cardiac.murmur_grade}, HR ${a.cardiac.heart_rate_bpm} bpm` },
    { modality: "Ultrasound", value: a.ultrasound.fluid_detection ? 45 : 6, weight: 0.5,
      note: a.ultrasound.fluid_detection ? "fluid accumulation detected on scan" : "no fluid accumulation detected" },
    { modality: "Pulse Ox / NIBP", value: fusionClamp((a.cardiac.hypoxemia_flagged ? 45 : 5) + (a.cardiac.hypertension_flagged ? 35 : 5), 0, 100), weight: 0.6,
      note: `SpO2 ${a.cardiac.spo2_pct}%, BP ${a.cardiac.blood_pressure.systolic_mmhg}/${a.cardiac.blood_pressure.diastolic_mmhg} mmHg` }
  ]);

  const musculoskeletal = fuseSystem([
    { modality: "Thermal", value: fusionClamp(a.thermal.thermal_asymmetry_map.max_delta_c * 25, 0, 100), weight: 1,
      note: `${a.thermal.thermal_asymmetry_map.max_delta_c}°C max limb asymmetry` },
    { modality: "Gait", value: a.gait.lameness_grade * 20, weight: 1.3,
      note: `lameness grade ${a.gait.lameness_grade}/5` },
    { modality: "Structural", value: fusionClamp(100 - a.structural.muscle_symmetry_pct, 0, 100), weight: 1,
      note: `${a.structural.muscle_symmetry_pct}% muscle symmetry` },
    { modality: "Blood", value: fusionClamp((100 - a.blood.organ_health_scores.hematology) * 0.6, 0, 100), weight: 0.5,
      note: `hematology/inflammatory panel score ${a.blood.organ_health_scores.hematology}/100` }
  ]);

  const liverFlagged = a.blood.disease_likelihood.filter(d => ["ALT", "ALP", "Total Bilirubin"].includes(d.analyte));
  const liverAbnormal = a.ultrasound.organ_segmentation.find(o => o.organ === "Liver")?.abnormal;
  const liver = fuseSystem([
    { modality: "Blood", value: fusionClamp(100 - a.blood.organ_health_scores.liver, 0, 100), weight: 1.5,
      note: liverFlagged.length ? `${liverFlagged.map(f => f.analyte).join(', ')} flagged on chemistry panel` : "liver panel within normal limits" },
    { modality: "Ultrasound", value: liverAbnormal ? 55 : 6, weight: 1,
      note: liverAbnormal ? "liver echogenicity abnormal on scan" : "liver appears normal on ultrasound" }
  ]);

  const kidneyFlagged = a.blood.disease_likelihood.filter(d => ["BUN", "Creatinine"].includes(d.analyte));
  const kidneyAbnormal = a.ultrasound.organ_segmentation.some(o => o.organ.includes("Kidney") && o.abnormal);
  const kidneys = fuseSystem([
    { modality: "Blood", value: fusionClamp(100 - a.blood.organ_health_scores.kidney, 0, 100), weight: 1.5,
      note: kidneyFlagged.length ? `${kidneyFlagged.map(f => f.analyte).join(', ')} flagged on chemistry panel` : "kidney panel within normal limits" },
    { modality: "Ultrasound", value: kidneyAbnormal ? 55 : 6, weight: 1,
      note: kidneyAbnormal ? "kidney echogenicity abnormal on scan" : "kidneys appear normal on ultrasound" }
  ]);

  const movement = fuseSystem([
    { modality: "Gait", value: fusionClamp(100 - a.gait.mobility_score, 0, 100), weight: 1.5,
      note: `mobility score ${a.gait.mobility_score}/100, ${a.gait.gait_symmetry_pct}% gait symmetry` },
    { modality: "Structural", value: fusionClamp(100 - a.structural.muscle_symmetry_pct, 0, 100), weight: 0.5,
      note: `${a.structural.muscle_symmetry_pct}% muscle symmetry` }
  ]);

  const systemsRaw = { skin, heart, musculoskeletal, liver, kidneys, movement };
  const systems = Object.fromEntries(Object.entries(systemsRaw).map(([key, sys]) => [key, { ...sys, screened_for: SCREENED_FOR[key] }]));

  const overallHealthScore = Math.round(fusionClamp(
    100 - Object.values(systems).reduce((s, sys) => s + sys.score, 0) / Object.keys(systems).length,
    0, 100
  ));

  const keyFindings = {
    skin: (() => {
      const notes = [];
      if (a.structural.surface_abnormality_detected) notes.push(`${a.structural.lesion_measurements.length} surface lesion(s) detected`);
      if (a.thermal.inflammation_score >= 40) notes.push(`thermal inflammation score ${a.thermal.inflammation_score}/100`);
      if (a.thermal.hotspots.length) notes.push(`${a.thermal.hotspots.length} thermal hotspot(s)`);
      return notes.length ? notes.join(' · ') : "No significant surface, coat, or thermal abnormalities";
    })(),
    heart: a.cardiac.murmur_grade !== "None"
      ? `Murmur grade ${a.cardiac.murmur_grade} · ${a.cardiac.rhythm_classification}`
      : `${a.cardiac.rhythm_classification} · HR ${a.cardiac.heart_rate_bpm} bpm`,
    musculoskeletal: a.gait.suspected_limb
      ? `Possible ${a.gait.suspected_limb} involvement · lameness grade ${a.gait.lameness_grade}/5`
      : "No lameness or joint inflammation detected",
    liver: liver.level === "Low Risk"
      ? "Liver panel within normal limits"
      : `Liver panel abnormalities on bloodwork${liverFlagged.length ? ` (${liverFlagged.map(f => f.analyte).join(', ')})` : ''}`,
    kidneys: kidneys.level === "Low Risk"
      ? "Kidney panel within normal limits"
      : `Kidney panel abnormalities on bloodwork${kidneyFlagged.length ? ` (${kidneyFlagged.map(f => f.analyte).join(', ')})` : ''}`,
    movement: `${a.gait.gait_symmetry_pct}% gait symmetry · mobility score ${a.gait.mobility_score}/100`
  };

  const recommendations = [];
  const add = r => { if (!recommendations.includes(r)) recommendations.push(r); };

  if (musculoskeletal.level !== "Low Risk") { add("Orthopedic radiographs"); add("Joint supplements"); }
  if (musculoskeletal.level === "High Risk") add("Orthopaedic consultation");
  if (kidneys.level !== "Low Risk") { add("Repeat bloods"); add("Recommend SDMA repeat"); }
  if (liver.level !== "Low Risk") add("Repeat liver panel in 2–4 weeks");
  if (heart.level !== "Low Risk") add("Recommend echocardiography");
  if (heart.level === "High Risk") add("Cardiology referral");
  if (skin.level !== "Low Risk") add("Dermatology evaluation");
  if (skin.level === "High Risk") add("Biopsy of identified mass(es)");
  if (movement.level !== "Low Risk") add("Physical rehabilitation / weight management plan");
  if (!recommendations.length) add("Continue routine wellness monitoring — no acute findings");

  return {
    patient,
    generated_at: nowISO(),
    overall_health_score: overallHealthScore,
    systems,
    key_findings: keyFindings,
    recommendations,
    modality_data: a
  };
}
