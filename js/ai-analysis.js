/**
 * js/ai-analysis.js
 *
 * The "AI Outputs" layer described in the VetVision spec. Each function
 * takes the RAW sensor-shaped data a driver already returns (same shape in
 * sim or real mode) and derives the higher-level clinical AI outputs a real
 * vision/signal/lab model would compute downstream of that raw data.
 *
 * These are simulated (rand()-driven) here, exactly like the raw drivers —
 * swapping USE_REAL_DEVICE doesn't change this file; a real deployment would
 * point these functions at actual inference services instead.
 */

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function pickWeighted(options) {
  // options: [[value, weight], ...]
  const total = options.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of options) { if ((r -= w) <= 0) return v; }
  return options[0][0];
}

/* ── 1. Thermal ──────────────────────────────────────────────────────────── */
function analyzeThermal(raw, patientCtx = {}) {
  const ranges = getReferenceRanges(patientCtx.species, patientCtx.breedKey, patientCtx.age_years, patientCtx.weight_kg);
  const { leftFore, rightFore, leftHind, rightHind, trunk, alarms, environment } = raw;
  const foreDelta = parseFloat(Math.abs(leftFore.temperature - rightFore.temperature).toFixed(2));
  const hindDelta = parseFloat(Math.abs(leftHind.temperature - rightHind.temperature).toFixed(2));
  const maxDelta = Math.max(foreDelta, hindDelta);
  const heatIndex = parseFloat(((leftFore.temperature + rightFore.temperature +
    leftHind.temperature + rightHind.temperature + trunk.avg) / 5).toFixed(2));
  const alarmActive = alarms.alarms.some(a => a.triggered);

  const tolerance = ranges.thermal_asymmetry_tolerance_c;
  const feverish = heatIndex > ranges.core_temp_c[1];
  const hypothermic = heatIndex < ranges.core_temp_c[0];

  const inflammationScore = clamp(Math.round(maxDelta * 28 + (alarmActive ? 18 : 0) + (feverish ? 15 : 0) + rand(-4, 4, 0)), 0, 100);
  const painProbability = clamp(Math.round(inflammationScore * 0.85 + rand(-6, 6, 0)), 0, 100);
  const recoveryTrend = pickWeighted([["Stable", 6], ["Improving", 2], ["Worsening", 1]]);

  const hotspots = [];
  if (foreDelta > tolerance) hotspots.push({ region: "Forelimb", delta_c: foreDelta });
  if (hindDelta > tolerance) hotspots.push({ region: "Hindlimb", delta_c: hindDelta });
  if (alarmActive) hotspots.push({ region: "Trunk / Mammary", delta_c: trunk.max - trunk.min });

  const idealAmbient = environment.ambient_temp_c >= 18 && environment.ambient_temp_c <= 25;
  const idealHumidity = environment.relative_humidity_pct <= 60;
  const idealEmissivity = environment.emissivity >= 0.95;
  let calibrationConfidencePct = 96;
  if (!idealAmbient) calibrationConfidencePct -= 12;
  if (!idealHumidity) calibrationConfidencePct -= 8;
  if (!idealEmissivity) calibrationConfidencePct -= 6;
  calibrationConfidencePct = clamp(Math.round(calibrationConfidencePct + rand(-2, 2, 0)), 0, 100);

  return {
    thermal_asymmetry_map: { forelimb_delta_c: foreDelta, hindlimb_delta_c: hindDelta, max_delta_c: maxDelta, tolerance_c: tolerance },
    heat_index_c: heatIndex,
    core_temp_status: feverish ? "Feverish" : hypothermic ? "Hypothermic" : "Normal",
    inflammation_score: inflammationScore,
    pain_probability: painProbability,
    recovery_trend: recoveryTrend,
    hotspots,
    environmental_conditions: {
      ambient_temp_c: environment.ambient_temp_c, relative_humidity_pct: environment.relative_humidity_pct,
      within_calibration_range: idealAmbient && idealHumidity && idealEmissivity
    },
    calibration_confidence_pct: calibrationConfidencePct
  };
}

/* ── 2. Ultrasound ───────────────────────────────────────────────────────── */
function analyzeUltrasound(raw) {
  const { iq } = raw;
  const organs = ["Liver", "Spleen", "Left Kidney", "Right Kidney", "Bladder"];
  const organSegmentation = organs.map(name => {
    const abnormal = Math.random() > 0.85;
    return {
      organ: name,
      volume_cm3: rand(8, 220, 1),
      echogenicity: abnormal ? pickWeighted([["Increased", 1], ["Decreased", 1], ["Heterogeneous", 1]]) : "Normal",
      abnormal
    };
  });

  const lesionCount = pickWeighted([[0, 6], [1, 2], [2, 1]]);
  const lesionMeasurements = Array.from({ length: lesionCount }, () => ({
    organ: organs[Math.floor(Math.random() * organs.length)],
    size_mm: rand(2, 18, 1),
    echogenicity: pickWeighted([["Hypoechoic", 2], ["Hyperechoic", 1], ["Anechoic", 1]]),
    malignancy_probability: rand(5, 70, 0)
  }));

  const fluidDetection = Math.random() > 0.88;
  const tumourProbabilityScore = lesionMeasurements.length
    ? Math.max(...lesionMeasurements.map(l => l.malignancy_probability))
    : rand(0, 8, 0);

  return {
    organ_segmentation: organSegmentation,
    lesion_measurements: lesionMeasurements,
    fluid_detection: fluidDetection,
    tumour_probability_score: tumourProbabilityScore,
    scan_quality: { center_frequency_mhz: iq.center_frequency_mhz, depth_cm: iq.depth_end_mm / 10 }
  };
}

/* ── 3. Cardiac (ECG + bundled pulse-ox / NIBP multiparameter monitor) ───── */
function analyzeCardiac(raw, patientCtx = {}) {
  const ranges = getReferenceRanges(patientCtx.species, patientCtx.breedKey, patientCtx.age_years, patientCtx.weight_kg);
  const { ecg, vitals } = raw;
  const hr = ecg.measurements.heart_rate_bpm;
  const qtc = ecg.measurements.qtc_interval_ms;
  const murmurGrade = pickWeighted([["None", 10], ["I/VI", 2], ["II/VI", 1.5], ["III/VI", 0.8], ["IV/VI", 0.4]]);
  const hrvSdnnMs = rand(20, 90, 1);
  const spo2 = vitals.pulse_oximetry.spo2_pct;
  const systolic = vitals.non_invasive_bp.systolic_mmhg;
  const diastolic = vitals.non_invasive_bp.diastolic_mmhg;
  const [hrLo, hrHi] = ranges.heart_rate_bpm;
  const hypoxemic = spo2 < ranges.spo2_pct_min;
  const hypertensive = systolic > ranges.systolic_bp_mmhg_max;
  // ACVIM 2018 consensus 4-tier BP staging (see BP_STAGES in
  // vet-knowledge-base.js) — richer than the single hypertensive_flagged
  // cutoff above, for the narrative to reason against.
  const bpStages = ranges.bp_stages;
  const bpStage = systolic <= bpStages.normotensive_max ? 'normotensive'
    : systolic <= bpStages.prehypertensive_max ? 'prehypertensive'
    : systolic <= bpStages.hypertensive_max ? 'hypertensive'
    : 'severely_hypertensive';

  let riskScore = 8;
  if (hr > hrHi || hr < hrLo) riskScore += 25;
  if (qtc > ranges.qtc_ms_max) riskScore += 15;
  if (murmurGrade !== "None") riskScore += (parseInt(murmurGrade) || 1) * 12;
  if (ecg.interpretation.abnormalities.length) riskScore += 20;
  if (hypoxemic) riskScore += 15;
  if (hypertensive) riskScore += 10;
  riskScore = clamp(Math.round(riskScore + rand(-5, 5, 0)), 0, 100);

  return {
    rhythm_classification: ecg.interpretation.rhythm,
    murmur_grade: murmurGrade,
    cardiac_risk_score: riskScore,
    hrv_analysis: { sdnn_ms: hrvSdnnMs, assessment: hrvSdnnMs > 50 ? "Normal variability" : "Reduced variability" },
    heart_rate_bpm: hr,
    heart_rate_normal_range_bpm: ranges.heart_rate_bpm,
    qtc_interval_ms: qtc,
    spo2_pct: spo2,
    hypoxemia_flagged: hypoxemic,
    blood_pressure: { systolic_mmhg: systolic, diastolic_mmhg: diastolic, map_mmhg: vitals.non_invasive_bp.map_mmhg, acvim_stage: bpStage },
    hypertension_flagged: hypertensive
  };
}

/* ── 4. Blood biomarkers ─────────────────────────────────────────────────── */
const BLOOD_PANELS = {
  liver:       ["ALT", "ALP", "Total Bilirubin"],
  kidney:      ["BUN", "Creatinine"],
  metabolic:   ["Glucose", "Total Protein", "Albumin"],
  electrolyte: ["Sodium", "Potassium", "Chloride"],
  hematology:  ["WBC", "RBC", "Hemoglobin", "Hematocrit", "Platelets", "Neutrophils", "Lymphocytes", "Monocytes"]
};

function analyzeBlood(raw, patientCtx = {}) {
  const ranges = getReferenceRanges(patientCtx.species, patientCtx.breedKey, patientCtx.age_years, patientCtx.weight_kg);
  // The driver returns a raw value plus a preliminary flag/reference_range of
  // its own (simulated sensor noise, species-agnostic). The authoritative
  // flag — what actually drives clinical output — is recomputed here against
  // this specific patient's species/breed/age-resolved reference range, so a
  // feline sample is never judged against canine ranges (or vice versa).
  const analytes = [...raw.chem.analytes, ...raw.cbc.analytes].map(a => {
    const range = ranges.blood[a.name];
    if (!range) return a;
    const flag = a.value > range[1] ? "H" : a.value < range[0] ? "L" : "N";
    return { ...a, flag, reference_range: range };
  });
  const byName = Object.fromEntries(analytes.map(a => [a.name, a]));

  const panelScore = names => {
    const found = names.map(n => byName[n]).filter(Boolean);
    if (!found.length) return 100;
    const abnormal = found.filter(a => a.flag !== "N").length;
    return clamp(100 - abnormal * 22, 0, 100);
  };

  const organHealthScores = {
    liver: panelScore(BLOOD_PANELS.liver),
    kidney: panelScore(BLOOD_PANELS.kidney),
    metabolic: panelScore(BLOOD_PANELS.metabolic),
    hematology: panelScore(BLOOD_PANELS.hematology)
  };

  const diseaseLikelihood = analytes
    .filter(a => a.flag !== "N")
    .map(a => ({
      analyte: a.name, flag: a.flag, value: a.value, unit: a.unit,
      note: a.flag === "H" ? `${a.name} above reference range` : `${a.name} below reference range`
    }));

  const abnormalTotal = diseaseLikelihood.length;
  const metabolicAge = Math.max(0, Math.round((patientCtx.age_years || 5) + abnormalTotal * 0.8 + rand(-1, 1, 1)));

  return {
    analytes,
    organ_health_scores: organHealthScores,
    disease_likelihood: diseaseLikelihood,
    metabolic_age_years: metabolicAge,
    summary: { total: analytes.length, abnormal: abnormalTotal, normal: analytes.length - abnormalTotal }
  };
}

/* ── 5. Gait ─────────────────────────────────────────────────────────────── */
function analyzeGait(frames, cols, patientCtx = {}) {
  const ranges = getReferenceRanges(patientCtx.species, patientCtx.breedKey, patientCtx.age_years, patientCtx.weight_kg);
  // Bands below were originally fixed around a 92% "normal" baseline; shift
  // them by however far this patient's KB-resolved normal baseline differs
  // from that original assumption, so the mechanism is wired for future
  // per-species/breed gait refinement even though today both species default
  // to the same 92% (gait literature doesn't yet back a confident numeric
  // breed split in this KB — see file header caveat).
  const bandShift = ranges.gait_symmetry_normal_pct - 92;
  const mid = cols / 2;
  let leftForce = 0, rightForce = 0, peak = 0;
  const quadrants = { FL: 0, FR: 0, HL: 0, HR: 0 };

  frames.forEach((f, i) => {
    peak = Math.max(peak, f.peak_force_N);
    const isLeft = f.center_of_pressure.x_sensel < mid;
    if (isLeft) leftForce += f.total_force_N; else rightForce += f.total_force_N;
    const isFront = i % 2 === 0; // alternating stance approximation across the sampled window
    const quad = isFront ? (isLeft ? "FL" : "FR") : (isLeft ? "HL" : "HR");
    quadrants[quad] += f.total_force_N;
  });

  const totalForce = leftForce + rightForce || 1;
  const symmetryPct = clamp(Math.round((1 - Math.abs(leftForce - rightForce) / totalForce) * 100), 0, 100);
  const lamenessGrade = symmetryPct > (92 + bandShift) ? 0 : symmetryPct > (85 + bandShift) ? 1 : symmetryPct > (75 + bandShift) ? 2 : symmetryPct > (60 + bandShift) ? 3 : symmetryPct > (45 + bandShift) ? 4 : 5;
  const mobilityScore = clamp(Math.round(100 - lamenessGrade * 16 + rand(-4, 4, 0)), 0, 100);

  const quadTotal = Object.values(quadrants).reduce((a, b) => a + b, 0) || 1;
  const weightDistribution = Object.fromEntries(
    Object.entries(quadrants).map(([k, v]) => [k, parseFloat((v / quadTotal * 100).toFixed(1))])
  );

  const lameLimb = Object.entries(weightDistribution).sort((a, b) => a[1] - b[1])[0][0];

  return {
    lameness_grade: lamenessGrade,
    lameness_scale: "0 (sound) – 5 (non-weight-bearing)",
    gait_symmetry_pct: symmetryPct,
    joint_loading_peak_n: parseFloat(peak.toFixed(2)),
    weight_distribution_pct: weightDistribution,
    range_of_motion_deg: rand(90, 165, 0),
    mobility_score: mobilityScore,
    suspected_limb: lamenessGrade > 0 ? lameLimb : null
  };
}

/* ── 6. Structural imaging ───────────────────────────────────────────────── */
function analyzeStructural(raw) {
  const { pointCloud } = raw;
  const bodyConditionScore = pickWeighted([[3, 1], [4, 3], [5, 4], [6, 3], [7, 1.5], [8, 0.5]]);
  const muscleSymmetryPct = rand(84, 99, 1);
  const lesionCount = pickWeighted([[0, 8], [1, 2]]);
  const lesionMeasurements = Array.from({ length: lesionCount }, () => ({
    location: pickWeighted([["Dorsal thorax", 1], ["Left flank", 1], ["Mammary chain", 1], ["Distal limb", 1]]),
    size_mm: rand(3, 25, 1),
    type: pickWeighted([["Mass", 1], ["Lesion", 1], ["Alopecia patch", 1]])
  }));

  return {
    body_condition_score: bodyConditionScore,
    body_condition_scale: "1 (emaciated) – 9 (obese), 4–5 ideal",
    muscle_symmetry_pct: muscleSymmetryPct,
    lesion_measurements: lesionMeasurements,
    growth_tracking: "Baseline established (first exam)",
    surface_abnormality_detected: lesionMeasurements.length > 0,
    body_volume_points: pointCloud.valid_points
  };
}

