// One place that owns "how does this server send mail".
//
// Why this exists: the activation email worked locally but timed out in
// production. Gmail is reached over SMTP (ports 465/587), and Render's free
// tier blocks outbound SMTP to stop spam, so the connection never completes and
// nodemailer reports ETIMEDOUT. No amount of fixing the approval logic helps
// while the transport itself cannot leave the host.
//
// So the transport is chosen at boot from what the environment provides:
//
//   RESEND_API_KEY set  -> HTTPS API on port 443, which Render allows. Preferred.
//   otherwise           -> Gmail SMTP, correct on a laptop and on a host that
//                          permits SMTP.
//
// Set RESEND_API_KEY (plus optionally RESEND_FROM) on the host and the activation
// email starts working again with no code change. The Gmail path is kept so
// nothing breaks for anyone still running this where SMTP is reachable.
const nodemailer = require('nodemailer');

let transport = null;
let provider = null;
let startupCheckDone = false;

// Human-readable description of the active transport, for the boot log and for
// the error text an admin sees when a send fails.
function providerName() {
  if (provider === 'resend') return 'Resend (HTTPS)';
  if (provider === 'gmail') return 'Gmail (SMTP)';
  return 'none';
}

function buildTransport() {
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    provider = 'resend';
    return nodemailer.createTransport({
      host: 'api.resend.com',
      port: 443,
      secure: true,
      auth: { user: 'resend', pass: apiKey },
      // Without these a blocked endpoint hangs until the platform kills the
      // request, which is exactly how the SMTP timeout presented itself.
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
  }

  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    provider = 'gmail';
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
  }

  provider = null;
  return null;
}

function getTransport() {
  if (!transport) transport = buildTransport();
  return transport;
}

// Explains, in the caller's terms, why nothing can be sent. Shown to the admin
// instead of a bare failure, because the two causes need opposite fixes.
function mailConfigError() {
  if (process.env.RESEND_API_KEY) return null;
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) return null;
  return 'No mail provider is configured. Set RESEND_API_KEY (recommended) or EMAIL_USER and EMAIL_PASS in the server environment.';
}

// Proves the credentials work at boot rather than on the first real activation.
// Runs at most once per process.
function verifyStartup() {
  if (startupCheckDone) return;
  startupCheckDone = true;

  const t = getTransport();
  if (!t) {
    console.error('Mail: no provider configured. Set RESEND_API_KEY or EMAIL_USER/EMAIL_PASS.');
    return;
  }

  t.verify((err) => {
    if (err) {
      console.error(`Mail: ${providerName()} verification failed - ${err.message}`);
      console.error(
        'Mail: if this is a timeout or a connection error, the host is probably blocking outbound SMTP (Render free tier does). Set RESEND_API_KEY to send over HTTPS instead.',
      );
    } else {
      console.log(`Mail: ready via ${providerName()}.`);
    }
  });
}

// Single send entry point so every caller behaves identically and reports the
// same reason on failure.
async function sendMail({ to, subject, html, text }) {
  const t = getTransport();
  if (!t) {
    return { sent: false, reason: mailConfigError() };
  }

  // Resend requires an explicit From, and Gmail will only send as the account
  // it authenticated with - so the from address is derived per provider.
  const fromName = 'Work Immersion System';
  const from = provider === 'resend'
    ? process.env.RESEND_FROM || `Work Immersion <${process.env.EMAIL_USER || 'onboarding@resend.dev'}>`
    : `"${fromName}" <${process.env.EMAIL_USER}>`;

  try {
    await t.sendMail({ from, to, subject, html, text });
    return { sent: true, reason: null };
  } catch (err) {
    // ETIMEDOUT/ESOCKET here almost always means the network path is blocked
    // rather than the message being bad, so it gets its own wording.
    const blocked = ['ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'ETIMOUT'].includes(err.code);
    const reason = blocked
      ? `Could not reach the mail server (${err.code}). This host is most likely blocking outbound SMTP. Set RESEND_API_KEY so mail is sent over HTTPS instead.`
      : err.code === 'EAUTH'
        ? `The mail provider rejected the sign-in for ${process.env.EMAIL_USER || process.env.RESEND_FROM}. Check the API key or app password.`
        : `The mail provider did not accept the message (${err.code || err.message}). Try again in a moment.`;
    console.error(`Mail: failed to send to ${to} [${err.code || 'no code'}]: ${err.message}`);
    return { sent: false, reason };
  }
}

// Names and addresses reach the mail bodies from Excel imports and typed forms,
// so they are escaped before interpolation. Lives here because escaping HTML is
// only ever needed for mail content.
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { getTransport, mailConfigError, providerName, sendMail, verifyStartup, escapeHtml };
