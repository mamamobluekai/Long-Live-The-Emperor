import { useCallback, useEffect, useState, useMemo } from 'react';
import { getSupervisorBatches, getSupervisorBatchAttendance } from '../../../api/supervisorApi';
import Feedback from '../../../components/Feedback';
import styles from './SupervisorAttendance.module.css';

function formatTime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function dayStatus(day) {
  if (!day) return 'absent';
  if (day.check_in_time && day.check_out_time) return 'complete';
  if (day.check_in_time) return 'in';
  return 'absent';
}

function SupervisorAttendance() {
  const [batches, setBatches] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [attendance, setAttendance] = useState({ students: [], days: [], batch_label: null });
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [loadingAtt, setLoadingAtt] = useState(false);
  const [error, setError] = useState('');

  const loadBatches = async () => {
    setLoadingBatches(true);
    setError('');
    try {
      const res = await getSupervisorBatches();
      const list = res.batches || [];
      setBatches(list);
      if (list.length > 0) setSelectedId(list[0].request_id);
      else setSelectedId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingBatches(false);
    }
  };

  useEffect(() => {
    loadBatches();
  }, []);

  const loadAttendance = useCallback(async () => {
    if (!selectedId) return;
    setLoadingAtt(true);
    setError('');
    try {
      const res = await getSupervisorBatchAttendance(selectedId);
      setAttendance(res || { students: [], days: [], batch_label: null });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingAtt(false);
    }
  }, [selectedId]);

  useEffect(() => {
    if (selectedId) loadAttendance();
  }, [selectedId, loadAttendance]);

  const students = useMemo(() => attendance.students || [], [attendance]);
  const days = useMemo(() => attendance.days || [], [attendance]);

  const summary = useMemo(() => {
    const total = students.length;
    const presentDays = students.reduce(
      (acc, s) => acc + Object.values(s.days || {}).filter((d) => dayStatus(d) !== 'absent').length,
      0
    );
    return { total, days: days.length, presentDays };
  }, [students, days]);

  const chart = useMemo(() => {
    if (students.length === 0 || days.length === 0) {
      return { points: '', items: [], width: 720, height: 240, maxValue: 1 };
    }

    const width = Math.max(720, days.length * 92);
    const height = 240;
    const padding = { top: 28, right: 28, bottom: 44, left: 46 };
    const maxValue = students.length;
    const usableWidth = width - padding.left - padding.right;
    const usableHeight = height - padding.top - padding.bottom;

    const items = days.map((day, index) => {
      const presentCount = students.reduce((count, student) => {
        const record = student.days?.[String(day)];
        return count + (dayStatus(record) !== 'absent' ? 1 : 0);
      }, 0);
      const x = days.length === 1
        ? padding.left + usableWidth / 2
        : padding.left + (index / (days.length - 1)) * usableWidth;
      const y = padding.top + usableHeight - (presentCount / maxValue) * usableHeight;
      return { day, presentCount, x, y };
    });

    return {
      points: items.map((item) => `${item.x},${item.y}`).join(' '),
      items,
      width,
      height,
      maxValue,
    };
  }, [students, days]);

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2>Student Attendance</h2>
        <p>Daily attendance for the students assigned to your batches. Days are counted from each student's first attendance.</p>
      </div>

      {error && <Feedback type="error" message={error} />}

      {loadingBatches ? (
        <p className={styles.loading}>Loading batches...</p>
      ) : batches.length === 0 ? (
        <p className={styles.empty}>No approved deployment batches assigned to you yet.</p>
      ) : (
        <>
          {!loadingAtt && students.length > 0 && (
            <>
              <section className={styles.chartCard}>
                <div className={styles.chartHeader}>
                  <div>
                    <h3>Attendance Trend</h3>
                    <p>Present students per immersion day</p>
                  </div>
                  <span>{summary.presentDays} present records</span>
                </div>

                <div className={styles.chartWrap}>
                  <svg
                    className={styles.lineChart}
                    viewBox={`0 0 ${chart.width} ${chart.height}`}
                    role="img"
                    aria-label="Line graph of present students by immersion day"
                  >
                    <line className={styles.chartAxis} x1="46" y1="196" x2={chart.width - 28} y2="196" />
                    <line className={styles.chartAxis} x1="46" y1="28" x2="46" y2="196" />
                    {[0, 0.5, 1].map((tick) => {
                      const y = 196 - tick * 168;
                      return (
                        <g key={tick}>
                          <line className={styles.chartGrid} x1="46" y1={y} x2={chart.width - 28} y2={y} />
                          <text className={styles.chartLabel} x="36" y={y + 4} textAnchor="end">
                            {Math.round(chart.maxValue * tick)}
                          </text>
                        </g>
                      );
                    })}
                    <polyline className={styles.chartLine} points={chart.points} />
                    {chart.items.map((item) => (
                      <g key={item.day}>
                        <circle className={styles.chartPoint} cx={item.x} cy={item.y} r="5" />
                        <text className={styles.chartValue} x={item.x} y={item.y - 12} textAnchor="middle">
                          {item.presentCount}
                        </text>
                        <text className={styles.chartLabel} x={item.x} y="222" textAnchor="middle">
                          Day {item.day}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>
              </section>

              <div className={styles.statRow}>
                <div className={styles.statCard}>
                  <span className={styles.statValue}>{summary.total}</span>
                  <span className={styles.statLabel}>Students</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statValue}>{summary.days}</span>
                  <span className={styles.statLabel}>Immersion Days</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statValue}>{summary.presentDays}</span>
                  <span className={styles.statLabel}>Present Records</span>
                </div>
              </div>
            </>
          )}

          {loadingAtt ? (
            <p className={styles.loading}>Loading attendance...</p>
          ) : students.length === 0 ? (
            <p className={styles.empty}>No attendance records for this batch yet.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.stickyCol}>Student</th>
                    <th>ID</th>
                    {days.map((d) => (
                      <th key={d} className={styles.dayCol}>
                        Day {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.student_id}>
                      <td className={styles.stickyCol}>
                        <div className={styles.studentCell}>
                          <span className={styles.studentName}>
                            {s.first_name} {s.last_name}
                          </span>
                          <span className={styles.studentMeta}>
                            {[s.grade_level, s.track_strand].filter(Boolean).join(' - ') || '-'}
                          </span>
                        </div>
                      </td>
                      <td>{s.student_number || '-'}</td>
                      {days.map((d) => {
                        const day = s.days[String(d)];
                        const status = dayStatus(day);
                        return (
                          <td key={d} className={styles.dayCol}>
                            {day ? (
                              <div className={styles.dayCell}>
                                <span className={`${styles.pill} ${styles['pill_' + status]}`}>
                                  {status === 'complete' ? 'Present' : status === 'in' ? 'In' : 'Absent'}
                                </span>
                                <span className={styles.timeRow}>
                                  {formatTime(day.check_in_time) || '-'} to {formatTime(day.check_out_time) || '-'}
                                </span>
                                {(day.appeal_time_in_id || day.appeal_time_out_id) && (
                                  <span className={styles.appealTag}>appeal</span>
                                )}
                              </div>
                            ) : (
                              <span className={styles.noRecord}>-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default SupervisorAttendance;
