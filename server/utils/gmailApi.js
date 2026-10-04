// Sending mail through the Gmail REST API instead of SMTP.
//
// Why: SMTP is unusable on this project's host. Render's free tier blocks
// outbound SMTP ports 25/465/587 (changelog 2025-09-16), so the approval email
// failed with ETIMEDOUT from the deployed server while working perfectly from a
// laptop. The Gmail *API* is plain HTTPS on port 443, which the host allows, and
// it is the same Gmail account - so nothing about the sender changes, only the
// transport.
//
// Deliberately dependency-free: the OAuth token exchange and the send call are
// two small HTTPS requests, so there is no reason to pull in `googleapis`.
//
// Credentials come from a one-time authorisation (see scripts/gmailAuth.js):
//   GMAIL_CLIENT_ID      from the Google Cloud console OAuth client
//   GMAIL_CLIENT_SECRET  ditto
//   GMAIL_REFRESH_TOKEN  obtained once by running that script; long-lived
//
// A refresh token is used rather than an access token because access tokens
// expire after an hour and this server has to keep sending approval emails for
// as long as it is running.
const crypto = require('crypto');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

const REQUEST_TIMEOUT_MS = 20000;

// Cached access token, valid for about an hour. Kept in module scope so a burst
// of bulk approvals does not trigger a token refresh per message.
let accessToken = null;
let accessTokenExpiresAt = 0;

function isConfigured() {
  return Boolean(process.env.GMAIL_REFRESH_TOKEN && process.env.GMAIL_CLIENT_ID);
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

// Exchanges the stored refresh token for a short-lived access token, reusing the
// cached one until it is close to expiring.
async function getAccessToken() {
  if (accessToken && Date.now() < accessTokenExpiresAt - 60000) {
    return accessToken;
  }

  const res = await fetchWithTimeout(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }).toString(),
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    // Google's error payload is { error, error_description }. Keep both the code
    // and the HTTP status: "Bad Request" alone identifies nothing.
    const code = body?.error || `HTTP ${res.status}`;
    const detail = body?.error_description || body?.error || `HTTP ${res.status}`;
    const err = new Error(detail);
    err.code = code;
    err.status = res.status;
    throw err;
  }

  accessToken = body.access_token;
  // `expires_in` is seconds. Default to 50 minutes when absent so a missing
  // field can never cause an unbounded cache.
  accessTokenExpiresAt = Date.now() + (Number(body.expires_in) || 3000) * 1000;
  return accessToken;
}

// Base64url, the encoding the Gmail API expects for a raw RFC 2822 message.
function base64Url(input) {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Builds a multipart/alternative message so there is a plain-text part as well
// as HTML. Gmail is markedly more likely to file an HTML-only message as spam,
// which matters here because a rejected approval email means nobody can sign in.
function buildMessage({ to, subject, html, text }) {
  const boundary = `wim_${crypto.randomBytes(12).toString('hex')}`;
  const safeSubject = String(subject).replace(/[\r\n]+/g, ' ');

  return [
    `To: ${to}`,
    `Subject: ${safeSubject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    text || '',
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    '',
    html || '',
    '',
    `--${boundary}--`,
  ].join('\r\n');
}

// Sends one message. Returns { sent, reason } so the caller can report the
// precise failure to the admin instead of a bare "failed".
async function sendMail({ to, subject, html, text }) {
  const from = process.env.GMAIL_FROM || process.env.EMAIL_USER;

  if (!from) {
    return {
      sent: false,
      reason: 'GMAIL_FROM is not set. Set it to the Gmail address that owns the refresh token.',
    };
  }

  let token;
  try {
    token = await getAccessToken();
  } catch (err) {
    // A revoked, expired-by-security-policy or malformed refresh token fails
    // here on every single send, so it is called out explicitly with the fix.
    if (/invalid_grant|unauthorized_client|invalid_client/i.test(err.code || '')) {
      return {
        sent: false,
        reason: `Gmail rejected the refresh token (${err.code}: ${err.message}). Re-run "npm run mail:auth" to authorise the account again.`,
      };
    }
    return {
      sent: false,
      reason: `Could not get a Gmail access token (${err.code || 'no code'}: ${err.message}). Check GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET.`,
    };
  }

  let res;
  try {
    res = await fetchWithTimeout(SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: base64Url(buildMessage({ to, subject, html, text })) }),
    });
  } catch (err) {
    const aborted = err.name === 'AbortError';
    return {
      sent: false,
      reason: aborted
        ? `The request to the Gmail API timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`
        : `Could not reach the Gmail API (${err.message}).`,
    };
  }

  if (res.ok) return { sent: true, reason: null };

  const body = await res.json().catch(() => null);
  const detail = body?.error?.message || body?.error_description || `HTTP ${res.status}`;

  if (res.status === 401 || res.status === 403) {
    return {
      sent: false,
      reason: `Gmail refused the message (${detail}). Check that the refresh token was granted the gmail.send scope and belongs to ${from}.`,
    };
  }
  if (res.status === 429) {
    return { sent: false, reason: `Gmail is rate limiting this account (${detail}). Wait a moment and resend.` };
  }
  return { sent: false, reason: `Gmail did not accept the message (${detail}).` };
}

// Used by the boot log. Deliberately makes no API call: a send-only scope
// cannot list anything, and probing an endpoint just produces a confusing 403.
function describe() {
  return isConfigured()
    ? `Gmail API (HTTPS, sending as ${process.env.GMAIL_FROM || process.env.EMAIL_USER || 'unknown'})`
    : 'Gmail API (not configured)';
}

module.exports = { isConfigured, sendMail, describe };
