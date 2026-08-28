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
  text: '#12324a', textMuted: '#637784', textDim: '#8798a1',
  brandNavy: '#123a5c', brandTeal: '#2bb5a6', brandSub: '#9fbbd0'
};

/**
 * Wraps a notification's body HTML in the shared Vitarus letterhead
 * (brand band, card, footer).
 *
 * Callers still pass `origin` (utils.appOrigin(req)) because button() needs
 * absolute URLs — email clients can't resolve relative ones — but the shell
 * itself no longer loads any remote asset, so it doesn't read it.
 */
function shell({ title, bodyHtml }) {
  return `<div style="background:${COLORS.bg};padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;">
    ${letterhead()}
    <div style="background:${COLORS.surface};border:1px solid ${COLORS.border};border-top:none;border-radius:0 0 14px 14px;padding:28px;">
      <h1 style="font-size:17px;font-weight:700;color:${COLORS.text};margin:0 0 14px;">${title}</h1>
      <div style="font-size:14px;line-height:1.65;color:${COLORS.text};">${bodyHtml}</div>
    </div>
    <p style="text-align:center;font-size:11px;color:${COLORS.textDim};margin-top:20px;">Vitarus Animal Diagnostics &middot; Multi-Modal Veterinary Diagnostic Platform</p>
  </div>
</div>`;
}

/**
 * The navy brand band above every email's card.
 *
 * Set as live HTML text rather than an <img> of the logo, which the rest of
 * the app uses: Gmail and Outlook.com strip SVG entirely, and most clients
 * block remote images until the reader opts in — an image-based letterhead
 * would show as an empty box on first open, which is exactly the moment the
 * mail needs to look legitimate. The mark is a wordmark, so text reproduces
 * it faithfully; the teal rule under the "A" is a border-bottom on an inline
 * span, and a client that drops that still renders "VITARUS" correctly.
 */
function letterhead() {
  return `<div style="background:${COLORS.brandNavy};border-radius:14px 14px 0 0;padding:26px 24px 22px;text-align:center;">
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:30px;font-weight:700;letter-spacing:3px;line-height:1.15;color:#ffffff;">VIT<span style="border-bottom:4px solid ${COLORS.brandTeal};padding-bottom:5px;">A</span>RUS</div>
      <div style="font-family:Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:3.6px;color:${COLORS.brandSub};margin-top:16px;">ANIMAL DIAGNOSTICS</div>
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

/**
 * @param {Array<{filename:string, content:Buffer, type:string}>} [attachments]
 *   Buffers are base64-encoded here (SendGrid's wire format) so every
 *   caller just hands over a plain Buffer, same as fs.readFile would give.
 */
async function send({ to, subject, html, attachments }) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey) return { sent: false, reason: 'no_api_key' };
  if (!from) return { sent: false, reason: 'no_from_address' };

  const sgMail = require('@sendgrid/mail');
  sgMail.setApiKey(apiKey);
  try {
    const msg = { to, from, subject, html, text: toPlainText(html) };
    if (attachments && attachments.length) {
      msg.attachments = attachments.map(a => ({
        filename: a.filename,
        type: a.type || 'application/octet-stream',
        content: a.content.toString('base64'),
        disposition: 'attachment'
      }));
    }
    await sgMail.send(msg);
    return { sent: true };
  } catch (err) {
    const detail = err.response && err.response.body ? JSON.stringify(err.response.body) : err.message;
    console.error('SendGrid send failed:', detail);
    return { sent: false, reason: 'send_error', error: detail };
  }
}

module.exports = { send, shell, button };
