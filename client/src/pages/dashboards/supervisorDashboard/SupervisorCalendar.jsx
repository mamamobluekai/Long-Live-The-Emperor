import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';

import {
  getSupervisorBatches,
  getSupervisorBatchAttendance,
} from '../../../api/supervisorApi';

import styles from './SupervisorCalendar.module.css';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* Per-day visual states. These mirror the student calendar in
   studentDashboard/Overview.jsx, but are resolved per BATCH rather than per
   student: a supervisor day is only "Attended" when every student completed it.
   `short` is the compact label rendered inside a calendar cell. */
const DAY_STATES = {
  complete: { label: 'Fully attended', short: 'All', hint: 'Every student completed the day' },
  active: { label: 'In progress', short: 'Now', hint: 'Some students are timed in today' },
  partial: { label: 'Partly attended', short: 'Part', hint: 'Only some students completed the day' },
  absent: { label: 'Nobody present', short: 'None', hint: 'No student completed this day' },
  missed: { label: 'No records', short: 'Miss', hint: 'No attendance recorded on this immersion day' },
  upcoming: { label: 'Upcoming', short: 'Plan', hint: 'Scheduled immersion day' },
  rest: { label: 'Not scheduled', short: '', hint: 'Not a scheduled immersion day' },
};

/** Build a 'YYYY-MM-DD' key from local date parts (never use toISOString here -
 *  it shifts the day across the UTC boundary and would mislabel calendar cells). */
function toDateKey(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeDateKey(value) {
  if (!value) return '';
  const normalized = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
}

function parseDateKey(key) {
  const normalized = normalizeDateKey(key);
  if (!normalized) return null;
  const [year, month, day] = normalized.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatLongDate(key) {
  const date = parseDateKey(key);
  if (!date) return '\u2014';
  return date.toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Map 'YYYY-MM-DD' -> immersion day number, so a date can be looked up in the
 *  per-student `days` matrix returned by the server. */
function indexDayNumbers(dates, days) {
  const map = new Map();
  (dates || []).forEach((date, index) => {
    const key = normalizeDateKey(date);
    const number = days?.[index] ?? index + 1;
    if (key) map.set(key, String(number));
  });
  return map;
}

/** Collapse one student's record for a day into a single verdict. */
function getStudentVerdict(record) {
  if (!record) return 'absent';
  if (record.check_in_time && record.check_out_time) return 'present';
  if (record.check_in_time) return 'partial';
  return 'absent';
}

/** Resolve the batch-wide state for one date.
 *
 *  The server fills every student/day slot, defaulting a missing record to
 *  `status: 'absent'`, so "no row at all" and "explicitly absent" are
 *  indistinguishable here. `hasAnyRecord` is therefore derived from the raw
 *  dates list, not from the matrix. */
function getDayState(key, { dayNumberMap, students, todayKey }) {
  const dayNumber = dayNumberMap.get(key);
  if (!dayNumber) return { state: 'rest', total: 0, present: 0, partial: 0, absent: 0 };

  let present = 0;
  let partial = 0;
  let absent = 0;

  (students || []).forEach((student) => {
    const record = student?.days?.[dayNumber];
    const verdict = getStudentVerdict(record);

    if (verdict === 'present') present += 1;
    else if (verdict === 'partial') partial += 1;
    else absent += 1;
  });

  const total = present + partial + absent;

  if (!total) {
    return { state: key < todayKey ? 'missed' : 'upcoming', total: 0, present: 0, partial: 0, absent: 0 };
  }

  // Everyone is still on site (timed in, not yet out).
  if (present === 0 && partial === total) {
    return { state: key === todayKey ? 'active' : 'partial', total, present, partial, absent };
  }

  if (present === total) {
    return { state: 'complete', total, present, partial, absent };
  }

  // Some completed it. A day that is still in progress reads as "Now" rather
  // than "Part", so the live day is not mislabelled as a shortfall.
  if (partial > 0 && absent === 0) {
    return { state: key === todayKey ? 'active' : 'partial', total, present, partial, absent };
  }

  if (present > 0) {
    return { state: 'partial', total, present, partial, absent };
  }

  return { state: 'absent', total, present, partial, absent };
}

function summarizeDay(state) {
  return DAY_STATES[state] || DAY_STATES.rest;
}

function DayCell({ day, context, isSelected, onSelect }) {
  if (!day) {
    return <div className={styles.dayBlank} aria-hidden="true" />;
  }

  const key = toDateKey(context.year, context.month, day);
  const info = getDayState(key, context);
  const meta = summarizeDay(info.state);
  const isToday = key === context.todayKey;
  const isRest = info.state === 'rest';

  const detail = isRest
    ? meta.hint
    : `${meta.hint} (${info.present} of ${info.total} students completed)`;

  return (
    <button
      type="button"
      onClick={() => onSelect(key)}
      aria-pressed={isSelected}
      aria-label={`${formatLongDate(key)} - ${detail}`}
      title={detail}
      className={[
        styles.dayCell,
        isRest ? styles.dayRest : '',
        isRest ? '' : styles[info.state],
        isToday ? styles.dayToday : '',
        isSelected ? styles.daySelected : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className={styles.dayNumber}>{day}</span>
      {!isRest && <span className={styles.dayMarker} aria-hidden="true" />}
      {meta.short && <span className={styles.dayShort}>{meta.short}</span>}
    </button>
  );
}

export default function SupervisorCalendar({ compact = false }) {
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [attendance, setAttendance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const loadBatches = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const result = await getSupervisorBatches();
      const list = result?.batches || [];

      setBatches(list);

      // Keep the current selection when it survives the refresh, otherwise fall
      // back to the first batch so the calendar always has something to show.
      setSelectedBatchId((prev) => {
        if (prev && list.some((b) => String(b.request_id) === String(prev))) {
          return prev;
        }
        return list.length ? String(list[0].request_id) : '';
      });
    } catch (err) {
      setError(err.message || 'Unable to load your batches.');
      setLoading(false);
    }
  }, []);

  const loadAttendance = useCallback(async (batchId) => {
    if (!batchId) {
      setAttendance(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await getSupervisorBatchAttendance(batchId);
      setAttendance(result);
    } catch (err) {
      setAttendance(null);
      setError(err.message || 'Unable to load the schedule for this batch.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  useEffect(() => {
    loadAttendance(selectedBatchId);
  }, [selectedBatchId, loadAttendance]);

  const todayKey = useMemo(() => {
    const now = new Date();
    return toDateKey(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  // Hoisted into their own memos: a bare `|| []` fallback allocates a new
  // array every render, which would invalidate `context` on each one.
  const EMPTY = useMemo(() => [], []);

  const students = attendance?.students ?? EMPTY;
  const dayNumbers = attendance?.days ?? EMPTY;
  const dates = attendance?.dates ?? EMPTY;

  const context = useMemo(
    () => ({
      year: cursor.year,
      month: cursor.month,
      todayKey,
      dayNumberMap: indexDayNumbers(dates, dayNumbers),
      students,
    }),
    [cursor, todayKey, dates, dayNumbers, students],
  );

  const scheduledKeys = useMemo(
    () => Array.from(context.dayNumberMap.keys()).sort(),
    [context],
  );

  // Default the detail panel to the first scheduled day, so the panel is never
  // empty on arrival.
  useEffect(() => {
    if (!loading && !selectedKey && scheduledKeys.length) {
      const todayIsScheduled = scheduledKeys.includes(todayKey);
      setSelectedKey(todayIsScheduled ? todayKey : scheduledKeys[0]);
    }
  }, [loading, selectedKey, scheduledKeys, todayKey]);

  const monthLabel = useMemo(
    () =>
      new Date(cursor.year, cursor.month, 1).toLocaleDateString('en-PH', {
        month: 'long',
        year: 'numeric',
      }),
    [cursor],
  );

  // Monday-first grid, padded with 0s so every row holds exactly 7 cells.
  const cells = useMemo(() => {
    const leading = (new Date(cursor.year, cursor.month, 1).getDay() + 6) % 7;
    const total = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const list = Array.from({ length: leading }, () => 0);
    for (let day = 1; day <= total; day += 1) list.push(day);
    while (list.length % 7 !== 0) list.push(0);
    return list;
  }, [cursor]);

  const goToMonth = (delta) => {
    setCursor((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  const jumpToToday = () => {
    const now = new Date();
    setCursor({ year: now.getFullYear(), month: now.getMonth() });
    setSelectedKey(todayKey);
  };

  const hasSchedule = scheduledKeys.length > 0;

  return (
    <section className={`${styles.card} ${compact ? styles.cardCompact : ''}`}>
      <div className={styles.cardHeader}>
        <div>
          <p className={styles.cardEyebrow}>IMMERSION CALENDAR</p>
          <h2 className={styles.cardTitle}>{monthLabel}</h2>
          {!compact && (
            <p className={styles.cardSubtitle}>
              Attendance across the immersion schedule you set for each batch.
            </p>
          )}
        </div>

        <div className={styles.calendarNav}>
          <button
            type="button"
            onClick={() => goToMonth(-1)}
            aria-label="Previous month"
          >
            <ChevronLeft size={17} />
          </button>

          <button type="button" onClick={jumpToToday} className={styles.todayButton}>
            Today
          </button>

          <button
            type="button"
            onClick={() => goToMonth(1)}
            aria-label="Next month"
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>

      {/* ---------- STATES ---------- */}

      {loading && (
        <div className={styles.loadingState} role="status">
          <RefreshCw size={16} />
          <span>Loading immersion schedule...</span>
        </div>
      )}

      {!loading && error && (
        <div className={styles.errorState} role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>

          <button type="button" onClick={loadBatches}>
            <RefreshCw size={15} /> Try again
          </button>
        </div>
      )}

      {!loading && !error && !batches.length && (
        <div className={styles.emptyState}>
          <CalendarDays size={22} />
          <p>
            You have no deployment batches yet. Once a batch is assigned to you,
            its immersion schedule will appear here.
          </p>
        </div>
      )}

      {/* ---------- CALENDAR ---------- */}

      {!loading && !error && hasSchedule && (
        <>
          <div className={styles.weekdayRow} aria-hidden="true">
            {WEEKDAY_LABELS.map((label) => (
              <span key={label} className={styles.weekdayLabel}>
                {label}
              </span>
            ))}
          </div>

          <div
            className={styles.calendarGrid}
            role="group"
            aria-label={`Immersion days for ${monthLabel}`}
          >
            {cells.map((day, index) => (
              <DayCell
                key={`${cursor.year}-${cursor.month}-${index}`}
                day={day}
                context={context}
                isSelected={
                  day
                    ? toDateKey(cursor.year, cursor.month, day) === selectedKey
                    : false
                }
                onSelect={setSelectedKey}
              />
            ))}
          </div>

          {/* ---------- LEGEND ---------- */}

          <div className={styles.legend}>
            {Object.entries(DAY_STATES).map(([key, meta]) => (
              <span key={key} className={styles.legendItem}>
                <span
                  className={`${styles.legendSwatch} ${styles[`swatch${key}`]}`}
                  aria-hidden="true"
                />
                {meta.label}
              </span>
            ))}
          </div>
        </>
      )}

      {!loading && !error && batches.length > 0 && !hasSchedule && (
        <div className={styles.emptyState}>
          <CalendarDays size={22} />
          <p>
            No immersion schedule has been set for this batch yet. Set one under
            Attendance Schedule and it will appear here.
          </p>
        </div>
      )}
    </section>
  );
}
