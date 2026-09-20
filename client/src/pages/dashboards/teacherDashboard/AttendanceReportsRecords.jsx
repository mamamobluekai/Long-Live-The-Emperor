import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useTeacherBatch } from '../../../hooks/useTeacherBatch';
import { getBatchAttendanceReport } from '../../../api/teacherApi';
import TeacherAppeals from './TeacherAppeals';
import styles from './AttendanceReportsRecords.module.css';

function parseDate(value) {
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(value) {
  return parseDate(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function statusLabel(status) {
  if (status === 'checked_in') return 'In';
  if (status === 'checked_out' || status === 'present') return 'Present';
  return status || 'Absent';
}

function reportRows(records) {
  const rows = new Map();
  records.forEach((record) => {
    if (!rows.has(record.student_id)) rows.set(record.student_id, { ...record, attendance: {} });
    rows.get(record.student_id).attendance[record.date] = record;
  });
  return Array.from(rows.values());
}

function AttendanceReportsRecords() {
  const { token } = useAuth();
  const { batchId, batchLabel } = useTeacherBatch();
  const [report, setReport] = useState({ dates: [], records: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadReport = useCallback(async () => {
    if (!batchId) {
      setReport({ dates: [], records: [] });
      setLoading(false);
      return;
    }
    setError('');
    try {
      const data = await getBatchAttendanceReport(batchId, token);
      setReport(data || { dates: [], records: [] });
    } catch (err) {
      setError(err.message || 'Failed to load attendance report.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [batchId, token]);

  useEffect(() => {
    setLoading(true);
    loadReport();
  }, [loadReport]);

  const rows = reportRows(report.records || []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>WORK IMMERSION MONITORING</span>
          <h1>Attendance Reports &amp; Records</h1>
          <p>{batchLabel ? `Batch: ${batchLabel}` : 'Review attendance across the scheduled immersion duration.'}</p>
        </div>
        <button type="button" className={styles.refreshButton} onClick={() => { setRefreshing(true); loadReport(); }} disabled={refreshing}>
          <RefreshCw size={16} className={refreshing ? styles.spin : ''} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      <section className={styles.reportPanel}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.kicker}>ATTENDANCE RECORDS</span>
            <h2>{report.dates.length} scheduled immersion dates</h2>
            <p>Every enrolled student is shown against each scheduled work immersion date.</p>
          </div>
          <div className={styles.legend}>
            <span><i className={styles.presentDot} />Present</span>
            <span><i className={styles.absentDot} />Absent</span>
            <span><i className={styles.appealDot} />Appeal</span>
          </div>
        </div>

        {loading ? <p className={styles.state}>Loading attendance records...</p> : !batchId ? <p className={styles.state}>You are not assigned to a batch yet.</p> : !report.dates.length ? <p className={styles.state}>No work immersion schedule has been configured for this batch.</p> : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Student</th><th>Student ID</th><th>Grade / Strand</th>{report.dates.map((date) => <th key={date}>{formatDate(date)}</th>)}</tr></thead>
              <tbody>
                {rows.map((student) => (
                  <tr key={student.student_id}>
                    <td className={styles.studentName}>{student.first_name} {student.last_name}</td>
                    <td>{student.student_number || '-'}</td>
                    <td>{[student.grade_level, student.track_strand].filter(Boolean).join(' / ') || '-'}</td>
                    {report.dates.map((date) => {
                      const record = student.attendance[date];
                      const value = statusLabel(record?.status);
                      const hasAppeal = record?.appeal_time_in_id || record?.appeal_time_out_id;
                      return <td key={date} className={styles.statusCell}><span className={`${styles.status} ${value === 'Absent' ? styles.absent : value === 'Late' ? styles.late : styles.present}`}>{value}</span>{hasAppeal && <span className={styles.appealMark}>Appeal</span>}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.appealsPanel}><TeacherAppeals embedded /></section>
    </div>
  );
}

export default AttendanceReportsRecords;
