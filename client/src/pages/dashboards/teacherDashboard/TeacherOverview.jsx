import { useCallback, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  UserCheck,
  UserX,
  ClipboardCheck,
  MapPin,
  AlertCircle,
  ArrowRight,
  Clock,
  FolderOpen,
  Activity,
} from 'lucide-react';

import {
  getTeacherBatchStudents,
  getBatchRecords,
  getBatchAppeals,
  getTeacherBatchEvaluations,
  getBatchDailyDocSummary,
} from '../../../api/teacherApi';

import { useTeacherBatch } from '../../../hooks/useTeacherBatch';
import styles from './TeacherOverview.module.css';

// Teacher routes the overview metric cards link to.
const ROUTES = {
  students: '/dashboard/teacher/students',
  attendance: '/dashboard/teacher/attendance',
  attendanceReports: '/dashboard/teacher/attendance-reports',
  evaluations: '/dashboard/teacher/evaluations',
  liveMap: '/dashboard/teacher/live-map',
  appeals: '/dashboard/teacher/attendance-reports',
  documentation: '/dashboard/teacher/student-documentation',
};

function TeacherDashboard({ user }) {
  // A teacher can be assigned to MULTIPLE batches (a batch may also be
  // shared with other supervisors/teachers). `useTeacherBatch` loads every
  // batch assigned to this teacher from the backend and keeps the selected
  // batch persisted, shared with the other teacher pages.
  const {
    batches,
    batch: selectedBatch,
    batchId: selectedBatchId,
    batchLabel,
    selectBatch,
    loading: batchesLoading,
    error: batchesError,
    reload: reloadBatches,
  } = useTeacherBatch();

  const [students, setStudents] = useState([]);
  const [records, setRecords] = useState([]);
  const [appeals, setAppeals] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [docSummary, setDocSummary] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [noBatch, setNoBatch] = useState(false);

  const token = localStorage.getItem('wim-token');

  const loadDashboard = useCallback(
    async ({ silent = false } = {}) => {
      // Wait for the batch list before deciding there is no batch.
      if (batchesLoading) return;

      if (!selectedBatchId) {
        setNoBatch(true);
        setStudents([]);
        setRecords([]);
        setAppeals([]);
        setDocSummary([]);
        setLoading(false);
        return;
      }

      try {
        if (!silent) {
          setLoading(true);
        }

        setError('');
        setNoBatch(false);

        const today = new Date().toISOString().split('T')[0];

        const [
          studentsData,
          recordsData,
          appealsData,
          evaluationsData,
          docSummaryData,
        ] = await Promise.all([
          getTeacherBatchStudents(selectedBatchId, token),
          getBatchRecords(selectedBatchId, today, token),
          getBatchAppeals(selectedBatchId, 'pending', token),
          getTeacherBatchEvaluations(),
          getBatchDailyDocSummary(selectedBatchId, token).catch(() => null),
        ]);

        setStudents(
          Array.isArray(studentsData)
            ? studentsData
            : studentsData?.students || []
        );

        setRecords(
          Array.isArray(recordsData)
            ? recordsData
            : recordsData?.records || []
        );

        setAppeals(
          Array.isArray(appealsData)
            ? appealsData
            : appealsData?.appeals || []
        );

        setEvaluations(
          Array.isArray(evaluationsData)
            ? evaluationsData
            : evaluationsData?.evaluations || []
        );

        setDocSummary(
          Array.isArray(docSummaryData)
            ? docSummaryData
            : docSummaryData?.students || []
        );
      } catch (err) {
        console.error('Teacher dashboard error:', err);

        setError(
          err?.response?.data?.message ||
            err?.message ||
            'Unable to load dashboard.'
        );
      } finally {
        setLoading(false);
      }
    },
    [token, selectedBatchId, batchesLoading]
  );

  // Reload whenever the selected batch changes (switching the batch button
  // re-computes the attendance pie/percentages for that batch).
  useEffect(() => {
    // Clear the previous batch's numbers so a switch never flashes stale data.
    setStudents([]);
    setRecords([]);
    setAppeals([]);
    setDocSummary([]);
  }, [selectedBatchId]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Refresh automatically when the page is opened, and whenever the
  // browser tab becomes visible again (so returning to this page
  // always shows up-to-date data without a refresh button).
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        reloadBatches();
        loadDashboard({ silent: true });
      }
    };

    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [loadDashboard, reloadBatches]);

  const studentCount = students.length;

  const presentCount = records.filter(
    (record) =>
      record.status === 'present' ||
      record.attendance_status === 'present' ||
      record.time_in
  ).length;

  const absentCount = Math.max(studentCount - presentCount, 0);

  const evaluationCount = evaluations.length;

  const evaluationCompleted = evaluations.filter(
    (evaluation) =>
      evaluation.status === 'completed' ||
      evaluation.completed === true ||
      evaluation.is_completed === true
  ).length;

  const evaluationPercentage =
    evaluationCount > 0
      ? Math.round((evaluationCompleted / evaluationCount) * 100)
      : 0;

  /* ---------------- Documentation (batch-scoped) ---------------- */

  const docTotal = docSummary.reduce(
    (sum, row) => sum + Number(row.total_docs || 0),
    0
  );

  const docGraded = docSummary.reduce(
    (sum, row) => sum + Number(row.graded_count || 0),
    0
  );

  const docPending = docSummary.reduce(
    (sum, row) => sum + Number(row.pending_count || 0),
    0
  );

  // Students who have submitted at least one documentation entry.
  const docSubmitters = docSummary.filter(
    (row) => Number(row.total_docs || 0) > 0
  ).length;

  // A student counts as "graded" once they have at least one graded doc.
  const docGradedStudents = docSummary.filter(
    (row) => Number(row.graded_count || 0) > 0
  ).length;

  const docNotGradedStudents = Math.max(
    docSummary.length - docGradedStudents,
    0
  );

  const docGradedPercentage =
    docSummary.length > 0
      ? Math.round((docGradedStudents / docSummary.length) * 100)
      : 0;

  const teacherName =
    user?.first_name ||
    user?.firstName ||
    user?.name ||
    user?.email ||
    'Teacher';

  const batchName =
    batchLabel ||
    selectedBatch?.batch_label ||
    selectedBatch?.name ||
    selectedBatch?.batch_name ||
    'My Work Immersion Batch';

  if (loading || batchesLoading) {
    return (
      <div className={styles.loadingPage}>
        <div className={styles.spinner} />
        <p>Loading teacher dashboard...</p>
      </div>
    );
  }

  if (noBatch) {
    return (
      <div className={styles.page}>
        <section className={styles.pageHeader}>
          <div>
            <div className={styles.eyebrow}>
              <Activity size={15} />
              Teacher Portal
            </div>

            <h1>Good day, {teacherName}</h1>

            <p>
              Monitor your students, attendance, evaluations, and
              work immersion activities.
            </p>
          </div>

          <div className={styles.headerIcon}>
            <Activity size={22} />
          </div>
        </section>

        <div className={styles.emptyState}>
          <Users size={40} />
          <p>No teacher batch assigned. Contact your coordinator.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <section className={styles.pageHeader}>
        <div>
          <div className={styles.eyebrow}>
            <Activity size={15} />
            Teacher Portal
          </div>

          <h1>Good day, {teacherName}</h1>

          <p>
            Monitor your students, attendance, evaluations, and
            work immersion activities.
          </p>
        </div>

        <div className={styles.headerIcon}>
          <Activity size={22} />
        </div>
      </section>

      {(error || batchesError) && (
        <div className={styles.errorAlert}>
          <AlertCircle size={18} />
          <span>{error || batchesError}</span>
        </div>
      )}

      {/* Overview */}
      <section className={styles.statsGrid}>
        <StatCard
          icon={<Users />}
          label="Total Students"
          value={studentCount}
          description="Students assigned"
          tone="blue"
          to={ROUTES.students}
        />

        <StatCard
          icon={<UserCheck />}
          label="Present Today"
          value={presentCount}
          description="Attendance recorded"
          tone="green"
          to={ROUTES.attendance}
        />

        <StatCard
          icon={<UserX />}
          label="Not Recorded"
          value={absentCount}
          description="Needs attention"
          tone="orange"
          to={ROUTES.attendanceReports}
        />

        <StatCard
          icon={<ClipboardCheck />}
          label="Evaluations"
          value={`${evaluationPercentage}%`}
          description={`${evaluationCompleted}/${evaluationCount} completed`}
          tone="red"
          to={ROUTES.evaluations}
        />
      </section>

      {/* Main content */}
      <div className={styles.contentGrid}>
        {/* Attendance */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h2>Today's Attendance</h2>
              <p>Attendance status for your assigned students.</p>
            </div>

            <div className={styles.cardHeaderIcon}>
              <Clock size={18} />
            </div>
          </div>

          {/* Batch switcher — a batch can be shared with other
              supervisors, so switching here re-fetches the selected
              batch and recomputes the attendance pie below. */}
          {batches.length > 0 && (
            <div className={styles.batchSwitcher}>
              {batches.map((b, index) => {
                const isActive =
                  Number(b.id) === Number(selectedBatchId);

                return (
                  <button
                    key={b.id}
                    type="button"
                    className={`${styles.batchChip} ${
                      isActive ? styles.batchChipActive : ''
                    }`}
                    onClick={() => selectBatch(b.id)}
                    aria-pressed={isActive}
                    title={b.batch_label}
                  >
                    Batch {index + 1}
                  </button>
                );
              })}
            </div>
          )}

          {selectedBatch && (
            <p className={styles.batchSwitcherLabel}>
              Showing: {batchName}
            </p>
          )}

          <div className={styles.attendanceOverview}>
            <div className={styles.attendanceCircle}>
              <strong>
                {studentCount > 0
                  ? Math.round((presentCount / studentCount) * 100)
                  : 0}
                %
              </strong>

              <span>Present</span>
            </div>

            <div className={styles.attendanceLegend}>
              <div>
                <span className={styles.presentDot} />
                <div>
                  <strong>{presentCount}</strong>
                  <small>Present</small>
                </div>
              </div>

              <div>
                <span className={styles.absentDot} />
                <div>
                  <strong>{absentCount}</strong>
                  <small>Not recorded</small>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Documentation progress */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h2>Student Documentation</h2>
              <p>
                Documentation graded
                {batchName ? ` · ${batchName}` : ''}
              </p>
            </div>

            <Link
              className={styles.smallAction}
              to={ROUTES.documentation}
            >
              Open
              <ArrowRight size={14} />
            </Link>
          </div>

          {docSummary.length === 0 ? (
            <div className={styles.emptyState}>
              <FolderOpen size={28} />
              <p>No documentation records yet.</p>
            </div>
          ) : (
            <div className={styles.docOverview}>
              <div className={styles.docPie}>
                <svg
                  viewBox="0 0 42 42"
                  role="img"
                  aria-label={`${docGradedPercentage}% of students have graded documentation`}
                >
                  <circle
                    className={styles.docPieTrack}
                    cx="21"
                    cy="21"
                    r="15.9155"
                  />

                  <circle
                    className={styles.docPieValue}
                    cx="21"
                    cy="21"
                    r="15.9155"
                    strokeDasharray={`${docGradedPercentage} ${100 - docGradedPercentage}`}
                    strokeDashoffset="25"
                  />
                </svg>

                <div className={styles.docPieInner}>
                  <strong>{docGradedPercentage}%</strong>
                  <span>Graded</span>
                </div>
              </div>

              <div className={styles.docLegend}>
                <div>
                  <span className={styles.docDotGraded} />
                  <div>
                    <strong>{docGradedStudents}</strong>
                    <small>Students graded</small>
                  </div>
                </div>

                <div>
                  <span className={styles.docDotPending} />
                  <div>
                    <strong>{docNotGradedStudents}</strong>
                    <small>Not yet graded</small>
                  </div>
                </div>
              </div>

              <div className={styles.docStats}>
                <div className={styles.docStat}>
                  <strong>{docGraded}</strong>
                  <small>Docs graded</small>
                </div>

                <div className={styles.docStat}>
                  <strong>{docPending}</strong>
                  <small>To review</small>
                </div>

                <div className={styles.docStat}>
                  <strong>{docSubmitters}</strong>
                  <small>Submitted</small>
                </div>

                <div className={styles.docStat}>
                  <strong>{docTotal}</strong>
                  <small>Total docs</small>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Quick Actions */}
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2>Quick Actions</h2>
            <p>Common teacher functions.</p>
          </div>
        </div>

        <div className={styles.quickActions}>
          <QuickAction
            icon={<UserCheck />}
            title="Attendance"
            description="Monitor attendance"
            to={ROUTES.attendance}
          />

          <QuickAction
            icon={<MapPin />}
            title="Live Map"
            description="Track students"
            to={ROUTES.liveMap}
          />

          <QuickAction
            icon={<ClipboardCheck />}
            title="Evaluations"
            description="Evaluate students"
            to={ROUTES.evaluations}
          />

          <QuickAction
            icon={<AlertCircle />}
            title="Appeals"
            description={`${appeals.length} pending`}
            alert={appeals.length > 0}
            to={ROUTES.appeals}
          />
        </div>
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  description,
  tone = 'blue',
  to,
}) {
  const toneClass = {
    blue: styles.statBlue,
    orange: styles.statOrange,
    green: styles.statGreen,
    red: styles.statRed,
  }[tone];

  const content = (
    <>
      <div className={`${styles.statIcon} ${toneClass}`}>
        {icon}
      </div>

      <div className={styles.statCopy}>
        <span className={styles.statLabel}>{label}</span>
        <strong>{value}</strong>
        <small>{description}</small>
      </div>

      {to && (
        <span className={styles.statAction}>
          <ArrowRight size={15} />
        </span>
      )}
    </>
  );

  // Clickable cards navigate to the matching teacher page.
  if (to) {
    return (
      <Link className={styles.statCard} to={to}>
        {content}
      </Link>
    );
  }

  return <div className={styles.statCard}>{content}</div>;
}

function QuickAction({
  icon,
  title,
  description,
  alert = false,
  to,
}) {
  const content = (
    <>
      <div className={styles.quickIcon}>{icon}</div>

      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>

      {alert && <span className={styles.alertCount}>!</span>}

      <ArrowRight size={16} className={styles.quickArrow} />
    </>
  );

  // Quick actions navigate to the matching teacher page when a route
  // is provided, otherwise they stay as inert buttons.
  if (to) {
    return (
      <Link className={styles.quickAction} to={to}>
        {content}
      </Link>
    );
  }

  return (
    <button className={styles.quickAction} type="button">
      {content}
    </button>
  );
}

export default TeacherDashboard;