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
} from '../../../api/attendanceApi';
import styles from './TeacherAttendance.module.css';

function TeacherAttendance() {
  const { token } = useAuth();
  const { batchId: selectedBatchId, batchLabel } = useTeacherBatch();
  const [status, setStatus] = useState(null);
  const [config, setConfig] = useState(null);
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const flash = (type, text) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 4000);
  };

  const loadAll = useCallback(async () => {
    if (!selectedBatchId) return;
    setLoading(true);
    setError(null);
    try {
      const [s, c, r, st] = await Promise.all([
        getTeacherBatchStatus(selectedBatchId, token),
        getBatchConfig(selectedBatchId, token),
        getBatchRecords(selectedBatchId, date, token),
        getBatchStats(selectedBatchId, date, token),
      ]);
      setStatus(s);
      setConfig(c);
      setRecords(r.records || []);
      setStats(st);
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
          {/* Control + status */}
          <div className={styles.controlBar}>
            <div className={styles.statusBlock}>
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
            </div>
            <button
              className={status?.manual_open ? styles.closeBtn : styles.openBtn}
              onClick={handleToggle}
              disabled={busy}
            >
              {status?.manual_open ? 'Close Attendance' : 'Open Attendance'}
            </button>
          </div>

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

          {/* Records */}
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h3 className={styles.panelTitle}>Attendance Records</h3>
              <input type="date" className={styles.dateInput} value={date} onChange={(e) => setDate(e.target.value)} />
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
                      <td>{r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString() : <span className={styles.missed}>missed</span>}</td>
                      <td>{r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString() : <span className={styles.missed}>missed</span>}</td>
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
    </div>
  );
}

export default TeacherAttendance;
