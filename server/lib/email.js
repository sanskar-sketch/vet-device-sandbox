/**
 * server/lib/email.js
 *
 * Thin wrapper around SendGrid for the platform's transactional email.
 * Unlike Resend's shared onboarding@resend.dev sender (which can only
 * email the Resend account's own address without a verified domain),
 * SendGrid's Single Sender Verification only restricts which FROM address
 * you send from — once EMAIL_FROM is verified in the SendGrid dashboard,
 * it can send to any recipient, no domain/DNS needed. Trade-off: SendGrid's
 * free tier is a 60-day trial (100 emails/day), then requires a paid plan —
 * fine for the near-term use case this was set up for.
 *
 * No SENDGRID_API_KEY or EMAIL_FROM configured -> send() resolves
 * { sent: false } instead of throwing, so every caller can fall back to
 * its own sandbox behavior (e.g. auth.js showing the reset link directly)
 * exactly like the OPENAI_API_KEY / AI narrative feature already does.
 */
async function send({ to, subject, html }) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey) return { sent: false, reason: 'no_api_key' };
  if (!from) return { sent: false, reason: 'no_from_address' };

  const sgMail = require('@sendgrid/mail');
  sgMail.setApiKey(apiKey);
  try {
    await sgMail.send({ to, from, subject, html });
    return { sent: true };
  } catch (err) {
    const detail = err.response && err.response.body ? JSON.stringify(err.response.body) : err.message;
    console.error('SendGrid send failed:', detail);
    return { sent: false, reason: 'send_error', error: detail };
  }
}

module.exports = { send };
