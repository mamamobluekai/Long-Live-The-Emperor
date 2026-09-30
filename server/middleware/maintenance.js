// System-wide maintenance mode.
//
// When an admin enables maintenance mode, every non-admin account is blocked
// both at login and on in-flight API calls, so turning the flag on takes effect
// immediately for users who are already signed in.
//
// Admins are deliberately exempt: if the flag applied to them too, an
// accidental toggle would lock every account out with no in-app way to recover.
const pool = require('../db');
const { verifyAccessToken } = require('../utils/generateToken');

const DEFAULT_MAINTENANCE_MESSAGE =
  'The system is temporarily unavailable while we perform scheduled maintenance. Please try again later.';

// Endpoints that must stay reachable during maintenance, otherwise users could
// not read the reason on the login screen and admins could not switch it off.
const ALLOWED_PATHS = [
  '/api/health',
  '/api/maintenance/status',
  '/api/admin/login',
  '/api/users/login',
  '/api/users/register',
  '/api/admin/settings/maintenance',
  '/api/feedback',
];

const isAllowedPath = (req) => {
  const path = req.path || req.originalUrl || '';
  return ALLOWED_PATHS.some((allowed) => path === allowed || path.startsWith(`${allowed}/`));
};

// Reads the flag straight from system_settings. Fails open so a database error
// cannot lock out every user; an outage is preferable to a total lockout.
async function readMaintenance() {
  try {
    const result = await pool.query(
      `SELECT maintenance_mode, maintenance_message, maintenance_started_at, maintenance_estimated_end
       FROM system_settings WHERE id = 1`
    );
    const row = result.rows[0] || {};
    return {
      enabled: Boolean(row.maintenance_mode),
      message: row.maintenance_message || DEFAULT_MAINTENANCE_MESSAGE,
      startedAt: row.maintenance_started_at || null,
      estimatedEnd: row.maintenance_estimated_end || null,
    };
  } catch (err) {
    console.error('readMaintenance error:', err.message);
    return { enabled: false, message: DEFAULT_MAINTENANCE_MESSAGE, startedAt: null, estimatedEnd: null };
  }
}

// Middleware form: blocks authenticated non-admin requests during maintenance.
// Mounted ahead of the routers, so it cannot rely on router-level auth having
// populated req.user. It decodes the token itself and treats anything it cannot
// verify as "unknown", letting the router produce the proper 401 afterwards.
async function maintenanceGuard(req, res, next) {
  if (isAllowedPath(req)) return next();

  let role = String(req.user?.role || '').toLowerCase();

  if (!role) {
    const header = req.headers.authorization;
    const raw = header?.startsWith('Bearer ') ? header.split(' ')[1] : req.query.token;
    if (raw) {
      try {
        role = String(verifyAccessToken(raw).role || '').toLowerCase();
      } catch {
        // Invalid or expired token: not our concern, the router rejects it.
      }
    }
  }

  // No role yet means the caller is anonymous, so let the router decide.
  if (!role || role === 'admin') return next();

  const status = await readMaintenance();
  if (!status.enabled) return next();

  return res.status(503).json({
    error: status.message,
    maintenance: true,
    startedAt: status.startedAt,
    estimatedEnd: status.estimatedEnd,
  });
}

module.exports = { maintenanceGuard, readMaintenance, DEFAULT_MAINTENANCE_MESSAGE };
