# Security Hardening Guide

This document maps every mitigation in the codebase to the ten attack classes
this capstone must defend against. It is written so a reviewer can trace a
requirement to the exact file, endpoint and database object that implements it.

| # | Attack | Primary defence | Supporting control |
|---|--------|-----------------|--------------------|
| 1 | SQL Injection | Parameterized queries (`$1`, `$2`...) everywhere | `middleware/requestGuard.js` + `utils/sanitize.js` detection |
| 2 | Brute Force | Account lockout + layered rate limits | `security_events` brute-force detector |
| 3 | Credential Stuffing | Per-IP+email limiter + IP-failure detector | `security_events` stuffing detector |
| 4 | DDoS / API flooding | Global API rate limit | Per-route limits + body-size caps + `helmet` |
| 5 | XSS | Output escaping + strict CSP | `utils/sanitize.js` + `middleware/securityHeaders.js` |
| 6 | CSRF | Signed double-submit cookie | `sameSite=strict` + SPA header echo |
| 7 | Session Hijacking | Refresh rotation + token revocation + `jti` deny-list | httpOnly cookie + `alg` pinning |
| 8 | Account Enumeration | Uniform generic errors | timing equalizer + state checks after auth |
| 9 | File Upload Attacks | Magic-byte + extension + MIME whitelist | size caps + audit trail |
| 10 | Broken Access Control | `authenticate` + `authorize(role)` on every route | object-level ownership checks |

---

## 1. SQL Injection

**Defence:** every database call uses the `pg` driver's parameterized query form
(`pool.query('... WHERE email = $1', [value])`). No user input is ever string-
concatenated into SQL. This is structural: injection is impossible regardless of
the payload.

**Detection layer (defence-in-depth):** `server/middleware/requestGuard.js` runs
`detectInjection()` (`server/utils/sanitize.js`) over `req.params`, `req.query`
and `req.body`. Requests carrying high-confidence signatures (`UNION SELECT`,
`OR 1=1`, `; DROP`, ...) are blocked with `400` and logged as a
`sqli_attempt` security event. Content paths (`/api/feed`, `/api/chat`,
`/api/documentation`) may legitimately contain code-like text, so findings there
are logged but not blocked.

**Verification:** `npm run test:security` asserts the detector flags
`' OR 1=1 --` and leaves benign input untouched.

---

## 2. Brute Force

**Defence (three layers):**

1. **Account lockout** - `server/utils/loginAttempts.js` increments a per-email
   counter in `login_attempts`; five failures locks the account for 15 minutes
   (`MAX_ATTEMPTS`, `LOCK_TIME_MINUTES`).
2. **Rate limiting** - `server/middleware/rateLimiters.js`:
   - `authLimiter` - 10 failed logins / 15 min / IP (`skipSuccessfulRequests`).
   - `credentialLimiter` - 5 failed logins / 15 min / (IP + email).
   - the original `loginLimiter` is retained as a coarse backstop.
3. **Behavioural detection** - `controllers/user.controller.js`
   `registerFailedLogin()` emits `brute_force_suspected` when one account sees
   `>= 12` failures in 10 minutes.

**Design note:** login failures always return the same generic message, and the
"account locked" state maps to `401` (not a distinctive `423`) so lockout cannot
itself be used to confirm an account exists. See §8.

---

## 3. Credential Stuffing

**Defence:**

- `credentialLimiter` keys on **IP + email**, so a single source spraying many
  distinct accounts is throttled even when no single account crosses its own
  lockout threshold.
- `registerFailedLogin()` counts `login_failed` events per IP; crossing
  `STUFFING_IP_THRESHOLD` (8 failures / 10 min from one IP) emits a
  `credential_stuffing_suspected` event.
- `ipKeyGenerator` (express-rate-limit v8) normalises IPv6 to a /64 so an
  attacker cannot rotate within one allocation to evade the IP limit.

**Telemetry:** every event is queryable in `security_events`
(`event_type`, `ip_address`, `email`, `created_at`).

---

## 4. DDoS / API Flooding

**Defence:**

- `globalLimiter` - 300 requests / min / IP across `/api` (mounted in `app.js`).
- `apiLimiter` - 120 / min for general CRUD; `writeLimiter` - 40 / min for
  mutations; `uploadLimiter` - 15 / min for multipart uploads.
- Body-size caps: `express.json({ limit: '10kb' })` and
  `express.urlencoded({ limit: '10kb' })` bound request memory.
- `app.disable('x-powered-by')` and `helmet` headers reduce fingerprinting.
- `app.set('trust proxy', 1)` in production so limits key on the real client,
  not the reverse proxy.

Every limiter returns `429` with a `retryAfter` hint and logs `rate_limit_hit`.


---

## 5. XSS (Cross-Site Scripting)

**Defence (layered):**

1. **Output encoding** - React escapes interpolated values by default, and the
   app never uses `dangerouslySetInnerHTML` / `innerHTML` (confirmed by search).
2. **Server-side helpers** - `utils/sanitize.js` exposes `escapeHtml()` and
   `stripTags()` for the places React cannot protect: transactional emails,
   generated PDFs and Excel exports.
3. **Input detection** - `requestGuard` flags `<script>`, `onerror=`,
   `javascript:` and similar in `xss_attempt` events.
4. **Content-Security-Policy** - `middleware/securityHeaders.js` sends a strict
   CSP with `default-src 'self'`, `script-src 'self'` (no inline, no CDN),
   and `connect-src` restricted to the API/socket origin so an injected script
   cannot exfiltrate tokens. `object-src 'none'`, `frame-ancestors 'none'`,
   `base-uri 'self'`, `form-action 'self'`.

---

## 6. Session Hijacking

**Defence:**

- **Refresh-token rotation** (`utils/tokenStore.js`): each login issues a
  refresh token with a unique `jti`; only a SHA-256 hash is stored in
  `refresh_tokens`. `/api/users/refresh` rotates it - the old row is revoked and
  linked to the new `jti` via `replaced_by`.
- **Replay detection:** presenting an already-revoked refresh token revokes the
  entire token family and logs `token_replay_detected` (severity `critical`).
- **Access-token deny-list:** access tokens carry a `jti`; logout and
  force-termination insert it into `revoked_tokens`, and `verifyToken.js`
  rejects any `jti` found there (`isAccessTokenRevoked`).
- **Algorithm pinning:** `generateToken.js` signs and verifies with
  `algorithms: ['HS256']`, defeating `alg:none` / algorithm-confusion forgeries.
- Refresh cookie is `httpOnly`, `secure` (in production), `SameSite=strict`.


---

## 8. Account Enumeration

**Defence:** every login failure - unknown email, wrong password, non-admin
email, wrong role, or locked account - returns the **same** `401` body
(`Invalid email or password.`) from both `user.controller.js` and
`adminContollers/auth.controller.js`.

- `attemptsRemaining` was removed: it leaked that an email exists.
- A `dummyCompare()` burns bcrypt-equivalent time when the email is unknown, so
  response timing is not an oracle.
- Account-state messages (`pending`, `disapproved`) only appear **after** the
  password is proven correct.

---

## 9. File Upload Attacks

**Defence** (`middleware/uploadGuard.js`, mounted after `multer`):

- `multer` uses `memoryStorage`, so nothing is written to disk before
  validation, and enforces `fileSize` (20 MB) and `files: 1`.
- Each file is checked on three independent axes:
  1. **extension** allow-list per category (image / document / spreadsheet),
  2. **declared MIME** allow-list,
  3. **magic bytes** - the only client-spoof-proof signal (`%PDF`, JPEG `FF D8
     FF`, PNG `89 50 4E 47`, RIFF/WebP, OLE `D0 CF 11 E0`, ZIP `50 4B 03 04`).
- A file is accepted only when all three agree; mismatches are rejected with
  `400` and recorded in `file_upload_audit` + a `upload_rejected` event.
- SVG is deliberately excluded from generic uploads (it can carry script).
- `express.static('/uploads')` sends `X-Content-Type-Options: nosniff` and forces
  `Content-Disposition: attachment` for non-images.

---

## 10. Broken Access Control

**Defence:**

- **Authentication** - `middleware/verifyToken.js` verifies the JWT (pinned
  algorithm) and checks the `jti` deny-list before populating `req.user`.
- **Role authorization** - `middleware/authorizeRole.js` (`authorize('admin')`)
  guards every privileged route; routers apply it via `router.use(...adminOnly)`
  or per-route (e.g. `fileRoutes.js` restricts `/upload` to `student`).
- **Object-level ownership** - controllers scope queries by the caller's id
  (e.g. `deleteFile` matches `student_id` against the caller, so a user cannot
  delete another user's file by guessing an id).
- **Socket.IO** - `sockets/index.js` re-checks batch membership
  (`canAccessBatch`) before joining any room, mirroring the HTTP checks.
- Denials log `access_denied`.

---

## Configuration

New environment variables (all optional; sensible defaults apply):

| Variable | Purpose | Default |
|----------|---------|---------|
| `NODE_ENV` | Enables `trust proxy`, `secure` cookies, HSTS | - |
| `CLIENT_URL` | Allowed CORS origin(s) and CSP `connect-src` (comma-separated) | `http://localhost:5173` |
| `JWT_SECRET` | **Required.** Token signing key | - |

> **`JWT_SECRET` is mandatory.** `generateToken.js` throws if it is unset, so the
> server refuses to sign or verify tokens with an empty secret.

---

## Applying the migration

```sql
-- Run once against the database:
psql -h <host> -U <user> -d <dbname> -f server/db/migrations/026_security_hardening.sql
```

All statements are idempotent (`IF NOT EXISTS`), so re-running is safe. The
security middleware **fails open** if these tables are missing (events are
skipped with a warning), so the app keeps working before the migration is
applied.

---

## Running the self-test

```bash
cd server
npm run test:security
```

It exercises the pure helpers (sanitizer, upload guard, token signing) without a
database and exits non-zero on any failure, so it can gate a build.


---

## Files added / changed

**Added**

| File | Purpose |
|------|---------|
| `server/db/migrations/026_security_hardening.sql` | New tables: refresh tokens, revoked tokens, CSRF secrets, security events, upload audit |
| `server/utils/securityLogger.js` | Event logging + rolling-window counters |
| `server/utils/sanitize.js` | HTML escaping, tag stripping, injection detection |
| `server/utils/tokenStore.js` | Refresh rotation, revocation, jti deny-list |
| `server/middleware/rateLimiters.js` | Global / api / auth / credential / write / upload limiters |
| `server/middleware/csrfProtection.js` | Double-submit CSRF issue + verify |
| `server/middleware/requestGuard.js` | SQLi / XSS / traversal inspection |
| `server/middleware/securityHeaders.js` | Strict CSP + hardening headers |
| `server/middleware/uploadGuard.js` | Magic-byte / extension / MIME validation |
| `server/scripts/securitySelfTest.js` | Dependency-free self-test (`npm run test:security`) |
| `client/src/utils/csrf.js` | Client-side CSRF header helper |

**Changed**

| File | Change |
|------|--------|
| `server/app.js` | Wired in all middleware, trust proxy, uploads hardening |
| `server/config/corsOption.js` | Origin allow-list instead of reflect-any |
| `server/utils/generateToken.js` | `jti` claims, HS256 pinning, `{ token, jti }` |
| `server/middleware/verifyToken.js` | Deny-list check + async |
| `server/controllers/user.controller.js` | Generic errors, rotation, refresh/logout, detection |
| `server/controllers/adminContollers/auth.controller.js` | Generic errors, rotation, logout revocation |
| `server/routes/user.routes.js` | Layered limiters + `/refresh` + `/logout` |
| `server/routes/admin.routes.js` | Auth limiters + upload guards |
| `server/routes/fileRoutes.js` | Upload limiter + upload guard |
| `client/src/context/AuthContext.jsx` | Persist CSRF token |
| `client/src/api/userApi.js` | Send `X-CSRF-Token` on mutations |
