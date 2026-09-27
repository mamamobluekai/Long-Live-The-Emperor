import { useState, useEffect, useCallback } from 'react';
import { CalendarDays, ClipboardList, X } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useTeacherBatch } from '../../../hooks/useTeacherBatch';
import ImmersionScheduleCalendar from './ImmersionScheduleCalendar';
import TeacherAttendanceRecords from './TeacherAttendanceRecords';
import AttendanceInsights from './AttendanceInsights';
import { useTeacherAttendanceReport } from '../../../hooks/useTeacherAttendanceReport';
import {
  getTeacherBatchStatus,
  getBatchConfig,
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
  const [groups, setGroups] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [calendarGroup, setCalendarGroup] = useState(null);
  const [recordsOpen, setRecordsOpen] = useState(false);

  // One report per batch, shared by the records modal and the insights charts.
  const report = useTeacherAttendanceReport();

  const loadAll = useCallback(async () => {
    if (!selectedBatchId) {
      setStatus(null);
      setConfig(null);
      setGroups([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Settle each request on its own: one failing endpoint must not blank out
    // the whole monitor, and the failure must say WHICH call broke.
    const calls = [
      ['status', () => getTeacherBatchStatus(selectedBatchId, token)],
      ['config', () => getBatchConfig(selectedBatchId, token)],
      ['schedules', () => getBatchSchedules(selectedBatchId, token)],
    ];

    const results = await Promise.allSettled(calls.map(([, run]) => run()));

    const failed = [];
    results.forEach((result, index) => {
      const name = calls[index][0];
      if (result.status === 'rejected') {
        const reason = result.reason;
        const status = reason?.response?.status;
        console.error(`Attendance Monitor: ${name} request failed`, reason);
        failed.push(`${name}${status ? ` (HTTP ${status})` : ''}`);
        return;
      }

      const value = result.value;
      if (name === 'status') {
        setStatus(value);
      } else if (name === 'config') {
        setConfig({
          ...value,
          time_in_open: normalizeTimeInput(value.time_in_open),
          time_in_close: normalizeTimeInput(value.time_in_close),
          time_out_open: normalizeTimeInput(value.time_out_open),
          time_out_close: normalizeTimeInput(value.time_out_close),
        });
      } else if (name === 'schedules') {
        setGroups(value?.groups || []);
      }
    });

    if (failed.length) {
      const unauthorized = results.some(
        (r) => r.status === 'rejected' && r.reason?.response?.status === 401
      );
      setError(
        unauthorized
          ? 'Your session has expired. Please sign in again to load attendance data.'
          : failed.length === calls.length
            ? 'Failed to load attendance data.'
            : `Could not load: ${failed.join(', ')}.`
      );
    }

    setLoading(false);
  }, [selectedBatchId, token]);

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
  }, [selectedBatchId, token]);

  // The attendance records modal has its own dismiss/scroll-lock behaviour.
  useEffect(() => {
    if (!recordsOpen) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setRecordsOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [recordsOpen]);

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
          <span className={styles.eyebrow}>Daily Monitoring</span>
          <h2 className={styles.title}>
            Attendance Monitor
          </h2>

          <p className={styles.pageDescription}>
            View-only. Attendance windows and immersion schedules are set by the supervisor.
          </p>
        </div>
        <div className={styles.headerIcon} aria-hidden="true">
          <CalendarDays size={24} strokeWidth={2} />
        </div>
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

      {/* Live attendance status */}
      {!loading && status && (
        <div
          className={`${styles.liveStatus} ${
            status.attendance_open ? styles.liveStatusOpen : styles.liveStatusClosed
          }`}
        >
          <span className={styles.liveStatusPill}>
            {status.attendance_open ? 'Open' : 'Closed'}
          </span>
          <span className={styles.liveStatusText}>
            {status.manual_open
              ? 'Manually opened'
              : status.active_type === 'time_in'
                ? 'Time-In is now open'
                : status.active_type === 'time_out'
                  ? 'Time-Out is now open'
                  : 'No attendance yet'}
          </span>
        </div>
      )}

      {!loading && selectedBatchId && (
        <>
          {/* Work Immersion Duration + supervisor-set attendance windows */}
          <div className={styles.panel}>

            <div className={styles.panelHeader}>
              <div className={styles.scheduleHeading}>
                <h3 className={styles.panelTitle}>
                  Work Immersion Duration
                </h3>
                <p className={styles.muted}>
                  Set the immersion duration per supervisor.
                  Weekends (Saturday/Sunday) are excluded from
                  attendance days.
                </p>
              </div>

              {config && (
                <div className={styles.windowSummary}>
                  <span className={styles.windowLabel}>Attendance Windows</span>
                  <span className={styles.windowValue}>
                    <span className={styles.windowTag}>Time In</span>
                    {normalizeTimeInput(config.time_in_open)} - {normalizeTimeInput(config.time_in_close)}
                  </span>
                  <span className={styles.windowValue}>
                    <span className={styles.windowTag}>Time Out</span>
                    {normalizeTimeInput(config.time_out_open)} - {normalizeTimeInput(config.time_out_close)}
                  </span>
                  <span className={styles.windowNote}>Set by the supervisor</span>
                </div>
              )}
            </div>

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

              return (
                <div
                  key={
                    group.supervisor_id || 'batch'
                  }
                  className={styles.supervisorGroup}
                >

                  <div className={styles.groupButtons}>

                    <button
                      type="button"
                      className={styles.scheduleButton}
                      onClick={() => setCalendarGroup({
                        title: group.supervisor_name || 'Batch Students',
                        dates: computedDates,
                      })}
                    >
                      <CalendarDays size={18} strokeWidth={2} aria-hidden="true" />
                      <span className={styles.scheduleButtonText}>
                        <strong>View Immersion Schedule</strong>
                        <span>
                          {computedDates.length} day{computedDates.length === 1 ? '' : 's'}
                          {form.start_date ? ` · starts ${form.start_date}` : ''}
                        </span>
                      </span>
                    </button>

                    <button
                      type="button"
                      className={styles.scheduleButton}
                      onClick={() => setRecordsOpen(true)}
                    >
                      <ClipboardList size={18} strokeWidth={2} aria-hidden="true" />
                      <span className={styles.scheduleButtonText}>
                        <strong>View Attendance Records</strong>
                        <span>Every student against each scheduled immersion date</span>
                      </span>
                    </button>

                  </div>

                </div>
              );
            })}
          </div>

          <AttendanceInsights report={report} />
        </>
      )}

      {!loading && !selectedBatchId && (
        <p className={styles.info}>
          You are not assigned to a batch yet.
        </p>
      )}

      {calendarGroup && (
        <ImmersionScheduleCalendar
          dates={calendarGroup.dates}
          title={calendarGroup.title}
          batchLabel={batchLabel}
          onClose={() => setCalendarGroup(null)}
        />
      )}

      {recordsOpen && (
        <div
          className={styles.calOverlay}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setRecordsOpen(false);
          }}
        >
          <section
            className={`${styles.calModal} ${styles.calModalWide}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="attendance-records-title"
          >
            <div className={styles.calHeader}>
              <div className={styles.calIdentity}>
                <span className={styles.calHeaderIcon} aria-hidden="true">
                  <ClipboardList size={20} strokeWidth={2} />
                </span>
                <div>
                  <span className={styles.calEyebrow}>Attendance Records</span>
                  <h2 id="attendance-records-title">Scheduled Immersion Attendance</h2>
                  <p>
                    {batchLabel ? `${batchLabel} · ` : ''}
                    Every enrolled student against each scheduled work immersion date.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className={styles.calClose}
                onClick={() => setRecordsOpen(false)}
                aria-label="Close attendance records"
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.calBody}>
              <TeacherAttendanceRecords variant="body" report={report} />
            </div>
          </section>
        </div>
      )}

    </div>
  );
}

export default TeacherAttendance;