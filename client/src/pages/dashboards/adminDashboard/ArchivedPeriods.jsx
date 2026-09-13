import { useEffect, useState, useCallback } from 'react';
import {
  listArchivePeriods,
  getArchivePeriod,
} from '../../../api/adminApi';
import LoadingSkeleton from '../../../components/admin/LoadingSkeleton';
import { useToast } from '../../../components/admin/ToastContainer';
import styles from './ArchivedPeriods.module.css';

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function profileName(role, profile) {
  if (!profile) return '';
  if (role === 'student') {
    return [profile.first_name, profile.middle_name, profile.last_name, profile.suffix]
      .filter(Boolean).join(' ').trim();
  }
  return [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
}

const SECTION_LABELS = {
  users: 'Users',
  students: 'Students',
  teachers: 'Teachers',
  supervisors: 'Supervisors',
  coordinators: 'Coordinators',
  batches: 'Batches',
  deployments: 'Deployment Requests',
};

function GroupedUsers({ users }) {
  const groups = { student: [], teacher: [], supervisor: [], coordinator: [] };
  for (const u of users) {
    if (groups[u.role]) groups[u.role].push(u);
  }

  return (
    <div className={styles.groups}>
      {Object.entries(groups).map(([role, list]) => {
        if (!list.length) return null;
        return (
          <div key={role} className={styles.groupBlock}>
            <h4 className={styles.groupTitle}>
              {SECTION_LABELS[role + 's'] || role} ({list.length})
            </h4>
            <div className={styles.userList}>
              {list.map((u) => (
                <div key={u.id} className={styles.userCard}>
                  <div className={styles.userMain}>
                    <strong>{profileName(u.role, u.profile) || u.email}</strong>
                    <span className={styles.userRole}>{u.role}</span>
                  </div>
                  <div className={styles.userMeta}>
                    <span>{u.email}</span>
                    {u.profile?.student_number && <span>· {u.profile.student_number}</span>}
                    {u.profile?.company_name && <span>· {u.profile.company_name}</span>}
                    {u.profile?.department && <span>· {u.profile.department}</span>}
                    {u.profile?.track_strand && <span>· {u.profile.track_strand}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BatchCard({ batch }) {
  const att = batch.attendance_records || [];
  const appeals = batch.attendance_appeals || [];
  const gps = batch.gps_logs || [];
  const docs = batch.daily_documentation || [];
  const files = batch.student_documents || [];
  const evals = batch.evaluations || [];
  const certs = batch.certificates || [];

  return (
    <div className={styles.batchCard}>
      <div className={styles.batchHeader}>
        <h4>{batch.batch_label}</h4>
        <span className={styles.batchMeta}>
          Teacher: {batch.teacher_name || '—'} · Supervisor: {batch.supervisor_name || '—'} · Coordinator: {batch.coordinator_name || '—'}
        </span>
      </div>
      <div className={styles.batchStats}>
        <span>{batch.students?.length || 0} students</span>
        <span>{att.length} attendance</span>
        <span>{appeals.length} appeals</span>
        <span>{gps.length} GPS logs</span>
        <span>{docs.length} daily docs</span>
        <span>{files.length} documents</span>
        <span>{evals.length} evaluations</span>
        <span>{certs.length} certificates</span>
      </div>

      {batch.attendance_config && (
        <details className={styles.collapsible}>
          <summary>Attendance config</summary>
          <pre className={styles.jsonBlock}>{JSON.stringify(batch.attendance_config, null, 2)}</pre>
        </details>
      )}

      {batch.work_immersion_schedule?.length > 0 && (
        <details className={styles.collapsible}>
          <summary>Work immersion schedule ({batch.work_immersion_schedule.length})</summary>
          <pre className={styles.jsonBlock}>{JSON.stringify(batch.work_immersion_schedule, null, 2)}</pre>
        </details>
      )}

      {batch.students?.length > 0 && (
        <details className={styles.collapsible}>
          <summary>Students ({batch.students.length})</summary>
          <pre className={styles.jsonBlock}>{JSON.stringify(batch.students, null, 2)}</pre>
        </details>
      )}

      {att.length > 0 && (
        <details className={styles.collapsible}>
          <summary>Attendance records ({att.length})</summary>
          <pre className={styles.jsonBlock}>{JSON.stringify(att, null, 2)}</pre>
        </details>
      )}

      {appeals.length > 0 && (
        <details className={styles.collapsible}>
          <summary>Attendance appeals ({appeals.length})</summary>
          <pre className={styles.jsonBlock}>{JSON.stringify(appeals, null, 2)}</pre>
        </details>
      )}

      {gps.length > 0 && (
        <details className={styles.collapsible}>
          <summary>GPS logs ({gps.length})</summary>
          <pre className={styles.jsonBlock}>{JSON.stringify(gps, null, 2)}</pre>
        </details>
      )}

      {docs.length > 0 && (
        <details className={styles.collapsible}>
          <summary>Daily documentation ({docs.length})</summary>
          <pre className={styles.jsonBlock}>{JSON.stringify(docs, null, 2)}</pre>
        </details>
      )}

      {files.length > 0 && (
        <details className={styles.collapsible}>
          <summary>Student documents ({files.length})</summary>
          <pre className={styles.jsonBlock}>{JSON.stringify(files, null, 2)}</pre>
        </details>
      )}

      {evals.length > 0 && (
        <details className={styles.collapsible}>
          <summary>Evaluations ({evals.length})</summary>
          <pre className={styles.jsonBlock}>{JSON.stringify(evals, null, 2)}</pre>
        </details>
      )}

      {certs.length > 0 && (
        <details className={styles.collapsible}>
          <summary>Certificates ({certs.length})</summary>
          <pre className={styles.jsonBlock}>{JSON.stringify(certs, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

export default function ArchivedPeriods() {
  const { showToast } = useToast();
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openArchive, setOpenArchive] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listArchivePeriods();
      setPeriods(data.periods || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (archive) => {
    setOpenArchive(archive);
    setDetail(null);
    setDetailLoading(true);
    try {
      const data = await getArchivePeriod(archive.id);
      setDetail(data.archive);
    } catch (err) {
      showToast(err.message, 'error');
      setOpenArchive(null);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2>Archived Periods</h2>
          <p>Snapshots of completed immersion periods for historical analysis.</p>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : periods.length === 0 ? (
        <div className={styles.empty}>
          No archived periods yet. Periods can be archived from System Settings → Immersion Periods.
        </div>
      ) : (
        <div className={styles.list}>
          {periods.map((p) => (
            <button
              key={p.id}
              type="button"
              className={styles.listItem}
              onClick={() => openDetail(p)}
            >
              <div className={styles.listItemMain}>
                <strong>{p.period_name}</strong>
                <span>{p.academic_year} · {p.semester}</span>
              </div>
              <div className={styles.listItemMeta}>
                <span>{formatDate(p.start_date)} → {formatDate(p.end_date)}</span>
                <span>Archived {formatDateTime(p.archived_at)}</span>
              </div>
              <div className={styles.listItemCounts}>
                <span>{p.student_count} students</span>
                <span>{p.teacher_count} teachers</span>
                <span>{p.supervisor_count} supervisors</span>
                <span>{p.coordinator_count} coordinators</span>
                <span>{p.batch_count} batches</span>
                <span>{p.attendance_record_count} attendance</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {openArchive && (
        <div className={styles.modalOverlay} onClick={() => setOpenArchive(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3>{openArchive.period_name}</h3>
                <span className={styles.modalSub}>
                  {openArchive.academic_year} · {openArchive.semester} ·{' '}
                  {formatDate(openArchive.start_date)} → {formatDate(openArchive.end_date)}
                </span>
              </div>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setOpenArchive(null)}
              >
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              {detailLoading ? (
                <LoadingSkeleton rows={4} />
              ) : detail ? (
                <>
                  <section>
                    <h4 className={styles.sectionTitle}>Users ({detail.users.length})</h4>
                    <GroupedUsers users={detail.users} />
                  </section>

                  <section>
                    <h4 className={styles.sectionTitle}>Batches ({detail.batches.length})</h4>
                    {detail.batches.length === 0 ? (
                      <p className={styles.muted}>No batches were linked to this period.</p>
                    ) : (
                      detail.batches.map((b) => <BatchCard key={b.id} batch={b} />)
                    )}
                  </section>

                  <section>
                    <h4 className={styles.sectionTitle}>Deployment requests ({detail.deployments.length})</h4>
                    {detail.deployments.length === 0 ? (
                      <p className={styles.muted}>No deployment requests were linked to this period.</p>
                    ) : (
                      detail.deployments.map((d) => (
                        <div key={d.id} className={styles.deploymentCard}>
                          <div className={styles.deploymentHeader}>
                            <strong>{d.batch_label}</strong>
                            <span className={styles.deploymentStatus}>{d.status}</span>
                          </div>
                          <div className={styles.deploymentMeta}>
                            <span>Direction: {d.direction}</span>
                            <span>Coordinator: {d.coordinator_name || '—'}</span>
                            <span>Supervisor: {d.supervisor_name || '—'}</span>
                            <span>Students: {d.num_students}</span>
                            <span>Created: {formatDateTime(d.created_at)}</span>
                          </div>
                          {d.student_names?.length > 0 && (
                            <details className={styles.collapsible}>
                              <summary>Student list ({d.student_names.length})</summary>
                              <pre className={styles.jsonBlock}>{JSON.stringify(d.student_names, null, 2)}</pre>
                            </details>
                          )}
                          {d.notes && (
                            <p className={styles.notes}>Notes: {d.notes}</p>
                          )}
                        </div>
                      ))
                    )}
                  </section>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
