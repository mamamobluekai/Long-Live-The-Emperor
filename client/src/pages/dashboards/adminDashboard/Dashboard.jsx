import { useEffect, useState, useCallback } from 'react';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { getAdminDashboard } from '../../../api/adminApi';
import { LineChart, AreaChart, BarChart, DonutChart, FunnelChart } from '../../../components/charts';
import styles from './Dashboard.module.css';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function getDayLabel(dayStr) {
  const map = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
  return map[dayStr?.toLowerCase()] || dayStr;
}

function buildWeekData(attendanceWeek) {
  const byDay = {};
  (attendanceWeek || []).forEach((d) => {
    byDay[getDayLabel(d.day)] = d.percentage;
  });
  return DAY_LABELS.map((label) => ({
    day: label,
    percentage: byDay[label] ?? 0,
  }));
}

function formatDateForChart(dateStr) {
  return dateStr;
}

export default function AdminDashboardPage() {
  useAdminAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAdminDashboard();
      setStats(data.stats || {});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const weekData = buildWeekData(stats?.attendanceWeek);
  const reqs = stats?.requirements || {};
  const docs = stats?.documentation || {};
  const evals = stats?.evaluations || [];
  const attendanceTrend = stats?.attendanceTrend || [];
  const requirementsTrend = stats?.requirementsTrend || [];
  const userGrowth = stats?.userGrowth || [];
  const batchPerformance = stats?.batchPerformance || [];
  const periodStatus = stats?.periodStatus || {};
  const docGradingTrend = stats?.docGradingTrend || [];
  const appeals = stats?.appeals || {};

  // Prepare data for charts
  const attendanceTrendData = attendanceTrend.map((d) => ({
    date: formatDateForChart(d.date),
    present: d.present,
    total: d.total,
    percentage: d.percentage,
  }));

  const requirementsTrendData = requirementsTrend.map((d) => ({
    date: formatDateForChart(d.date),
    completed: d.completed,
    pending: d.pending,
    under_review: d.under_review,
    rejected: d.rejected,
    total: d.total,
  }));

  const userGrowthData = userGrowth.map((d) => ({
    month: d.month,
    students: d.students,
    teachers: d.teachers,
    supervisors: d.supervisors,
    coordinators: d.coordinators,
    total: d.total,
  }));

  const batchPerformanceData = batchPerformance.map((d) => ({
    name: d.batchLabel,
    studentCount: d.studentCount,
    attendanceRate: d.attendanceRate,
    attendanceDays: d.attendanceDays,
  }));

  const periodStatusData = [
    { label: 'Upcoming', value: periodStatus.upcoming || 0 },
    { label: 'Ongoing', value: periodStatus.ongoing || 0 },
    { label: 'Completed', value: periodStatus.completed || 0 },
    { label: 'Inactive', value: periodStatus.inactive || 0 },
  ].filter((d) => d.value > 0);

  const docGradingData = docGradingTrend.map((d) => ({
    date: formatDateForChart(d.date),
    submitted: d.submitted,
    graded: d.graded,
    rate: d.rate,
  }));

  const appealsFunnel = [
    { label: 'Pending', value: appeals.pending || 0, percentage: appeals.pending ? Math.round((appeals.pending / (appeals.pending + appeals.approved + appeals.rejected || 1)) * 100) : 0 },
    { label: 'Approved', value: appeals.approved || 0, percentage: appeals.approved ? Math.round((appeals.approved / (appeals.pending + appeals.approved + appeals.rejected || 1)) * 100) : 0 },
    { label: 'Rejected', value: appeals.rejected || 0, percentage: appeals.rejected ? Math.round((appeals.rejected / (appeals.pending + appeals.approved + appeals.rejected || 1)) * 100) : 0 },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Admin Dashboard</h1>
          <p className={styles.subtitle}>Work Immersion System Overview</p>
        </div>
        <button
          className={styles.refreshBtn}
          onClick={fetchStats}
          disabled={loading}
          type="button"
        >
          {loading ? '...' : 'Refresh'}
        </button>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {loading && !stats ? (
        <div className={styles.loadingGrid}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className={styles.skeletonCard} />
          ))}
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className={styles.statsRow}>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Students</span>
              <span className={styles.statValue}>{stats?.totalStudents ?? 0}</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Teachers</span>
              <span className={styles.statValue}>{stats?.totalTeachers ?? 0}</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Supervisors</span>
              <span className={styles.statValue}>{stats?.totalSupervisors ?? 0}</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Coordinators</span>
              <span className={styles.statValue}>{stats?.totalCoordinators ?? 0}</span>
            </div>
          </div>

          {/* Row 1: Users by Role, Account Status, Attendance This Week */}
          <div className={styles.chartsRow}>
            <div className={styles.chartCard}>
              <h3 className={styles.chartTitle}>Users by Role</h3>
              <div className={styles.donutContainer}>
                <DonutChart
                  data={[
                    { label: 'Students', value: stats?.totalStudents ?? 0 },
                    { label: 'Teachers', value: stats?.totalTeachers ?? 0 },
                    { label: 'Supervisors', value: stats?.totalSupervisors ?? 0 },
                    { label: 'Coordinators', value: stats?.totalCoordinators ?? 0 },
                  ]}
                  height={200}
                />
              </div>
            </div>

            <div className={styles.chartCard}>
              <h3 className={styles.chartTitle}>Account Status</h3>
              <div className={styles.barList}>
                <BarRow
                  label="Active"
                  value={stats?.totalActiveUsers ?? 0}
                  max={stats?.totalActiveUsers + stats?.totalPendingAccounts + stats?.totalDisabledAccounts || 1}
                  color="#22c55e"
                />
                <BarRow
                  label="Pending"
                  value={stats?.totalPendingAccounts ?? 0}
                  max={stats?.totalActiveUsers + stats?.totalPendingAccounts + stats?.totalDisabledAccounts || 1}
                  color="#f59e0b"
                />
                <BarRow
                  label="Disabled"
                  value={stats?.totalDisabledAccounts ?? 0}
                  max={stats?.totalActiveUsers + stats?.totalPendingAccounts + stats?.totalDisabledAccounts || 1}
                  color="#ef4444"
                />
              </div>
            </div>
          </div>

          <div className={styles.chartCardFull}>
            <h3 className={styles.chartTitle}>Attendance This Week</h3>
            <div className={styles.attendanceBars}>
              {weekData.map((d) => (
                <div key={d.day} className={styles.attendanceRow}>
                  <span className={styles.attendanceDay}>{d.day}</span>
                  <div className={styles.attendanceBarTrack}>
                    <div
                      className={styles.attendanceBarFill}
                      style={{ width: `${d.percentage}%` }}
                    />
                  </div>
                  <span className={styles.attendancePct}>{d.percentage}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Row 2: Attendance Trend, Requirements Trend, Documentation Grading Rate */}
          <div className={styles.chartsRow}>
            <div className={styles.chartCardFull}>
              <h3 className={styles.chartTitle}>Attendance Trend (30 Days)</h3>
              <LineChart
                data={attendanceTrendData}
                xKey="date"
                lines={[
                  { dataKey: 'percentage', label: 'Attendance %', color: '#3b82f6' },
                ]}
                height={280}
                tooltipFormatter={(value) => `${value}%`}
              />
            </div>

            <div className={styles.chartCardFull}>
              <h3 className={styles.chartTitle}>Requirements Trend (30 Days)</h3>
              <AreaChart
                data={requirementsTrendData}
                xKey="date"
                areas={[
                  { dataKey: 'completed', label: 'Completed', color: '#22c55e' },
                  { dataKey: 'pending', label: 'Pending', color: '#f59e0b' },
                  { dataKey: 'under_review', label: 'Under Review', color: '#3b82f6' },
                  { dataKey: 'rejected', label: 'Rejected', color: '#ef4444' },
                ]}
                height={280}
                stacked
                tooltipFormatter={(value, name) => [value, name]}
              />
            </div>
          </div>

          <div className={styles.chartCardFull}>
            <h3 className={styles.chartTitle}>Documentation Grading Rate (30 Days)</h3>
            <LineChart
              data={docGradingData}
              xKey="date"
              lines={[
                { dataKey: 'submitted', label: 'Submitted', color: '#3b82f6' },
                { dataKey: 'graded', label: 'Graded', color: '#22c55e' },
                { dataKey: 'rate', label: 'Grading Rate %', color: '#8b5cf6' },
              ]}
              height={280}
              tooltipFormatter={(value, name) => name === 'Grading Rate %' ? `${value}%` : value}
            />
          </div>

          {/* Row 3: User Growth, Batch Performance */}
          <div className={styles.chartsRow}>
            <div className={styles.chartCardFull}>
              <h3 className={styles.chartTitle}>User Growth (12 Months)</h3>
              <BarChart
                data={userGrowthData}
                xKey="month"
                bars={[
                  { dataKey: 'students', label: 'Students', color: '#3b82f6' },
                  { dataKey: 'teachers', label: 'Teachers', color: '#22c55e' },
                  { dataKey: 'supervisors', label: 'Supervisors', color: '#f59e0b' },
                  { dataKey: 'coordinators', label: 'Coordinators', color: '#8b5cf6' },
                ]}
                height={320}
                stacked
              />
            </div>

            <div className={styles.chartCardFull}>
              <h3 className={styles.chartTitle}>Batch Performance</h3>
              <BarChart
                data={batchPerformanceData}
                xKey="name"
                bars={[
                  { dataKey: 'attendanceRate', label: 'Attendance Rate %', color: '#3b82f6' },
                ]}
                height={320}
                horizontal
                maxBarSize={40}
                tooltipFormatter={(value) => `${value}%`}
              />
            </div>
          </div>

          {/* Row 4: Immersion Periods, Appeals Funnel, Evaluation Performance */}
          <div className={styles.chartsRow}>
            <div className={styles.chartCard}>
              <h3 className={styles.chartTitle}>Immersion Periods</h3>
              <DonutChart
                data={periodStatusData}
                height={260}
                innerRadius={50}
                outerRadius={70}
              />
            </div>

            <div className={styles.chartCard}>
              <h3 className={styles.chartTitle}>Appeals Funnel</h3>
              <FunnelChart
                stages={appealsFunnel}
                height={260}
              />
            </div>
          </div>

          {/* Row 5: Requirements, Documentation, Evaluations (existing) */}
          <div className={styles.chartsRow}>
            <div className={styles.chartCard}>
              <h3 className={styles.chartTitle}>Requirements</h3>
              <div className={styles.progressList}>
                <ProgressItem label="Completed" count={reqs.completed ?? 0} percentage={reqs.completedPct ?? 0} color="#22c55e" />
                <ProgressItem label="Pending" count={reqs.pending ?? 0} percentage={reqs.pendingPct ?? 0} color="#f59e0b" />
                <ProgressItem label="Review" count={reqs.review ?? 0} percentage={reqs.reviewPct ?? 0} color="#3b82f6" />
                <ProgressItem label="Rejected" count={reqs.rejected ?? 0} percentage={reqs.rejectedPct ?? 0} color="#ef4444" />
              </div>
            </div>

            <div className={styles.chartCard}>
              <h3 className={styles.chartTitle}>Daily Documentation</h3>
              <div className={styles.docGrid}>
                <div className={styles.docItem}>
                  <span className={styles.docValue}>{docs.submitted ?? 0}</span>
                  <span className={styles.docLabel}>Submitted</span>
                </div>
                <div className={styles.docItem}>
                  <span className={styles.docValue}>{docs.pending ?? 0}</span>
                  <span className={styles.docLabel}>Pending</span>
                </div>
                <div className={styles.docItem}>
                  <span className={styles.docValue}>{docs.reviewed ?? 0}</span>
                  <span className={styles.docLabel}>Reviewed</span>
                </div>
                <div className={styles.docItem}>
                  <span className={styles.docValue}>{docs.graded ?? 0}</span>
                  <span className={styles.docLabel}>Graded</span>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.chartCardFull}>
            <h3 className={styles.chartTitle}>Evaluation Performance</h3>
            <div className={styles.evalList}>
              {evals.length > 0 ? (
                evals.map((e) => (
                  <div key={e.category} className={styles.evalRow}>
                    <span className={styles.evalLabel}>{e.category}</span>
                    <div className={styles.evalBarTrack}>
                      <div
                        className={styles.evalBarFill}
                        style={{ width: `${e.percentage}%` }}
                      />
                    </div>
                    <span className={styles.evalPct}>{e.percentage}%</span>
                  </div>
                ))
              ) : (
                <p className={styles.emptyState}>No evaluation data yet.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BarRow({ label, value, max, color }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className={styles.barRow}>
      <span className={styles.barLabel}>{label}</span>
      <div className={styles.barTrack}>
        <div className={styles.barFill} style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function ProgressItem({ label, count, percentage, color }) {
  return (
    <div className={styles.progressItem}>
      <div className={styles.progressHeader}>
        <span className={styles.progressLabel}>{label}</span>
        <span className={styles.progressPercentage}>{percentage}%</span>
      </div>
      <div className={styles.progressTrack}>
        <div
          className={styles.progressFill}
          style={{ width: `${percentage}%`, background: color }}
        />
      </div>
      <span className={styles.progressCount}>{count}</span>
    </div>
  );
}