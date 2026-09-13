const pool = require('../db');

function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) {
    return new Date(dateStr.getFullYear(), dateStr.getMonth(), dateStr.getDate());
  }
  const str = String(dateStr);
  const [y, m, d] = str.substring(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

async function getImmersionSettings() {
  const result = await pool.query(
    `SELECT immersion_start_date, immersion_end_date, auto_activate, auto_deactivate,
            access_student, access_teacher, access_coordinator, access_supervisor
     FROM system_settings WHERE id = 1`
  );
  return result.rows[0] || null;
}

async function getActiveImmersionPeriod() {
  const result = await pool.query(
    `SELECT id, period_name, start_date, end_date, is_active, status
     FROM immersion_periods
     WHERE is_active = true
     ORDER BY start_date DESC`
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const inProgress = result.rows.find((p) => {
    if (!p.start_date || !p.end_date) return false;
    const start = parseLocalDate(p.start_date);
    const end = parseLocalDate(p.end_date);
    if (!start || !end) return false;
    return today >= start && today <= end;
  });
  return inProgress || result.rows[0] || null;
}

function computePhase(startDate, endDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = startDate ? parseLocalDate(startDate) : null;
  const end = endDate ? parseLocalDate(endDate) : null;

  if (!start || !end) return 'inactive';
  if (today < start) return 'upcoming';
  if (today > end) return 'completed';
  return 'ongoing';
}

function formatDate(date) {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

const immersionAccessGuard = async (req, res, next) => {
  try {
    if (req.user?.role === 'admin') {
      return next();
    }

    const settings = await getImmersionSettings();
    const activePeriod = await getActiveImmersionPeriod();
    const role = req.user?.role;

    const roleAccess = {
      student: settings?.access_student,
      teacher: settings?.access_teacher,
      coordinator: settings?.access_coordinator,
      supervisor: settings?.access_supervisor,
    };

    if (activePeriod) {
      const start = parseLocalDate(activePeriod.start_date);
      const end = parseLocalDate(activePeriod.end_date);
      if (start && end) {
        const phase = computePhase(activePeriod.start_date, activePeriod.end_date);
        if (phase === 'ongoing' && roleAccess[role]) {
          return next();
        }
        let message = 'Your access to immersion features is currently restricted.';
        if (phase === 'upcoming') {
          message = `Work Immersion has not started yet. Your access will be available on ${formatDate(start)}.`;
        } else if (phase === 'completed') {
          message = 'Work Immersion has been completed. Immersion features are now read-only.';
        } else if (!roleAccess[role]) {
          message = `Your role (${role}) does not have access to immersion features during this period.`;
        }
        return res.status(403).json({
          error: message,
          phase,
          startDate: activePeriod.start_date,
          endDate: activePeriod.end_date,
        });
      }
    }

    if (!settings || !settings.immersion_start_date || !settings.immersion_end_date) {
      return next();
    }

    const phase = computePhase(settings.immersion_start_date, settings.immersion_end_date);

    if (phase === 'ongoing' && roleAccess[role]) {
      return next();
    }

    let message = 'Your access to immersion features is currently restricted.';
    if (phase === 'upcoming') {
      const start = parseLocalDate(settings.immersion_start_date);
      message = `Work Immersion has not started yet. Your access will be available on ${formatDate(start)}.`;
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
    const activePeriod = await getActiveImmersionPeriod();
    const source = activePeriod || settings;
    if (source && source.immersion_start_date === undefined && source.start_date) {
      req.immersionStatus = {
        phase: computePhase(source.start_date, source.end_date),
        startDate: source.start_date,
        endDate: source.end_date,
      };
    } else if (settings) {
      req.immersionStatus = {
        phase: computePhase(settings.immersion_start_date, settings.immersion_end_date),
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
