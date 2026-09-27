import { useMemo } from 'react';
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
import { TrendingUp } from 'lucide-react';
import { byDate, formatShortDate } from '../../../utils/attendanceAnalytics';
import styles from './AttendanceInsights.module.css';

// Daily attendance trend for the batch selected in the sidebar. All figures come
// from the already-loaded attendance report, so nothing extra is fetched.
function AttendanceInsights({ report }) {
  const { dates = [], records = [], rows = [], loading } = report || {};

  const daily = useMemo(() => byDate(records, dates), [records, dates]);

  if (loading) {
    return (
      <div className={styles.card}>
        <div className={styles.loading}>Preparing attendance insights...</div>
      </div>
    );
  }

  if (!dates.length || !rows.length) {
    return (
      <div className={styles.card}>
        <div className={styles.empty}>
          <TrendingUp size={30} strokeWidth={1.5} />
          <h3>No attendance data yet</h3>
          <p>Charts appear once a work immersion schedule and student records exist for this batch.</p>
        </div>
      </div>
    );
  }

  // Upcoming immersion days have no attendance yet, so they are not plotted.
  const trendData = daily
    .filter((day) => !day.upcoming)
    .map((day) => ({
      date: formatShortDate(day.date),
      present: day.present + day.late,
      absent: day.absent,
    }));

  return (
    <div className={styles.card}>
      <div className={styles.grid}>
        <section className={styles.block}>
          <h3 className={styles.blockTitle}>Daily attendance trend</h3>
          <p className={styles.blockSub}>Present vs absent students per immersion date.</p>
          <div className={styles.chart}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trendData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f4" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#8490a1' }}
                  axisLine={{ stroke: '#e6dfe2' }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#8490a1' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(139, 30, 45, 0.05)' }}
                  contentStyle={{
                    borderRadius: 10,
                    border: '1px solid #e6dfe2',
                    fontSize: 12,
                    fontFamily: 'Lexend, Inter, system-ui, sans-serif',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Lexend, Inter, system-ui, sans-serif' }} />
                <Bar dataKey="present" name="Present" stackId="a" fill="#15803d" radius={[0, 0, 3, 3]} maxBarSize={34} />
                <Bar dataKey="absent" name="Absent" stackId="a" fill="#b4233b" radius={[3, 3, 0, 0]} maxBarSize={34} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}

export default AttendanceInsights;
