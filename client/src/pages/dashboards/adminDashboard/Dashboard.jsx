import { useEffect, useState, useCallback } from 'react';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { getAdminDashboard } from '../../../api/adminApi';
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

          <div className={styles.chartsRow}>
            <div className={styles.chartCard}>
              <h3 className={styles.chartTitle}>Users by Role</h3>
              <div className={styles.donutContainer}>
                <DonutChart
                  segments={[
                    { label: 'Students', value: stats?.totalStudents ?? 0, color: '#3b82f6' },
                    { label: 'Teachers', value: stats?.totalTeachers ?? 0, color: '#22c55e' },
                    { label: 'Supervisors', value: stats?.totalSupervisors ?? 0, color: '#f59e0b' },
                    { label: 'Coordinators', value: stats?.totalCoordinators ?? 0, color: '#8b5cf6' },
                  ]}
                />
                <div className={styles.legend}>
                  <LegendItem color="#3b82f6" label="Students" value={stats?.totalStudents ?? 0} />
                  <LegendItem color="#22c55e" label="Teachers" value={stats?.totalTeachers ?? 0} />
                  <LegendItem color="#f59e0b" label="Supervisors" value={stats?.totalSupervisors ?? 0} />
                  <LegendItem color="#8b5cf6" label="Coordinators" value={stats?.totalCoordinators ?? 0} />
                </div>
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

function DonutChart({ segments }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;

  const size = 160;
  const strokeWidth = 28;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const segmentData = [];
  segments.reduce((acc, seg) => {
    const pct = seg.value / total;
    const dashLength = pct * circumference;
    const dashOffset = -(acc * circumference);
    segmentData.push({ ...seg, dashLength, dashOffset });
    return acc + pct;
  }, 0);

  return (
    <svg width={size} height={size} className={styles.donutSvg}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#f1f5f9"
        strokeWidth={strokeWidth}
      />
      {segmentData.map((seg, i) => (
        <circle
          key={i}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={seg.color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${seg.dashLength} ${circumference - seg.dashLength}`}
          strokeDashoffset={seg.dashOffset}
          strokeLinecap="butt"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      ))}
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className={styles.donutCenterText}
      >
        {total}
      </text>
    </svg>
  );
}

function LegendItem({ color, label, value }) {
  return (
    <div className={styles.legendItem}>
      <span className={styles.legendDot} style={{ background: color }} />
      <span className={styles.legendLabel}>{label}</span>
      <span className={styles.legendValue}>{value}</span>
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
