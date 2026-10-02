// Central security event logger.
//
// Every security control in this project funnels through `logSecurityEvent`
// so that brute-force, credential-stuffing and flooding attempts all end up in
// one queryable table (`security_events`) instead of being scattered across
// console.error calls. Logging never throws: a telemetry failure must not break
// the request that triggered it, so failures are swallowed after a console
// warning.
const pool = require('../db');

// Canonical event names. Kept as constants so dashboards and detection queries
// can rely on exact strings rather than free text.
const SECURITY_EVENTS = {
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILED: 'login_failed',
  LOGIN_LOCKED: 'login_locked',
  ACCOUNT_ENUMERATION_BLOCKED: 'account_enumeration_blocked',
  BRUTE_FORCE_SUSPECTED: 'brute_force_suspected',
  CREDENTIAL_STUFFING_SUSPECTED: 'credential_stuffing_suspected',
  RATE_LIMIT_HIT: 'rate_limit_hit',
  CSRF_FAILED: 'csrf_failed',
  SQLI_ATTEMPT: 'sqli_attempt',
  XSS_ATTEMPT: 'xss_attempt',
  PATH_TRAVERSAL_ATTEMPT: 'path_traversal_attempt',
  UPLOAD_REJECTED: 'upload_rejected',
  UPLOAD_ACCEPTED: 'upload_accepted',
  TOKEN_REVOKED: 'token_revoked',
  TOKEN_REPLAY_DETECTED: 'token_replay_detected',
  ACCESS_DENIED: 'access_denied',
  SUSPICIOUS_ACTIVITY: 'suspicious_activity',
};

const SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  HIGH: 'high',
  CRITICAL: 'critical',
};

// Normalises whatever `req.ip` gives us. `req.ip` can be a bare address or an
// IPv6-mapped IPv4 (::ffff:1.2.3.4); we store both consistently as a string.
function getClientIp(req) {
  if (!req) return null;
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim().slice(0, 100);
  }
  return (req.ip || req.socket?.remoteAddress || null)?.toString().slice(0, 100) || null;
}

function getUserId(req) {
  const id = req?.user?.id;
  return Number.isInteger(id) ? id : null;
}

/**
 * Persist a security event. Fire-and-forget: callers should not await for
 * correctness, only when they need the row to exist before continuing.
 *
 * @param {object} params
 * @param {string} params.type        one of SECURITY_EVENTS
 * @param {string} [params.severity]  one of SEVERITY (defaults to info)
 * @param {object} [params.req]       Express request, used for ip/ua/user
 * @param {number} [params.userId]
 * @param {string} [params.email]
 * @param {string} [params.detail]
 * @param {object} [params.metadata]  any extra structured context (JSONB)
 */
async function logSecurityEvent({
  type,
  severity = SEVERITY.INFO,
  req = null,
  userId = null,
  email = null,
  detail = null,
  metadata = null,
} = {}) {
  if (!type) return;
  try {
    await pool.query(
      `INSERT INTO security_events
         (event_type, severity, user_id, email, ip_address, user_agent, path, method, detail, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        String(type).slice(0, 60),
        String(severity).slice(0, 20),
        userId || getUserId(req),
        email ? String(email).slice(0, 255) : null,
        getClientIp(req),
        req?.headers?.['user-agent']?.slice(0, 500) || null,
        (req?.originalUrl || req?.path || '')?.slice(0, 500) || null,
        req?.method?.slice(0, 10) || null,
        detail ? String(detail).slice(0, 2000) : null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
  } catch (err) {
    console.warn('logSecurityEvent failed:', err.message);
  }
}

/**
 * Count how many events of a given type match a filter inside a rolling window.
 * Used by the brute-force / credential-stuffing detectors. Fails closed (returns
 * 0) so a telemetry outage cannot itself block legitimate traffic.
 */
async function countRecentEvents({ type, ip, email, userId, windowMs }) {
  try {
    const conditions = ['event_type = $1', 'created_at > NOW() - ($2::bigint * INTERVAL \'1 millisecond\')'];
    const values = [type, windowMs];
    if (ip) {
      values.push(ip);
      conditions.push(`ip_address = $${values.length}`);
    }
    if (email) {
      values.push(email);
      conditions.push(`LOWER(email) = LOWER($${values.length})`);
    }
    if (userId) {
      values.push(userId);
      conditions.push(`user_id = $${values.length}`);
    }
    const result = await pool.query(
      `SELECT COUNT(*)::int AS total FROM security_events WHERE ${conditions.join(' AND ')}`,
      values
    );
    return result.rows[0]?.total || 0;
  } catch (err) {
    console.warn('countRecentEvents failed:', err.message);
    return 0;
  }
}

module.exports = { logSecurityEvent, countRecentEvents, getClientIp, SECURITY_EVENTS, SEVERITY };
