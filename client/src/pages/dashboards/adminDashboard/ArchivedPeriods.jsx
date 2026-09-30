import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Search,
  X,
  Users,
  Layers,
  Send,
  ChevronRight,
  AlertCircle,
  CalendarDays,
  Clock3,
  GraduationCap,
  BriefcaseBusiness,
  ShieldCheck,
  User,
  ChevronDown,
} from 'lucide-react';

import { listArchivePeriods, getArchivePeriod } from '../../../api/adminApi';
import { useToast } from '../../../components/admin/toastContext';
import styles from './ArchivedPeriods.module.css';

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function profileName(role, profile) {
  if (!profile) return '';
  if (role === 'student') {
    return [profile.first_name, profile.middle_name, profile.last_name, profile.suffix]
      .filter(Boolean)
      .join(' ')
      .trim();
  }
  return [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
}

const ROLE_META = {
  student: { label: 'Students', icon: GraduationCap },
  teacher: { label: 'Teachers', icon: User },
  supervisor: { label: 'Supervisors', icon: BriefcaseBusiness },
  coordinator: { label: 'Coordinators', icon: ShieldCheck },
};

const DEPLOYMENT_STATUS_CLASS = {
  approved: styles.badgeApproved,
  pending: styles.badgePending,
  rejected: styles.badgeRejected,
  cancelled: styles.badgeNeutral,
};

function JsonBlock({ value }) {
  return (
    <pre className={styles.jsonBlock}>{JSON.stringify(value, null, 2)}</pre>
  );
}

function Collapsible({ label, count, children }) {
  return (
    <details className={styles.collapsible}>
      <summary>
        <span>{label}</span>
        <span className={styles.collapsibleCount}>{count}</span>
        <ChevronDown size={15} className={styles.collapsibleChevron} />
      </summary>

      {children}
    </details>
  );
}

function GroupedUsers({ users }) {
  const groups = useMemo(() => {
    const map = { student: [], teacher: [], supervisor: [], coordinator: [] };

    for (const u of users) {
      if (map[u.role]) map[u.role].push(u);
    }

    return map;
  }, [users]);

  const roles = Object.entries(groups).filter(([, list]) => list.length > 0);

  if (!roles.length) {
    return <p className={styles.muted}>No users were captured in this archive.</p>;
  }

  return (
    <div className={styles.groups}>
      {roles.map(([role, list]) => {
        const Icon = ROLE_META[role]?.icon || User;

        return (
          <div key={role} className={styles.groupBlock}>
            <h4 className={styles.groupTitle}>
              <span className={styles.groupTitleIcon}>
                <Icon size={15} />
              </span>
              {ROLE_META[role]?.label || role}
              <span className={styles.groupTitleCount}>{list.length}</span>
            </h4>

            <div className={styles.userList}>
              {list.map((u) => (
                <div key={u.id} className={styles.userCard}>
                  <div className={styles.userMain}>
                    <strong>
                      {profileName(u.role, u.profile) || u.email}
                    </strong>
                    <span className={styles.userRole}>{u.role}</span>
                  </div>

                  <div className={styles.userMeta}>
                    <span>{u.email}</span>
                    {u.profile?.student_number && (
                      <span>• {u.profile.student_number}</span>
                    )}
                    {u.profile?.company_name && (
                      <span>• {u.profile.company_name}</span>
                    )}
                    {u.profile?.department && (
                      <span>• {u.profile.department}</span>
                    )}
                    {u.profile?.track_strand && (
                      <span>• {u.profile.track_strand}</span>
                    )}
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
        <div>
          <h4>{batch.batch_label}</h4>
          <span className={styles.batchMeta}>
            Teacher: {batch.teacher_name || '—'} • Supervisor:{' '}
            {batch.supervisor_name || '—'} • Coordinator:{' '}
            {batch.coordinator_name || '—'}
          </span>
        </div>

        <span className={styles.batchStudentCount}>
          {batch.students?.length || 0} students
        </span>
      </div>

      <div className={styles.batchStats}>
        <span>{att.length} attendance</span>
        <span>{appeals.length} appeals</span>
        <span>{gps.length} GPS logs</span>
        <span>{docs.length} daily docs</span>
        <span>{files.length} documents</span>
        <span>{evals.length} evaluations</span>
        <span>{certs.length} certificates</span>
      </div>

      {batch.attendance_config && (
        <Collapsible label="Attendance config" count={Object.keys(batch.attendance_config).length}>
          <JsonBlock value={batch.attendance_config} />
        </Collapsible>
      )}

      {batch.work_immersion_schedule?.length > 0 && (
        <Collapsible
          label="Work immersion schedule"
          count={batch.work_immersion_schedule.length}
        >
          <JsonBlock value={batch.work_immersion_schedule} />
        </Collapsible>
      )}

      {batch.students?.length > 0 && (
        <Collapsible label="Students" count={batch.students.length}>
          <JsonBlock value={batch.students} />
        </Collapsible>
      )}

      {att.length > 0 && (
        <Collapsible label="Attendance records" count={att.length}>
          <JsonBlock value={att} />
        </Collapsible>
      )}

      {appeals.length > 0 && (
        <Collapsible label="Attendance appeals" count={appeals.length}>
          <JsonBlock value={appeals} />
        </Collapsible>
      )}

      {gps.length > 0 && (
        <Collapsible label="GPS logs" count={gps.length}>
          <JsonBlock value={gps} />
        </Collapsible>
      )}

      {docs.length > 0 && (
        <Collapsible label="Daily documentation" count={docs.length}>
          <JsonBlock value={docs} />
        </Collapsible>
      )}

      {files.length > 0 && (
        <Collapsible label="Student documents" count={files.length}>
          <JsonBlock value={files} />
        </Collapsible>
      )}

      {evals.length > 0 && (
        <Collapsible label="Evaluations" count={evals.length}>
          <JsonBlock value={evals} />
        </Collapsible>
      )}

      {certs.length > 0 && (
        <Collapsible label="Certificates" count={certs.length}>
          <JsonBlock value={certs} />
        </Collapsible>
      )}
    </div>
  );
}

function DeploymentCard({ deployment }) {
  const status = String(deployment.status || '').toLowerCase();

  return (
    <div className={styles.deploymentCard}>
      <div className={styles.deploymentHeader}>
        <strong>{deployment.batch_label}</strong>
        <span
          className={`${styles.badge} ${DEPLOYMENT_STATUS_CLASS[status] || styles.badgeNeutral}`}
        >
          {deployment.status || 'Unknown'}
        </span>
      </div>

      <div className={styles.deploymentMeta}>
        <span>Direction: {deployment.direction}</span>
        <span>Coordinator: {deployment.coordinator_name || '—'}</span>
        <span>Supervisor: {deployment.supervisor_name || '—'}</span>
        <span>Students: {deployment.num_students}</span>
        <span>Created: {formatDateTime(deployment.created_at)}</span>
      </div>

      {deployment.student_names?.length > 0 && (
        <Collapsible label="Student list" count={deployment.student_names.length}>
          <JsonBlock value={deployment.student_names} />
        </Collapsible>
      )}

      {deployment.notes && (
        <p className={styles.notes}>Notes: {deployment.notes}</p>
      )}
    </div>
  );
}

export default function ArchivedPeriods() {
  const { showToast } = useToast();

  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [openArchive, setOpenArchive] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tab, setTab] = useState('users');

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

  const filteredPeriods = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return periods;

    return periods.filter((p) =>
      [p.period_name, p.academic_year, p.semester]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term)),
    );
  }, [periods, search]);

  const openDetail = async (archive) => {
    setOpenArchive(archive);
    setDetail(null);
    setTab('users');
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

  const closeDetail = () => {
    setOpenArchive(null);
    setDetail(null);
    setTab('users');
  };

  const tabs = detail
    ? [
        { key: 'users', label: 'Users', count: detail.users.length, icon: Users },
        {
          key: 'batches',
          label: 'Batches',
          count: detail.batches.length,
          icon: Layers,
        },
        {
          key: 'deployments',
          label: 'Deployments',
          count: detail.deployments.length,
          icon: Send,
        },
      ]
    : [];

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>Historical Records</span>

          <h1>Archived Periods</h1>

          <p>
            Frozen snapshots of completed immersion periods. Open a period to
            review the users, batches, and deployment requests captured when it
            was archived.
          </p>
        </div>

        <div className={styles.headerIcon}>
          <Archive size={24} />
        </div>
      </div>

      {error && (
        <div className={styles.errorAlert}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className={styles.card}>
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={18} />

            <input
              placeholder="Search period, school year, or semester..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            {search && (
              <button
                type="button"
                className={styles.searchClear}
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <span className={styles.resultCount}>
            {filteredPeriods.length} archive
            {filteredPeriods.length === 1 ? '' : 's'}
          </span>
        </div>

        {loading ? (
          <div className={styles.loading}>
            <div className={styles.spinner} />
            <span>Loading archived periods...</span>
          </div>
        ) : filteredPeriods.length === 0 ? (
          <div className={styles.empty}>
            <Archive size={40} />
            <h3>No archived periods</h3>
            <p>
              {search
                ? 'No archive matches your search.'
                : 'Periods can be archived from System Settings → Immersion Periods.'}
            </p>
          </div>
        ) : (
          <div className={styles.list}>
            {filteredPeriods.map((p) => (
              <button
                key={p.id}
                type="button"
                className={styles.listItem}
                onClick={() => openDetail(p)}
              >
                <div className={styles.listItemIcon}>
                  <Archive size={20} />
                </div>

                <div className={styles.listItemMain}>
                  <strong>{p.period_name}</strong>

                  <span className={styles.listItemSub}>
                    {p.academic_year} • {p.semester}
                  </span>

                  <span className={styles.listItemMeta}>
                    <span>
                      <CalendarDays size={13} />
                      {formatDate(p.start_date)} → {formatDate(p.end_date)}
                    </span>
                    <span>
                      <Clock3 size={13} />
                      Archived {formatDateTime(p.archived_at)}
                    </span>
                  </span>
                </div>

                <div className={styles.listItemCounts}>
                  <span>{p.student_count} students</span>
                  <span>{p.teacher_count} teachers</span>
                  <span>{p.supervisor_count} supervisors</span>
                  <span>{p.coordinator_count} coordinators</span>
                  <span>{p.batch_count} batches</span>
                  <span>{p.attendance_record_count} attendance</span>
                </div>

                <span className={styles.viewButton}>
                  View archive
                  <ChevronRight size={15} />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {openArchive && (
        <div className={styles.overlay} onClick={closeDetail}>
          <div
            className={styles.modal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div className={styles.panelIdentity}>
                <div className={styles.largeAvatar}>
                  <Archive size={20} />
                </div>

                <div>
                  <h2>{openArchive.period_name}</h2>
                  <p>
                    {openArchive.academic_year} • {openArchive.semester} •{' '}
                    {formatDate(openArchive.start_date)} →{' '}
                    {formatDate(openArchive.end_date)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                className={styles.closeButton}
                onClick={closeDetail}
                aria-label="Close archive"
              >
                <X size={20} />
              </button>
            </div>

            {!detailLoading && tabs.length > 0 && (
              <div className={styles.tabs}>
                {tabs.map((t) => {
                  const Icon = t.icon;

                  return (
                    <button
                      key={t.key}
                      type="button"
                      className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
                      onClick={() => setTab(t.key)}
                    >
                      <Icon size={15} />
                      {t.label}
                      <span className={styles.tabCount}>{t.count}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className={styles.modalBody}>
              {detailLoading ? (
                <div className={styles.loadingPanel}>
                  <div className={styles.spinner} />
                  <span>Loading archive details...</span>
                </div>
              ) : !detail ? null : tab === 'users' ? (
                <GroupedUsers users={detail.users} />
              ) : tab === 'batches' ? (
                detail.batches.length === 0 ? (
                  <p className={styles.muted}>
                    No batches were linked to this period.
                  </p>
                ) : (
                  detail.batches.map((b) => <BatchCard key={b.id} batch={b} />)
                )
              ) : detail.deployments.length === 0 ? (
                <p className={styles.muted}>
                  No deployment requests were linked to this period.
                </p>
              ) : (
                detail.deployments.map((d) => (
                  <DeploymentCard key={d.id} deployment={d} />
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
