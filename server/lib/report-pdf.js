/**
 * server/lib/report-pdf.js
 *
 * Renders a signed exam as a PDF for the "your report is ready" email
 * attachment. Deliberately mirrors the owner portal's simplified web view
 * (js/report-view.js opts.simplified) rather than the staff/vet clinical
 * one — plain-language system names, action-oriented risk labels, no
 * confidence percentages or per-signal weighting. An owner should be able
 * to open this on a phone and understand it without the app.
 *
 * Leads with the single biggest concern and what to do about it, not the
 * score — same redesign as the web view's ownerReportHTML(): patient info
 * → data-quality check → priority finding → bottom line → the explained
 * score → per-system findings (with the raw measurement vs. reference
 * range that decided each flag) → an urgency-grouped action plan, instead
 * of "42/100" followed immediately by six same-sized system blocks.
 *
 * This file can't import js/report-view.js (that's a browser script with
 * no module exports, mixing pure logic with DOM-facing HTML-string
 * builders) so the handful of pure helpers it needs — ranking systems by
 * severity, the urgency/confidence labels, the recommendation shape — are
 * duplicated here in pdfkit-native form, same convention this file already
 * used for SYSTEM_LABELS_SIMPLE/LEVEL_LABELS_SIMPLE before this rewrite.
 *
 * Built with pdfkit (pure JS, no headless-browser dependency — matters on
 * Render's free tier, where a Puppeteer/Chromium approach would be a real
 * memory/cold-start risk) rather than reusing the client-side print-to-PDF
 * HTML in js/report-view.js, which needs a live browser to render.
 */
const PDFDocument = require('pdfkit');
const { getReferenceRanges } = require('../../js/vet-knowledge-base.js');

const SYSTEM_LABELS_SIMPLE = {
  skin: 'Skin & Coat', heart: 'Heart', musculoskeletal: 'Bones & Joints',
  liver: 'Liver', kidneys: 'Kidneys', movement: 'Walking & Movement'
};
const LEVEL_LABELS_SIMPLE = {
  'Low Risk': 'Looks healthy', 'Moderate Risk': 'Worth keeping an eye on', 'High Risk': 'Needs attention'
};
const LEVEL_COLORS = { 'Low Risk': '#15958d', 'Moderate Risk': '#e6a23c', 'High Risk': '#c9484d' };
const URGENCY_META = {
  today:   { label: 'Today',          color: '#c2372e', bg: '#fbe8e6' },
  soon:    { label: 'Follow up soon', color: '#8a5c10', bg: '#fdf2df' },
  routine: { label: 'Routine',        color: '#1c6b41', bg: '#eafaf3' }
};

const NAVY = '#12324a', MUTED = '#637784', BORDER = '#d8e5e2', ACCENT = '#15958d';

function scoreBand(score) {
  if (score >= 75) return 'Overall, things look good.';
  if (score >= 50) return 'Overall, a few things are worth watching.';
  return 'Overall, some findings need follow-up.';
}

function recoText(r) { return typeof r === 'string' ? r : r.text; }
function recoUrgency(r) { return typeof r === 'string' ? null : r.urgency; }

function systemUrgency(level) {
  return level === 'High Risk' ? 'today' : level === 'Moderate Risk' ? 'soon' : 'routine';
}

/** Every scored system, worst-first. */
function rankedSystems(report) {
  const order = { 'High Risk': 3, 'Moderate Risk': 2, 'Low Risk': 1 };
  return Object.entries(SYSTEM_LABELS_SIMPLE)
    .map(([key, label]) => ({ key, label, s: report.systems[key] }))
    .filter(e => e.s)
    .sort((a, b) => (order[b.s.level] - order[a.s.level]) || (b.s.score - a.s.score));
}

function confidenceLabel(pct) {
  if (typeof pct !== 'number') return null;
  if (pct >= 85) return 'High confidence';
  if (pct >= 65) return 'Moderate confidence';
  return 'Screening-level evidence';
}

/** Same species/breed/age-resolved lookup ai-analysis.js scores against — a
 *  deterministic data-quality check, not an AI judgment, so it belongs on
 *  every report regardless of whether OPENAI_API_KEY is configured. */
function dataQualityFlags(pet) {
  const flags = [];
  if (pet.breed_key && pet.weight_kg != null) {
    try {
      const ranges = getReferenceRanges(pet.species, pet.breed_key, pet.age_years, pet.weight_kg);
      if (ranges.weight_status && ranges.weight_status !== 'within breed-typical range' && ranges.expected_weight_range_kg) {
        flags.push(`Recorded weight ${pet.weight_kg} kg is ${ranges.weight_status} for ${ranges.breed_label || pet.breed || 'the recorded breed'} `
          + `(typically ${ranges.expected_weight_range_kg[0]}–${ranges.expected_weight_range_kg[1]} kg). Please verify the weight and breed `
          + `before interpreting weight-dependent findings — this is not corrected automatically.`);
      }
    } catch { /* lookup miss — never block the PDF over this */ }
  }
  return flags;
}

function fmtNum(v) { return typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : v; }

function statFlag(value, lo, hi) {
  if (typeof value !== 'number') return null;
  if (lo != null && value < lo) return 'high_low';
  if (hi != null && value > hi) return 'high_low';
  if (lo != null || hi != null) return 'normal';
  return null;
}

/** One raw measurement, drawn as a single line: label, value, range, flag word. */
function drawStatRow(doc, { label, value, unit = '', lo, hi, rangeText }) {
  if (value == null) return;
  const flag = statFlag(value, lo, hi);
  const isAbnormal = flag === 'high_low';
  // pdfkit's base Helvetica font only covers WinAnsi — ≤/≥ silently garble
  // into unrelated glyphs, unlike the web view which can use them freely.
  const range = rangeText || (lo != null && hi != null ? `${fmtNum(lo)}–${fmtNum(hi)} ${unit}`.trim()
    : hi != null ? `up to ${fmtNum(hi)} ${unit}`.trim()
    : lo != null ? `at least ${fmtNum(lo)} ${unit}`.trim()
    : '—');
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(NAVY).text(`${label}: `, 50, doc.y, { continued: true, width: 495 });
  doc.font('Helvetica').fontSize(9.5).fillColor(NAVY).text(`${fmtNum(value)}${unit ? ' ' + unit : ''}  `, { continued: true });
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(`(Normal: ${range})`, { continued: isAbnormal });
  if (isAbnormal) {
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(flag === 'high_low' ? '#c2372e' : MUTED).text('  FLAGGED');
  }
}

/**
 * @param {object} exam    a serialized exam (see exams-api.js serializeExam) — needs
 *                         .report, .signed_by_name, .signed_at, .vet_notes
 * @param {object} pet     the pets row — needs .name/.species/.breed/.breed_key/
 *                         .age_years/.weight_kg
 * @param {Buffer} [photo] the pet's uploaded photo (JPEG/PNG), if any — from
 *                         pet_photos, fetched by the caller since this
 *                         module has no DB access of its own
 * @returns {Promise<Buffer>}
 */
function buildReportPdf(exam, pet, photo) {
  return new Promise((resolve, reject) => {
    const report = exam.report;
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ── Header ──────────────────────────────────────────────────────────
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(20).text('Vitarus', { continued: false });
    doc.fillColor(MUTED).font('Helvetica').fontSize(10).text('Multi-Modal Veterinary Diagnostic Report');
    doc.moveDown(0.6);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(BORDER).stroke();
    doc.moveDown(0.8);

    // Photo (if the owner uploaded one) sits to the right of the name block,
    // clipped to a rounded square so it reads as a portrait, not a raw
    // rectangle crop. Text width narrows to leave room for it.
    const hasPhoto = Boolean(photo);
    const textWidth = hasPhoto ? 425 : 495;
    const nameBlockTop = doc.y;

    if (hasPhoto) {
      const px = 485, py = nameBlockTop, size = 55, radius = 8;
      try {
        doc.save();
        doc.roundedRect(px, py, size, size, radius).clip();
        doc.image(photo, px, py, { width: size, height: size, cover: [size, size] });
        doc.restore();
      } catch (err) {
        // A corrupt/unsupported image shouldn't take the whole report down —
        // pdfkit only decodes JPEG/PNG, and upload validation already
        // restricts to those, but this is cheap insurance either way.
        console.error('Report PDF: photo embed failed:', err.message);
        doc.restore();
      }
    }

    const petLine = [pet.species, pet.breed].filter(Boolean).join(' · ');
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(16).text(pet.name || 'Patient', 50, nameBlockTop, { width: textWidth });
    doc.fillColor(MUTED).font('Helvetica').fontSize(10.5)
      .text([petLine, pet.age_years != null ? `${pet.age_years} yrs` : null, pet.weight_kg != null ? `${pet.weight_kg} kg` : null]
        .filter(Boolean).join(' · '), 50, doc.y, { width: textWidth });
    doc.moveDown(0.3);
    doc.text(`Prepared by Vitarus · reviewed and released by ${exam.signed_by_name || 'your vet'} on ${new Date(exam.signed_at || Date.now()).toLocaleString()}`, 50, doc.y, { width: textWidth });
    doc.y = Math.max(doc.y, nameBlockTop + 55);
    doc.moveDown(1);

    // ── Data-quality check (deterministic, not AI) — near the top, not buried ──
    // pdfkit draws text immediately (no measure-only pass for wrapped text),
    // so a "box behind text" needs the box's height computed with
    // heightOfString() BEFORE anything is drawn, rect first, then text once
    // on top — not drawn twice, which would double up and misalign.
    const dqFlags = dataQualityFlags(pet);
    if (dqFlags.length) {
      const boxWidth = 475;
      doc.font('Helvetica-Bold').fontSize(10.5);
      let dqHeight = doc.heightOfString('IMPORTANT: Please verify patient information', { width: boxWidth }) + 6;
      doc.font('Helvetica').fontSize(9.5);
      for (const f of dqFlags) dqHeight += doc.heightOfString(f, { width: boxWidth }) + 3;

      const boxTop = doc.y;
      doc.save();
      doc.rect(50, boxTop, 495, dqHeight + 20).fillOpacity(0.15).fill('#e6a23c');
      doc.restore();
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#8a5c10').text('IMPORTANT: Please verify patient information', 60, boxTop + 10, { width: boxWidth });
      for (const f of dqFlags) doc.font('Helvetica').fontSize(9.5).fillColor('#6b5000').text(f, 60, doc.y + 3, { width: boxWidth });
      doc.y = boxTop + dqHeight + 20 + 14;
    }

    // ── Priority: the single biggest concern first, not the score ────────
    const ranked = rankedSystems(report);
    const top = ranked[0];
    if (top && top.s.level !== 'Low Risk') {
      const urgency = systemUrgency(top.s.level);
      const meta = URGENCY_META[urgency];
      const boxWidth = 475;
      const topFinding = report.key_findings[top.key] || '';
      doc.font('Helvetica-Bold').fontSize(10);
      let boxHeight = doc.heightOfString(`PRIORITY — ${meta.label.toUpperCase()}`, { width: boxWidth }) + 3;
      doc.font('Helvetica-Bold').fontSize(15);
      boxHeight += doc.heightOfString(top.label, { width: boxWidth }) + 3;
      doc.font('Helvetica').fontSize(10.5);
      boxHeight += doc.heightOfString(topFinding, { width: boxWidth });

      const boxTop = doc.y;
      doc.save();
      doc.rect(50, boxTop, 495, boxHeight + 20).fillOpacity(0.18).fill(meta.bg);
      doc.restore();
      doc.font('Helvetica-Bold').fontSize(10).fillColor(meta.color).text(`PRIORITY — ${meta.label.toUpperCase()}`, 60, boxTop + 10, { width: boxWidth });
      doc.font('Helvetica-Bold').fontSize(15).fillColor(NAVY).text(top.label, 60, doc.y + 3, { width: boxWidth });
      doc.font('Helvetica').fontSize(10.5).fillColor(NAVY).text(topFinding, 60, doc.y + 3, { width: boxWidth });
      doc.y = boxTop + boxHeight + 20 + 12;

      const others = ranked.filter(e => e.key !== top.key && e.s.level !== 'Low Risk');
      if (others.length) {
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(MUTED).text('OTHER FINDINGS', 50, doc.y, { width: 495 });
        doc.moveDown(0.2);
        for (const e of others) {
          const om = URGENCY_META[systemUrgency(e.s.level)];
          doc.font('Helvetica-Bold').fontSize(10).fillColor(om.color).text(`${e.label}: `, 50, doc.y, { continued: true, width: 495 });
          doc.font('Helvetica').fontSize(10).fillColor(NAVY).text(report.key_findings[e.key] || '');
        }
        doc.moveDown(0.5);
      }

      // ── Bottom line ─────────────────────────────────────────────────
      const otherCount = ranked.filter(e => e.s.level !== 'Low Risk').length - 1;
      const reassuringCount = ranked.filter(e => e.s.level === 'Low Risk').length;
      const bottomLine = `Bottom line: The most important finding is ${top.label.toLowerCase()} (${LEVEL_LABELS_SIMPLE[top.s.level].toLowerCase()}).`
        + (otherCount > 0 ? ` ${otherCount} other area${otherCount > 1 ? 's' : ''} also need${otherCount === 1 ? 's' : ''} follow-up,` : '')
        + (reassuringCount ? ` while ${reassuringCount} area${reassuringCount > 1 ? 's look' : ' looks'} reassuring.` : '');
      doc.font('Helvetica-BoldOblique').fontSize(10).fillColor(NAVY).text(bottomLine, 50, doc.y, { width: 495 });
      doc.moveDown(0.8);
    } else {
      doc.font('Helvetica-Bold').fontSize(13).fillColor(ACCENT)
        .text(`${pet.name || 'Your pet'}'s results look good overall`, 50, doc.y, { width: 495 });
      doc.font('Helvetica').fontSize(10).fillColor(MUTED)
        .text('No system needed follow-up this visit — see the findings below for the full picture.', 50, doc.y + 2, { width: 495 });
      doc.moveDown(0.8);
    }

    // ── Overall score, de-emphasized and explained ────────────────────────
    const score = report.overall_health_score;
    const scoreColor = score >= 75 ? ACCENT : score >= 50 ? '#e6a23c' : '#c9484d';
    if (doc.y > 680) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(13).fillColor(NAVY).text('Vitarus Screening Score', { continued: true });
    doc.font('Helvetica-Bold').fontSize(13).fillColor(scoreColor).text(`  ${score}/100`);
    doc.font('Helvetica').fontSize(11).fillColor(NAVY).text(scoreBand(score));
    doc.font('Helvetica').fontSize(9.5).fillColor('#40495a')
      .text('A composite screening indicator based on the available measurements. It does not represent a probability '
        + 'of disease or a veterinary diagnosis. If anything here is unclear or worrying, your vet is the best person to ask.');
    doc.moveDown(0.6);

    // ── Legend ─────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('HOW TO READ THIS REPORT', { continued: false });
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
      .text(`• Looks healthy — no significant abnormality identified.   `
        + `• Worth keeping an eye on — may need monitoring or confirmation.   `
        + `• Needs attention — veterinary follow-up is recommended.`, { width: 495 });
    doc.moveDown(1);

    if (exam.vet_notes) {
      doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text('Notes from your vet');
      doc.font('Helvetica').fontSize(10.5).fillColor(NAVY).text(exam.vet_notes);
      doc.moveDown(1);
    }

    if (exam.ai_narrative) {
      doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text('Summary');
      doc.font('Helvetica').fontSize(10.5).fillColor(NAVY).text(exam.ai_narrative, { align: 'justify' });
      doc.moveDown(1);
    }

    // ── Per-system findings — headline, measured values vs. reference
    //    range, confidence, then the fuller explanation ────────────────────
    doc.font('Helvetica-Bold').fontSize(13).fillColor(NAVY).text('By System');
    doc.moveDown(0.4);

    for (const [key, label] of Object.entries(SYSTEM_LABELS_SIMPLE)) {
      const s = report.systems[key];
      if (!s) continue;
      if (doc.y > 660) doc.addPage();

      const levelText = LEVEL_LABELS_SIMPLE[s.level] || s.level;
      const levelColor = LEVEL_COLORS[s.level] || MUTED;
      const startY = doc.y;

      doc.font('Helvetica-Bold').fontSize(11.5).fillColor(NAVY).text(label, 50, startY, { continued: true, width: 400 });
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(levelColor).text(`  ${levelText.toUpperCase()}`, { align: 'left' });

      const finding = (report.key_findings && report.key_findings[key]) || '';
      if (finding) doc.font('Helvetica').fontSize(10).fillColor(NAVY).text(finding, 50, doc.y + 2, { width: 495 });

      const md = report.modality_data;
      if (md) drawSystemStats(doc, key, md);

      const conf = confidenceLabel(s.confidence);
      if (conf) doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MUTED).text(conf.toUpperCase(), 50, doc.y + 3, { width: 495 });

      if (s.reasoning) doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(s.reasoning, 50, doc.y + 4, { width: 495 });

      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(BORDER).stroke();
      doc.moveDown(0.5);
    }

    // ── Reassuring findings ────────────────────────────────────────────
    const reassuring = ranked.filter(e => e.s.level === 'Low Risk');
    if (reassuring.length) {
      if (doc.y > 700) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(12).fillColor(ACCENT).text("What's reassuring");
      doc.moveDown(0.2);
      for (const e of reassuring) {
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(NAVY).text(`${e.label}: `, 50, doc.y, { continued: true, width: 495 });
        doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(report.key_findings[e.key] || '');
      }
      doc.moveDown(0.8);
    }

    // ── Action plan, grouped by urgency ────────────────────────────────
    if (report.recommendations && report.recommendations.length) {
      if (doc.y > 660) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(13).fillColor(NAVY).text('What Happens Next');
      doc.moveDown(0.3);

      const groups = { today: [], soon: [], routine: [] };
      for (const r of report.recommendations) {
        const u = recoUrgency(r) || 'soon';
        (groups[u] || groups.soon).push(recoText(r));
      }
      for (const key of ['today', 'soon', 'routine']) {
        if (!groups[key].length) continue;
        if (doc.y > 700) doc.addPage();
        const meta = URGENCY_META[key];
        doc.font('Helvetica-Bold').fontSize(10).fillColor(meta.color).text(meta.label.toUpperCase());
        doc.moveDown(0.15);
        for (const rec of groups[key]) {
          doc.font('Helvetica').fontSize(10.5).fillColor(NAVY).text(`• ${rec}`, { width: 495 });
        }
        doc.moveDown(0.5);
      }
    }

    // ── Footer on every page ────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.font('Helvetica').fontSize(8).fillColor(MUTED)
        .text('Generated by Vitarus · Decision support only, not a substitute for veterinary diagnosis.', 50, 780, { width: 495, align: 'center' });
    }

    doc.end();
  });
}

/* Same per-system stat selection as js/report-view.js's SYSTEM_STAT_ROWS —
   limited to values with a real KB-backed or published-standard reference,
   never a fabricated range for the synthetic 0-100 composite scores. */
function drawSystemStats(doc, key, md) {
  if (key === 'skin' && md.thermal) {
    drawStatRow(doc, { label: 'Max limb thermal asymmetry', value: md.thermal.thermal_asymmetry_map?.max_delta_c, unit: '°C', hi: md.thermal.thermal_asymmetry_map?.tolerance_c });
    drawStatRow(doc, { label: 'Core temperature (thermal)', value: md.thermal.heat_index_c, unit: '°C', lo: md.thermal.core_temp_normal_range_c?.[0], hi: md.thermal.core_temp_normal_range_c?.[1] });
  }
  if (key === 'heart' && md.cardiac) {
    drawStatRow(doc, { label: 'Heart rate', value: md.cardiac.heart_rate_bpm, unit: 'bpm', lo: md.cardiac.heart_rate_normal_range_bpm?.[0], hi: md.cardiac.heart_rate_normal_range_bpm?.[1] });
    drawStatRow(doc, { label: 'QTc interval', value: md.cardiac.qtc_interval_ms, unit: 'ms', hi: md.cardiac.qtc_interval_normal_max_ms });
    drawStatRow(doc, { label: 'SpO2 (blood oxygen)', value: md.cardiac.spo2_pct, unit: '%', lo: md.cardiac.spo2_normal_min_pct });
    drawStatRow(doc, { label: 'Systolic blood pressure', value: md.cardiac.blood_pressure?.systolic_mmhg, unit: 'mmHg', hi: md.cardiac.blood_pressure?.systolic_normal_max_mmhg });
  }
  if (key === 'musculoskeletal') {
    if (md.gait) drawStatRow(doc, { label: 'Lameness grade', value: md.gait.lameness_grade, rangeText: md.gait.lameness_scale });
    if (md.thermal) drawStatRow(doc, { label: 'Max limb thermal asymmetry', value: md.thermal.thermal_asymmetry_map?.max_delta_c, unit: '°C', hi: md.thermal.thermal_asymmetry_map?.tolerance_c });
  }
  if ((key === 'liver' || key === 'kidneys') && md.blood?.analytes) {
    const names = key === 'liver' ? ['ALT', 'ALP', 'Total Bilirubin'] : ['BUN', 'Creatinine'];
    for (const name of names) {
      const a = md.blood.analytes.find(x => x.name === name);
      if (!a) continue;
      const [lo, hi] = a.reference_range || [];
      drawStatRow(doc, { label: a.name, value: a.value, unit: a.unit, lo, hi });
    }
  }
  if (key === 'movement' && md.gait) {
    drawStatRow(doc, { label: 'Gait symmetry', value: md.gait.gait_symmetry_pct, unit: '%', lo: md.gait.gait_symmetry_normal_min_pct });
  }
}

module.exports = { buildReportPdf };
