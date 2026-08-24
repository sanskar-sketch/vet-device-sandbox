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
 * Built with pdfkit (pure JS, no headless-browser dependency — matters on
 * Render's free tier, where a Puppeteer/Chromium approach would be a real
 * memory/cold-start risk) rather than reusing the client-side print-to-PDF
 * HTML in js/report-view.js, which needs a live browser to render.
 */
const PDFDocument = require('pdfkit');

const SYSTEM_LABELS_SIMPLE = {
  skin: 'Skin & Coat', heart: 'Heart', musculoskeletal: 'Bones & Joints',
  liver: 'Liver', kidneys: 'Kidneys', movement: 'Walking & Movement'
};
const LEVEL_LABELS_SIMPLE = {
  'Low Risk': 'Looks healthy', 'Moderate Risk': 'Worth keeping an eye on', 'High Risk': 'Needs attention'
};
const LEVEL_COLORS = { 'Low Risk': '#15958d', 'Moderate Risk': '#e6a23c', 'High Risk': '#c9484d' };

const NAVY = '#12324a', MUTED = '#637784', BORDER = '#d8e5e2', ACCENT = '#15958d';

function scoreBand(score) {
  if (score >= 75) return 'Overall, things look good.';
  if (score >= 50) return 'Overall, a few things are worth watching.';
  return 'Overall, some findings need follow-up.';
}

/**
 * @param {object} exam    a serialized exam (see exams-api.js serializeExam) — needs
 *                         .report, .signed_by_name, .signed_at, .vet_notes
 * @param {object} pet     the pets row — needs .name/.species/.breed/.age_years/.weight_kg
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
    doc.text(`Signed by ${exam.signed_by_name || 'your vet'} on ${new Date(exam.signed_at || Date.now()).toLocaleString()}`, 50, doc.y, { width: textWidth });
    doc.y = Math.max(doc.y, nameBlockTop + 55);
    doc.moveDown(1);

    // ── Overall score ───────────────────────────────────────────────────
    const score = report.overall_health_score;
    const scoreColor = score >= 75 ? ACCENT : score >= 50 ? '#e6a23c' : '#c9484d';
    doc.font('Helvetica-Bold').fontSize(13).fillColor(NAVY).text('Overall Health Score', { continued: true });
    doc.font('Helvetica-Bold').fontSize(13).fillColor(scoreColor).text(`  ${score}/100`);
    doc.font('Helvetica').fontSize(11).fillColor(NAVY).text(scoreBand(score));
    doc.font('Helvetica').fontSize(9.5).fillColor(MUTED)
      .text('This is a wellbeing indicator, not a diagnosis. If anything here is unclear or worrying, your vet is the best person to ask.');
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

    // ── Per-system cards (plain-language, same framing as the owner portal) ──
    doc.font('Helvetica-Bold').fontSize(13).fillColor(NAVY).text('By System');
    doc.moveDown(0.4);

    for (const [key, label] of Object.entries(SYSTEM_LABELS_SIMPLE)) {
      const s = report.systems[key];
      if (!s) continue;
      if (doc.y > 700) doc.addPage();

      const levelText = LEVEL_LABELS_SIMPLE[s.level] || s.level;
      const levelColor = LEVEL_COLORS[s.level] || MUTED;
      const startY = doc.y;

      doc.font('Helvetica-Bold').fontSize(11.5).fillColor(NAVY).text(label, 50, startY, { continued: true, width: 400 });
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(levelColor).text(`  ${levelText.toUpperCase()}`, { align: 'left' });

      const finding = (report.key_findings && report.key_findings[key]) || '';
      if (finding) doc.font('Helvetica').fontSize(10).fillColor(NAVY).text(finding, 50, doc.y + 2, { width: 495 });
      if (s.reasoning) doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(s.reasoning, 50, doc.y + 3, { width: 495 });

      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(BORDER).stroke();
      doc.moveDown(0.5);
    }

    // ── What happens next ───────────────────────────────────────────────
    if (report.recommendations && report.recommendations.length) {
      if (doc.y > 680) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(13).fillColor(NAVY).text('What Happens Next');
      doc.moveDown(0.3);
      for (const rec of report.recommendations) {
        doc.font('Helvetica').fontSize(10.5).fillColor(NAVY).text(`• ${rec}`, { width: 495 });
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

module.exports = { buildReportPdf };
