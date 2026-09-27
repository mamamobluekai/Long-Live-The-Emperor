import { RefreshCw } from 'lucide-react';
import { useTeacherAttendanceReport } from '../../../hooks/useTeacherAttendanceReport';
import { labelForStatus, hasAppeal, isFutureDate, formatShortDate } from '../../../utils/attendanceAnalytics';
import styles from './AttendanceReportsRecords.module.css';

// Attendance records grid for the batch selected in the sidebar: every enrolled
// student against every scheduled work immersion date.
//
// variant="panel" renders the full card (section header, legend, refresh) and
// fetches its own data. variant="body" renders only the grid for use inside a
// modal that supplies its own header, taking the already-loaded `report` so the
// batch is not fetched twice.
function TeacherAttendanceRecords({ variant = 'panel', report: reportProp }) {
  const own = useTeacherAttendanceReport({ enabled: !reportProp });
  const report = reportProp || own;

  const { dates, rows, loading, refreshing, error } = report;
  const refresh = report.refresh || own.refresh;

  const grid = (
    <>
      {loading ? <p className={styles.state}>Loading attendance records...</p> : !dates.length ? <p className={styles.state}>No work immersion schedule has been configured for this batch.</p> : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Student</th><th>Student ID</th><th>Grade / Strand</th>{dates.map((date) => <th key={date}>{formatShortDate(date)}</th>)}</tr></thead>
            <tbody>
              {rows.map((student) => (
                <tr key={student.student_id}>
                  <td className={styles.studentName}>{student.first_name} {student.last_name}</td>
                  <td>{student.student_number || '-'}</td>
                  <td>{[student.grade_level, student.track_strand].filter(Boolean).join(' / ') || '-'}</td>
                  {dates.map((date) => {
                    const record = student.attendance[date];
                    const appealed = hasAppeal(record);
                    // No record on a future date means the immersion day has not
                    // started yet — never label that an absence.
                    if (!record?.status && isFutureDate(date)) {
                      return (
                        <td key={date} className={styles.statusCell}>
                          <span className={`${styles.status} ${styles.upcoming}`}>Not Started</span>
                        </td>
                      );
                    }
                    const value = labelForStatus(record?.status);
                    return <td key={date} className={styles.statusCell}><span className={`${styles.status} ${value === 'Absent' ? styles.absent : value === 'Late' ? styles.late : value === 'Present' || value === 'In' ? styles.present : styles.unrecorded}`}>{value}</span>{appealed && <span className={styles.appealMark}>Appeal</span>}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );

  if (variant === 'body') {
    return (
      <div>
        {error && <div className={styles.error}>{error}</div>}
        {grid}
      </div>
    );
  }

  return (
    <div>
      {error && <div className={styles.error}>{error}</div>}

      <section className={styles.reportPanel}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.kicker}>ATTENDANCE RECORDS</span>
            <h2>{dates.length} scheduled immersion dates</h2>
            <p>Every enrolled student is shown against each scheduled work immersion date.</p>
          </div>
          <div className={styles.headerTools}>
            <div className={styles.legend}>
              <span><i className={styles.presentDot} />Present</span>
              <span><i className={styles.absentDot} />Absent</span>
              <span><i className={styles.appealDot} />Appeal</span>
            </div>
            <button
              type="button"
              className={styles.refreshButton}
              onClick={() => {
                if (!refreshing) refresh();
              }}
              disabled={refreshing}
            >
              <RefreshCw size={16} className={refreshing ? styles.spin : ''} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {grid}
      </section>
    </div>
  );
}

export default TeacherAttendanceRecords;
