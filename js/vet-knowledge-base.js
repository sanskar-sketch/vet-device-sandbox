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
   Claude narrative as clinical context, not the fusion engine's scoring.
   One exception: GREYHOUND_BLOOD below, which is a real published breed-
   specific reference interval, not a qualitative note (see its own
   citation). */
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

/* ── Category-level canine clusters ──────────────────────────────────────
   Covering all 227 directory breeds individually with cited literature
   isn't possible — most breeds simply have no breed-specific study. What
   IS well-published is a handful of physiologically/clinically distinct
   *clusters* that cut across many breeds at once. Applying documented
   cluster-level findings to every breed_directory.js slug in that cluster
   is the accurate way to extend real coverage across the full directory,
   instead of inventing per-breed numbers for breeds nobody has studied.
   Sources (Aug 2026 research pass):
   - Sighthound hematology: IDEXX "Greyhounds: a breed apart" (Jun 2025,
     greyhound-specific reference intervals below) + Campora et al. 2011
     Vet Clin Pathol (Whippet/Lurcher transference) + Zaldívar-López et al.
     2011 Vet Clin Pathol (cross-sighthound comparison).
   - Brachycephalic airway/SpO2: Liu et al., "Evaluation of Pulse Oximetry
     in Healthy Brachycephalic Dogs" (PubMed 30272480) — SpO2 statistically
     lower but stays within the 95-100% reference range at rest.
   - Chondrodystrophic IVDD: Bach/Batcher FGF4-retrogene literature (UC
     Davis VGL CDDY/CDPA panel) + DachsLife 2015 (Packer et al., PMC5097381).
   - GDV/bloat risk breeds: Cornell Riney Canine Health Center GDV summary;
     Glickman et al. breed-risk literature it cites.
   - DCM risk breeds: Cornell Riney Canine Health Center canine DCM summary.
   - MDR1 (ABCB1-1Δ) multidrug sensitivity: Mealey lab / WSU VCPL breed
     prevalence data as summarized by UC Davis VGL and VCA. */
const SIGHTHOUND_BREED_KEYS = new Set([
  'greyhound', 'whippet', 'saluki', 'afghan_hound', 'borzoi', 'irish_wolfhound',
  'deerhound', 'ibizan_hound', 'pharaoh_hound', 'azawakh', 'sloughi', 'basenji',
  'italian_greyhound', 'cirneco_dell_etna'
]);
const BRACHYCEPHALIC_BREED_KEYS = new Set([
  'bulldog', 'french_bulldog', 'pug', 'boston_terrier', 'pekingese', 'shih_tzu',
  'lhasa_apso', 'japanese_chin', 'king_charles_spaniel', 'cavalier_king_charles_spaniel',
  'griffon_bruxellois', 'tibetan_spaniel'
]);
const CHONDRODYSTROPHIC_BREED_KEYS = new Set([
  'long_haired_dachshund', 'miniature_long_haired_dachshund', 'miniature_smooth_haired_dachshund',
  'miniature_wire_haired_dachshund', 'smooth_haired_dachshund', 'wire_haired_dachshund',
  'basset_hound', 'basset_bleu_de_gascogne', 'basset_fauve_de_bretagne',
  'grand_basset_griffon_vendeen', 'petit_basset_griffon_vendeen', 'pembroke_welsh_corgi',
  'cardigan_welsh_corgi', 'pekingese', 'west_highland_white_terrier', 'scottish_terrier',
  'french_bulldog', 'bichon_frise'
]);
const GDV_RISK_BREED_KEYS = new Set([
  'great_dane', 'st_bernard', 'irish_wolfhound', 'weimaraner', 'irish_setter',
  'irish_red_and_white_setter', 'gordon_setter', 'english_setter', 'standard_poodle',
  'basset_hound', 'dobermann', 'old_english_sheepdog', 'german_shepherd_dog', 'bloodhound',
  'mastiff', 'neapolitan_mastiff', 'bullmastiff', 'dogue_de_bordeaux', 'newfoundland',
  'bernese_mountain_dog', 'great_swiss_mountain_dog', 'greenland_dog', 'akita',
  'japanese_akita_inu', 'boxer', 'rottweiler', 'komondor', 'hungarian_kuvasz', 'leonberger',
  'pyrenean_mastiff', 'pyrenean_mountain_dog', 'tibetan_mastiff', 'russian_black_terrier'
]);
const DCM_RISK_BREED_KEYS = new Set([
  'dobermann', 'great_dane', 'boxer', 'irish_wolfhound', 'giant_schnauzer', 'schnauzer',
  'newfoundland', 'portuguese_water_dog', 'cocker_spaniel', 'american_cocker_spaniel', 'st_bernard'
]);
const MDR1_RISK_BREED_KEYS = new Set([
  'rough_collie', 'smooth_collie', 'whippet', 'australian_shepherd',
  'miniature_american_shepherd', 'shetland_sheepdog', 'old_english_sheepdog', 'german_shepherd_dog'
]);

/* Soft, group-wide tendencies — always true-ish at the group level, so safe
   to attach to every breed in the group even without individual-breed
   literature. Deliberately generic; specific clusters/breeds above and in
   BREED_OVERRIDES layer stronger, more precise notes on top. */
const GROUP_RISK_NOTES = {
  Toy: ["Small/toy conformation — watch for patellar luxation and dental crowding; juveniles under ~5 months or very small adults carry elevated hypoglycemia risk; resting heart rate normally runs faster than in larger breeds"],
  Terrier: ["Terrier-type breed — elevated patellar luxation risk in several terrier breeds; generally robust cardiovascular profile relative to body size"],
  Hound: ["Hound-group breed — scent hounds commonly show a food-driven weight-gain tendency; see sighthound-specific note below if this breed is a sighthound"],
  Gundog: ["Gundog/sporting breed — larger gundog breeds carry elevated hip/elbow dysplasia risk; retrievers and spaniels carry elevated later-life cancer risk (lymphoma, hemangiosarcoma, mast cell tumors)"],
  Pastoral: ["Pastoral/herding breed — elevated hip dysplasia risk in many lines; several herding breeds carry the MDR1 (ABCB1-1Δ) drug-sensitivity variant — see MDR1 note below if this breed is a documented carrier before dosing ivermectin-class or other MDR1-substrate drugs"],
  Working: ["Working-group breed — often large/giant bodied with elevated hip/elbow dysplasia and orthopedic load-bearing risk; see GDV and DCM notes below if this breed is in either documented risk cluster"],
  Utility: ["Utility-group breed — a mixed category by design; rely on breed-specific notes below over group-level generalization"]
};

/* Greyhound-specific published reference intervals — IDEXX Reference
   Laboratories, "Greyhounds: a breed apart" diagnostic update, published
   June 2025 (N=220 healthy adult greyhounds, CLSI-guideline study).
   Unlike every other range in this file's BREED_OVERRIDES, these are a
   real cited breed-specific study, not a qualitative note, so they replace
   (not adjust) the canine species-default blood panel for this one breed. */
const GREYHOUND_BLOOD = {
  WBC: [3.6, 8.6], RBC: [7.04, 9.73], Hemoglobin: [16.9, 23.1], Hematocrit: [52, 68.4],
  Platelets: [97, 232], Neutrophils: [2.14, 6.52], Lymphocytes: [0.59, 2.1], Monocytes: [0.04, 0.34],
  Glucose: [72, 118], BUN: [13, 29], Creatinine: [1.2, 2.1], Calcium: [9.3, 10.5],
  "Total Protein": [5.2, 6.8], Albumin: [2.7, 3.9], ALT: [24, 97], ALP: [12, 79],
  "Total Bilirubin": [0.2, 0.5], Sodium: [139, 149], Potassium: [3.8, 4.7], Chloride: [107, 117]
};

/**
 * Single lookup — always resolves (unlisted breed silently falls back to
 * the species default, never throws or blocks an exam).
 */
function getReferenceRanges(species, breedKey, ageYears, weightKg) {
  const sp = SPECIES_DEFAULTS[species] || SPECIES_DEFAULTS.Canine;
  const isCanine = species !== 'Feline';
  const breedEntry = isCanine ? resolveBreedEntry(breedKey) : null;
  const canonicalSlug = breedEntry ? breedEntry.slug : null;
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

  let blood;
  if (canonicalSlug === 'greyhound') {
    // Published breed-specific study (see GREYHOUND_BLOOD comment) — used
    // as-is rather than compounded with the generic age/creatinine factor.
    blood = { ...GREYHOUND_BLOOD };
  } else {
    blood = {};
    for (const [analyte, range] of Object.entries(sp.blood)) {
      blood[analyte] = analyte === 'Creatinine' ? [range[0] * adj.creatinine_factor, range[1] * adj.creatinine_factor] : range;
    }
  }

  const breed = (breedKey && BREED_OVERRIDES[breedKey]) || {};

  // Cluster-level notes (group tendency + documented physiological/disease
  // clusters), then the hand-curated single-breed notes on top.
  const riskNotes = [];
  if (breedEntry && GROUP_RISK_NOTES[breedEntry.group]) riskNotes.push(...GROUP_RISK_NOTES[breedEntry.group]);
  if (canonicalSlug && SIGHTHOUND_BREED_KEYS.has(canonicalSlug)) {
    riskNotes.push(canonicalSlug === 'greyhound'
      ? "Sighthound (Greyhound) — blood panel evaluated against Greyhound-specific published reference intervals (IDEXX, 2025), not generic canine ranges; expect higher HCT/RBC/Hgb/creatinine and lower platelet/WBC counts than a non-sighthound at the same values."
      : "Sighthound-type breed — expect physiologically higher HCT/RBC/hemoglobin and lower platelet/WBC counts than generic canine reference ranges (well documented in Greyhounds; extends qualitatively to this breed as a sighthound, not from a breed-specific study of this exact breed).");
  }
  if (canonicalSlug && BRACHYCEPHALIC_BREED_KEYS.has(canonicalSlug)) {
    riskNotes.push("Brachycephalic conformation — baseline SpO2 typically sits at the lower end of the normal range with reduced respiratory and thermoregulatory reserve; treat any SpO2 dip or thermal asymmetry more seriously than in a mesocephalic breed, and expect an exaggerated heat/stress response.");
  }
  if (canonicalSlug && CHONDRODYSTROPHIC_BREED_KEYS.has(canonicalSlug)) {
    riskNotes.push("Chondrodystrophic (short-legged) conformation — substantially elevated intervertebral disc disease (IVDD) risk; weigh gait/structural findings with a lower threshold for suspecting disc-related pathology.");
  }
  if (canonicalSlug && GDV_RISK_BREED_KEYS.has(canonicalSlug)) {
    riskNotes.push("Large, deep-chested breed — elevated gastric dilatation-volvulus (GDV/bloat) risk; acute abdominal distension or unproductive retching is an emergency regardless of other exam findings.");
  }
  if (canonicalSlug && DCM_RISK_BREED_KEYS.has(canonicalSlug)) {
    riskNotes.push("Documented breed predisposition to dilated cardiomyopathy (DCM) — weigh cardiac findings accordingly and treat this as history-relevant even when the current exam is normal.");
  }
  if (canonicalSlug && MDR1_RISK_BREED_KEYS.has(canonicalSlug)) {
    riskNotes.push("Documented carrier breed for the MDR1 (ABCB1-1Δ) multidrug-sensitivity variant — confirm genetic status before dosing ivermectin-class or other MDR1-substrate medications.");
  }
  if (breed.risk_notes) riskNotes.push(...breed.risk_notes);

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
    breed_risk_notes: riskNotes
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getReferenceRanges, canineWeightClass, ageBand, SPECIES_DEFAULTS, BREED_OVERRIDES, resolveBreedEntry,
    SIGHTHOUND_BREED_KEYS, BRACHYCEPHALIC_BREED_KEYS, CHONDRODYSTROPHIC_BREED_KEYS,
    GDV_RISK_BREED_KEYS, DCM_RISK_BREED_KEYS, MDR1_RISK_BREED_KEYS, GROUP_RISK_NOTES, GREYHOUND_BLOOD
  };
}
