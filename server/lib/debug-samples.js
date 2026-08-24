/**
 * server/lib/debug-samples.js
 *
 * TEMPORARY — sends one sample of each transactional email template to a
 * requested address, using the exact same shell()/button()/send() code the
 * real flows use, with placeholder content instead of live DB records. Copy
 * kept byte-identical to server/lib/auth.js, pets-api.js, and exams-api.js
 * at time of writing — re-sync if those templates change again. Admin-
 * gated so it isn't an open send-mail-anywhere endpoint. Delete this file
 * and its mount point in server/services/web.js once no longer needed.
 */
const express = require('express');
const { requireAuth, requireRole } = require('./auth');
const { ah } = require('./async-handler');
const { appOrigin } = require('./utils');
const email = require('./email');
const { buildReportPdf } = require('./report-pdf');

function router() {
  const r = express.Router();

  r.post('/_debug/sample-emails', requireAuth, requireRole('admin', 'super_admin'), ah(async (req, res) => {
    const { to } = req.body || {};
    if (!to) return res.status(400).json({ error: 'to is required' });
    const origin = appOrigin(req);
    const results = {};

    results.password_reset = await email.send({
      to, subject: 'Let\'s get you back in',
      html: email.shell({
        origin, title: 'Forgot your password? No worries.',
        bodyHtml: `<p>We got a request to reset the password on this Vitarus account. Happens to the best of us — click below and you'll be back in in no time.</p>
                   ${email.button('Choose a new password', `${origin}/reset-password.html?token=sample-preview-token`)}
                   <p style="margin-top:18px;color:#637784;font-size:12.5px;">This link is good for the next hour. If this wasn't you, no need to do anything — your account is still safe.</p>`
      })
    });

    results.owner_welcome = await email.send({
      to, subject: 'Welcome to Vitarus — Buddy is all set up 🐾',
      html: email.shell({
        origin, title: 'Welcome to Vitarus!',
        bodyHtml: `<p><b>Buddy</b> just had a visit at the clinic, and we've set up a portal just for you to keep track of their health journey — every exam, every result, all in one place.</p>
                   <p>As soon as your vet signs off on this visit, the full report will be waiting for you right here, written in plain language so it's easy to follow.</p>
                   <p>Let's get you in — choose a password to unlock your portal:</p>
                   ${email.button('Set your password', `${origin}/reset-password.html?token=sample-preview-token`)}
                   <p style="margin-top:18px;color:#637784;font-size:12.5px;">This link works for the next 7 days. Already set a password before? You can just sign in instead.</p>`
      })
    });

    results.vet_review = await email.send({
      to, subject: 'Buddy is ready for your expert eye 👀',
      html: email.shell({
        origin, title: 'A patient is waiting on you',
        bodyHtml: `<p><b>Buddy</b> (Canine, Golden Retriever) just wrapped up a full diagnostic exam, and it's ready for your review.</p>
                   <p>Their owner is looking forward to hearing from you — take a look whenever you're ready.</p>
                   ${email.button('Review now', `${origin}/vet/index.html`)}`
      })
    });

    let attachments;
    try {
      const samplePdf = await buildReportPdf({
        ai_narrative: 'Buddy is a healthy adult Golden Retriever. All systems screened within expected range, with one mildly elevated blood pressure reading worth a recheck.',
        vet_notes: 'Recheck blood pressure at next visit — otherwise Buddy looks great!',
        signed_by_name: 'Jane Smith', signed_at: new Date().toISOString(),
        report: {
          overall_health_score: 89,
          systems: {
            skin: { level: 'Low Risk', reasoning: 'No lesions or hotspots detected.' },
            heart: { level: 'Moderate Risk', reasoning: 'Systolic BP 142 mmHg, mildly elevated.' },
            musculoskeletal: { level: 'Low Risk', reasoning: 'Gait and muscle symmetry normal.' },
            liver: { level: 'Low Risk', reasoning: 'No abnormal findings.' },
            kidneys: { level: 'Low Risk', reasoning: 'Within normal range.' },
            movement: { level: 'Low Risk', reasoning: 'No lameness observed.' }
          },
          key_findings: { skin: 'No skin issues', heart: 'BP mildly elevated at 142', musculoskeletal: 'Normal', liver: 'Normal', kidneys: 'Normal', movement: 'Normal gait' },
          recommendations: ['Recheck blood pressure in 3 months', 'Continue annual wellness exams']
        }
      }, { name: 'Buddy', species: 'Canine', breed: 'Golden Retriever', age_years: 4, weight_kg: 28 });
      attachments = [{ filename: 'Buddy-vitarus-report.pdf', type: 'application/pdf', content: samplePdf }];
    } catch (err) {
      console.error('Sample PDF build failed:', err.message);
    }

    results.report_signed = await email.send({
      to, subject: "Buddy's results are in! 🐾",
      html: email.shell({
        origin, title: 'Great news about Buddy!',
        bodyHtml: `<p>Dr. Jane Smith just finished reviewing and signing off on <b>Buddy</b>'s exam and the results look good overall.</p>
                   <p>We've packaged the full report as a PDF, right here in this email — written in plain, friendly language, no medical degree required. It's also always waiting for you in your Vitarus portal.</p>
                   ${email.button('View report online', `${origin}/owner/index.html`)}
                   <p style="margin-top:18px;color:#637784;font-size:12.5px;">Got questions about anything in there? Your vet is always happy to help — just reach out.</p>`
      }),
      attachments
    });

    res.json(results);
  }));

  return r;
}

module.exports = { router };
