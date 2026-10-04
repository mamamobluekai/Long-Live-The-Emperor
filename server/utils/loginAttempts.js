const pool = require('../db');

const MAX_ATTEMPTS = 5;
const LOCK_TIME_MINUTES = 15;

const getLoginAttempts = async (email, ipAddress) => {
  const result = await pool.query(
    'SELECT * FROM login_attempts WHERE LOWER(email) = LOWER($1) ORDER BY last_attempt DESC LIMIT 1',
    [email]
  );
  return result.rows[0];
};

const incrementLoginAttempts = async (email, ipAddress) => {
  const existing = await getLoginAttempts(email, ipAddress);

  if (existing) {
    const newAttempts = existing.attempts + 1;
    const lockedUntil = newAttempts >= MAX_ATTEMPTS
      ? new Date(Date.now() + LOCK_TIME_MINUTES * 60 * 1000)
      : null;

    await pool.query(
      'UPDATE login_attempts SET attempts = $1, last_attempt = CURRENT_TIMESTAMP, locked_until = $2 WHERE id = $3',
      [newAttempts, lockedUntil, existing.id]
    );

    return { attempts: newAttempts, lockedUntil };
  } else {
    await pool.query(
      'INSERT INTO login_attempts (email, ip_address, attempts, last_attempt) VALUES ($1, $2, 1, CURRENT_TIMESTAMP)',
      [email, ipAddress]
    );
    return { attempts: 1, lockedUntil: null };
  }
};

const resetLoginAttempts = async (email, ipAddress) => {
  await pool.query(
    'DELETE FROM login_attempts WHERE LOWER(email) = LOWER($1)',
    [email]
  );
};

// Kept for callers that already hold an attempts row.
const isAccountLocked = (attempts) => {
  if (!attempts || !attempts.locked_until) return false;
  return new Date(attempts.locked_until) > new Date();
};

// Reads the lockout state for an email address.
//
// This exists because both login controllers used to call isAccountLocked() with
// an email *string* and await it. On a string, `attempts.locked_until` is
// undefined, so the function always answered false and the lockout branch was
// unreachable - five wrong passwords never locked anything. This is the
// by-address version they actually meant.
//
// `attemptsRemaining` is reported so the UI can warn before the lock, but it is
// only meaningful for an address that exists, so callers must not send it back
// to the client (see utils/loginErrors.js).
const getLockoutState = async (email) => {
  const row = await getLoginAttempts(email);
  if (!row) return { locked: false, minutesRemaining: 0, attempts: 0, attemptsRemaining: MAX_ATTEMPTS };

  if (row.locked_until && new Date(row.locked_until) > new Date()) {
    const minutes = Math.ceil((new Date(row.locked_until) - Date.now()) / 60000);
    return { locked: true, minutesRemaining: minutes, attempts: row.attempts, attemptsRemaining: 0 };
  }

  return {
    locked: false,
    minutesRemaining: 0,
    attempts: row.attempts,
    // A lock that has already expired starts the count again.
    attemptsRemaining: Math.max(0, MAX_ATTEMPTS - (row.locked_until ? 0 : row.attempts)),
  };
};

module.exports = {
  getLoginAttempts,
  incrementLoginAttempts,
  resetLoginAttempts,
  isAccountLocked,
  getLockoutState,
  MAX_ATTEMPTS,
  LOCK_TIME_MINUTES,
};
