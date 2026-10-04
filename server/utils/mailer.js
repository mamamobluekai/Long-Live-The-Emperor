// One place that owns "how does this server send mail".
//
// Why this exists: the activation email worked locally but timed out in
// production. Gmail is reached over SMTP (ports 465/587), and Render's free
// tier blocks outbound SMTP to stop spam (Render changelog, 2025-09-16), so the
// connection never completes and nodemailer reports ETIMEDOUT. No amount of
// fixing the approval logic helps while the transport cannot leave the host.
//
// The provider is therefore chosen at boot from what the environment provides:
//
//   RESEND_API_KEY set  -> Resend's HTTPS API on port 443, which Render allows.
//   otherwise           -> Gmail over SMTP, correct on a laptop and on any host
//                          that permits SMTP.
//
// Resend is called with a plain HTTPS POST rather than through nodemailer.
// Nodemailer only speaks SMTP, so pointing it at an HTTP API makes it fake an
// SMTP conversation; against Resend that ended in "Connection closed" during the
// verify() handshake. A direct fetch is what the API actually expects, has no
// handshake to fail, and lets the HTTP status be reported precisely.
const nodemailer = require('nodemailer');

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

// Every outbound HTTPS call is bounded. An unbounded fetch on a platform that
// silently drops packets is what turned a misconfiguration into a request that
// hung until the platform killed it.
const REQUEST_TIMEOUT_MS = 20000;

let provider = null;
let smtpTransport = null;
let startupCheckDone = false;

// Human-readable name of the active provider, for the boot log.
function providerName() {
  const active = resolveProvider();
  if (active === 'resend') return 'Resend (HTTPS)';
  if (active === 'gmail') return 'Gmail (SMTP)';
  return 'none';
}

function resolveProvider() {
  if (!provider) {
    if (process.env.RESEND_API_KEY) provider = 'resend';
    else if (process.env.EMAIL_USER && process.env.EMAIL_PASS) provider = 'gmail';
    else provider = 'none';
  }
  return provider;
}

function getSmtpTransport() {
  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
  }
  return smtpTransport;
}

// Explains, in the caller's terms, why nothing can be sent. Shown to the admin
// instead of a bare failure, because the two causes need opposite fixes.
function mailConfigError() {
  if (resolveProvider() !== 'none') return null;
  return 'No mail provider is configured. Set RESEND_API_KEY (required on Render free tier) or EMAIL_USER and EMAIL_PASS.';
}

// The From address. Resend rejects anything but a domain it is allowed to send
// for, so this is configurable; Gmail can only send as the account it
// authenticated with.
//
// RESEND_FROM is typed by hand into a dashboard, so it is the single most likely
// value to be subtly malformed - a trailing full stop is enough for the whole
// send to be rejected. Checked here so it is caught at boot rather than on the
// first account activation.
const FROM_SHAPE = /^(?:[^<>@]*<\s*[^<>\s@]+@[^<>\s@]+\s*>|[^<>\s@]+@[^<>\s@]+)$/;

function fromAddress() {
  if (resolveProvider() === 'resend') {
    return (process.env.RESEND_FROM || 'Work Immersion <onboarding@resend.dev>').trim();
  }
  return `"Work Immersion System" <${process.env.EMAIL_USER}>`;
}

// Returns a message when RESEND_FROM cannot possibly be accepted.
function fromAddressProblem() {
  if (resolveProvider() !== 'resend') return null;
  const from = (process.env.RESEND_FROM || 'Work Immersion <onboarding@resend.dev>').trim();
  if (FROM_SHAPE.test(from)) return null;
  return `RESEND_FROM is malformed: "${from}". It must be exactly "email@example.com" or "Name <email@example.com>" - a stray character such as a trailing full stop makes Resend reject every message with HTTP 422.`;
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Turns a Resend error body into something an admin can act on. Resend's own
// messages are specific ("domain is not verified"), so they are passed through
// rather than flattened into "failed".
function resendErrorReason(status, body) {
  const detail = body?.message || body?.name || '';
  if (status === 401 || status === 403) {
    if (/domain/i.test(detail)) {
      return `Resend rejected the sending domain (${detail}). Verify the domain in Resend, or set RESEND_FROM=Work Immersion <onboarding@resend.dev> to send to your own address while testing.`;
    }
    return `Resend rejected the API key (${detail}). Check that RESEND_API_KEY on the host is correct and has not been revoked.`;
  }
  if (status === 422) {
    // Resend's own text is specific and correct here - it names whether the
    // problem is the from or the to address, and mentions the testing-address
    // restriction. Relaying it verbatim beats a generic explanation.
    return `Resend rejected the message as invalid: ${detail || 'no detail given'}.`;
  }
  if (status === 429) {
    return `Resend is rate limiting this account (${detail}). Wait a moment and resend.`;
  }
  return `Resend did not accept the message (HTTP ${status}${detail ? `: ${detail}` : ''}).`;
}

async function sendViaResend({ to, subject, html, text }) {
  const fromProblem = fromAddressProblem();
  if (fromProblem) return { sent: false, reason: fromProblem };

  let res;
  let body = null;
  try {
    res = await fetchWithTimeout(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [to],
        subject,
        html,
        text,
      }),
    });
  } catch (err) {
    const aborted = err.name === 'AbortError';
    return {
      sent: false,
      reason: aborted
        ? `The request to Resend timed out after ${REQUEST_TIMEOUT_MS / 1000}s. Check the host's outbound HTTPS access.`
        : `Could not reach the Resend API (${err.message}). Check the host's outbound HTTPS access.`,
    };
  }

  body = await res.json().catch(() => null);

  if (!res.ok) {
    return { sent: false, reason: resendErrorReason(res.status, body) };
  }
  return { sent: true, reason: null };
}

async function sendViaGmail({ to, subject, html, text }) {
  try {
    await getSmtpTransport().sendMail({ from: fromAddress(), to, subject, html, text });
    return { sent: true, reason: null };
  } catch (err) {
    // ETIMEDOUT/ESOCKET here almost always means the network path is blocked
    // rather than the message being bad, so it gets its own wording.
    const blocked = ['ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'ETIMOUT'].includes(err.code);
    const reason = blocked
      ? `Could not reach Gmail over SMTP (${err.code}). This host blocks outbound SMTP. Set RESEND_API_KEY so mail is sent over HTTPS instead.`
      : err.code === 'EAUTH'
        ? `Gmail rejected the sign-in for ${process.env.EMAIL_USER}. Check that EMAIL_PASS is a current app password.`
        : `Gmail did not accept the message (${err.code || err.message}). Try again in a moment.`;
    console.error(`Mail: Gmail send to ${to} failed [${err.code || 'no code'}]: ${err.message}`);
    return { sent: false, reason };
  }
}

// Single send entry point so every caller behaves identically and reports the
// same reason on failure.
async function sendMail({ to, subject, html, text }) {
  if (resolveProvider() === 'resend') return sendViaResend({ to, subject, html, text });
  if (resolveProvider() === 'gmail') return sendViaGmail({ to, subject, html, text });
  return { sent: false, reason: mailConfigError() };
}

// Proves the credentials work at boot rather than on the first real activation.
// Runs at most once per process.
function verifyStartup() {
  if (startupCheckDone) return;
  startupCheckDone = true;

  const active = resolveProvider();

  if (active === 'resend') {
    // Deliberately no authenticated API call here. Resend's send-only keys are
    // refused by every read endpoint (GET /domains answers 401 "restricted to
    // only send emails"), so probing one reported a perfectly good key as broken.
    // The key is validated for real on the first send, which returns the exact
    // reason if it is wrong.
    const fromProblem = fromAddressProblem();
    if (fromProblem) {
      console.error(`Mail: ${providerName()} is misconfigured - ${fromProblem}`);
      return;
    }
    console.log(`Mail: ready via ${providerName()}, sending as "${fromAddress()}". The API key is validated on the first send.`);
    return;
  }

  if (active === 'gmail') {
    getSmtpTransport().verify((err) => {
      if (err) {
        console.error(`Mail: ${providerName()} verification failed - ${err.message}`);
        console.error(
          `Mail: if this is a timeout or connection error, the host is blocking outbound SMTP (Render free tier does, since 2025-09-26). Set RESEND_API_KEY to send over HTTPS instead.`,
        );
      } else {
        console.log(`Mail: ready via ${providerName()}.`);
      }
    });
    return;
  }

  console.error('Mail: no provider configured. Set RESEND_API_KEY or EMAIL_USER/EMAIL_PASS.');
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

module.exports = { getSmtpTransport, mailConfigError, providerName, sendMail, verifyStartup, escapeHtml };
