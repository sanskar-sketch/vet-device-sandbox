/**
 * server/lib/email.js
 *
 * Thin wrapper around SendGrid for the platform's transactional email, plus
 * a shared branded template every email in the app builds on (see shell()/
 * button() below) so notifications look like they came from Vitarus rather
 * than a bare unstyled system message.
 *
 * Unlike Resend's shared onboarding@resend.dev sender (which can only email
 * the Resend account's own address without a verified domain), SendGrid's
 * Single Sender Verification only restricts which FROM address you send
 * from — once EMAIL_FROM is verified in the SendGrid dashboard, it can
 * email anyone, no domain/DNS needed. Trade-off: SendGrid's free tier is a
 * 60-day trial (100 emails/day), then requires a paid plan — fine for the
 * near-term use case this was set up for.
 *
 * No SENDGRID_API_KEY or EMAIL_FROM configured -> send() resolves
 * { sent: false } instead of throwing, so every caller can fall back to its
 * own sandbox behavior (e.g. auth.js showing the reset link directly)
 * exactly like the OPENAI_API_KEY / AI narrative feature already does.
 */

// Colors sampled from css/redesign.css's :root palette — the same values
// the product's actual light-theme UI uses, so mail doesn't look like a
// different product.
const COLORS = {
  bg: '#f5f8f7', surface: '#ffffff', border: '#d8e5e2',
  accent: '#15958d', accentHover: '#0f766f',
  text: '#12324a', textMuted: '#637784', textDim: '#8798a1'
};

/**
 * Wraps a notification's body HTML in the shared Vitarus letterhead
 * (logo, card, footer). `origin` must be an absolute origin (from
 * utils.appOrigin(req)) — email clients can't resolve relative asset URLs
 * the way the app's own pages can.
 */
function shell({ title, bodyHtml, origin }) {
  return `<div style="background:${COLORS.bg};padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;">
    <div style="text-align:center;margin-bottom:24px;">
      <img src="${origin}/assets/brand/logo-icon-64.png" width="32" height="32" alt="" style="vertical-align:middle;border-radius:8px;">
      <span style="font-size:19px;font-weight:700;color:${COLORS.text};vertical-align:middle;margin-left:8px;">Vitarus</span>
    </div>
    <div style="background:${COLORS.surface};border:1px solid ${COLORS.border};border-radius:14px;padding:28px;">
      <h1 style="font-size:17px;font-weight:700;color:${COLORS.text};margin:0 0 14px;">${title}</h1>
      <div style="font-size:14px;line-height:1.65;color:${COLORS.text};">${bodyHtml}</div>
    </div>
    <p style="text-align:center;font-size:11px;color:${COLORS.textDim};margin-top:20px;">Vitarus &middot; Multi-Modal Veterinary Diagnostic Platform</p>
  </div>
</div>`;
}

function button(label, url) {
  return `<a href="${url}" style="display:inline-block;background:${COLORS.accent};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 22px;border-radius:9px;margin-top:16px;">${label}</a>`;
}

// Crude plain-text fallback — strips tags rather than hand-writing a second
// copy of each email; fine for these single-paragraph-plus-button notices.
function toPlainText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&middot;/g, '·').replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function send({ to, subject, html }) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey) return { sent: false, reason: 'no_api_key' };
  if (!from) return { sent: false, reason: 'no_from_address' };

  const sgMail = require('@sendgrid/mail');
  sgMail.setApiKey(apiKey);
  try {
    await sgMail.send({ to, from, subject, html, text: toPlainText(html) });
    return { sent: true };
  } catch (err) {
    const detail = err.response && err.response.body ? JSON.stringify(err.response.body) : err.message;
    console.error('SendGrid send failed:', detail);
    return { sent: false, reason: 'send_error', error: detail };
  }
}

module.exports = { send, shell, button };
