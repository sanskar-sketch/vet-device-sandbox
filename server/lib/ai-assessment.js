/**
 * server/lib/ai-assessment.js
 *
 * AI-generated clinical assessment. Where js/fusion-engine.js computed
 * every system score with fixed weighted arithmetic, this hands the raw
 * per-instrument readings to the model and asks it to produce the scores
 * itself — so the numbers reflect an actual reading of the data rather
 * than a fixed formula.
 *
 * Uses OpenAI structured outputs (json_schema, strict) so the response is
 * guaranteed to match the exact shape js/report-view.js already renders —
 * without that, a single malformed field would break the whole report.
 *
 * The patient's resolved reference ranges (js/vet-knowledge-base.js) are
 * included in the prompt so scoring is anchored to the same cited IDEXX /
 * Merck / ACVIM intervals the rest of the platform uses, rather than the
 * model's own recollection of normal values.
 *
 * No OPENAI_API_KEY → { assessment: null, reason: 'no_api_key' } and the
 * caller keeps its existing local fusion output.
 */
const express = require('express');
const { getReferenceRanges, FIELD_EVIDENCE } = require('../../js/vet-knowledge-base.js');

const MODEL = process.env.OPENAI_MODEL || 'gpt-5.6';

const SYSTEM_KEYS = ['skin', 'heart', 'musculoskeletal', 'liver', 'kidneys', 'movement'];
const RISK_LEVELS = ['Low Risk', 'Moderate Risk', 'High Risk'];

/* What each body system is screened for — mirrors SCREENED_FOR in
   js/fusion-engine.js so the model scores against the same remit the UI
   tells the vet each system covers. */
const SYSTEM_REMIT = {
  skin: 'Tumours, cysts & surface lesions; allergic skin patterns; coat abnormalities; mammary tumours, wound assessment',
  heart: 'Arrhythmias & valve disease; dilated cardiomyopathy (DCM); pericardial effusion & CHF; circulatory irregularities',
  musculoskeletal: 'Arthritis & joint degeneration; hip dysplasia, ACL, fractures; tendon & ligament damage; lameness & posture disorders',
  liver: 'Hepatic enzyme abnormalities (ALT, ALP, bilirubin); liver masses & structural changes; synthetic/metabolic function',
  kidneys: 'Kidney disease & insufficiency; SDMA & creatinine trends; bladder stones, cystitis; fluid accumulation',
  movement: 'Gait symmetry & weight distribution; lameness scoring; range of motion; rehabilitation progress'
};

const systemSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['score', 'level', 'confidence', 'modalities', 'reasoning', 'signals'],
  properties: {
    score: { type: 'integer', description: '0-100 risk score. 0 = no concern, 100 = severe. Low Risk <25, Moderate 25-54, High >=55.' },
    level: { type: 'string', enum: RISK_LEVELS },
    confidence: { type: 'integer', description: '50-97. How strongly the contributing instruments agree with each other.' },
    modalities: { type: 'array', items: { type: 'string' }, description: 'Instrument names that contributed, e.g. Thermal, Ultrasound, Cardiac, Blood, Gait, Structural.' },
    reasoning: { type: 'string', description: 'Plain-language explanation of why this score, citing the actual measured values and the patient\'s reference ranges.' },
    signals: {
      type: 'array',
      description: 'The evidence trail — one entry per contributing instrument, ordered most influential first.',
      items: {
        type: 'object', additionalProperties: false,
        required: ['modality', 'note', 'contributionPct'],
        properties: {
          modality: { type: 'string' },
          note: { type: 'string', description: 'The specific measured finding, with its value.' },
          contributionPct: { type: 'integer', description: 'Share of this system score attributable to this instrument, 0-100. Should total ~100 across signals.' }
        }
      }
    }
  }
};

const ASSESSMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['overall_health_score', 'systems', 'key_findings', 'recommendations'],
  properties: {
    overall_health_score: { type: 'integer', description: '0-100 where 100 is perfect health (inverse of risk).' },
    systems: {
      type: 'object', additionalProperties: false,
      required: SYSTEM_KEYS,
      properties: Object.fromEntries(SYSTEM_KEYS.map(k => [k, systemSchema]))
    },
    key_findings: { type: 'array', items: { type: 'string' }, description: 'Most clinically significant findings, most urgent first.' },
    recommendations: { type: 'array', items: { type: 'string' }, description: 'Concrete recommended next steps.' }
  }
};

function buildPrompt(patient, modules, ranges) {
  return `Assess this veterinary patient from the raw instrument data below.

PATIENT
${patient.name || 'Unnamed'}, ${patient.species || 'Canine'}${patient.breed ? ', ' + patient.breed : ''}, ${patient.age_years ?? '?'} years, ${patient.weight_kg ?? '?'} kg.

THIS PATIENT'S REFERENCE RANGES (species/breed/age-resolved — score against these, not generic values)
Heart rate ${ranges.heart_rate_bpm[0]}-${ranges.heart_rate_bpm[1]} bpm | QTc <${ranges.qtc_ms_max}ms | SpO2 >=${ranges.spo2_pct_min}% | Core temp ${ranges.core_temp_c[0]}-${ranges.core_temp_c[1]}C | Age band: ${ranges.age_band}
${ranges.expected_weight_range_kg ? `Breed-typical weight ${ranges.expected_weight_range_kg[0]}-${ranges.expected_weight_range_kg[1]} kg — this patient is ${ranges.weight_status}.` : ''}
Blood panel reference intervals: ${JSON.stringify(ranges.blood)}
Blood pressure staging (ACVIM): normotensive <${ranges.bp_stages.normotensive_max + 1}, prehypertensive ${ranges.bp_stages.normotensive_max + 1}-${ranges.bp_stages.prehypertensive_max}, hypertensive ${ranges.bp_stages.prehypertensive_max + 1}-${ranges.bp_stages.hypertensive_max}, severely hypertensive >${ranges.bp_stages.hypertensive_max}.
${ranges.breed_risk_notes.length ? `Breed predispositions: ${ranges.breed_risk_notes.join('; ')}` : ''}

EVIDENCE GRADE PER FIELD (A/B = published reference interval, C = screening heuristic, D = unvalidated internal default)
${JSON.stringify(FIELD_EVIDENCE)}
Weight a deviation less heavily when the threshold it breached is only grade C or D, and say so in your reasoning.

RAW INSTRUMENT DATA
${JSON.stringify(modules, null, 2)}

BODY SYSTEMS TO SCORE
${SYSTEM_KEYS.map(k => `- ${k}: ${SYSTEM_REMIT[k]}`).join('\n')}

Score every system, drawing on whichever instruments genuinely bear on it (one instrument can inform several systems — e.g. thermal asymmetry informs both skin and musculoskeletal). Base every number on the actual values above; quote real measurements in your notes and reasoning. If a system has no relevant abnormal signal, score it low and say what was checked. This is decision support for a supervising veterinarian, never a definitive diagnosis.`;
}

function router() {
  const r = express.Router();

  r.post('/ai-assessment', async (req, res) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.json({ assessment: null, reason: 'no_api_key' });

    const { patient, modules } = req.body || {};
    if (!patient || !modules) return res.status(400).json({ assessment: null, reason: 'bad_request' });

    try {
      const OpenAI = require('openai');
      const client = new OpenAI({ apiKey });
      const ranges = getReferenceRanges(patient.species, patient.breedKey, patient.age_years, patient.weight_kg);

      const response = await client.responses.create({
        model: MODEL,
        instructions: 'You are a veterinary diagnostic AI producing structured multi-system risk assessments from raw instrument data. Decision support only — never state a definitive diagnosis.',
        input: [{ role: 'user', content: buildPrompt(patient, modules, ranges) }],
        text: {
          format: {
            type: 'json_schema',
            name: 'clinical_assessment',
            strict: true,
            schema: ASSESSMENT_SCHEMA
          }
        }
      });

      let text = '';
      for (const item of response.output || []) {
        if (item.type !== 'message') continue;
        for (const part of item.content || []) {
          if (part.type === 'output_text' && part.text) text += part.text;
        }
      }
      if (!text) return res.json({ assessment: null, reason: 'empty_response' });

      res.json({ assessment: JSON.parse(text) });
    } catch (err) {
      console.error('AI assessment failed:', err.message);
      res.json({ assessment: null, reason: 'api_error', message: err.message });
    }
  });

  return r;
}

module.exports = { router };
