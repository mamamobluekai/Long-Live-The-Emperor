import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { getMyProgress } from '../../../api/studentApi';
import {
  getMyAttendanceRecords,
  getMySchedule,
  getStudentAttendanceStatus,
} from '../../../api/attendanceApi';
import { getMyDailyDocs } from '../../../api/fileApi';
import { useAuth } from '../../../context/AuthContext';
import styles from './Overview.module.css';

const ROUTES = {
  attendance: '/dashboard/student/attendance',
  documentation: '/dashboard/student/daily-documentation',
  progress: '/dashboard/student/progress',
};

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Per-day visual states. `rest` is any day that is not a scheduled immersion day.
 *  `short` is the compact label rendered inside a calendar cell. */
const DAY_STATES = {
  complete: { label: 'Attended', short: 'Done', hint: 'Timed in and out' },
  active: { label: 'In progress', short: 'Now', hint: 'Timed in today' },
  partial: { label: 'Timed in only', short: 'In', hint: 'No time out recorded' },
  absent: { label: 'Absent', short: 'Abs', hint: 'Marked absent' },
  missed: { label: 'Missed', short: 'Miss', hint: 'No record on this immersion day' },
  upcoming: { label: 'Upcoming', short: 'Plan', hint: 'Scheduled immersion day' },
  rest: { label: 'Rest day', short: '', hint: 'Not a scheduled immersion day' },
};

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

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

/** Flatten every schedule row into one map of 'YYYY-MM-DD' -> schedule row.
 *  A student can have several rows (batch-level + one per supervisor), and the
 *  server already expands each into its concrete Mon-Fri attendance_dates. */
function indexScheduleDates(schedules) {
  const map = new Map();
  (schedules || []).forEach((schedule) => {
    String(schedule.attendance_dates || '')
      .split(',')
      .map(normalizeDateKey)
      .filter(Boolean)
      .forEach((key) => {
        if (!map.has(key)) map.set(key, schedule);
      });
  });
  return map;
}

function indexByDate(list, pickDate) {
  const map = new Map();
  (list || []).forEach((item) => {
    const key = normalizeDateKey(pickDate(item));
    if (key && !map.has(key)) map.set(key, item);
  });
  return map;
}

/** Resolve the calendar state for one day from the schedule + attendance + docs. */
function getDayState(key, { scheduleMap, recordMap, docMap, todayKey }) {
  const schedule = scheduleMap.get(key);
  if (!schedule) return { state: 'rest', schedule: null, record: null, doc: null };

  const record = recordMap.get(key) || null;
  const doc = docMap.get(key) || null;

  if (!record) {
    if (key < todayKey) return { state: 'missed', schedule, record, doc };
    return { state: 'upcoming', schedule, record, doc };
  }

  if (record.status === 'absent') return { state: 'absent', schedule, record, doc };
  if (record.status === 'present') return { state: 'complete', schedule, record, doc };
  if (record.check_out_time) return { state: 'complete', schedule, record, doc };
  if (record.check_in_time) {
    return { state: key === todayKey ? 'active' : 'partial', schedule, record, doc };
  }
  return { state: 'absent', schedule, record, doc };
}

function summarizeDay(state) {
  return DAY_STATES[state] || DAY_STATES.rest;
}

function LoadingState() {
  return (
    <div className={styles.loadingCard} role="status">
      <span className={styles.loadingPulse} />
      <span>Loading your immersion calendar...</span>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className={styles.errorState} role="alert">
      <AlertCircle size={20} />
      <span>{message}</span>
      <button type="button" onClick={onRetry}>
        <RefreshCw size={15} /> Try again
      </button>
    </div>
  );
}

function DayCell({ day, context, isSelected, onSelect, todayKey }) {
  if (!day) {
    return <div className={styles.dayBlank} aria-hidden="true" />;
  }

  const key = toDateKey(context.year, context.month, day);
  const info = getDayState(key, context);
  const meta = summarizeDay(info.state);
  const isToday = key === todayKey;
  const isRest = info.state === 'rest';

  return (
    <button
      type="button"
      onClick={() => onSelect(key)}
      aria-pressed={isSelected}
      aria-label={`${formatLongDate(key)} - ${meta.label}`}
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



function ProgressGraph({ progress, scheduledTotal, attendedDays, docs }) {
  const attendance = progress?.attendance || {};
  const documentation = progress?.documentation || {};
  const requirements = progress?.requirements || {};

  const attendanceTotal = Number(attendance.scheduled || scheduledTotal || 0);
  const attendanceDone = Number(attendance.complete ?? attendedDays ?? 0);
  const requirementTotal = Number(requirements.required || 0);
  const requirementDone = Number(requirements.uploaded || 0);
  const documentationTotal = Number(documentation.total || scheduledTotal || 0);
  const documentationDone = Number(documentation.submitted ?? docs?.length ?? 0);

  const rows = [
    {
      key: 'attendance',
      label: 'Attendance',
      done: attendanceDone,
      total: attendanceTotal,
      color: '#8b1e2d',
    },
    {
      key: 'requirements',
      label: 'Requirements',
      done: Math.min(requirementDone, requirementTotal || requirementDone),
      total: requirementTotal,
      color: '#b8394f',
    },
    {
      key: 'documentation',
      label: 'Documentation',
      done: Math.min(documentationDone, documentationTotal || documentationDone),
      total: documentationTotal,
      color: '#c98a4b',
    },
  ];

  return (
    <div className={styles.progressGraph}>
      {rows.map((row) => {
        const percent = row.total ? Math.min(100, Math.round((row.done / row.total) * 100)) : 0;
        return (
          <div key={row.key} className={styles.progressRow}>
            <span className={styles.progressLabel}>{row.label}</span>
            <div
              className={styles.progressTrack}
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${row.label} progress`}
            >
              <span
                className={styles.progressFill}
                style={{ width: `${percent}%`, background: row.color }}
              />
            </div>
            <span className={styles.progressValue}>{row.done}/{row.total}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function Overview({ user }) {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const loadCalendar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // getMySchedule 404s when the student profile row is missing, and the
      // status call fails when no batch is assigned. Neither should blank the
      // whole calendar, so both degrade gracefully instead of rejecting.
      const [scheduleResult, recordsResult, docsResult, progressResult, statusResult] =
        await Promise.all([
          getMySchedule(token).catch(() => ({ schedules: [] })),
          getMyAttendanceRecords(token),
          getMyDailyDocs({}),
          getMyProgress(),
          getStudentAttendanceStatus(token).catch(() => ({})),
        ]);

      setData({
        schedules: scheduleResult?.schedules || [],
        records: recordsResult?.records || [],
        docs: docsResult?.docs || [],
        progress: progressResult || {},
        status: statusResult || {},
      });
    } catch (err) {
      setError(err.message || 'Unable to load your immersion calendar.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) loadCalendar();
  }, [token, loadCalendar]);

  // The server resolves "today" in Asia/Manila; prefer it over the browser clock
  // so the highlighted cell matches the attendance window the backend uses.
  const todayKey = useMemo(() => {
    const fromServer = normalizeDateKey(data?.status?.date);
    if (fromServer) return fromServer;
    const now = new Date();
    return toDateKey(now.getFullYear(), now.getMonth(), now.getDate());
  }, [data]);

  const context = useMemo(
    () => ({
      year: cursor.year,
      month: cursor.month,
      scheduleMap: indexScheduleDates(data?.schedules),
      recordMap: indexByDate(data?.records, (r) => r.date),
      docMap: indexByDate(data?.docs, (d) => d.date),
      todayKey,
    }),
    [cursor, data, todayKey],
  );

  const scheduledKeys = useMemo(
    () => Array.from(context.scheduleMap.keys()).sort(),
    [context],
  );

  const stats = useMemo(() => {
    const attended = scheduledKeys.filter(
      (key) => getDayState(key, context).state === 'complete',
    ).length;
    const total = scheduledKeys.length;
    const required = Number(data?.progress?.attendance?.required || 0);
    return {
      attended,
      total,
      required,
      percent: required ? Math.min(100, Math.round((attended / required) * 100)) : 0,
    };
  }, [scheduledKeys, context, data]);

  // Default the detail panel to today once the data has landed.
  useEffect(() => {
    if (!loading && !selectedKey && todayKey) setSelectedKey(todayKey);
  }, [loading, selectedKey, todayKey]);

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

  const firstName = user?.first_name || user?.email?.split('@')[0] || 'Student';
  const hasSchedule = scheduledKeys.length > 0;



  return (
    <div className={styles.dashboard}>
      <section className={styles.greeting}>
        <div>
          <h1>
            {getGreeting()}, {firstName}!
          </h1>
          <p className={styles.greetingText}>
            Track every immersion day of your work immersion. Tap any date to see
            your time in, time out, and daily documentation.
          </p>
        </div>
      </section>

      {loading && <LoadingState />}
      {!loading && error && <ErrorState message={error} onRetry={loadCalendar} />}

      {!loading && !error && data && (
        <>
          <div className={styles.contentGrid}>
            <div className={styles.mainColumn}>
              <section className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <p className={styles.cardEyebrow}>IMMERSION PROGRESS</p>
                    <h2>Your progress</h2>
                  </div>
                  <Link className={styles.cardFooterLink} to={ROUTES.progress}>
                    View full progress<ChevronRight size={15} />
                  </Link>
                </div>

                <ProgressGraph
                  progress={data?.progress}
                  scheduledTotal={scheduledKeys.length}
                  attendedDays={stats.attended}
                  docs={data?.docs}
                />
              </section>

              <section className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <p className={styles.cardEyebrow}>IMMERSION CALENDAR</p>
                    <h2>{monthLabel}</h2>
                  </div>
                  <div className={styles.calendarNav}>
                    <button
                      type="button"
                      onClick={() => goToMonth(-1)}
                      aria-label="Previous month"
                    >
                      <ChevronLeft size={17} />
                    </button>
                    <button
                      type="button"
                      onClick={jumpToToday}
                      className={styles.todayButton}
                    >
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
                        day ? toDateKey(cursor.year, cursor.month, day) === selectedKey : false
                      }
                      onSelect={setSelectedKey}
                      todayKey={todayKey}
                    />
                  ))}
                </div>

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

                {!hasSchedule && (
                  <div className={styles.emptyState}>
                    <CalendarDays size={22} />
                    <p>
                      No immersion schedule has been assigned to you yet. Your teacher
                      or coordinator needs to set the schedule for your batch first.
                    </p>
                  </div>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
