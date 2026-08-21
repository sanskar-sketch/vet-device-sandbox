/**
 * server/lib/email.js
 *
 * Thin wrapper around Resend for the platform's transactional email. Uses
 * Resend's own onboarding@resend.dev sender by default — a shared address
 * Resend pre-verifies for you, so real mail can go out to real inboxes
 * with zero domain/DNS setup. Swap EMAIL_FROM once a custom domain is
 * verified in Resend (needed for higher volume / better deliverability;
 * onboarding@resend.dev is rate-limited and clearly not your own brand).
 *
 * No RESEND_API_KEY configured -> send() resolves { sent: false } instead
 * of throwing, so every caller can fall back to its own sandbox behavior
 * (e.g. auth.js showing the reset link directly) exactly like the
 * OPENAI_API_KEY / AI narrative feature already does.
 */
const FROM = process.env.EMAIL_FROM || 'Vitarus <onboarding@resend.dev>';

async function send({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: 'no_api_key' };

  const { Resend } = require('resend');
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({ from: FROM, to, subject, html });
  if (error) return { sent: false, reason: 'send_error', error };
  return { sent: true, id: data.id };
}

module.exports = { send };
