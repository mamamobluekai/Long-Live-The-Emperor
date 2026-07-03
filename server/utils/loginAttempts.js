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

const isAccountLocked = (attempts) => {
  if (!attempts || !attempts.locked_until) return false;
  return new Date(attempts.locked_until) > new Date();
};

module.exports = { getLoginAttempts, incrementLoginAttempts, resetLoginAttempts, isAccountLocked, MAX_ATTEMPTS, LOCK_TIME_MINUTES };
