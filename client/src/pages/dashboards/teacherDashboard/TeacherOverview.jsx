import { useState, useEffect } from 'react';
import {
  Users,
  UserCheck,
  UserX,
  ClipboardCheck,
  MapPin,
  CalendarDays,
  AlertCircle,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
  Activity,
} from 'lucide-react';

import {
  getMyTeacherBatch,
  getTeacherBatchStudents,
  getTeacherBatchStatus,
  getBatchRecords,
  getBatchAppeals,
  getTeacherBatchEvaluations,
} from '../../../api/teacherApi';

import styles from './TeacherDashboard.module.css';

function TeacherDashboard({ user }) {
  const [batch, setBatch] = useState(null);
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState(null);
  const [records, setRecords] = useState([]);
  const [appeals, setAppeals] = useState([]);
  const [evaluations, setEvaluations] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [noBatch, setNoBatch] = useState(false);

  const token = localStorage.getItem('wim-token');

  useEffect(() => {
    loadDashboard();
  }, []);



  async function loadDashboard() {
    try {
      setLoading(true);
      setError('');

      const teacherBatch = await getMyTeacherBatch(token);
      const batches = teacherBatch?.batches;
      const batchData = Array.isArray(batches)
        ? batches[0]
        : teacherBatch?.batch ||
          teacherBatch?.data ||
          teacherBatch;

      setBatch(batchData);

      const batchId =
        batchData?.id ||
        batchData?.batch_id ||
        batchData?.teacher_batch_id;

      if (!batchId) {
        setNoBatch(true);
        return;
      }

      const today = new Date().toISOString().split('T')[0];

      const [
        studentsData,
        attendanceData,
        recordsData,
        appealsData,
        evaluationsData,
      ] = await Promise.all([
        getTeacherBatchStudents(batchId, token),
        getTeacherBatchStatus(batchId, token),
        getBatchRecords(batchId, today, token),
        getBatchAppeals(batchId, 'pending', token),
        getTeacherBatchEvaluations(),
      ]);

      setStudents(
        Array.isArray(studentsData)
          ? studentsData
          : studentsData?.students || []
      );

      setAttendance(attendanceData);

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
  }

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

  const teacherName =
    user?.first_name ||
    user?.firstName ||
    user?.name ||
    user?.email ||
    'Teacher';

  const batchName =
    batch?.name ||
    batch?.batch_name ||
    batch?.section_name ||
    batch?.section ||
    'My Work Immersion Batch';

  if (loading) {
    return (
      <div className={styles.loadingPage}>
        <div className={styles.spinner} />
        <p>Loading teacher dashboard...</p>
      </div>
    );
  }

  if (noBatch) {
    return (
      <div className={styles.dashboard}>
        <section className={styles.header}>
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

          <button className={styles.refreshButton} onClick={loadDashboard}>
            Refresh
          </button>
        </section>

        <div className={styles.emptyState}>
          <Users size={40} />
          <p>No teacher batch assigned. Contact your coordinator.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      {/* Header */}
      <section className={styles.header}>
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

        <button
          className={styles.refreshButton}
          onClick={loadDashboard}
        >
          Refresh
        </button>
      </section>

      {error && (
        <div className={styles.errorBox}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Batch */}
      <section className={styles.batchCard}>
        <div className={styles.batchIcon}>
          <Users size={22} />
        </div>

        <div className={styles.batchInfo}>
          <span>Assigned Batch</span>
          <strong>{batchName}</strong>

          <small>
            {studentCount} student
            {studentCount !== 1 ? 's' : ''} assigned
          </small>
        </div>

        <div className={styles.batchStatus}>
          <span className={styles.statusDot} />
          Active
        </div>
      </section>

      {/* Overview */}
      <section className={styles.statsGrid}>
        <StatCard
          icon={<Users />}
          label="Total Students"
          value={studentCount}
          description="Students assigned"
        />

        <StatCard
          icon={<UserCheck />}
          label="Present Today"
          value={presentCount}
          description="Attendance recorded"
          positive
        />

        <StatCard
          icon={<UserX />}
          label="Not Recorded"
          value={absentCount}
          description="Needs attention"
        />

        <StatCard
          icon={<ClipboardCheck />}
          label="Evaluations"
          value={`${evaluationPercentage}%`}
          description={`${evaluationCompleted}/${evaluationCount} completed`}
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

          <button className={styles.linkButton}>
            Open Attendance
            <ArrowRight size={16} />
          </button>
        </section>

        {/* Attendance Status */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h2>Attendance Window</h2>
              <p>Current attendance session.</p>
            </div>

            <CalendarDays size={19} />
          </div>

          <div className={styles.sessionList}>
            <Session
              title="Morning"
              time="8:00 AM – 8:30 AM"
              active={
                attendance?.morning_open === true ||
                attendance?.am_open === true
              }
            />

            <Session
              title="Afternoon"
              time="5:00 PM – 5:30 PM"
              active={
                attendance?.afternoon_open === true ||
                attendance?.pm_open === true
              }
            />
          </div>

          <button className={styles.linkButton}>
            Manage Attendance
            <ArrowRight size={16} />
          </button>
        </section>
      </div>

      {/* Students + Quick Actions */}
      <div className={styles.contentGrid}>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h2>My Students</h2>
              <p>Students under your supervision.</p>
            </div>

            <button className={styles.smallAction}>
              View all
              <ArrowRight size={14} />
            </button>
          </div>

          {students.length === 0 ? (
            <div className={styles.emptyState}>
              <Users size={28} />
              <p>No students assigned.</p>
            </div>
          ) : (
            <div className={styles.studentList}>
              {students.slice(0, 5).map((student, index) => {
                const name =
                  student.full_name ||
                  student.name ||
                  `${student.first_name || ''} ${
                    student.last_name || ''
                  }`.trim() ||
                  'Unnamed Student';

                const studentId =
                  student.student_id ||
                  student.student_number ||
                  student.id ||
                  '—';

                const record = records.find(
                  (item) =>
                    item.student_id === student.id ||
                    item.student_id === student.student_id
                );

                const isPresent =
                  record &&
                  (record.status === 'present' ||
                    record.attendance_status === 'present' ||
                    record.time_in);

                return (
                  <div
                    className={styles.studentRow}
                    key={student.id || student.student_id || index}
                  >
                    <div className={styles.avatar}>
                      {name.charAt(0).toUpperCase()}
                    </div>

                    <div className={styles.studentDetails}>
                      <strong>{name}</strong>
                      <span>{studentId}</span>
                    </div>

                    <div
                      className={
                        isPresent
                          ? styles.presentBadge
                          : styles.pendingBadge
                      }
                    >
                      {isPresent ? (
                        <>
                          <CheckCircle2 size={13} />
                          Present
                        </>
                      ) : (
                        <>
                          <XCircle size={13} />
                          No record
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

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
            />

            <QuickAction
              icon={<MapPin />}
              title="Live Map"
              description="Track students"
            />

            <QuickAction
              icon={<ClipboardCheck />}
              title="Evaluations"
              description="Evaluate students"
            />

            <QuickAction
              icon={<AlertCircle />}
              title="Appeals"
              description={`${appeals.length} pending`}
              alert={appeals.length > 0}
            />
          </div>
        </section>
      </div>

      {/* Recent activity */}
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2>Recent Attendance Activity</h2>
            <p>Latest attendance records from your students.</p>
          </div>

          <Clock size={18} />
        </div>

        {records.length === 0 ? (
          <div className={styles.emptyState}>
            <Clock size={28} />
            <p>No attendance activity today.</p>
          </div>
        ) : (
          <div className={styles.activityList}>
            {records.slice(0, 6).map((record, index) => (
              <div
                className={styles.activityRow}
                key={record.id || index}
              >
                <div className={styles.activityIcon}>
                  <CheckCircle2 size={17} />
                </div>

                <div>
                  <strong>
                    {record.student_name ||
                      record.full_name ||
                      `Student ${record.student_id || ''}`}
                  </strong>

                  <span>
                    {record.time_in
                      ? `Time in: ${formatTime(record.time_in)}`
                      : 'Attendance recorded'}
                  </span>
                </div>

                <small>
                  {record.date || 'Today'}
                </small>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  description,
  positive = false,
}) {
  return (
    <div className={styles.statCard}>
      <div
        className={`${styles.statIcon} ${
          positive ? styles.statIconPositive : ''
        }`}
      >
        {icon}
      </div>

      <div className={styles.statContent}>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{description}</small>
      </div>
    </div>
  );
}

function Session({ title, time, active }) {
  return (
    <div className={styles.session}>
      <div className={styles.sessionLeft}>
        <div
          className={`${styles.sessionIcon} ${
            active ? styles.sessionActive : ''
          }`}
        >
          <Clock size={16} />
        </div>

        <div>
          <strong>{title}</strong>
          <span>{time}</span>
        </div>
      </div>

      <span
        className={
          active
            ? styles.sessionOpen
            : styles.sessionClosed
        }
      >
        {active ? 'Open' : 'Closed'}
      </span>
    </div>
  );
}

function QuickAction({
  icon,
  title,
  description,
  alert = false,
}) {
  return (
    <button className={styles.quickAction}>
      <div className={styles.quickIcon}>{icon}</div>

      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>

      {alert && (
        <span className={styles.alertCount}>
          !
        </span>
      )}

      <ArrowRight
        size={16}
        className={styles.quickArrow}
      />
    </button>
  );
}

function formatTime(value) {
  if (!value) return '';

  try {
    return new Date(value).toLocaleTimeString('en-PH', {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

export default TeacherDashboard;