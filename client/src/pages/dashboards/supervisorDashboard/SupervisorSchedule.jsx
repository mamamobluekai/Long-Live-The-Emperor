import { useEffect, useState } from 'react';
import {
  getSupervisorBatches,
  getSupervisorBatchStatus,
  getSupervisorBatchConfig,
  updateSupervisorBatchConfig,
  openSupervisorBatchAttendance,
  closeSupervisorBatchAttendance,
  getSupervisorBatchSchedules,
  upsertSupervisorBatchSchedule,
} from '../../../api/supervisorApi';
import Feedback from '../../../components/Feedback';
import styles from './SupervisorAttendance.module.css';

function normalizeTime(value) {
  if (!value) return '';
  return String(value).slice(0, 5);
}

function normalizeDate(value) {
  if (!value) return '';
  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (str.includes('T')) return str.substring(0, 10);
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// The supervisor owns attendance scheduling: time-in/out windows, the work
// immersion duration, and manual open/close — for every teacher batch linked
// to them. (Deployment-request batches are scheduled through their linked
// teacher batch.)
function SupervisorSchedule() {
  const [batches, setBatches] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [status, setStatus] = useState(null);
  const [config, setConfig] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoadingBatches(true);
      setError('');
      try {
        const res = await getSupervisorBatches();
        // Only teacher batches carry attendance config/schedules.
        const teacherBatches = (res.batches || []).filter((b) => b.source === 'teacher');
        if (cancelled) return;
        setBatches(teacherBatches);
        setSelectedId(teacherBatches.length ? teacherBatches[0].request_id : null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoadingBatches(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [s, c, g] = await Promise.all([
          getSupervisorBatchStatus(selectedId),
          getSupervisorBatchConfig(selectedId),
          getSupervisorBatchSchedules(selectedId),
        ]);
        if (cancelled) return;
        setStatus(s);
        setConfig({
          time_in_open: normalizeTime(c.time_in_open),
          time_in_close: normalizeTime(c.time_in_close),
          time_out_open: normalizeTime(c.time_out_open),
          time_out_close: normalizeTime(c.time_out_close),
          timezone: c.timezone,
        });
        setGroups(g.groups || []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [selectedId]);

  const flash = (text) => {
    setNotice(text);
    setTimeout(() => setNotice(''), 4000);
  };

  const saveWindows = async (e) => {
    e.preventDefault();
    if (!selectedId || !config) return;
    setSaving(true);
    setError('');
    try {
      const updated = await updateSupervisorBatchConfig(selectedId, {
        time_in_open: config.time_in_open,
        time_in_close: config.time_in_close,
        time_out_open: config.time_out_open,
        time_out_close: config.time_out_close,
      });
      setConfig({
        time_in_open: normalizeTime(updated.time_in_open),
        time_in_close: normalizeTime(updated.time_in_close),
        time_out_open: normalizeTime(updated.time_out_open),
        time_out_close: normalizeTime(updated.time_out_close),
        timezone: updated.timezone,
      });
      const s = await getSupervisorBatchStatus(selectedId);
      setStatus(s);
      flash('Attendance windows saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleOpen = async () => {
    if (!selectedId) return;
    setSaving(true);
    setError('');
    try {
      if (status?.manual_open) {
        await closeSupervisorBatchAttendance(selectedId);
        flash('Attendance closed.');
      } else {
        await openSupervisorBatchAttendance(selectedId);
        flash('Attendance opened.');
      }
      const s = await getSupervisorBatchStatus(selectedId);
      setStatus(s);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const saveDuration = async (group, startDate) => {
    if (!selectedId) return;
    setSaving(true);
    setError('');
    try {
      await upsertSupervisorBatchSchedule(selectedId, {
        supervisor_id: group.supervisor_id,
        duration_type: 'days',
        duration_value: 10,
        start_date: startDate,
      });
      const g = await getSupervisorBatchSchedules(selectedId);
      setGroups(g.groups || []);
      flash('Immersion schedule saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const selectedBatch = batches.find((b) => Number(b.request_id) === Number(selectedId));

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2>Attendance Schedule</h2>
        <p>Set attendance windows and immersion duration for your batches. Teachers see these as read-only.</p>
      </div>

      {error && <Feedback type="error" message={error} />}
      {notice && <Feedback type="success" message={notice} />}

      {loadingBatches ? (
        <p className={styles.loading}>Loading batches...</p>
      ) : batches.length === 0 ? (
        <p className={styles.empty}>No teacher batches linked to you yet.</p>
      ) : (
        <>
          <div className={styles.batchPickerRow}>
            <label>
              Batch
              <select value={selectedId || ''} onChange={(e) => setSelectedId(Number(e.target.value))}>
                {batches.map((b) => (
                  <option key={b.request_id} value={b.request_id}>
                    {b.batch_label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {loading ? (
            <p className={styles.loading}>Loading schedule...</p>
          ) : (
            <>
              {config && (
                <section className={styles.section}>
                  <h3 className={styles.sectionTitle}>
                    Attendance Windows {config.timezone ? `(${config.timezone})` : ''}
                    {selectedBatch ? ` — ${selectedBatch.batch_label}` : ''}
                  </h3>
                  <form onSubmit={saveWindows} className={styles.scheduleForm}>
                    <label>
                      Time In Open
                      <input
                        type="time"
                        value={config.time_in_open || ''}
                        onChange={(e) => setConfig({ ...config, time_in_open: e.target.value })}
                        required
                      />
                    </label>
                    <label>
                      Time In Close
                      <input
                        type="time"
                        value={config.time_in_close || ''}
                        onChange={(e) => setConfig({ ...config, time_in_close: e.target.value })}
                        required
                      />
                    </label>
                    <label>
                      Time Out Open
                      <input
                        type="time"
                        value={config.time_out_open || ''}
                        onChange={(e) => setConfig({ ...config, time_out_open: e.target.value })}
                        required
                      />
                    </label>
                    <label>
                      Time Out Close
                      <input
                        type="time"
                        value={config.time_out_close || ''}
                        onChange={(e) => setConfig({ ...config, time_out_close: e.target.value })}
                        required
                      />
                    </label>
                    <button type="submit" className={styles.primaryButton} disabled={saving}>
                      {saving ? 'Saving...' : 'Save Windows'}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      disabled={saving}
                      onClick={toggleOpen}
                    >
                      {status?.manual_open ? 'Close Attendance' : 'Open Attendance'}
                    </button>
                  </form>
                  <p className={styles.muted}>
                    Status: {status?.attendance_open ? 'Open' : 'Closed'}
                    {status?.manual_open ? ' (manually opened)' : ''}
                  </p>
                </section>
              )}

              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Work Immersion Duration (10 days, weekdays only)</h3>
                {groups.length === 0 && <p className={styles.empty}>No students in this batch yet.</p>}
                {groups.map((group) => {
                  const schedule = group.schedule || {};
                  const start = normalizeDate(schedule.start_date) || normalizeDate(new Date());
                  return (
                    <div key={group.supervisor_id || 'batch'} className={styles.groupCard}>
                      <div className={styles.groupHeader}>
                        <strong>{group.supervisor_name || 'Batch Students'}</strong>
                        <span className={styles.muted}>
                          {group.students.length} student{group.students.length !== 1 ? 's' : ''}
                          {schedule.id ? ' · Schedule active' : ' · No schedule yet'}
                        </span>
                      </div>
                      <div className={styles.scheduleForm}>
                        <label>
                          Start Date
                          <input
                            type="date"
                            value={start}
                            onChange={(e) => {
                              const val = e.target.value;
                              setGroups((gs) =>
                                gs.map((g) =>
                                  g.supervisor_id === group.supervisor_id
                                    ? { ...g, schedule: { ...(g.schedule || {}), start_date: val } }
                                    : g
                                )
                              );
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          className={styles.primaryButton}
                          disabled={saving}
                          onClick={() => saveDuration(group, start)}
                        >
                          {schedule.id ? 'Update Schedule' : 'Save Schedule'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default SupervisorSchedule;