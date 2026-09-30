const pool = require('../db');

const MS_PER_DAY = 86400000;

/**
 * The single source of truth for "which calendar days count as work immersion
 * days".
 *
 * Previously this Mon-Fri loop was duplicated in eight places across the
 * supervisor, teacher and student controllers (plus one on the client). Any
 * change to the rule had to be replicated everywhere or day numbers would
 * disagree between views. Every caller now goes through here.
 *
 * A day counts unless it is:
 *   - Saturday or Sunday,
 *   - a Philippine non-working day (ph_holidays), or
 *   - blocked by the supervisor for that batch (work_immersion_blocked_dates).
 *
 * All dates are 'YYYY-MM-DD' strings. The pg type parser in server/db/index.js
 * already returns DATE columns as plain strings, so no conversion is needed and
 * no UTC/local-time drift can occur.
 */

/** Coerce a Date, a DATE string, or a timestamp into a 'YYYY-MM-DD' string. */
function toDateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const m = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : toDateOnly(d);
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
      value.getDate()
    ).padStart(2, '0')}`;
  }
  return null;
}

/** Parse 'YYYY-MM-DD' into a local-midnight Date (safe: no TZ conversion). */
function fromDateOnly(iso) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function addDays(date, count) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + count);
  return next;
}

function isWeekend(date) {
  return date.getDay() === 0 || date.getDay() === 6;
}

/**
 * Convert a stored duration into a number of immersion DAYS.
 * Hours are counted at 8 per day, matching the existing server behaviour.
 */
function durationToDays(durationType, durationValue) {
  const value = Number(durationValue);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return durationType === 'hours' ? Math.ceil(value / 8) : Math.floor(value);
}

/**
 * Build the immersion day list.
 *
 * @param {string|Date} startDate        First candidate day, inclusive.
 * @param {string} durationType          'days' | 'hours'
 * @param {number|string} durationValue
 * @param {object} [opts]
 * @param {Set<string>} [opts.blockedDates]  'YYYY-MM-DD' strings to skip.
 * @param {number} [opts.maxLookaheadDays]   Safety cap so a fully blocked
 *        range cannot spin forever. Defaults to 10x the day count.
 * @returns {{number:number,date:string}[]}
 */
function buildImmersionDays(startDate, durationType, durationValue, opts = {}) {
  const start = toDateOnly(startDate);
  const totalDays = durationToDays(durationType, durationValue);
  if (!start || totalDays <= 0) return [];

  const blocked = opts.blockedDates instanceof Set ? opts.blockedDates : new Set(opts.blockedDates || []);
  const maxLookahead = opts.maxLookaheadDays || totalDays * 10 + 60;

  const days = [];
  let current = fromDateOnly(start);
  let examined = 0;

  while (days.length < totalDays && examined < maxLookahead) {
    examined += 1;
    const iso = toDateOnly(current);
    if (!isWeekend(current) && !blocked.has(iso)) {
      days.push({ number: days.length + 1, date: iso });
    }
    current = addDays(current, 1);
  }
  return days;
}

/** Just the dates, for callers that only need a membership list. */
function buildImmersionDateList(startDate, durationType, durationValue, opts = {}) {
  return buildImmersionDays(startDate, durationType, durationValue, opts).map((d) => d.date);
}

/**
 * The holiday calendar changes rarely but is needed on every schedule read, so
 * it is cached briefly. A short TTL means a newly added holiday takes effect
 * almost immediately without adding a query to every request.
 */
/**
 * Create ph_holidays and work_immersion_blocked_dates if they are missing, and
 * seed the fixed-date Philippine holidays.
 *
 * This project has no migration runner - migrations are applied by hand - so
 * relying on 023_holidays_blocked_dates.sql having been run would break every
 * schedule read with a 42P01 on a fresh database. The same idempotent-DDL
 * pattern the other controllers use (ensureSupervisorReportsTable,
 * ensureImmersionScheduleTable) is applied here so the feature works
 * immediately. Running the migration later is still fine: every statement is
 * IF NOT EXISTS / ON CONFLICT DO NOTHING.
 *
 * The memoised promise means the DDL runs at most once per process.
 */
let ensurePromise = null;
function ensureExclusionTables() {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ph_holidays (
        id SERIAL PRIMARY KEY,
        holiday_date DATE NOT NULL,
        name VARCHAR(120) NOT NULL,
        is_regular BOOLEAN NOT NULL DEFAULT FALSE,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS ux_ph_holidays_date ON ph_holidays (holiday_date);

      CREATE TABLE IF NOT EXISTS work_immersion_blocked_dates (
        id SERIAL PRIMARY KEY,
        teacher_batch_id INTEGER NOT NULL REFERENCES teacher_batches(id) ON DELETE CASCADE,
        supervisor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        blocked_date DATE NOT NULL,
        reason VARCHAR(200),
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS ux_immersion_blocked_unique
        ON work_immersion_blocked_dates (teacher_batch_id, supervisor_id, blocked_date)
        WHERE supervisor_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS ux_immersion_blocked_batch_null
        ON work_immersion_blocked_dates (teacher_batch_id, blocked_date)
        WHERE supervisor_id IS NULL;
    `);

    // Fixed-date holidays only. Movable feasts and yearly proclaimed specials
    // are added through the UI, since their real dates are not knowable ahead
    // of time and a wrong guess would silently shift every schedule.
    // Single-quoted literals; the apostrophe in "New Year's ..." is doubled.
    await pool.query(
      `INSERT INTO ph_holidays (holiday_date, name, is_regular) VALUES
        (DATE '2024-01-01', 'New Year''s Day', true),
        (DATE '2024-04-09', 'Araw ng Kagitingan (Rizal Day)', true),
        (DATE '2024-05-01', 'Labor Day', true),
        (DATE '2024-06-12', 'Independence Day', true),
        (DATE '2024-08-21', 'Ninoy Aquino Day', false),
        (DATE '2024-11-30', 'Bonifacio Day', true),
        (DATE '2024-12-25', 'Christmas Day', true),
        (DATE '2024-12-30', 'Rizal Day', true),
        (DATE '2024-12-31', 'New Year''s Eve', false),
        (DATE '2025-01-01', 'New Year''s Day', true),
        (DATE '2025-04-09', 'Araw ng Kagitingan (Rizal Day)', true),
        (DATE '2025-05-01', 'Labor Day', true),
        (DATE '2025-06-12', 'Independence Day', true),
        (DATE '2025-08-21', 'Ninoy Aquino Day', false),
        (DATE '2025-11-30', 'Bonifacio Day', true),
        (DATE '2025-12-25', 'Christmas Day', true),
        (DATE '2025-12-30', 'Rizal Day', true),
        (DATE '2025-12-31', 'New Year''s Eve', false),
        (DATE '2026-01-01', 'New Year''s Day', true),
        (DATE '2026-04-09', 'Araw ng Kagitingan (Rizal Day)', true),
        (DATE '2026-05-01', 'Labor Day', true),
        (DATE '2026-06-12', 'Independence Day', true),
        (DATE '2026-08-21', 'Ninoy Aquino Day', false),
        (DATE '2026-11-30', 'Bonifacio Day', true),
        (DATE '2026-12-25', 'Christmas Day', true),
        (DATE '2026-12-30', 'Rizal Day', true),
        (DATE '2026-12-31', 'New Year''s Eve', false)
      ON CONFLICT (holiday_date) DO NOTHING`
    );
    holidayCache = { at: 0, rows: [] };
  })().catch((err) => {
    // Let the next request retry rather than caching a failed DDL forever.
    ensurePromise = null;
    throw err;
  });
  return ensurePromise;
}

/**
 * The holiday calendar changes rarely but is needed on every schedule read, so
 * it is cached briefly. A short TTL means a newly added holiday takes effect
 * almost immediately without adding a query to every request.
 */
let holidayCache = { at: 0, rows: [] };
const HOLIDAY_TTL_MS = 30000;

async function loadHolidays() {
  if (Date.now() - holidayCache.at < HOLIDAY_TTL_MS) return holidayCache.rows;
  const res = await pool.query(
    `SELECT to_char(holiday_date, 'YYYY-MM-DD') AS holiday_date, name, is_regular
       FROM ph_holidays
      ORDER BY holiday_date`
  );
  holidayCache = { at: Date.now(), rows: res.rows };
  return res.rows;
}

/** Drop the cached holiday list. Call after adding or removing a holiday. */
function invalidateHolidayCache() {
  holidayCache = { at: 0, rows: [] };
}

/**
 * Load every non-working date that applies to a batch, as a Set of
 * 'YYYY-MM-DD' strings ready to pass to buildImmersionDays.
 *
 * A date blocked for the batch (supervisor_id IS NULL) applies to everyone in
 * it; a date blocked for one supervisor applies only to that supervisor. Both
 * are unioned with the holiday calendar.
 *
 * @param {number|null} teacherBatchId
 * @param {number|null} supervisorId
 * @returns {Promise<{blocked: Set<string>, blockedOnly: Set<string>, blockedRows: object[], holidays: Set<string>, holidayRows: object[]}>}
 *   `blocked` is the full set of dates that must NOT count - supervisor-blocked
 *   dates UNION Philippine holidays - and is what every caller passes as
 *   `blockedDates`. `blockedOnly` and `holidays` are kept separate for the UI,
 *   which needs to tell the two apart.
 */
async function loadExcludedDates(teacherBatchId, supervisorId) {
  await ensureExclusionTables();

  const params = [];
  const clauses = [];

  if (teacherBatchId != null) {
    params.push(teacherBatchId);
    clauses.push(`(teacher_batch_id = $${params.length} AND supervisor_id IS NULL)`);
    if (supervisorId != null) {
      params.push(supervisorId);
      clauses.push(`supervisor_id = $${params.length}`);
    }
  }

  let blockedRows = [];
  if (clauses.length) {
    const res = await pool.query(
      `SELECT id, teacher_batch_id, supervisor_id,
              to_char(blocked_date, 'YYYY-MM-DD') AS blocked_date, reason
         FROM work_immersion_blocked_dates
        WHERE ${clauses.join(' OR ')}
        ORDER BY blocked_date`,
      params
    );
    blockedRows = res.rows;
  }

  const holidayRows = await loadHolidays();

  const blockedOnly = new Set(blockedRows.map((r) => r.blocked_date));
  const holidays = new Set(holidayRows.map((r) => r.holiday_date));

  // The union is what the day builder must skip. Returning these as two
  // separate sets caused every call site to pass only the blocked dates, so
  // holidays were silently counted as immersion days.
  const blocked = new Set([...blockedOnly, ...holidays]);

  return { blocked, blockedOnly, blockedRows, holidays, holidayRows };
}

/**
 * Convenience wrapper for the common case: load exclusions and build the day
 * list in one call.
 */
async function buildImmersionDaysForBatch(teacherBatchId, supervisorId, startDate, durationType, durationValue) {
  const { blocked } = await loadExcludedDates(teacherBatchId, supervisorId);
  return buildImmersionDays(startDate, durationType, durationValue, { blockedDates: blocked });
}

/** Extract 'HH:MM' from a timestamp value (Date object or string). */
function toTimeOfDay(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  }
  const s = String(value);
  const m = s.match(/T?(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : null;
}

/**
 * Did the student actually complete this immersion day?
 *
 * A day counts as completed only when the student clocked in AND clocked out
 * before the Time Out window closed. A day with no time-in, no time-out, or a
 * time-out after the window shut is an absence and earns a make-up day.
 *
 * @param {object|null} row  student_attendance row for that date
 * @param {string|null} [timeOutClose]  'HH:MM' window close from the batch config
 */
function isDayCompleted(row, timeOutClose) {
  if (!row) return false;
  const inTime = toTimeOfDay(row.check_in_time);
  const outTime = toTimeOfDay(row.check_out_time);
  if (!inTime || !outTime) return false;
  if (timeOutClose) {
    const out = Number(outTime.slice(0, 2)) * 60 + Number(outTime.slice(3, 5));
    const close = Number(timeOutClose.slice(0, 2)) * 60 + Number(timeOutClose.slice(3, 5));
    if (out > close) return false;
  }
  return true;
}

/**
 * Append make-up days after the batch's scheduled days for each one the
 * student did not complete, so every student still finishes the full duration.
 *
 * The batch's own 10 days are never altered - make-ups are added strictly
 * after the last scheduled day, which keeps every student on the same first 10
 * dates and keeps batch-level reports aligned.
 *
 * @param {object} p
 * @param {{number:number,date:string}[]} p.scheduledDays  the batch's day list
 * @param {Map<string,object>} [p.attendanceByDate]  'YYYY-MM-DD' -> attendance row
 * @param {string|null} [p.timeOutClose]
 * @param {Set<string>} [p.blockedDates]
 * @returns {{number:number,date:string,is_makeup:boolean}[]}
 */
function appendMakeupDays(p = {}) {
  const scheduledDays = p.scheduledDays || [];
  const attendance = p.attendanceByDate instanceof Map ? p.attendanceByDate : new Map(p.attendanceByDate || []);
  const blocked = p.blockedDates instanceof Set ? p.blockedDates : new Set(p.blockedDates || []);

  const result = scheduledDays.map((d) => ({ ...d, is_makeup: false }));

  // Only days that have already passed can be judged. A future scheduled day
  // is not an absence yet, otherwise a student would be given make-up days for
  // days they simply have not reached.
  const today = toDateOnly(new Date());
  const absenceCount = scheduledDays.filter(
    (d) => (!today || d.date < today) && !isDayCompleted(attendance.get(d.date), p.timeOutClose)
  ).length;

  if (absenceCount === 0) return result;

  let cursor = scheduledDays.length
    ? fromDateOnly(scheduledDays[scheduledDays.length - 1].date)
    : fromDateOnly(toDateOnly(new Date()));

  let remaining = absenceCount;
  let examined = 0;
  while (remaining > 0 && examined < absenceCount * 10 + 60) {
    examined += 1;
    cursor = addDays(cursor, 1);
    const iso = toDateOnly(cursor);
    if (isWeekend(cursor) || blocked.has(iso)) continue;
    remaining -= 1;
    result.push({ number: result.length + 1, date: iso, is_makeup: true });
  }
  return result;
}

module.exports = {
  buildImmersionDays,
  buildImmersionDateList,
  buildImmersionDaysForBatch,
  loadExcludedDates,
  ensureExclusionTables,
  invalidateHolidayCache,
  appendMakeupDays,
  isDayCompleted,
  toTimeOfDay,
  durationToDays,
  isWeekend,
  toDateOnly,
  fromDateOnly,
  addDays,
  MS_PER_DAY,
};
