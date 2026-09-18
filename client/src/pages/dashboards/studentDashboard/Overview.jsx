import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { getMyRequirements, getMyProgress } from '../../../api/studentApi';
import { getMyDailyDocs } from '../../../api/fileApi';
import {
  getMyAttendanceRecords,
  getMySchedule,
  getStudentAttendanceStatus,
} from '../../../api/attendanceApi';
import { useAuth } from '../../../context/AuthContext';
import SocialFeed from './SocialFeed';
import styles from './Overview.module.css';

function formatTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

function formatDate(value) {
  if (!value) return 'Recently';
  return new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function Overview({ user }) {
  const { token } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [progress, requirements, attendance, schedules, attendanceRecords, dailyDocs] = await Promise.all([
        getMyProgress(),
        getMyRequirements(),
        getStudentAttendanceStatus(token),
        getMySchedule(token),
        getMyAttendanceRecords(token),
        getMyDailyDocs({}),
      ]);
      setDashboard({ progress, requirements, attendance, schedules, attendanceRecords, dailyDocs });
    } catch (err) {
      setError(err.message || 'Unable to load your dashboard.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) loadDashboard();
  }, [token, loadDashboard]);

  const firstName = user?.first_name || user?.email?.split('@')[0] || 'Student';
  const progressData = dashboard?.progress;
  const attendance = dashboard?.attendance;
  const requirements = dashboard?.requirements;
  const documentation = progressData?.documentation || {};
  const attendanceProgress = progressData?.attendance || {};
  const progressSteps = [Boolean(progressData?.requirements?.approved), Boolean(documentation.graded), Boolean(attendanceProgress.complete)];
  const progress = Math.round((progressSteps.filter(Boolean).length / progressSteps.length) * 100);
  const todayRecord = attendance?.today;
  const scheduledDays = dashboard?.schedules?.schedules?.reduce(
    (sum, schedule) => sum + String(schedule.attendance_dates || '').split(',').filter(Boolean).length,
    0,
  ) || attendanceProgress.scheduled || 0;
  const attendanceStatus = todayRecord?.check_out_time
    ? 'Completed'
    : todayRecord?.check_in_time
      ? 'Checked in'
      : attendance?.in_schedule
        ? 'Ready to time in'
        : 'Not scheduled today';

  const activities = useMemo(() => {
    const docs = dashboard?.dailyDocs?.docs || [];
    const records = dashboard?.attendanceRecords?.records || [];
    const items = [];
    if (progressData?.requirements) {
      items.push({ icon: ClipboardCheck, tone: 'success', title: 'Requirements status', detail: progressData.requirements.status || 'Not submitted', time: requirements?.submission?.updated_at });
    }
    if (records[0]) {
      items.push({ icon: Clock3, tone: 'info', title: 'Latest attendance recorded', detail: records[0].check_out_time ? 'Time in and time out completed.' : 'Time in recorded for your latest immersion day.', time: records[0].check_in_time });
    }
    if (docs[0]) {
      items.push({ icon: FileText, tone: 'warning', title: 'Daily documentation updated', detail: `Status: ${docs[0].status || 'Submitted'}`, time: docs[0].updated_at || docs[0].created_at });
    }
    return items.slice(0, 3);
  }, [dashboard, progressData, requirements]);

  return (
    <div className={styles.dashboard}>
      <section className={styles.greeting}>
        <div>
          <p className={styles.eyebrow}>WORK IMMERSION</p>
          <h2>Welcome back, {firstName}.</h2>
          <p className={styles.greetingText}>Here&apos;s an overview of your work immersion progress and activities.</p>
        </div>
        <div className={styles.greetingDate}>
          <CalendarDays size={17} aria-hidden="true" />
          <span>Today</span>
          <strong>{new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}</strong>
        </div>
      </section>

      {loading && <div className={styles.stateCard} role="status"><Sparkles size={20} /><span>Preparing your immersion overview...</span></div>}
      {!loading && error && <div className={`${styles.stateCard} ${styles.errorState}`} role="alert"><span>{error}</span><button type="button" onClick={loadDashboard}><RefreshCw size={15} /> Try again</button></div>}

      {!loading && !error && (
        <div className={styles.mainGrid}>
          <main className={styles.leftColumn}>
            <section className={styles.progressCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.cardEyebrow}>IMMERSION PROGRESS</p>
                  <h3>Overall Progress</h3>
                  <p>Keep completing your requirements and attendance to finish your immersion.</p>
                </div>
                <div className={styles.progressCircle}>
                  <svg viewBox="0 0 100 100" aria-label={`${progress}% complete`} role="img">
                    <circle className={styles.progressBackground} cx="50" cy="50" r="42" />
                    <circle className={styles.progressValue} cx="50" cy="50" r="42" style={{ strokeDashoffset: 264 - (264 * progress) / 100 }} />
                  </svg>
                  <span>{progress}%</span>
                </div>
              </div>
              <div className={styles.progressBar}><div className={styles.progressBarFill} style={{ width: `${progress}%` }} /></div>
              <div className={styles.progressStats}>
                <div><strong>{attendanceProgress.days || 0}</strong><span>Days attended</span></div>
                <div><strong>{scheduledDays || attendanceProgress.required || 0}</strong><span>Scheduled days</span></div>
                <div><strong>{Math.max((scheduledDays || attendanceProgress.required || 0) - (attendanceProgress.days || 0), 0)}</strong><span>Days remaining</span></div>
              </div>
              <div className={styles.progressLinks}>
                <a href="/dashboard/student/progress">Open full progress <ArrowUpRight size={14} /></a>
                {progressData?.certificate?.issued && <span><CheckCircle2 size={14} /> Certificate ready</span>}
              </div>
            </section>

            <section className={styles.attendanceCard}>
              <div className={styles.sectionTitle}><div className={styles.titleIcon}><CalendarDays size={19} /></div><div><h3>Today&apos;s Attendance</h3><p>{attendanceStatus}</p></div></div>
              <div className={styles.attendanceGrid}>
                <div className={styles.attendanceItem}><span className={styles.attendanceLabel}>Morning</span><strong className={styles.time}>{formatTime(todayRecord?.check_in_time)}</strong><span className={`${styles.status} ${todayRecord?.check_in_time ? styles.present : styles.pending}`}>{todayRecord?.check_in_time ? '● Present' : '○ Not recorded'}</span></div>
                <div className={styles.attendanceDivider} />
                <div className={styles.attendanceItem}><span className={styles.attendanceLabel}>Afternoon</span><strong className={styles.time}>{formatTime(todayRecord?.check_out_time)}</strong><span className={`${styles.status} ${todayRecord?.check_out_time ? styles.present : styles.pending}`}>{todayRecord?.check_out_time ? '● Completed' : '○ Not yet timed out'}</span></div>
              </div>
              <a href="/dashboard/student/attendance" className={styles.viewButton}>View attendance <ArrowUpRight size={14} /></a>
            </section>

            <section className={styles.activityCard}>
              <div className={styles.sectionHeaderSimple}><div><p className={styles.cardEyebrow}>ACTIVITY</p><h3>Recent Activity</h3></div><a href="/dashboard/student/progress" className={styles.viewAll}>View all</a></div>
              <div className={styles.activityList}>
                {activities.length ? activities.map(({ icon: Icon, tone, title, detail, time }) => (
                  <div className={styles.activityItem} key={title}><div className={`${styles.activityIcon} ${styles[tone]}`}><Icon size={16} /></div><div><strong>{title}</strong><p>{detail}</p><span>{formatDate(time)}</span></div></div>
                )) : <p className={styles.emptyText}>Your recent activity will appear here as you complete immersion tasks.</p>}
              </div>
            </section>
          </main>

          <aside className={styles.rightColumn}>
            <div className={styles.feedHeader}><div><p className={styles.cardEyebrow}>COMMUNITY</p><h3>News Feed</h3></div></div>
            <SocialFeed embedded />
          </aside>
        </div>
      )}
    </div>
  );
}

export default Overview;