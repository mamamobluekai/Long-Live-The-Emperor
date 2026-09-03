const pool = require('../db');

async function getImmersionSettings() {
  const result = await pool.query(
    `SELECT immersion_start_date, immersion_end_date, auto_activate, auto_deactivate,
            access_student, access_teacher, access_coordinator, access_supervisor
     FROM system_settings WHERE id = 1`
  );
  return result.rows[0] || null;
}

function computePhase(startDate, endDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;

  if (!start || !end) return 'inactive';
  if (today < start) return 'upcoming';
  if (today > end) return 'completed';
  return 'ongoing';
}

const immersionAccessGuard = async (req, res, next) => {
  try {
    if (req.user?.role === 'admin') {
      return next();
    }

    const settings = await getImmersionSettings();
    if (!settings || !settings.immersion_start_date || !settings.immersion_end_date) {
      return next();
    }

    const phase = computePhase(settings.immersion_start_date, settings.immersion_end_date);
    const role = req.user?.role;

    const roleAccess = {
      student: settings.access_student,
      teacher: settings.access_teacher,
      coordinator: settings.access_coordinator,
      supervisor: settings.access_supervisor,
    };

    if (phase === 'ongoing' && roleAccess[role]) {
      return next();
    }

    let message = 'Your access to immersion features is currently restricted.';
    if (phase === 'upcoming') {
      const start = new Date(settings.immersion_start_date);
      message = `Work Immersion has not started yet. Your access will be available on ${start.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.`;
    } else if (phase === 'completed') {
      message = 'Work Immersion has been completed. Immersion features are now read-only.';
    } else if (!roleAccess[role]) {
      message = `Your role (${role}) does not have access to immersion features during this period.`;
    }

    return res.status(403).json({
      error: message,
      phase,
      startDate: settings.immersion_start_date,
      endDate: settings.immersion_end_date,
    });
  } catch (err) {
    console.error('Immersion access guard error:', err);
    return next();
  }
};

const immersionStatus = async (req, res, next) => {
  try {
    const settings = await getImmersionSettings();
    if (settings) {
      const phase = computePhase(settings.immersion_start_date, settings.immersion_end_date);
      req.immersionStatus = {
        phase,
        startDate: settings.immersion_start_date,
        endDate: settings.immersion_end_date,
      };
    }
    return next();
  } catch (err) {
    return next();
  }
};

module.exports = { immersionAccessGuard, immersionStatus, computePhase };
