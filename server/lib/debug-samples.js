/**
 * server/lib/debug-samples.js
 *
 * TEMPORARY — sends one sample of each transactional email template to a
 * requested address, using the exact same shell()/button() code the real
 * flows use, with placeholder content instead of live DB records. Admin-
 * gated so it isn't an open send-mail-anywhere endpoint. Delete this file
 * and its mount point in server/services/web.js once no longer needed.
 */
const express = require('express');
const { requireAuth, requireRole } = require('./auth');
const { ah } = require('./async-handler');
const { appOrigin } = require('./utils');
const email = require('./email');

function router() {
  const r = express.Router();

  r.post('/_debug/sample-emails', requireAuth, requireRole('admin', 'super_admin'), ah(async (req, res) => {
    const { to } = req.body || {};
    if (!to) return res.status(400).json({ error: 'to is required' });
    const origin = appOrigin(req);
    const results = {};

    results.password_reset = await email.send({
      to, subject: 'Reset your Vitarus password',
      html: email.shell({
        origin, title: 'Reset your password',
        bodyHtml: `<p>Someone requested a password reset for this Vitarus account.</p>
                   ${email.button('Choose a new password', `${origin}/reset-password.html?token=sample-preview-token`)}
                   <p style="margin-top:18px;color:#637784;font-size:12.5px;">This link expires in 1 hour. If this wasn't you, no action is needed.</p>`
      })
    });

    results.owner_welcome = await email.send({
      to, subject: 'Your Vitarus portal account is ready',
      html: email.shell({
        origin, title: 'Your pet is now on Vitarus',
        bodyHtml: `<p><b>Buddy</b> was just added at the clinic under this email address, and a portal account has been created for you — you'll see the full diagnostic report here as soon as a vet signs off.</p>
                   ${email.button('Set your password', `${origin}/reset-password.html?token=sample-preview-token`)}
                   <p style="margin-top:18px;color:#637784;font-size:12.5px;">This link expires in 7 days. Already have a password? You can also just sign in.</p>`
      })
    });

    results.vet_review = await email.send({
      to, subject: 'New exam ready for your review — Buddy',
      html: email.shell({
        origin, title: 'A new exam is awaiting your review',
        bodyHtml: `<p><b>Buddy</b> (Canine, Golden Retriever) has a new diagnostic exam ready for your review and signature.</p>
                   ${email.button('Review now', `${origin}/vet/index.html`)}`
      })
    });

    results.report_signed = await email.send({
      to, subject: "Buddy's report is ready to view",
      html: email.shell({
        origin, title: 'Your pet\'s report is ready',
        bodyHtml: `<p>Dr. Jane Smith has reviewed and signed off on <b>Buddy</b>'s diagnostic report — it's now available in your Vitarus portal.</p>
                   ${email.button('View report', `${origin}/owner/index.html`)}`
      })
    });

    res.json(results);
  }));

  return r;
}

module.exports = { router };
