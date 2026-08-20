/**
 * server/lib/ai-narrative.js
 *
 * The one piece of this platform that isn't simulated: sends the already-
 * computed fusion report (scores, evidence, reasoning — all real math, see
 * js/fusion-engine.js) to the actual Claude API and asks it to synthesize
 * the multi-system findings into the kind of narrative summary a
 * veterinarian would want to read first. Everything upstream of this is
 * deterministic/simulated; this step is genuine model inference.
 *
 * No ANTHROPIC_API_KEY configured → responds with reason:"no_api_key" and
 * the frontend quietly falls back to the rule-based report only.
 */
const express = require('express');
const { getReferenceRanges, FIELD_EVIDENCE } = require('../../js/vet-knowledge-base.js');

const SYSTEM_PROMPT = `You are an AI clinical-decision-support assistant summarizing a multi-modal veterinary diagnostic exam for the supervising veterinarian to review. This is decision support only, not a replacement for clinical diagnosis — never state a definitive diagnosis, only risk levels, evidence, and recommended next steps.

You have two tools available:
- search_knowledge_base: this platform's own species/breed/age-resolved veterinary reference data for the patient in this exam — the full blood panel (all 20 analytes), vitals thresholds, ACVIM blood-pressure staging, breed risk notes, and an evidence grade (A-D) per field telling you whether a value is a cited published reference interval or an internal screening heuristic. The narrative below already includes a summary of this; call the tool when you need more than the summary — e.g. the full blood panel, or to check a field's evidence grade before leaning on it.
- web_search: live web search, for when the knowledge base genuinely doesn't cover something you need (a breed not in the directory, or a specific recent clinical question) and checking would materially change your interpretation. Don't reach for it on routine, well-covered cases. If you use it, keep to reputable veterinary sources (veterinary schools, AVMA/ACVIM/ACVECC, IDEXX/Merck, peer-reviewed journals) and briefly note what you checked.

Write a concise 3-paragraph clinical summary a veterinarian would read first: (1) overall impression and the most urgent finding(s), (2) system-by-system context tying the evidence together — explicitly note when a finding is or isn't within this patient's expected range given its species/breed, and be explicit when you're relying on an internal heuristic (grade C/D) rather than a published reference interval (grade A/B), (3) suggested next steps and monitoring priorities. Professional, clear, plain prose — no markdown headers, no bullet lists.`;

const TOOLS = [
  {
    name: 'search_knowledge_base',
    description: "Look up this platform's full species/breed/age-resolved veterinary reference data — the complete blood panel, vitals thresholds, ACVIM BP staging, breed risk notes, and an evidence grade per field. Use the patient's own species/breed_key/age_years/weight_kg from the exam to get patient-specific results; call with just species for a generic species baseline.",
    input_schema: {
      type: 'object',
      properties: {
        species: { type: 'string', enum: ['Canine', 'Feline'] },
        breed_key: { type: 'string', description: 'Breed slug from this patient\'s intake record, e.g. "labrador_retriever" or a legacy key like "labrador". Omit for a species-only baseline.' },
        age_years: { type: 'number' },
        weight_kg: { type: 'number' }
      },
      required: ['species']
    }
  },
  // Server-side tool — Anthropic runs the search and resolves the result
  // inside the same API response; nothing for this endpoint to execute.
  { type: 'web_search_20260209', name: 'web_search', max_uses: 3 }
];

function runKnowledgeBaseTool(input) {
  const { species, breed_key, age_years, weight_kg } = input || {};
  const ranges = getReferenceRanges(species, breed_key, age_years, weight_kg);
  return { ...ranges, field_evidence: FIELD_EVIDENCE };
}

function buildPrompt(report) {
  const p = report.patient || {};
  const systemLines = Object.entries(report.systems || {}).map(([key, s]) =>
    `- ${key}: ${s.level} (score ${s.score}/100, confidence ${s.confidence}%) — ${s.reasoning}`
  ).join('\n');

  // Same species/breed/age-aware lookup js/ai-analysis.js already scores
  // against — repeated here so the narrative can reason against this
  // patient's actual normal ranges without needing a tool round-trip for
  // the common case. The search_knowledge_base tool (see SYSTEM_PROMPT)
  // is there for when the model wants more than this summary.
  const ranges = getReferenceRanges(p.species, p.breedKey, p.age_years, p.weight_kg);
  const contextLines = [
    `Normal ranges for this patient: heart rate ${ranges.heart_rate_bpm[0]}-${ranges.heart_rate_bpm[1]} bpm, QTc <${ranges.qtc_ms_max}ms, SpO2 ≥${ranges.spo2_pct_min}%, core temperature ${ranges.core_temp_c[0]}-${ranges.core_temp_c[1]}°C. Age band: ${ranges.age_band}.`,
    ranges.expected_weight_range_kg
      ? `Typical adult weight for ${ranges.breed_label || 'this breed'} (${ranges.breed_group || 'n/a'} group): ${ranges.expected_weight_range_kg[0]}-${ranges.expected_weight_range_kg[1]} kg.${ranges.weight_status ? ` This patient is ${ranges.weight_status}.` : ''}`
      : '',
    ranges.breed_risk_notes.length ? `Known breed predispositions to weigh: ${ranges.breed_risk_notes.join('; ')}.` : '',
    `(Species/breed_key for the search_knowledge_base tool, if needed: species="${ranges.species}", breed_key="${ranges.breed_key || ''}", age_years=${p.age_years ?? 'null'}, weight_kg=${p.weight_kg ?? 'null'}.)`
  ].filter(Boolean).join('\n');

  return `Patient: ${p.name || 'Unnamed'}, ${p.species || 'unknown species'}${p.breed ? ', ' + p.breed : ''}, ${p.age_years ?? '?'} years old, ${p.weight_kg ?? '?'} kg.
Overall health score: ${report.overall_health_score}/100.

${contextLines}

Per-system findings (already computed from real multi-modal fusion across the exam's diagnostic instruments, already normalized against this patient's species/breed/age reference ranges above):
${systemLines}

Recommendations already generated by the fusion engine: ${(report.recommendations || []).join('; ')}`;
}

function router() {
  const r = express.Router();

  r.post('/ai-narrative', async (req, res) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.json({ narrative: null, reason: 'no_api_key' });
    }

    const report = req.body;
    if (!report || !report.systems) {
      return res.status(400).json({ narrative: null, reason: 'bad_request' });
    }

    try {
      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey });
      const messages = [{ role: 'user', content: buildPrompt(report) }];
      let narrative = '';

      // Agentic loop: only the custom search_knowledge_base tool ever
      // stops here with stop_reason "tool_use" — web_search is a
      // server-side tool Anthropic resolves inside its own response, so
      // it never hands control back to us. Bounded to guard against a
      // runaway tool-call loop.
      for (let turn = 0; turn < 4; turn++) {
        const msg = await client.messages.create({
          model: 'claude-sonnet-5',
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          tools: TOOLS,
          messages
        });

        const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
        if (text) narrative = text;

        const toolUses = msg.content.filter(b => b.type === 'tool_use' && b.name === 'search_knowledge_base');
        if (msg.stop_reason !== 'tool_use' || toolUses.length === 0) break;

        messages.push({ role: 'assistant', content: msg.content });
        messages.push({
          role: 'user',
          content: toolUses.map(tu => ({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: JSON.stringify(runKnowledgeBaseTool(tu.input))
          }))
        });
      }

      res.json(narrative ? { narrative } : { narrative: null, reason: 'empty_response' });
    } catch (err) {
      res.json({ narrative: null, reason: 'api_error', message: err.message });
    }
  });

  return r;
}

module.exports = { router };
