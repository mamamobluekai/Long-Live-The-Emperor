import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useTeacherBatch } from '../../../hooks/useTeacherBatch';
import TeacherBatchPicker from './TeacherBatchPicker';
import {
  getTeacherBatchStatus,
  getBatchConfig,
  getBatchStats,
  getBatchSchedules,
} from '../../../api/teacherApi';
import styles from './TeacherAttendance.module.css';

function parseLocalDate(dateStr) {
  if (dateStr instanceof Date) {
    if (isNaN(dateStr.getTime())) return new Date();
    return new Date(dateStr.getFullYear(), dateStr.getMonth(), dateStr.getDate());
  }

  if (!dateStr) return new Date();

  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toLocalDateString(date) {
  if (!date) return '';

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');

  return `${y}-${m}-${d}`;
}

/* FIX: Make sure backend date values are always YYYY-MM-DD */
function normalizeDateInput(value) {
  if (!value) return toLocalDateString(new Date());

  const str = String(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // ISO datetime such as 2026-08-28T00:00:00.000Z
  if (str.includes('T')) {
    return str.substring(0, 10);
  }

  const d = new Date(str);

  if (isNaN(d.getTime())) {
    return toLocalDateString(new Date());
  }

  return toLocalDateString(d);
}

function normalizeTimeInput(value) {
  if (!value) return '';
  return String(value).slice(0, 5);
}

function TeacherAttendance() {
  const { token } = useAuth();
  const { batchId: selectedBatchId, batchLabel } = useTeacherBatch();

  const [status, setStatus] = useState(null);
  const [config, setConfig] = useState(null);
  const [stats, setStats] = useState(null);
  const [groups, setGroups] = useState([]);

  const [date] = useState(
    toLocalDateString(new Date())
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAll = useCallback(async () => {
    if (!selectedBatchId) return;

    setLoading(true);
    setError(null);

    try {
      const [s, c, st, g] = await Promise.all([
        getTeacherBatchStatus(selectedBatchId, token),
        getBatchConfig(selectedBatchId, token),
        getBatchStats(selectedBatchId, date, token),
        getBatchSchedules(selectedBatchId, token),
      ]);

      setStatus(s);
      setConfig({
        ...c,
        time_in_open: normalizeTimeInput(c.time_in_open),
        time_in_close: normalizeTimeInput(c.time_in_close),
        time_out_open: normalizeTimeInput(c.time_out_open),
        time_out_close: normalizeTimeInput(c.time_out_close),
      });
      setStats(st);
      setGroups(g.groups || []);
    } catch {
      setError('Failed to load attendance data.');
    } finally {
      setLoading(false);
    }
  }, [selectedBatchId, date, token]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Live refresh
  useEffect(() => {
    if (!selectedBatchId) return;

    const id = setInterval(async () => {
      try {
        const [s] = await Promise.all([
          getTeacherBatchStatus(selectedBatchId, token),
        ]);

        setStatus(s);
      } catch {
        /* ignore */
      }
    }, 15000);

    return () => clearInterval(id);
  }, [selectedBatchId, date, token]);

  // Read-only monitor: the supervisor owns attendance scheduling, so the
  // teacher cannot edit windows or immersion durations here.
  function computeDates(startDate) {
    const current = parseLocalDate(startDate);

    if (isNaN(current.getTime())) return [];

    const dates = [];

    while (dates.length < 10) {
      const day = current.getDay();

      if (day !== 0 && day !== 6) {
        dates.push(toLocalDateString(current));
      }

      current.setDate(current.getDate() + 1);
    }

    return dates;
  }

  return (
    <div className={styles.page}>

      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>
            Attendance Monitor
          </h2>

          {batchLabel && (
            <p className={styles.batchTag}>
              Batch: {batchLabel}
            </p>
          )}
          <p className={styles.pageDescription}>
            View-only. Attendance windows and immersion schedules are set by the supervisor.
          </p>
        </div>
        <TeacherBatchPicker />
      </div>

      {loading && (
        <p className={styles.info}>
          Loading…
        </p>
      )}

      {error && (
        <p className={styles.error}>
          {error}
        </p>
      )}

      {!loading && selectedBatchId && (
        <>
          {stats && (
            <div className={styles.statGrid}>

              <div className={styles.statCard}>
                <span className={styles.statValue}>
                  {stats.total_students}
                </span>

                <span className={styles.statLabel}>
                  Students
                </span>
              </div>

              <div className={styles.statCard}>
                <span className={styles.statValue}>
                  {stats.timed_in}
                </span>

                <span className={styles.statLabel}>
                  Timed In ({stats.timed_in_rate}%)
                </span>
              </div>

              <div className={styles.statCard}>
                <span className={styles.statValue}>
                  {stats.timed_out}
                </span>

                <span className={styles.statLabel}>
                  Timed Out ({stats.timed_out_rate}%)
                </span>
              </div>

              <div className={styles.statCard}>
                <span className={styles.statValue}>
                  {stats.pending_appeals}
                </span>

                <span className={styles.statLabel}>
                  Pending Appeals
                </span>
              </div>

            </div>
          )}

          {/* Schedule config */}
          {config && (
            <div className={styles.panel}>

              <div className={styles.panelHeader}>
                <div className={styles.scheduleHeading}>
                  <h3 className={styles.panelTitle}>
                    Attendance Schedule
                  </h3>
                  <p className={styles.scheduleSummary}>
                    Time In: {normalizeTimeInput(config.time_in_open)} - {normalizeTimeInput(config.time_in_close)}
                    {' | '}
                    Time Out: {normalizeTimeInput(config.time_out_open)} - {normalizeTimeInput(config.time_out_close)}
                  </p>
                  <p className={styles.muted}>
                    Set by the supervisor. Contact the supervisor to change these windows.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Work Immersion Duration Settings */}
          <div className={styles.panel}>

            <h3 className={styles.panelTitle}>
              Work Immersion Duration
            </h3>

            <p
              className={styles.muted}
              style={{ marginBottom: 14 }}
            >
              Set the immersion duration per supervisor.
              Weekends (Saturday/Sunday) are excluded from
              attendance days.
            </p>

            {groups.map((group) => {

              const schedule = group.schedule || {};

              const form = {
                duration_type:
                  schedule.duration_type || 'days',

                duration_value:
                  schedule.duration_value || 10,

                // FIX: normalize backend date
                start_date:
                  normalizeDateInput(
                    schedule.start_date
                  ),
              };

              const computedDates =
                computeDates(form.start_date);

              const hasSchedule =
                Boolean(schedule.id);

              return (
                <div
                  key={
                    group.supervisor_id || 'batch'
                  }
                  className={styles.supervisorGroup}
                >

                  <div
                    className={
                      styles.supervisorHeader
                    }
                  >

                    <div>
                      <h4
                        className={
                          styles.supervisorName
                        }
                      >
                        {group.supervisor_name ||
                          'Batch Students'}
                      </h4>

                      <p className={styles.muted}>
                        {group.students.length} student
                        {group.students.length !== 1
                          ? 's'
                          : ''}
                      </p>
                    </div>

                    {hasSchedule && (
                      <span
                        className={
                          styles.scheduleBadge
                        }
                      >
                        Schedule active
                      </span>
                    )}

                  </div>

                  <div
                    className={styles.scheduleForm}
                  >

                    <div className={styles.cfgField}>
                      <span className={styles.muted}>Total Days</span>
                      <strong>{form.duration_value || 10} days</strong>
                    </div>

                    <div className={styles.cfgField}>
                      <span className={styles.muted}>Start Date</span>
                      <strong>{form.start_date || '—'}</strong>
                    </div>

                    <div className={styles.cfgField}>
                      <span className={styles.muted}>Set by</span>
                      <strong>Supervisor</strong>
                    </div>

                  </div>

                  <div
                    className={
                      styles.dateTimeline
                    }
                  >
                    {computedDates.map((d) => (
                      <span
                        key={d}
                        className={styles.dateChip}
                      >
                        {d}
                      </span>
                    ))}
                  </div>

                  <div
                    className={
                      styles.studentChips
                    }
                  >
                    {group.students.map((s) => (
                      <span
                        key={s.student_id}
                        className={
                          styles.studentChip
                        }
                      >
                        {s.first_name} {s.last_name}
                      </span>
                    ))}
                  </div>

                  <div
                    className={
                      styles.groupActions
                    }
                  >

                    <span
                      className={`${styles.statePill} ${
                        status?.attendance_open
                          ? styles.open
                          : styles.closed
                      }`}
                    >
                      {status?.attendance_open
                        ? 'Open'
                        : 'Closed'}
                    </span>

                    <span
                      className={
                        styles.stateMeta
                      }
                    >
                      {status?.manual_open
                        ? 'Manually opened'
                        : status?.active_type ===
                          'time_in'
                        ? 'Time In window active'
                        : status?.active_type ===
                          'time_out'
                        ? 'Time Out window active'
                        : 'No active window'}
                    </span>

                  </div>

                </div>
              );
            })}
          </div>

        </>
      )}

      {!loading && !selectedBatchId && (
        <p className={styles.info}>
          You are not assigned to a batch yet.
        </p>
      )}

    </div>
  );
}

export default TeacherAttendance;