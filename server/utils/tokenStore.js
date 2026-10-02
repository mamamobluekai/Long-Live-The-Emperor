// Refresh-token lifecycle and access-token revocation (#7 session hijacking).
//
// Design:
//   - Every login issues a refresh token carrying a unique `jti`. The DB stores
//     only a SHA-256 *hash* of the token (a stolen database row is not usable).
//   - Refreshing rotates the token: the old row is marked revoked and linked to
//     the replacement via `replaced_by`. If a revoked token is ever presented
//     again that is a strong signal of theft ("refresh token replay"), so every
//     token for that user is revoked immediately.
//   - Logout revokes the stored refresh token and adds the access token's `jti`
//     to a short-lived deny-list (`revoked_tokens`) so it cannot be replayed
//     until it would naturally expire.
//   - Access tokens now carry a `jti` (see utils/generateToken.js) which is what
//     the deny-list and replay detection key on.
const crypto = require('crypto');
const pool = require('../db');
const { logSecurityEvent, SECURITY_EVENTS, SEVERITY } = require('./securityLogger');

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, matches the cookie
const ACCESS_TTL_MS = 60 * 60 * 1000; // 1 hour, matches the access token

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// Persist a freshly-issued refresh token.
async function storeRefreshToken({ userId, token, jti, req }) {
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, jti, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      userId,
      hashToken(token),
      jti,
      req?.ip?.slice(0, 100) || null,
      req?.headers?.['user-agent']?.slice(0, 500) || null,
      expiresAt,
    ]
  );
  return expiresAt;
}

// Look up a refresh token row by its raw value. Returns null when absent.
async function findRefreshToken(token) {
  const result = await pool.query(
    'SELECT * FROM refresh_tokens WHERE token_hash = $1 LIMIT 1',
    [hashToken(token)]
  );
  return result.rows[0] || null;
}

// Validate a presented refresh token. Detects replay of already-revoked tokens
// and, when found, revokes the whole family (defence against a stolen token
// being reused after the legitimate client already rotated it).
async function validateRefreshToken(token, req) {
  const row = await findRefreshToken(token);
  if (!row) return { valid: false, reason: 'not_found' };

  if (row.revoked_at) {
    await revokeAllUserTokens(row.user_id, 'refresh_token_replay');
    await logSecurityEvent({
      type: SECURITY_EVENTS.TOKEN_REPLAY_DETECTED,
      severity: SEVERITY.CRITICAL,
      req,
      userId: row.user_id,
      detail: 'Reuse of a revoked refresh token; all sessions revoked.',
    });
    return { valid: false, reason: 'revoked' };
  }

  if (new Date(row.expires_at) < new Date()) {
    return { valid: false, reason: 'expired' };
  }

  return { valid: true, row };
}

// Rotate: revoke the presented token and record which jti replaced it.
async function rotateRefreshToken(oldToken, newJti) {
  await pool.query(
    `UPDATE refresh_tokens
        SET revoked_at = CURRENT_TIMESTAMP, replaced_by = $1
      WHERE token_hash = $2 AND revoked_at IS NULL`,
    [newJti, hashToken(oldToken)]
  );
}

// Revoke a single refresh token (logout).
async function revokeRefreshToken(token) {
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP
      WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hashToken(token)]
  );
}

// Revoke every active refresh token for a user (logout-all / theft response).
async function revokeAllUserTokens(userId, reason = 'logout_all') {
  const result = await pool.query(
    `UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND revoked_at IS NULL
      RETURNING jti`,
    [userId]
  );
  if (result.rows.length) {
    await logSecurityEvent({
      type: SECURITY_EVENTS.TOKEN_REVOKED,
      severity: SEVERITY.WARNING,
      userId,
      detail: `${result.rows.length} refresh token(s) revoked (${reason}).`,
    });
  }
  return result.rows.length;
}

// Add an access-token jti to the short-lived deny-list. Expiry mirrors the
// access token TTL so the list self-cleans.
async function revokeAccessToken({ jti, userId, reason = 'logout' }) {
  if (!jti) return;
  const expiresAt = new Date(Date.now() + ACCESS_TTL_MS);
  await pool.query(
    `INSERT INTO revoked_tokens (jti, user_id, reason, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (jti) DO NOTHING`,
    [jti, userId || null, reason, expiresAt]
  );
}

// Is this access-token jti on the deny-list?
async function isAccessTokenRevoked(jti) {
  if (!jti) return false;
  const result = await pool.query(
    `SELECT 1 FROM revoked_tokens
      WHERE jti = $1 AND expires_at > CURRENT_TIMESTAMP LIMIT 1`,
    [jti]
  );
  return result.rows.length > 0;
}

// Housekeeping: drop deny-list rows past their expiry. Safe to call on a timer.
async function pruneExpiredRevocations() {
  await pool.query('DELETE FROM revoked_tokens WHERE expires_at < CURRENT_TIMESTAMP');
}

module.exports = {
  hashToken,
  storeRefreshToken,
  findRefreshToken,
  validateRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  revokeAccessToken,
  isAccessTokenRevoked,
  pruneExpiredRevocations,
  REFRESH_TTL_MS,
  ACCESS_TTL_MS,
};
