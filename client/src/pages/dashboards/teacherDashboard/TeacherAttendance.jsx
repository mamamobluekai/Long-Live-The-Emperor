import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useTeacherBatch } from '../../../hooks/useTeacherBatch';
import {
  getTeacherBatchStatus,
  openBatchAttendance,
  closeBatchAttendance,
  getBatchConfig,
  updateBatchConfig,
  getBatchRecords,
  getBatchStats,
  getBatchSchedules,
  upsertBatchSchedule,
} from '../../../api/attendanceApi';
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

function TeacherAttendance() {
  const { token } = useAuth();
  const { batchId: selectedBatchId, batchLabel } = useTeacherBatch();
  const [status, setStatus] = useState(null);
  const [config, setConfig] = useState(null);
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState(null);
  const [groups, setGroups] = useState([]);
  const [date, setDate] = useState(toLocalDateString(new Date()));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  
  // Location modal state
  const [locationModal, setLocationModal] = useState(null);

  const flash = (type, text) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 4000);
  };

  const loadAll = useCallback(async () => {
    if (!selectedBatchId) return;
    setLoading(true);
    setError(null);
    try {
      const [s, c, r, st, g] = await Promise.all([
        getTeacherBatchStatus(selectedBatchId, token),
        getBatchConfig(selectedBatchId, token),
        getBatchRecords(selectedBatchId, date, token),
        getBatchStats(selectedBatchId, date, token),
        getBatchSchedules(selectedBatchId, token),
      ]);
      setStatus(s);
      setConfig(c);
      setRecords(r.records || []);
      setStats(st);
      setGroups(g.groups || []);
    } catch {
      setError('Failed to load attendance data.');
    } finally {
      setLoading(false);
    }
  }, [selectedBatchId, date, token]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Live refresh
  useEffect(() => {
    if (!selectedBatchId) return;
    const id = setInterval(async () => {
      try {
        const [s, r] = await Promise.all([
          getTeacherBatchStatus(selectedBatchId, token),
          getBatchRecords(selectedBatchId, date, token),
        ]);
        setStatus(s);
        setRecords(r.records || []);
      } catch { /* ignore */ }
    }, 15000);
    return () => clearInterval(id);
  }, [selectedBatchId, date, token]);

  const handleToggle = async () => {
    setBusy(true);
    try {
      if (status?.manual_open) await closeBatchAttendance(selectedBatchId, token);
      else await openBatchAttendance(selectedBatchId, token);
      const s = await getTeacherBatchStatus(selectedBatchId, token);
      setStatus(s);
      flash('info', s.manual_open ? 'Attendance manually opened.' : 'Manual override turned off.');
    } catch {
      flash('error', 'Could not update attendance state.');
    } finally {
      setBusy(false);
    }
  };

  const showLocationModal = (record, type) => {
    const lat = type === 'check_in' ? record.check_in_lat : record.check_out_lat;
    const lng = type === 'check_in' ? record.check_in_lng : record.check_out_lng;
    const accuracy = type === 'check_in' ? record.check_in_accuracy : record.check_out_accuracy;
    const time = type === 'check_in' ? record.check_in_time : record.check_out_time;

    if (!lat || !lng) {
      flash('error', 'No location data available for this attendance.');
      return;
    }

    setLocationModal({ record, type, lat, lng, accuracy, time });
  };

  const closeLocationModal = () => {
    setLocationModal(null);
  };

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
      await updateBatchConfig(selectedBatchId, payload, token);
      const c = await getBatchConfig(selectedBatchId, token);
      setConfig(c);
      flash('success', 'Schedule updated.');
    } catch {
      flash('error', 'Failed to update schedule.');
    } finally {
      setBusy(false);
    }
  };

  const onConfigChange = (key, value) => setConfig((c) => ({ ...c, [key]: value }));

  const saveGroupSchedule = async (group, form) => {
    setBusy(true);
    try {
      const payload = {
        supervisor_id: group.supervisor_id,
        duration_type: form.duration_type,
        duration_value: form.duration_value,
        start_date: form.start_date,
      };
      await upsertBatchSchedule(selectedBatchId, payload, token);
      flash('success', 'Immersion schedule saved.');
      const g = await getBatchSchedules(selectedBatchId, token);
      setGroups(g.groups || []);
    } catch {
      flash('error', 'Failed to save immersion schedule.');
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

  const today = toLocalDateString(new Date());
  const isTodayInSchedule = groups.some((g) => {
    const s = g.schedule;
    if (!s || !s.start_date) return false;
    const dates = computeDates(s.start_date);
    return dates.includes(today);
  });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Attendance Management</h2>
          {batchLabel && <p className={styles.batchTag}>Batch: {batchLabel}</p>}
        </div>
      </div>

      {notice && <div className={`${styles.notice} ${styles['notice_' + notice.type]}`}>{notice.text}</div>}

      {loading && <p className={styles.info}>Loading…</p>}
      {error && <p className={styles.error}>{error}</p>}

      {!loading && selectedBatchId && (
        <>
          {stats && (
            <div className={styles.statGrid}>
              <div className={styles.statCard}>
                <span className={styles.statValue}>{stats.total_students}</span>
                <span className={styles.statLabel}>Students</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statValue}>{stats.timed_in}</span>
                <span className={styles.statLabel}>Timed In ({stats.timed_in_rate}%)</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statValue}>{stats.timed_out}</span>
                <span className={styles.statLabel}>Timed Out ({stats.timed_out_rate}%)</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statValue}>{stats.pending_appeals}</span>
                <span className={styles.statLabel}>Pending Appeals</span>
              </div>
            </div>
          )}

          {/* Schedule config */}
          {config && (
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>Attendance Schedule ({config.timezone})</h3>
              <form className={styles.configForm} onSubmit={saveConfig}>
                <label className={styles.cfgField}>
                  Time In Open
                  <input type="time" value={config.time_in_open} onChange={(e) => onConfigChange('time_in_open', e.target.value)} />
                </label>
                <label className={styles.cfgField}>
                  Time In Close
                  <input type="time" value={config.time_in_close} onChange={(e) => onConfigChange('time_in_close', e.target.value)} />
                </label>
                <label className={styles.cfgField}>
                  Time Out Open
                  <input type="time" value={config.time_out_open} onChange={(e) => onConfigChange('time_out_open', e.target.value)} />
                </label>
                <label className={styles.cfgField}>
                  Time Out Close
                  <input type="time" value={config.time_out_close} onChange={(e) => onConfigChange('time_out_close', e.target.value)} />
                </label>
                <button type="submit" className={styles.saveBtn} disabled={busy}>Save Schedule</button>
              </form>
            </div>
          )}

          {/* Work Immersion Duration Settings */}
          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>Work Immersion Duration</h3>
            <p className={styles.muted} style={{ marginBottom: 14 }}>
              Set the immersion duration per supervisor. Weekends (Saturday/Sunday) are excluded from attendance days.
            </p>
            {groups.map((group) => {
              const schedule = group.schedule || {};
              const form = {
                duration_type: schedule.duration_type || 'days',
                duration_value: schedule.duration_value || 10,
                start_date: schedule.start_date || toLocalDateString(new Date()),
              };
              const computedDates = computeDates(form.start_date);
              const hasSchedule = Boolean(schedule.id);
              return (
                <div key={group.supervisor_id || 'batch'} className={styles.supervisorGroup}>
                  <div className={styles.supervisorHeader}>
                    <div>
                      <h4 className={styles.supervisorName}>
                        {group.supervisor_name || 'Batch Students'}
                      </h4>
                      <p className={styles.muted}>
                        {group.students.length} student{group.students.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    {hasSchedule && <span className={styles.scheduleBadge}>Schedule active</span>}
                  </div>
                  <div className={styles.scheduleForm}>
                    <label className={styles.cfgField}>
                      Total Days
                      <input
                        type="number"
                        min="1"
                        value={10}
                        readOnly
                        style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
                      />
                    </label>
                    <label className={styles.cfgField}>
                      Start Date
                      <input
                        type="date"
                        value={form.start_date}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val && isWeekend(val)) {
                            flash('error', 'Start date cannot be a weekend (Saturday/Sunday).');
                            return;
                          }
                          setGroups((gs) => gs.map((g) => g.supervisor_id === group.supervisor_id ? { ...g, schedule: { ...g.schedule, start_date: val } } : g));
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className={styles.saveBtn}
                      disabled={busy}
                      onClick={() => saveGroupSchedule(group, { ...form, duration_type: 'days', duration_value: 10 })}
                    >
                      {hasSchedule ? 'Update Schedule' : 'Save Schedule'}
                    </button>
                  </div>
                  <div className={styles.dateTimeline}>
                    {computedDates.map((d) => (
                      <span key={d} className={styles.dateChip}>{d}</span>
                    ))}
                  </div>
                  <div className={styles.studentChips}>
                    {group.students.map((s) => (
                      <span key={s.student_id} className={styles.studentChip}>
                        {s.first_name} {s.last_name}
                      </span>
                    ))}
                  </div>
                  <div className={styles.groupActions}>
                    <span className={`${styles.statePill} ${status?.attendance_open ? styles.open : styles.closed}`}>
                      {status?.attendance_open ? 'Open' : 'Closed'}
                    </span>
                    <span className={styles.stateMeta}>
                      {status?.manual_open
                        ? 'Manually opened by you'
                        : status?.active_type === 'time_in'
                        ? 'Time In window active'
                        : status?.active_type === 'time_out'
                        ? 'Time Out window active'
                        : 'No active window'}
                    </span>
                    {!isTodayInSchedule && (
                      <span className={styles.stateMeta} style={{ color: '#dc2626', fontWeight: 600 }}>
                        Today is not a scheduled immersion date — manual override is still available.
                      </span>
                    )}
                    <button
                      type="button"
                      className={status?.manual_open ? styles.closeBtn : styles.openBtn}
                      onClick={handleToggle}
                      disabled={busy}
                    >
                      {status?.manual_open ? 'Close Attendance' : 'Open Attendance'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Records */}
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h3 className={styles.panelTitle}>Attendance Records</h3>
              <input type="date" className={styles.dateInput} value={date} onChange={(e) => {
                const val = e.target.value;
                if (val && isWeekend(val)) {
                  flash('error', 'Attendance records are not available on weekends.');
                  return;
                }
                setDate(val);
              }} />
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>ID</th>
                    <th>Grade / Strand</th>
                    <th>Time In</th>
                    <th>Time Out</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {records.length === 0 && (
                    <tr><td colSpan="6" className={styles.empty}>No records for this date.</td></tr>
                  )}
                  {records.map((r) => (
                    <tr key={r.id}>
                      <td>{r.first_name} {r.last_name}</td>
                      <td>{r.student_number || '—'}</td>
                      <td>{[r.grade_level, r.track_strand].filter(Boolean).join(' / ') || '—'}</td>
                      <td style={{ cursor: r.check_in_time ? 'pointer' : 'default' }} onClick={() => r.check_in_time && showLocationModal(r, 'check_in')}>
                        {r.check_in_time ? (
                          <span style={{ color: '#0066cc', textDecoration: 'underline' }}>
                            {new Date(r.check_in_time).toLocaleTimeString()}
                          </span>
                        ) : (
                          <span className={styles.missed}>missed</span>
                        )}
                      </td>
                      <td style={{ cursor: r.check_out_time ? 'pointer' : 'default' }} onClick={() => r.check_out_time && showLocationModal(r, 'check_out')}>
                        {r.check_out_time ? (
                          <span style={{ color: '#0066cc', textDecoration: 'underline' }}>
                            {new Date(r.check_out_time).toLocaleTimeString()}
                          </span>
                        ) : (
                          <span className={styles.missed}>missed</span>
                        )}
                      </td>
                      <td>
                        <span className={`${styles.badge} ${styles['badge_' + (r.status || 'none')]}`}>{r.status}</span>
                        {r.appeal_time_in_id && <span className={styles.appealTag}>appeal</span>}
                        {r.appeal_time_out_id && <span className={styles.appealTag}>appeal</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!loading && !selectedBatchId && <p className={styles.info}>You are not assigned to a batch yet.</p>}

      {/* Location Modal */}
      {locationModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }} onClick={closeLocationModal}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem' }}>
              {locationModal.type === 'check_in' ? 'Check-In' : 'Check-Out'} Location
            </h3>
            <div style={{ marginBottom: '12px' }}>
              <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', color: '#666' }}>Student</p>
              <p style={{ margin: 0, fontWeight: 500 }}>
                {locationModal.record.first_name} {locationModal.record.last_name}
              </p>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', color: '#666' }}>Time</p>
              <p style={{ margin: 0, fontWeight: 500 }}>
                {new Date(locationModal.time).toLocaleString()}
              </p>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', color: '#666' }}>Latitude</p>
              <p style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.9rem' }}>
                {locationModal.lat.toFixed(6)}
              </p>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', color: '#666' }}>Longitude</p>
              <p style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.9rem' }}>
                {locationModal.lng.toFixed(6)}
              </p>
            </div>
            {locationModal.accuracy && (
              <div style={{ marginBottom: '12px' }}>
                <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', color: '#666' }}>Accuracy</p>
                <p style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.9rem' }}>
                  ±{locationModal.accuracy.toFixed(2)} meters
                </p>
              </div>
            )}
            <div style={{ marginBottom: '12px' }}>
              <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', color: '#666' }}>Map Link</p>
              <a 
                href={`https://www.google.com/maps?q=${locationModal.lat},${locationModal.lng}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: '#0066cc',
                  textDecoration: 'none',
                  display: 'inline-block',
                  padding: '6px 12px',
                  border: '1px solid #0066cc',
                  borderRadius: '4px',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                }}
              >
                Open in Google Maps
              </a>
            </div>
            <button
              onClick={closeLocationModal}
              style={{
                width: '100%',
                padding: '10px',
                marginTop: '16px',
                backgroundColor: '#f3f4f6',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: '0.9rem',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default TeacherAttendance;
