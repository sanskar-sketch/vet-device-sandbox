/**
 * js/vet-knowledge-base.js
 *
 * Species / breed / age-aware normal-range reference data. Replaces the
 * single hardcoded threshold set that used to apply identically to every
 * patient in js/ai-analysis.js (a Chihuahua and a Great Dane scored against
 * the same heart-rate cutoff; a cat scored against a dog's heart-rate cutoff
 * entirely).
 *
 * Seeded with well-established, broadly-published veterinary reference
 * intervals — the kind every commercial veterinary diagnostic lab panel
 * (IDEXX, Antech, etc.) already reports against — plus documented breed
 * predispositions for the breeds this app's intake form actually offers
 * (see BREED_LIST in js/clinical-map.js).
 *
 * IMPORTANT: this is a STARTING knowledge base, not a claim of exhaustive or
 * clinically-validated veterinary literature coverage. Every numeric range
 * here should be reviewed against your own reference lab's published
 * intervals before being relied on for real clinical use. This file is
 * intentionally the single place to correct or extend that data.
 *
 * Works in both the browser (plain global declarations, loaded via
 * <script>) and Node (`require()`), so the same ranges back both the
 * client-side exam pipeline (js/ai-analysis.js) and the server-side Claude
 * narrative prompt (server/lib/ai-narrative.js).
 *
 * Canine breed coverage (weight range, typical lifespan -> senior-age
 * cutoff) comes from js/breed-directory.js, a 227-breed directory built
 * from a user-supplied breed index — see that file's header for exactly
 * what's sourced vs. derived. This file still owns every cardiac/blood/
 * thermal/gait *clinical* range itself; the directory only supplies
 * weight-range context and a breed-informed age band.
 */

const _breedDirectory = typeof require === 'function' ? require('./breed-directory.js') : null;
function resolveBreedEntry(breedKey) {
  if (_breedDirectory) return _breedDirectory.getBreedDirectoryEntry(breedKey);
  if (typeof getBreedDirectoryEntry === 'function') return getBreedDirectoryEntry(breedKey);
  return null;
}

/* ── Canine weight class ─────────────────────────────────────────────────
   Resting heart rate scales inversely with body size — this is standard
   veterinary teaching (toy breeds run faster resting HR than giant breeds),
   not breed-specific guesswork, so it's applied by weight rather than by
   name and works for any canine patient, listed breed or not. ─────────── */
function canineWeightClass(weightKg) {
  const w = weightKg == null ? 20 : weightKg;
  if (w < 10) return 'toy_small';
  if (w < 25) return 'medium';
  if (w < 40) return 'large';
  return 'giant';
}

/**
 * @param {number} seniorAgeYears breed-specific senior-onset age from
 *   js/breed-directory.js when known, otherwise the flat default (8) is
 *   used — same as before that directory existed.
 */
function ageBand(ageYears, seniorAgeYears) {
  const a = ageYears == null ? 5 : ageYears;
  const seniorCutoff = seniorAgeYears == null ? 8 : seniorAgeYears;
  if (a < 1) return 'juvenile';
  if (a >= seniorCutoff) return 'senior';
  return 'adult';
}

/* Modest, textbook-supported age effects only (HR runs higher in juveniles;
   creatinine baseline drifts up with age) — not a fabricated full per-analyte
   age table. */
const AGE_BAND_ADJUSTMENTS = {
  juvenile: { hr_bonus: 20, creatinine_factor: 0.8 },
  adult:    { hr_bonus: 0,  creatinine_factor: 1.0 },
  senior:   { hr_bonus: -5, creatinine_factor: 1.15 }
};

/* ── Blood reference intervals ───────────────────────────────────────────
   Canine table matches what js/drivers/vemo-tekscan-vetscan.js already
   simulated (kept identical so existing sim output doesn't shift). Feline
   table is a separate, standard published set — cats run meaningfully
   different ranges for several analytes (higher creatinine tolerance,
   higher glucose due to stress hyperglycemia, higher sodium, lower ALP). */
const CANINE_ADULT_BLOOD = {
  WBC: [6.0, 17.0], RBC: [5.5, 8.5], Hemoglobin: [12, 18], Hematocrit: [37, 55],
  Platelets: [180, 400], Neutrophils: [3, 11.5], Lymphocytes: [1, 4.8], Monocytes: [0.2, 1.5],
  Glucose: [70, 138], BUN: [9, 29], Creatinine: [0.5, 1.6], Calcium: [9, 11.4],
  "Total Protein": [5.4, 7.5], Albumin: [2.9, 4.2], ALT: [18, 86], ALP: [12, 122],
  "Total Bilirubin": [0.1, 0.5], Sodium: [142, 152], Potassium: [3.8, 5.4], Chloride: [105, 115]
};

const FELINE_ADULT_BLOOD = {
  WBC: [5.5, 19.5], RBC: [5.0, 10.0], Hemoglobin: [8, 15], Hematocrit: [24, 45],
  Platelets: [200, 500], Neutrophils: [2.5, 12.5], Lymphocytes: [1.5, 7.0], Monocytes: [0, 0.9],
  Glucose: [64, 170], BUN: [16, 36], Creatinine: [0.7, 2.1], Calcium: [8, 10.5],
  "Total Protein": [5.7, 8.2], Albumin: [2.3, 3.9], ALT: [25, 97], ALP: [12, 59],
  "Total Bilirubin": [0.1, 0.4], Sodium: [149, 159], Potassium: [3.4, 5.6], Chloride: [112, 129]
};

/* ── Species defaults ────────────────────────────────────────────────────
   Feline resting HR (140–220 bpm) is materially different from canine — the
   pre-existing single threshold (`hr > 160 || hr < 60`) applied the dog
   range to cats too, which flagged nearly every normal cat as tachycardic
   and every normal dog resting near 160bpm as fine regardless of size. */
const SPECIES_DEFAULTS = {
  Canine: {
    heart_rate_bpm_by_weight_class: {
      toy_small: [80, 180], medium: [70, 160], large: [60, 140], giant: [55, 120]
    },
    qtc_ms_max: 260,
    spo2_pct_min: 95,
    systolic_bp_mmhg_max: 160,
    core_temp_c: [38.3, 39.2],
    thermal_asymmetry_tolerance_c: 1.0,
    gait_symmetry_normal_pct: 92,
    blood: CANINE_ADULT_BLOOD
  },
  Feline: {
    heart_rate_bpm: [140, 220],
    qtc_ms_max: 230,
    spo2_pct_min: 95,
    systolic_bp_mmhg_max: 160,
    core_temp_c: [38.1, 39.2],
    thermal_asymmetry_tolerance_c: 1.0,
    gait_symmetry_normal_pct: 92,
    blood: FELINE_ADULT_BLOOD
  }
};

/* ── Breed overrides ──────────────────────────────────────────────────────
   Deliberately qualitative (risk_notes only) rather than invented precise
   numeric breed deltas that can't be confidently cited — these feed the
   Claude narrative as clinical context, not the fusion engine's scoring. */
const BREED_OVERRIDES = {
  // Canine — see BREED_LIST in js/clinical-map.js for the exact key list.
  labrador: { risk_notes: ["Predisposed to hip and elbow dysplasia", "Prone to obesity — weigh body condition score against this"] },
  golden_retriever: { risk_notes: ["Elevated lifetime risk of lymphoma, hemangiosarcoma, and mast cell tumors — weigh ultrasound/structural findings accordingly", "Predisposed to hip dysplasia and subvalvular aortic stenosis"] },
  german_shepherd: { risk_notes: ["Predisposed to hip/elbow dysplasia and degenerative myelopathy — relevant to gait findings", "Predisposed to exocrine pancreatic insufficiency — relevant to metabolic/blood findings"] },
  beagle: { risk_notes: ["Prone to obesity — weigh body condition score against this", "Mildly elevated intervertebral disc disease risk"] },
  poodle: { risk_notes: ["Predisposed to Addison's disease — relevant to metabolic/electrolyte findings", "Predisposed to hip dysplasia and sebaceous adenitis (coat/skin)"] },
  // Feline
  siamese: { risk_notes: ["Predisposed to amyloidosis affecting liver/kidney function"] },
  persian: { risk_notes: ["Predisposed to polycystic kidney disease — weigh kidney panel accordingly", "Mildly brachycephalic — may run slightly lower baseline SpO2"] },
  maine_coon: { risk_notes: ["Materially elevated risk of hypertrophic cardiomyopathy (HCM) — weigh cardiac findings accordingly"] },
  ragdoll: { risk_notes: ["Materially elevated risk of hypertrophic cardiomyopathy (HCM) — weigh cardiac findings accordingly"] },
  british_shorthair: { risk_notes: ["Elevated risk of hypertrophic cardiomyopathy (HCM) and polycystic kidney disease"] }
};

/**
 * Single lookup — always resolves (unlisted breed silently falls back to
 * the species default, never throws or blocks an exam).
 */
function getReferenceRanges(species, breedKey, ageYears, weightKg) {
  const sp = SPECIES_DEFAULTS[species] || SPECIES_DEFAULTS.Canine;
  const isCanine = species !== 'Feline';
  const breedEntry = isCanine ? resolveBreedEntry(breedKey) : null;
  const band = ageBand(ageYears, breedEntry ? breedEntry.senior_age_years : undefined);
  const adj = AGE_BAND_ADJUSTMENTS[band];

  let hrRange;
  if (sp.heart_rate_bpm_by_weight_class) {
    const wc = canineWeightClass(weightKg);
    hrRange = sp.heart_rate_bpm_by_weight_class[wc];
  } else {
    hrRange = sp.heart_rate_bpm;
  }
  hrRange = [hrRange[0] + adj.hr_bonus, hrRange[1] + adj.hr_bonus];

  const blood = {};
  for (const [analyte, range] of Object.entries(sp.blood)) {
    blood[analyte] = analyte === 'Creatinine' ? [range[0] * adj.creatinine_factor, range[1] * adj.creatinine_factor] : range;
  }

  const breed = (breedKey && BREED_OVERRIDES[breedKey]) || {};

  let weightStatus = null;
  if (breedEntry && weightKg != null) {
    weightStatus = weightKg < breedEntry.weight_min_kg ? 'below breed-typical range'
      : weightKg > breedEntry.weight_max_kg ? 'above breed-typical range'
      : 'within breed-typical range';
  }

  return {
    species: species === 'Feline' ? 'Feline' : 'Canine',
    breed_key: breedKey || null,
    breed_label: breedEntry ? breedEntry.label : null,
    breed_group: breedEntry ? breedEntry.group : null,
    age_band: band,
    heart_rate_bpm: hrRange,
    qtc_ms_max: sp.qtc_ms_max,
    spo2_pct_min: sp.spo2_pct_min,
    systolic_bp_mmhg_max: sp.systolic_bp_mmhg_max,
    core_temp_c: sp.core_temp_c,
    thermal_asymmetry_tolerance_c: sp.thermal_asymmetry_tolerance_c,
    gait_symmetry_normal_pct: sp.gait_symmetry_normal_pct,
    expected_weight_range_kg: breedEntry ? [breedEntry.weight_min_kg, breedEntry.weight_max_kg] : null,
    weight_status: weightStatus,
    blood,
    breed_risk_notes: breed.risk_notes || []
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getReferenceRanges, canineWeightClass, ageBand, SPECIES_DEFAULTS, BREED_OVERRIDES, resolveBreedEntry };
}
