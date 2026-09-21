import { useEffect, useMemo, useState } from 'react';
import {
  getSupervisorBatches,
  getSupervisorBatchReport,
  getSupervisorBatchStats,
} from '../../../api/supervisorApi';
import Feedback from '../../../components/Feedback';
import styles from './SupervisorAttendance.module.css';

function formatDate(value) {
  if (!value) return '—';
  const str = String(value).slice(0, 10);
  const d = new Date(`${str}T00:00:00`);
  if (Number.isNaN(d.getTime())) return str;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 5);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Supervisor's attendance reports & records: the full per-day grid plus
// today's stats for every teacher batch linked to them.
function SupervisorAttendanceReports() {
  const [batches, setBatches] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [report, setReport] = useState({ dates: [], records: [] });
  const [stats, setStats] = useState(null);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoadingBatches(true);
      setError('');
      try {
        const res = await getSupervisorBatches();
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
        const [r, s] = await Promise.all([
          getSupervisorBatchReport(selectedId),
          getSupervisorBatchStats(selectedId),
        ]);
        if (cancelled) return;
        setReport({ dates: r.dates || [], records: r.records || [] });
        setStats(s);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [selectedId]);

  const students = useMemo(() => {
    const map = new Map();
    for (const row of report.records || []) {
      if (!map.has(row.student_id)) {
        map.set(row.student_id, {
          student_id: row.student_id,
          first_name: row.first_name,
          last_name: row.last_name,
          student_number: row.student_number,
        });
      }
    }
    return Array.from(map.values());
  }, [report.records]);

  const byStudentDate = useMemo(() => {
    const map = new Map();
    for (const row of report.records || []) {
      map.set(`${row.student_id}:${String(row.date).slice(0, 10)}`, row);
    }
    return map;
  }, [report.records]);

  const selectedBatch = batches.find((b) => Number(b.request_id) === Number(selectedId));

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2>Attendance Reports & Records</h2>
        <p>Full per-day attendance grid and today's summary for your batches.</p>
      </div>

      {error && <Feedback type="error" message={error} />}

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
            <p className={styles.loading}>Loading report...</p>
          ) : (
            <>
              {stats && (
                <div className={styles.statRow}>
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

              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>
                  Daily Records{selectedBatch ? ` — ${selectedBatch.batch_label}` : ''}
                </h3>
                {report.dates.length === 0 ? (
                  <p className={styles.empty}>No immersion schedule yet. Set one on the Attendance Schedule page.</p>
                ) : (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Student</th>
                          {report.dates.map((d) => (
                            <th key={String(d).slice(0, 10)}>{formatDate(d)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {students.map((s) => (
                          <tr key={s.student_id}>
                            <td>
                              {s.first_name} {s.last_name}
                              <br />
                              <small className={styles.muted}>{s.student_number || ''}</small>
                            </td>
                            {report.dates.map((d) => {
                              const key = String(d).slice(0, 10);
                              const row = byStudentDate.get(`${s.student_id}:${key}`);
                              const status = row?.status || 'absent';
                              return (
                                <td key={key} className={styles[`status_${status}`] || ''}>
                                  <span className={styles.statusPill}>{status}</span>
                                  {(row?.check_in_time || row?.check_out_time) && (
                                    <small className={styles.muted}>
                                      <br />
                                      {formatTime(row.check_in_time)} – {formatTime(row.check_out_time)}
                                    </small>
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
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default SupervisorAttendanceReports;