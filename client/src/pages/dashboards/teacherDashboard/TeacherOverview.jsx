import { useCallback, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  AlertCircle,
  ArrowRight,
  FolderOpen,
  Activity,
} from 'lucide-react';

import {
  getTeacherBatchStudents,
  getBatchRecords,
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
          docSummaryData,
        ] = await Promise.all([
          getTeacherBatchStudents(selectedBatchId, token),
          getBatchRecords(selectedBatchId, today, token),
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

          <h1>Good day, {teacherName}</h1>

          <p>
            Track student attendance, review documentation, and evaluate
            your students' work immersion progress.
          </p>
        </div>
      </section>

      {(error || batchesError) && (
        <div className={styles.errorAlert}>
          <AlertCircle size={18} />
          <span>{error || batchesError}</span>
        </div>
      )}

      {/* Main content */}
      <div className={styles.contentGrid}>
        {/* Attendance */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h2>Today's Attendance</h2>
              <p>Attendance status for your assigned students.</p>
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

      <section className={styles.roleSection} aria-label="Teacher responsibilities">
        <div className={styles.roleCard}>
          <p className={styles.eyebrow}>STUDENT ATTENDANCE</p>
          <p>Mark daily attendance, track present and absent students, and monitor batch participation.</p>
        </div>
        <div className={styles.roleCard}>
          <p className={styles.eyebrow}>STUDENT DOCUMENTATION</p>
          <p>Review submitted documentation, grade entries, and track completion across your batch.</p>
        </div>
        <div className={styles.roleCard}>
          <p className={styles.eyebrow}>STUDENT EVALUATIONS</p>
          <p>Evaluate student performance and record assessment results for work immersion.</p>
        </div>
      </section>
    </div>
  );
}

export default TeacherDashboard;