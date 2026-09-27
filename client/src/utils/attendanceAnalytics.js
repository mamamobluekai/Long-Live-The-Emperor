// Pure aggregation helpers for the teacher attendance report records.
// Kept separate from the components so the maths is easy to test and the UI
// stays presentational.

export const PRESENT_STATUSES = ['checked_in', 'checked_out', 'present'];

export const STATUS_LABELS = {
  checked_in: 'In',
  checked_out: 'Present',
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  excused: 'On Leave',
};

export function labelForStatus(status) {
  return STATUS_LABELS[status] || status || 'Not recorded';
}

export function isPresent(status) {
  return PRESENT_STATUSES.includes(status);
}

export function isAbsent(status) {
  return !isPresent(status);
}

function parseISODate(value) {
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

/**
 * True when the immersion date has not arrived yet. A date in the future with no
 * attendance row is "not started", not an absence.
 */
export function isFutureDate(value) {
  const parsed = parseISODate(value);
  if (!parsed) return false;
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return new Date(parsed.y, parsed.m - 1, parsed.d) > todayMidnight;
}

/**
 * Collapse flat records into one row per student with an attendance map.
 * @param {object[]} records
 * @returns {object[]} rows
 */
export function reportRows(records = []) {
  const rows = new Map();
  records.forEach((record) => {
    if (!rows.has(record.student_id)) {
      rows.set(record.student_id, { ...record, attendance: {} });
    }
    rows.get(record.student_id).attendance[record.date] = record;
  });
  return Array.from(rows.values());
}

/**
 * Present / absent / late counts for every scheduled date. Dates that have not
 * arrived yet report `upcoming: true` and are never counted as absences.
 * @returns {{date: string, present: number, absent: number, late: number, appeals: number, upcoming: boolean}[]}
 */
export function byDate(records = [], dates = []) {
  return dates.map((date) => {
    const dayRecords = records.filter((record) => record.date === date);
    const upcoming = isFutureDate(date);
    return {
      date,
      present: dayRecords.filter((r) => isPresent(r.status)).length,
      // An unrecorded upcoming day is not an absence.
      absent: upcoming ? 0 : dayRecords.filter((r) => !r.status || isAbsent(r.status)).length,
      late: dayRecords.filter((r) => r.status === 'late').length,
      appeals: dayRecords.filter(hasAppeal).length,
      upcoming,
    };
  });
}

export function hasAppeal(record) {
  return Boolean(record && (record.appeal_time_in_id || record.appeal_time_out_id));
}

export function formatShortDate(value) {
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
