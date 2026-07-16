import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useTeacherBatch } from '../../../hooks/useTeacherBatch';
import { getBatchStats } from '../../../api/attendanceApi';
import styles from './TeacherReports.module.css';

function TeacherReports() {
  const { token } = useAuth();
  const { batchId: selectedBatchId, batchLabel } = useTeacherBatch();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedBatchId) return;
    setLoading(true);
    getBatchStats(selectedBatchId, date, token)
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [selectedBatchId, date, token]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Attendance Reports</h2>
          {batchLabel && <p className={styles.batchTag}>Batch: {batchLabel}</p>}
        </div>
        <input type="date" className={styles.dateInput} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {loading && <p className={styles.info}>Loading…</p>}

      {stats && (
        <div className={styles.grid}>
          <div className={styles.card}>
            <span className={styles.value}>{stats.total_students}</span>
            <span className={styles.label}>Total Students</span>
          </div>
          <div className={styles.card}>
            <span className={styles.value}>{stats.timed_in}</span>
            <span className={styles.label}>Timed In ({stats.timed_in_rate}%)</span>
          </div>
          <div className={styles.card}>
            <span className={styles.value}>{stats.timed_out}</span>
            <span className={styles.label}>Timed Out ({stats.timed_out_rate}%)</span>
          </div>
          <div className={styles.card}>
            <span className={styles.value}>{stats.pending_appeals}</span>
            <span className={styles.label}>Pending Appeals</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default TeacherReports;
