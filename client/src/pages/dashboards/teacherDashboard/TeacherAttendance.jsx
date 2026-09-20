import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useTeacherBatch } from '../../../hooks/useTeacherBatch';
import {
  getTeacherBatchStatus,
  getBatchConfig,
  updateBatchConfig,
  getBatchStats,
  getBatchSchedules,
  upsertBatchSchedule,
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [editingHours, setEditingHours] = useState(false);

  // Location modal state

  const flash = (type, text) => {
    setNotice({ type, text });

    setTimeout(() => setNotice(null), 4000);
  };

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

  const saveConfig = async (e) => {
    e.preventDefault();

    setBusy(true);

    try {
      const payload = {
        time_in_open: config.time_in_open,
        time_in_close: config.time_in_close,
        time_out_open: config.time_out_open,
        time_out_close: config.time_out_close,
      };

      await updateBatchConfig(
        selectedBatchId,
        payload,
        token
      );

      const c = await getBatchConfig(
        selectedBatchId,
        token
      );

      setConfig({
        ...c,
        time_in_open: normalizeTimeInput(c.time_in_open),
        time_in_close: normalizeTimeInput(c.time_in_close),
        time_out_open: normalizeTimeInput(c.time_out_open),
        time_out_close: normalizeTimeInput(c.time_out_close),
      });

      const s = await getTeacherBatchStatus(
        selectedBatchId,
        token
      );
      setStatus(s);

      flash('success', 'Schedule updated.');
      setEditingHours(false);
    } catch {
      flash('error', 'Failed to update schedule.');
    } finally {
      setBusy(false);
    }
  };

  const onConfigChange = (key, value) =>
    setConfig((c) => ({
      ...c,
      [key]: value,
    }));

  const saveGroupSchedule = async (group, form) => {
    setBusy(true);

    try {
      const payload = {
        supervisor_id: group.supervisor_id,
        duration_type: form.duration_type,
        duration_value: form.duration_value,
        start_date: form.start_date,
      };

      await upsertBatchSchedule(
        selectedBatchId,
        payload,
        token
      );

      flash('success', 'Immersion schedule saved.');

      const g = await getBatchSchedules(
        selectedBatchId,
        token
      );

      setGroups(g.groups || []);
    } catch {
      flash(
        'error',
        'Failed to save immersion schedule.'
      );
    } finally {
      setBusy(false);
    }
  };

  const isWeekend = (dateStr) => {
    if (!dateStr) return false;

    const d = parseLocalDate(dateStr);
    const day = d.getDay();

    return day === 0 || day === 6;
  };

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
            Teacher Attendance & Work Immersion Schedule
          </h2>

          {batchLabel && (
            <p className={styles.batchTag}>
              Batch: {batchLabel}
            </p>
          )}
          <p className={styles.pageDescription}>
            Configure attendance windows and set the work immersion duration for this batch.
          </p>
        </div>
      </div>

      {notice && (
        <div
          className={`${styles.notice} ${
            styles['notice_' + notice.type]
          }`}
        >
          {notice.text}
        </div>
      )}

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
                    Attendance Schedule ({config.timezone})
                  </h3>
                  <p className={styles.scheduleSummary}>
                    Time In: {normalizeTimeInput(config.time_in_open)} - {normalizeTimeInput(config.time_in_close)}
                    {' | '}
                    Time Out: {normalizeTimeInput(config.time_out_open)} - {normalizeTimeInput(config.time_out_close)}
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.editHoursButton}
                  onClick={() => setEditingHours((value) => !value)}
                  disabled={busy}
                >
                  {editingHours ? 'Hide Hour Editor' : 'Edit Attendance Hours'}
                </button>
              </div>

              {editingHours && (
                <form
                  className={styles.configForm}
                  onSubmit={saveConfig}
                >

                <label className={styles.cfgField}>
                  Time In Open

                  <input
                    type="time"
                    value={normalizeTimeInput(config.time_in_open)}
                    onChange={(e) =>
                      onConfigChange(
                        'time_in_open',
                        e.target.value
                      )
                    }
                  />
                </label>

                <label className={styles.cfgField}>
                  Time In Close

                  <input
                    type="time"
                    value={normalizeTimeInput(config.time_in_close)}
                    onChange={(e) =>
                      onConfigChange(
                        'time_in_close',
                        e.target.value
                      )
                    }
                  />
                </label>

                <label className={styles.cfgField}>
                  Time Out Open

                  <input
                    type="time"
                    value={normalizeTimeInput(config.time_out_open)}
                    onChange={(e) =>
                      onConfigChange(
                        'time_out_open',
                        e.target.value
                      )
                    }
                  />
                </label>

                <label className={styles.cfgField}>
                  Time Out Close

                  <input
                    type="time"
                    value={normalizeTimeInput(config.time_out_close)}
                    onChange={(e) =>
                      onConfigChange(
                        'time_out_close',
                        e.target.value
                      )
                    }
                  />
                </label>

                  <button
                    type="submit"
                    className={styles.saveBtn}
                    disabled={busy}
                  >
                    Save Schedule
                  </button>

                </form>
              )}
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

                    <label
                      className={styles.cfgField}
                    >
                      Total Days

                      <input
                        type="number"
                        min="1"
                        value={10}
                        readOnly
                        style={{
                          backgroundColor:
                            '#f3f4f6',
                          cursor: 'not-allowed',
                        }}
                      />
                    </label>

                    <label
                      className={styles.cfgField}
                    >
                      Start Date

                      <input
                        type="date"
                        className={styles.dateInput}
                        value={form.start_date || ''}
                        onClick={(e) => {
                          if (
                            e.currentTarget.showPicker
                          ) {
                            e.currentTarget.showPicker();
                          }
                        }}
                        onChange={(e) => {
                          const val =
                            e.target.value;

                          if (!val) return;

                          if (isWeekend(val)) {
                            flash(
                              'error',
                              'Start date cannot be a weekend (Saturday/Sunday).'
                            );

                            return;
                          }

                          setGroups((gs) =>
                            gs.map((g) =>
                              g.supervisor_id ===
                              group.supervisor_id
                                ? {
                                    ...g,
                                    schedule: {
                                      ...(g.schedule ||
                                        {}),
                                      start_date:
                                        val,
                                    },
                                  }
                                : g
                            )
                          );
                        }}
                      />
                    </label>

                    <button
                      type="button"
                      className={styles.saveBtn}
                      disabled={busy}
                      onClick={() =>
                        saveGroupSchedule(
                          group,
                          {
                            ...form,
                            duration_type:
                              'days',
                            duration_value: 10,
                          }
                        )
                      }
                    >
                      {hasSchedule
                        ? 'Update Schedule'
                        : 'Save Schedule'}
                    </button>

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
                        ? 'Manually opened by you'
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