import { useEffect, useState, useMemo } from 'react';
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
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

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

  const loadAttendance = async () => {
    if (!selectedId) return;
    setLoadingAtt(true);
    setError('');
    try {
      const res = await getSupervisorBatchAttendance(selectedId, { from, to });
      setAttendance(res || { students: [], days: [], batch_label: null });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingAtt(false);
    }
  };

  useEffect(() => {
    if (selectedId) loadAttendance();
  }, [selectedId]);

  const students = attendance.students || [];
  const days = attendance.days || [];

  const summary = useMemo(() => {
    const total = students.length;
    const presentDays = students.reduce(
      (acc, s) => acc + Object.values(s.days || {}).filter((d) => dayStatus(d) !== 'absent').length,
      0
    );
    return { total, days: days.length, presentDays };
  }, [attendance]);

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2>Student Attendance</h2>
        <p>Daily attendance for the students assigned to your batches. Days are counted from each student's first attendance.</p>
      </div>

      {error && <Feedback type="error" message={error} />}

      {loadingBatches ? (
        <p className={styles.loading}>Loading batches…</p>
      ) : batches.length === 0 ? (
        <p className={styles.empty}>No approved deployment batches assigned to you yet.</p>
      ) : (
        <>
          <div className={styles.batchTabs}>
            {batches.map((b) => (
              <button
                key={b.request_id}
                type="button"
                className={`${styles.batchTab} ${selectedId === b.request_id ? styles.batchTabActive : ''}`}
                onClick={() => setSelectedId(b.request_id)}
              >
                <span className={styles.batchTabLabel}>{b.batch_label}</span>
                <span className={styles.batchTabMeta}>
                  {b.students?.length || 0} students · {b.coordinator_first_name} {b.coordinator_last_name}
                </span>
              </button>
            ))}
          </div>

          <div className={styles.filters}>
            <label className={styles.filterField}>
              From
              <input type="date" className={styles.input} value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className={styles.filterField}>
              To
              <input type="date" className={styles.input} value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <button className={styles.btn} type="button" onClick={loadAttendance} disabled={loadingAtt}>
              {loadingAtt ? 'Loading…' : 'Apply'}
            </button>
            <button
              className={styles.btnSecondary}
              type="button"
              onClick={() => {
                setFrom('');
                setTo('');
              }}
              disabled={loadingAtt}
            >
              Reset
            </button>
          </div>

          {!loadingAtt && students.length > 0 && (
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
          )}

          {loadingAtt ? (
            <p className={styles.loading}>Loading attendance…</p>
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
                            {[s.grade_level, s.track_strand].filter(Boolean).join(' · ') || '—'}
                          </span>
                        </div>
                      </td>
                      <td>{s.student_number || '—'}</td>
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
                                  {formatTime(day.check_in_time) || '—'} → {formatTime(day.check_out_time) || '—'}
                                </span>
                                {(day.appeal_time_in_id || day.appeal_time_out_id) && (
                                  <span className={styles.appealTag}>appeal</span>
                                )}
                              </div>
                            ) : (
                              <span className={styles.noRecord}>·</span>
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
