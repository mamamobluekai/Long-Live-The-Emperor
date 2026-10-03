// Admin overview.
// Design system: Lexend + the RequirementsReview maroon palette.
//
// The top of the page shows the four role totals. Below that, the same
// attendance / participation / completion figures are graphed for every work
// immersion period, and rolled up per academic year, so a coordinator can
// compare one semester against another.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Briefcase, CalendarRange, GraduationCap, School, UserCog } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAdminAuth } from '../../../context/useAdminAuth';
import { getAdminDashboard, getAdminPeriodAnalytics } from '../../../api/adminApi';
import { useToast } from '../../../components/admin/toastContext';
import styles from './Dashboard.module.css';

// Palette lifted from the RequirementsReview / CoordinatorOverview design system.
const PARTICIPANTS = [
  { key: 'students', label: 'Students', color: '#8b1e2d' },
  { key: 'teachers', label: 'Teachers', color: '#37568c' },
  { key: 'supervisors', label: 'Supervisors', color: '#b45309' },
  { key: 'coordinators', label: 'Coordinators', color: '#be8c3f' },
];

const TOOLTIP_STYLE = {
  backgroundColor: '#fff',
  border: '1px solid #dcc9cf',
  borderRadius: '10px',
  boxShadow: '0 8px 24px -18px rgba(80, 20, 32, 0.5)',
  fontSize: '0.78rem',
};

const AXIS_TICK = { fontSize: 11, fill: '#8490a1', fontFamily: 'Lexend, Inter, sans-serif' };

// Sentinel for the year picker's "show every academic year" option.
const ALL_YEARS = 'all';

function formatRange(start, end) {
  if (!start || !end) return '';
  const fmt = (d) =>
    new Date(d).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

// immersion_periods.status is a free-form lowercase string; normalise it into a
// class suffix so the pill always gets one of the styled variants below.
function statusKey(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'ongoing') return 'Ongoing';
  if (value === 'completed') return 'Completed';
  return 'Upcoming';
}

export default function AdminDashboardPage() {
  useAdminAuth();
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState({ periods: [], years: [] });
  const [groupBy, setGroupBy] = useState('period');
  const [selectedYear, setSelectedYear] = useState(ALL_YEARS);
  const [loading, setLoading] = useState(true);

  const { showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dashboard, periodData] = await Promise.all([
        getAdminDashboard(),
        // Charts are supplementary: a failure here should not blank the KPI cards.
        getAdminPeriodAnalytics().catch(() => ({ periods: [], years: [] })),
      ]);
      setStats(dashboard.stats || {});
      setAnalytics({
        periods: periodData?.periods || [],
        years: periodData?.years || [],
      });
    } catch (err) {
      showToast(err.message || 'Unable to load the overview.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const students = stats?.totalStudents ?? 0;
  const teachers = stats?.totalTeachers ?? 0;
  const supervisors = stats?.totalSupervisors ?? 0;
  const coordinators = stats?.totalCoordinators ?? 0;

  const roleCards = [
    { id: 'students', icon: GraduationCap, label: 'Students', value: students, tone: 'maroon' },
    { id: 'teachers', icon: School, label: 'Teachers', value: teachers, tone: 'blue' },
    { id: 'supervisors', icon: Briefcase, label: 'Supervisors', value: supervisors, tone: 'amber' },
    { id: 'coordinators', icon: UserCog, label: 'Coordinators', value: coordinators, tone: 'green' },
  ];

  const periods = analytics.periods;
  const years = analytics.years;

  // The year picker filters the analytics section only. The KPI cards above stay
  // on the all-time totals, matching the system-wide user counts.
  const filteredPeriods = useMemo(
    () => (selectedYear === ALL_YEARS
      ? periods
      : periods.filter((p) => p.academicYear === selectedYear)),
    [periods, selectedYear],
  );

  const filteredYears = useMemo(
    () => (selectedYear === ALL_YEARS
      ? years
      : years.filter((y) => y.academicYear === selectedYear)),
    [years, selectedYear],
  );

  const rows = groupBy === 'period' ? filteredPeriods : filteredYears;
  const hasAnalytics = filteredPeriods.length > 0;

  // Shared shape for every chart so the toggle only swaps the dataset.
  const participationData = useMemo(
    () => rows.map((r) => ({
      name: r.periodName || r.academicYear,
      students: r.students,
      teachers: r.teachers,
      supervisors: r.supervisors,
      coordinators: r.coordinators,
    })),
    [rows],
  );

  const performanceData = useMemo(
    () => rows.map((r) => ({
      name: r.periodName || r.academicYear,
      attendanceRate: r.attendanceRate,
      completionRate: r.completionRate,
    })),
    [rows],
  );

  return (
    <div className={styles.dashboard}>
      <section className={styles.pageHeader}>
        <div className={styles.headerCopy}>
          <h1>Admin Dashboard</h1>
          <p className={styles.headerText}>
            A quick look at the people registered in the Work Immersion System,
            graphed for every work immersion period and academic year.
          </p>
        </div>

        <span className={styles.headerIcon} aria-hidden="true">
          <GraduationCap size={22} strokeWidth={1.9} />
        </span>
      </section>

      <section className={styles.statsGrid} aria-label="Users by role">
        {loading && !stats
          ? [...Array(4)].map((_, i) => (
              <div key={i} className={styles.skeletonCard} aria-hidden="true" />
            ))
          : roleCards.map((card) => (
              <RoleCard
                key={card.id}
                icon={card.icon}
                label={card.label}
                value={card.value}
                tone={card.tone}
              />
            ))}
      </section>

      <section className={styles.analyticsSection}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.cardEyebrow}>PERFORMANCE</p>
            <h2>Immersion Analytics</h2>
            <p className={styles.sectionSub}>
              Participation, attendance and requirement completion for every
              {' '}{groupBy === 'period' ? 'work immersion period' : 'academic year'}
              {selectedYear === ALL_YEARS ? '.' : ` in ${selectedYear}.`}
            </p>
          </div>

          <div className={styles.sectionControls}>
            <label className={styles.yearPicker}>
              <span className={styles.yearPickerLabel}>Academic Year</span>
              <select
                className={styles.yearSelect}
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                aria-label="Filter analytics by academic year"
              >
                <option value={ALL_YEARS}>All years</option>
                {years.map((y) => (
                  <option key={y.academicYear} value={y.academicYear}>
                    {y.academicYear}
                  </option>
                ))}
              </select>
            </label>

            <div className={styles.toggle} role="group" aria-label="Group analytics by">
              <button
                type="button"
                className={`${styles.toggleBtn} ${groupBy === 'period' ? styles.toggleBtnActive : ''}`}
                onClick={() => setGroupBy('period')}
                aria-pressed={groupBy === 'period'}
              >
                <CalendarRange size={15} /> By Period
              </button>
              <button
                type="button"
                className={`${styles.toggleBtn} ${groupBy === 'year' ? styles.toggleBtnActive : ''}`}
                onClick={() => setGroupBy('year')}
                aria-pressed={groupBy === 'year'}
              >
                By Year
              </button>
            </div>
          </div>
        </div>

        {!hasAnalytics ? (
          <div className={styles.emptyState}>
            <BarChart3 size={30} strokeWidth={1.5} />
            <h3>No work immersion periods yet</h3>
            <p>
              Charts appear once an immersion period is created in
              {' '}System Settings and students are assigned to it.
            </p>
          </div>
        ) : (
          <div className={styles.chartGrid}>
            <div className={styles.chartCard}>
              <h3 className={styles.chartTitle}>Participants</h3>
              <p className={styles.chartSub}>
                Headcount per {groupBy === 'period' ? 'immersion period' : 'academic year'}
                {selectedYear === ALL_YEARS ? '.' : ` · ${selectedYear}`}
              </p>
              <div className={styles.chart}>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={participationData} margin={{ top: 8, right: 8, left: -18, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1e9ec" vertical={false} />
                    <XAxis dataKey="name" tick={AXIS_TICK} axisLine={{ stroke: '#ecdfe2' }} tickLine={false} interval={0} angle={-12} textAnchor="end" height={62} />
                    <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(139,30,45,0.05)' }} />
                    <Legend wrapperStyle={{ fontSize: '0.76rem', fontFamily: 'Lexend, Inter, sans-serif' }} />
                    {PARTICIPANTS.map((p) => (
                      <Bar key={p.key} dataKey={p.key} name={p.label} fill={p.color} radius={[4, 4, 0, 0]} maxBarSize={46} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={styles.chartCard}>
              <h3 className={styles.chartTitle}>Attendance &amp; Completion</h3>
              <p className={styles.chartSub}>
                Percentage of records that are present, and requirements finished.
              </p>
              <div className={styles.chart}>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={performanceData} margin={{ top: 8, right: 8, left: -18, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1e9ec" vertical={false} />
                    <XAxis dataKey="name" tick={AXIS_TICK} axisLine={{ stroke: '#ecdfe2' }} tickLine={false} interval={0} angle={-12} textAnchor="end" height={62} />
                    <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} domain={[0, 100]} unit="%" />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(139,30,45,0.05)' }} formatter={(v) => `${v}%`} />
                    <Legend wrapperStyle={{ fontSize: '0.76rem', fontFamily: 'Lexend, Inter, sans-serif' }} />
                    <Bar dataKey="attendanceRate" name="Attendance Rate" fill="#8b1e2d" radius={[4, 4, 0, 0]} maxBarSize={46} />
                    <Bar dataKey="completionRate" name="Requirements Completion" fill="#be8c3f" radius={[4, 4, 0, 0]} maxBarSize={46} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {hasAnalytics && (
          <div className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <div>
                <h3 className={styles.chartTitle}>Breakdown</h3>
                <p className={styles.chartSub}>Raw figures behind the charts above.</p>
              </div>
              <span className={styles.totalBadge}>{rows.length} total</span>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{groupBy === 'period' ? 'Period' : 'Academic Year'}</th>
                    {groupBy === 'period' ? <th>Status</th> : null}
                    <th>Students</th>
                    <th>Teachers</th>
                    <th>Supervisors</th>
                    <th>Coordinators</th>
                    <th>Batches</th>
                    <th>Attendance</th>
                    <th>Completion</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={groupBy === 'period' ? r.id : r.academicYear}>
                      <td>
                        <strong>{r.periodName || r.academicYear}</strong>
                        {groupBy === 'period' && r.academicYear ? (
                          <span className={styles.tableSub}>{r.academicYear} · {r.semester}</span>
                        ) : null}
                        {groupBy === 'period' && formatRange(r.startDate, r.endDate) ? (
                          <span className={styles.tableSub}>{formatRange(r.startDate, r.endDate)}</span>
                        ) : null}
                        {groupBy === 'year' ? (
                          <span className={styles.tableSub}>
                            {r.periods} period{r.periods === 1 ? '' : 's'}
                          </span>
                        ) : null}
                      </td>
                      {groupBy === 'period' ? (
                        <td>
                          <span className={`${styles.pill} ${styles[`pill${statusKey(r.status)}`]}`}>
                            {r.status}
                          </span>
                        </td>
                      ) : null}
                      <td>{r.students}</td>
                      <td>{r.teachers}</td>
                      <td>{r.supervisors}</td>
                      <td>{r.coordinators}</td>
                      <td>{r.batches}</td>
                      <td>{r.attendanceRate}%</td>
                      <td>{r.completionRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function RoleCard({ icon: Icon, label, value, tone }) {
  return (
    <div className={`${styles.statCard} ${styles[`tone${tone}`]}`}>
      <span className={styles.statIcon} aria-hidden="true">
        <Icon size={17} strokeWidth={1.9} />
      </span>
      <div className={styles.statCopy}>
        <span className={styles.statLabel}>{label}</span>
        <strong className={styles.statValue}>{value}</strong>
      </div>
    </div>
  );
}
