import { useEffect, useMemo, useState } from 'react';
import { Link, Routes, Route, Navigate } from 'react-router-dom';
import {
  Users,
  ClipboardCheck,
  Building2,
  TrendingUp,
  UserCheck,
  UserX,
  Clock3,
  ArrowRight,
  RefreshCw,
  CalendarDays,
  BarChart3,
  FilePlus2,
  GraduationCap,
} from 'lucide-react';

import DashboardLayout from '../sharedSidebar/DashboardLayout';
import DashboardTopNav from '../sharedSidebar/DashboardTopNav';
import SupervisorSidebar from './SupervisorSidebar';
import CreateDeploymentRequest from './CreateDeploymentRequest';
import SupervisorStudents from './SupervisorStudents';
import SupervisorAttendance from './SupervisorAttendance';
import SupervisorEvaluateStudent from './SupervisorEvaluateStudent';
import SupervisorEvaluation from './SupervisorEvaluation';
import SupervisorCertifications from './SupervisorCertifications';
import SocialFeed from '../studentDashboard/SocialFeed';
import BatchChat from '../../../components/social/BatchChat';
import UserProfileSettings from '../UserProfileSettings';

import {
  getSupervisorBatches,
  getSupervisorBatchAttendance,
} from '../../../api/supervisorApi';

import styles from './SupervisorDashboard.module.css';

function SupervisorDashboard({ user, onLogout }) {
  return (
    <DashboardLayout
      topNav={
        <DashboardTopNav
          user={user}
          onLogout={onLogout}
          title="Supervisor Dashboard"
        />
      }
      sidebar={<SupervisorSidebar />}
    >
      <Routes>
        <Route index element={<SupervisorOverview user={user} />} />

        <Route
          path="create-deployment-request"
          element={<CreateDeploymentRequest />}
        />

        <Route path="students" element={<SupervisorStudents />} />

        <Route path="attendance" element={<SupervisorAttendance />} />

        <Route
          path="evaluate"
          element={<SupervisorEvaluateStudent />}
        />

        <Route
          path="evaluation"
          element={<SupervisorEvaluation />}
        />

        <Route
          path="certifications"
          element={<SupervisorCertifications />}
        />

        <Route path="social-feed" element={<SocialFeed />} />

        <Route
          path="group-chat"
          element={<BatchChat user={user} />}
        />

        <Route
          path="profile"
          element={<UserProfileSettings />}
        />

        <Route
          path="*"
          element={<Navigate to="evaluate" replace />}
        />
      </Routes>
    </DashboardLayout>
  );
}

/* =========================================================
   SUPERVISOR OVERVIEW
========================================================= */

function SupervisorOverview({ user }) {
  const [batches, setBatches] = useState([]);
  const [attendanceData, setAttendanceData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      setError('');
      setLoading(true);

      const batchResponse = await getSupervisorBatches();

      const batchList = normalizeArray(batchResponse);

      setBatches(batchList);

      if (!batchList.length) {
        setAttendanceData([]);
        return;
      }

      const attendanceResults = await Promise.allSettled(
        batchList.map(async (batch) => {
          const requestId =
            batch.request_id ??
            batch.deployment_request_id ??
            batch.id;

          if (!requestId) {
            return [];
          }

          const response =
            await getSupervisorBatchAttendance(requestId);

          return normalizeAttendanceResponse(response, batch);
        })
      );

      const mergedAttendance = attendanceResults
        .filter((result) => result.status === 'fulfilled')
        .flatMap((result) => result.value);

      setAttendanceData(mergedAttendance);
    } catch (err) {
      console.error('Supervisor dashboard error:', err);

      setError(
        err?.message ||
          'Unable to load supervisor dashboard.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    try {
      setRefreshing(true);
      await loadDashboard();
    } finally {
      setRefreshing(false);
    }
  }

  const stats = useMemo(() => {
    const students = getTotalStudents(batches);

    const present = attendanceData.filter(
      (item) => item.status === 'present'
    ).length;

    const late = attendanceData.filter(
      (item) => item.status === 'late'
    ).length;

    const absent = attendanceData.filter(
      (item) => item.status === 'absent'
    ).length;

    const totalAttendance = present + late + absent;

    const attendanceRate =
      totalAttendance > 0
        ? Math.round(
            ((present + late) / totalAttendance) * 100
          )
        : 0;

    return {
      batches: batches.length,
      students,
      present,
      late,
      absent,
      attendanceRate,
    };
  }, [batches, attendanceData]);

  const trendData = useMemo(() => {
    const grouped = {};

    attendanceData.forEach((item) => {
      const date =
        item.date ||
        item.attendance_date ||
        item.day;

      if (!date) return;

      if (!grouped[date]) {
        grouped[date] = {
          date,
          present: 0,
          late: 0,
          absent: 0,
        };
      }

      if (item.status === 'present') {
        grouped[date].present += 1;
      }

      if (item.status === 'late') {
        grouped[date].late += 1;
      }

      if (item.status === 'absent') {
        grouped[date].absent += 1;
      }
    });

    return Object.values(grouped)
      .sort(
        (a, b) =>
          new Date(a.date) - new Date(b.date)
      )
      .slice(-7);
  }, [attendanceData]);

  const batchStats = useMemo(() => {
    return batches.map((batch) => {
      const requestId =
        batch.request_id ??
        batch.deployment_request_id ??
        batch.id;

      const batchAttendance =
        attendanceData.filter(
          (item) =>
            String(
              item.request_id ??
                item.deployment_request_id ??
                item.batch_id
            ) === String(requestId)
        );

      const present = batchAttendance.filter(
        (item) => item.status === 'present'
      ).length;

      const late = batchAttendance.filter(
        (item) => item.status === 'late'
      ).length;

      const absent = batchAttendance.filter(
        (item) => item.status === 'absent'
      ).length;

      const total = present + late + absent;

      return {
        ...batch,
        present,
        late,
        absent,
        attendanceRate:
          total > 0
            ? Math.round(
                ((present + late) / total) * 100
              )
            : 0,
      };
    });
  }, [batches, attendanceData]);

  if (loading) {
    return (
      <div className={styles.dashboard}>
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <p>Loading supervisor dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>

      {/* ================= HEADER ================= */}

      <div className={styles.pageHeader}>
        <div>
          <div className={styles.eyebrow}>
            Supervisor Overview
          </div>

          <h1>
            Welcome back,
            <span>
              {' '}
              {getUserName(user)}
            </span>
          </h1>

          <p>
            Monitor your deployed students, attendance,
            and immersion progress from one place.
          </p>
        </div>

        <button
          className={styles.refreshButton}
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw
            size={16}
            className={
              refreshing ? styles.spin : ''
            }
          />

          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* ================= ERROR ================= */}

      {error && (
        <div className={styles.errorBox}>
          <strong>Dashboard Error</strong>
          <span>{error}</span>

          <button onClick={loadDashboard}>
            Try Again
          </button>
        </div>
      )}

      {/* ================= STAT CARDS ================= */}

      <div className={styles.statsGrid}>

        <StatCard
          icon={<Building2 size={21} />}
          label="Deployment Batches"
          value={stats.batches}
          description="Active assignments"
          type="maroon"
        />

        <StatCard
          icon={<Users size={21} />}
          label="Assigned Students"
          value={stats.students}
          description="Students under supervision"
          type="blue"
        />

        <StatCard
          icon={<ClipboardCheck size={21} />}
          label="Attendance Rate"
          value={`${stats.attendanceRate}%`}
          description="Present + late attendance"
          type="green"
        />

        <StatCard
          icon={<TrendingUp size={21} />}
          label="Attendance Records"
          value={
            stats.present +
            stats.late +
            stats.absent
          }
          description="Recorded immersion attendance"
          type="purple"
        />

      </div>

      {/* ================= ATTENDANCE SUMMARY ================= */}

      <div className={styles.mainGrid}>

        {/* Chart */}

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Attendance Overview</h2>
              <p>
                Student attendance over the latest
                immersion days.
              </p>
            </div>

            <div className={styles.chartIcon}>
              <BarChart3 size={19} />
            </div>
          </div>

          {trendData.length ? (
            <AttendanceChart data={trendData} />
          ) : (
            <EmptyChart />
          )}
        </section>

        {/* Status */}

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Attendance Status</h2>
              <p>Current attendance distribution.</p>
            </div>

            <CalendarDays size={19} />
          </div>

          <AttendanceStatus
            present={stats.present}
            late={stats.late}
            absent={stats.absent}
          />
        </section>

      </div>

      {/* ================= BATCHES ================= */}

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>My Deployment Batches</h2>
            <p>
              Overview of students assigned to your
              immersion deployments.
            </p>
          </div>

          <Link
            to="students"
            className={styles.viewAll}
          >
            View Students
            <ArrowRight size={15} />
          </Link>
        </div>

        {batchStats.length ? (
          <div className={styles.batchGrid}>
            {batchStats.map((batch, index) => (
              <BatchCard
                key={
                  batch.id ??
                  batch.request_id ??
                  index
                }
                batch={batch}
              />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </section>

      {/* ================= QUICK ACTIONS ================= */}

      <section className={styles.quickSection}>
        <div className={styles.sectionTitle}>
          <div>
            <h2>Quick Actions</h2>
            <p>Frequently used supervisor tools.</p>
          </div>
        </div>

        <div className={styles.quickGrid}>

          <QuickAction
            to="create-deployment-request"
            icon={<FilePlus2 size={21} />}
            title="Deployment Request"
            description="Request students for your company."
          />

          <QuickAction
            to="students"
            icon={<GraduationCap size={21} />}
            title="View Students"
            description="See students assigned to you."
          />

          <QuickAction
            to="attendance"
            icon={<ClipboardCheck size={21} />}
            title="Attendance"
            description="Review student attendance."
          />

          <QuickAction
            to="evaluate"
            icon={<UserCheck size={21} />}
            title="Evaluate Students"
            description="Review student performance."
          />

        </div>
      </section>

    </div>
  );
}

/* =========================================================
   STAT CARD
========================================================= */

function StatCard({
  icon,
  label,
  value,
  description,
  type,
}) {
  return (
    <div className={styles.statCard}>

      <div
        className={`${styles.statIcon} ${styles[type]}`}
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

/* =========================================================
   ATTENDANCE CHART
========================================================= */

function AttendanceChart({ data }) {
  const maxValue = Math.max(
    ...data.map(
      (item) =>
        item.present +
        item.late +
        item.absent
    ),
    1
  );

  return (
    <div className={styles.chartWrapper}>

      <div className={styles.chartLegend}>
        <span>
          <i className={styles.presentDot} />
          Present
        </span>

        <span>
          <i className={styles.lateDot} />
          Late
        </span>

        <span>
          <i className={styles.absentDot} />
          Absent
        </span>
      </div>

      <div className={styles.chart}>

        {data.map((item, index) => {
          const total =
            item.present +
            item.late +
            item.absent;

          const presentHeight =
            (item.present / maxValue) * 100;

          const lateHeight =
            (item.late / maxValue) * 100;

          const absentHeight =
            (item.absent / maxValue) * 100;

          return (
            <div
              className={styles.chartColumn}
              key={item.date || index}
            >
              <div className={styles.chartValue}>
                {total}
              </div>

              <div className={styles.barArea}>

                <div
                  className={`${styles.bar} ${styles.presentBar}`}
                  style={{
                    height: `${presentHeight}%`,
                  }}
                  title={`Present: ${item.present}`}
                />

                <div
                  className={`${styles.bar} ${styles.lateBar}`}
                  style={{
                    height: `${lateHeight}%`,
                  }}
                  title={`Late: ${item.late}`}
                />

                <div
                  className={`${styles.bar} ${styles.absentBar}`}
                  style={{
                    height: `${absentHeight}%`,
                  }}
                  title={`Absent: ${item.absent}`}
                />

              </div>

              <span className={styles.chartLabel}>
                {formatShortDate(item.date)}
              </span>
            </div>
          );
        })}

      </div>
    </div>
  );
}

/* =========================================================
   ATTENDANCE STATUS
========================================================= */

function AttendanceStatus({
  present,
  late,
  absent,
}) {
  const total =
    present + late + absent;

  const getPercentage = (value) => {
    if (!total) return 0;

    return Math.round(
      (value / total) * 100
    );
  };

  return (
    <div className={styles.statusContainer}>

      <div className={styles.donutWrapper}>
        <div
          className={styles.donut}
          style={{
            background: createDonutGradient(
              present,
              late,
              absent
            ),
          }}
        >
          <div className={styles.donutCenter}>
            <strong>
              {total}
            </strong>

            <span>Records</span>
          </div>
        </div>
      </div>

      <div className={styles.statusList}>

        <StatusRow
          icon={<UserCheck size={17} />}
          label="Present"
          value={present}
          percentage={getPercentage(present)}
          type="present"
        />

        <StatusRow
          icon={<Clock3 size={17} />}
          label="Late"
          value={late}
          percentage={getPercentage(late)}
          type="late"
        />

        <StatusRow
          icon={<UserX size={17} />}
          label="Absent"
          value={absent}
          percentage={getPercentage(absent)}
          type="absent"
        />

      </div>

    </div>
  );
}

/* =========================================================
   STATUS ROW
========================================================= */

function StatusRow({
  icon,
  label,
  value,
  percentage,
  type,
}) {
  return (
    <div className={styles.statusRow}>

      <div className={styles.statusInfo}>

        <div
          className={`${styles.statusIcon} ${styles[type]}`}
        >
          {icon}
        </div>

        <div>
          <strong>{label}</strong>
          <span>{percentage}%</span>
        </div>

      </div>

      <strong className={styles.statusNumber}>
        {value}
      </strong>

    </div>
  );
}

/* =========================================================
   BATCH CARD
========================================================= */

function BatchCard({ batch }) {
  const name =
    batch.company_name ||
    batch.company ||
    batch.deployment_name ||
    batch.name ||
    'Deployment Batch';

  const students =
    batch.student_count ??
    batch.total_students ??
    batch.students_count ??
    batch.assigned_students ??
    0;

  const status =
    batch.status ||
    batch.request_status ||
    'Active';

  return (
    <div className={styles.batchCard}>

      <div className={styles.batchTop}>

        <div className={styles.companyIcon}>
          <Building2 size={18} />
        </div>

        <span
          className={`${styles.badge} ${
            status.toLowerCase() === 'approved'
              ? styles.badgeApproved
              : styles.badgeDefault
          }`}
        >
          {formatStatus(status)}
        </span>

      </div>

      <h3>{name}</h3>

      <div className={styles.batchMeta}>
        <Users size={15} />

        <span>
          {students} student
          {Number(students) === 1 ? '' : 's'}
        </span>
      </div>

      <div className={styles.batchProgress}>

        <div className={styles.progressHeader}>
          <span>Attendance</span>

          <strong>
            {batch.attendanceRate}%
          </strong>
        </div>

        <div className={styles.progressTrack}>
          <div
            className={styles.progressFill}
            style={{
              width: `${Math.min(
                batch.attendanceRate,
                100
              )}%`,
            }}
          />
        </div>

      </div>

    </div>
  );
}

/* =========================================================
   QUICK ACTION
========================================================= */

function QuickAction({
  to,
  icon,
  title,
  description,
}) {
  return (
    <Link
      to={to}
      className={styles.quickCard}
    >
      <div className={styles.quickIcon}>
        {icon}
      </div>

      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>

      <ArrowRight
        size={17}
        className={styles.quickArrow}
      />
    </Link>
  );
}

/* =========================================================
   EMPTY STATES
========================================================= */

function EmptyChart() {
  return (
    <div className={styles.emptyChart}>
      <BarChart3 size={30} />
      <strong>No attendance data yet</strong>
      <span>
        Attendance records will appear here once
        students have attendance activity.
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className={styles.emptyState}>
      <Building2 size={30} />

      <strong>No deployment batches</strong>

      <span>
        You currently have no deployment batches
        assigned to your account.
      </span>
    </div>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function normalizeArray(response) {
  if (Array.isArray(response)) {
    return response;
  }

  if (Array.isArray(response?.batches)) {
    return response.batches;
  }

  if (Array.isArray(response?.data)) {
    return response.data;
  }

  if (Array.isArray(response?.results)) {
    return response.results;
  }

  return [];
}

function normalizeAttendanceResponse(
  response,
  batch
) {
  let records = [];

  if (Array.isArray(response)) {
    records = response;
  } else if (Array.isArray(response?.attendance)) {
    records = response.attendance;
  } else if (Array.isArray(response?.data)) {
    records = response.data;
  } else if (Array.isArray(response?.records)) {
    records = response.records;
  }

  return records.map((record) => ({
    ...record,
    request_id:
      record.request_id ??
      record.deployment_request_id ??
      batch.request_id ??
      batch.deployment_request_id ??
      batch.id,

    status: normalizeAttendanceStatus(
      record.status ??
        record.attendance_status
    ),

    date:
      record.date ??
      record.attendance_date ??
      record.day,
  }));
}

function normalizeAttendanceStatus(status) {
  if (!status) return 'absent';

  const value = String(status)
    .trim()
    .toLowerCase();

  if (
    value.includes('present') ||
    value === 'on_time'
  ) {
    return 'present';
  }

  if (value.includes('late')) {
    return 'late';
  }

  return 'absent';
}

function getTotalStudents(batches) {
  return batches.reduce((total, batch) => {
    const count =
      batch.student_count ??
      batch.total_students ??
      batch.students_count ??
      batch.assigned_students ??
      0;

    return total + Number(count || 0);
  }, 0);
}

function getUserName(user) {
  return (
    user?.first_name ||
    user?.name ||
    user?.email ||
    'Supervisor'
  );
}

function formatShortDate(date) {
  if (!date) return '';

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return String(date).slice(0, 10);
  }

  return parsed.toLocaleDateString(
    'en-PH',
    {
      month: 'short',
      day: 'numeric',
    }
  );
}

function formatStatus(status) {
  if (!status) return 'Active';

  return String(status)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

function createDonutGradient(
  present,
  late,
  absent
) {
  const total =
    present + late + absent;

  if (!total) {
    return 'conic-gradient(#e7e5e4 0deg 360deg)';
  }

  const presentDegrees =
    (present / total) * 360;

  const lateDegrees =
    (late / total) * 360;

  return `
    conic-gradient(
      #166534 0deg ${presentDegrees}deg,
      #b45309 ${presentDegrees}deg ${
        presentDegrees + lateDegrees
      }deg,
      #b91c1c ${
        presentDegrees + lateDegrees
      }deg 360deg
    )
  `;
}

export default SupervisorDashboard;