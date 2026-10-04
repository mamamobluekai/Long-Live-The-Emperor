// One-time authorisation that turns the Gmail OAuth client into a long-lived
// refresh token, and writes that token into .env.
//
//   npm run mail:auth
//
// Why this has to be manual: a refresh token can only be created by the account
// owner clicking "Allow" in a browser. No script can do it for them, so this
// script does everything around that one click - it opens the consent URL, waits
// for Google to redirect back, exchanges the code for tokens, and edits .env.
//
// Requires in .env:
//   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI
// In the Google Cloud console the OAuth client must be type "Web application"
// (a loopback redirect such as http://localhost:5000 is only allowed there), and
// the Gmail API must be enabled for the project.
const fs = require('fs');
const http = require('http');
const path = require('path');

require('dotenv').config();

const ENV_PATH = path.join(__dirname, '..', '.env');
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

// gmail.send is the only scope needed: it sends mail as the signed-in user and
// nothing else. Ask for more and the consent screen demands extra review.
const SCOPE = 'https://www.googleapis.com/auth/gmail.send';

// Matches "KEY=value" on one line. The gap uses [^\S\r\n] rather than \s
// because \s also matches newlines: with \s the pattern for an empty value runs
// past the end of the line and captures the *following* line instead, which made
// a blank token look like a 75-character one.
const KEY_VALUE = (key) => new RegExp(`^${key}[^\\S\\r\\n]*=[^\\S\\r\\n]*([^\\r\\n]*)`, 'm');
const KEY_LINE = (key) => new RegExp(`^${key}[^\\S\\r\\n]*=.*$`, 'm');

function readEnvValue(key) {
  const match = fs.readFileSync(ENV_PATH, 'utf8').match(KEY_VALUE(key));
  return match ? match[1].trim() : '';
}

// Adds or replaces a key in .env, keeping every other line and comment intact.
function writeEnvValue(key, value) {
  const existing = fs.readFileSync(ENV_PATH, 'utf8');
  const line = `${key}=${value}`;
  const pattern = KEY_LINE(key);
  const next = pattern.test(existing)
    ? existing.replace(pattern, line)
    : `${existing.trimEnd()}\n${line}\n`;
  fs.writeFileSync(ENV_PATH, next);
  console.log(`\nSaved ${key} to .env`);
}

async function main() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  // Defaults to this project's own port so the redirect URI matches what the
  // OAuth client was registered with.
  const redirectUri = process.env.GMAIL_REDIRECT_URI || 'http://localhost:5000/api/email/oauth2callback';
  const from = process.env.GMAIL_FROM || process.env.EMAIL_USER;

  if (!clientId || !clientSecret) {
    console.error('GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set in .env first.');
    process.exit(1);
  }

  const state = `wim_${Math.random().toString(36).slice(2)}`;
  const url =
    `${AUTH_URL}?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code&scope=${encodeURIComponent(SCOPE)}` +
    // access_type=offline is what makes Google return a refresh token at all.
    `&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;

  const redirect = new URL(redirectUri);
  const port = Number(redirect.port || 80);

  console.log('Authorising Gmail for sending. A browser window will open;');
  console.log('sign in as the Gmail account the app should send from, then Allow.\n');
  console.log('If the browser does not open, paste this URL manually:\n');
  console.log(url + '\n');

  const server = http.createServer((req, res) => {
    const current = new URL(req.url, redirectUri);
    const code = current.searchParams.get('code');
    const error = current.searchParams.get('error');
    const returnedState = current.searchParams.get('state');

    // Google's consent screen lands here first, before the actual callback.
    if (!code && !error && !returnedState) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<p>Waiting for the Google consent screen...</p>');
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(
      `<p>${code || error ? 'Authorisation received. You can close this tab.' : 'Something went wrong. Return to the terminal.'}</p>`,
    );
    server.close();

    if (error) {
      console.error(`Authorisation failed: ${error}`);
      process.exit(1);
    }
    if (returnedState !== state) {
      console.error('State mismatch - refusing to use this code.');
      process.exit(1);
    }

    finish(code, { clientId, clientSecret, redirectUri, from });
  });

  server.listen(port, () => {
    // Best effort only; the URL is printed above, so a machine with no browser
    // can still complete this.
    try {
      require('child_process').exec(`start "" "${url}"`);
    } catch {
      // ignore
    }
  });

  server.on('error', (err) => {
    console.error(`Could not listen on port ${port}: ${err.message}`);
    console.error('Free the port, or set GMAIL_REDIRECT_URI to another one that is also registered in the Google Cloud console.');
    process.exit(1);
  });
}

async function finish(code, { clientId, clientSecret, redirectUri, from }) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    console.error(`Token exchange failed: ${body?.error_description || body?.error || res.status}`);
    process.exit(1);
  }

  if (!body.refresh_token) {
    // Happens when Google reuses an existing grant rather than issuing a new one.
    console.log('Google returned no refresh token, which means this account already authorised this app.');
    console.log('If the token in .env no longer works, revoke access at');
    console.log('https://myaccount.google.com/permissions and run this again.');
    process.exit(0);
  }

  writeEnvValue('GMAIL_REFRESH_TOKEN', body.refresh_token);

  if (from) console.log(`Sending as: ${from}`);
  console.log('\nDone. Copy these into the Render dashboard environment:');
  console.log('  GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_FROM');
  console.log('\nRemove RESEND_API_KEY if it is set there, so the Gmail API is used.');
}

// Surfaces the current state when someone just wants to check, without
// reauthorising.
if (process.argv.includes('--status')) {
  const token = readEnvValue('GMAIL_REFRESH_TOKEN');
  console.log(token ? `GMAIL_REFRESH_TOKEN is set (${token.length} chars).` : 'GMAIL_REFRESH_TOKEN is not set.');
  process.exit(0);
}

main();