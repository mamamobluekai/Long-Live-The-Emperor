import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileText,
  MapPin,
  MessageCircle,
  RefreshCw,
  TrendingUp,
  UserCheck,
} from 'lucide-react';
import { getMyRequirements, getMyProgress } from '../../../api/studentApi';
import { getMyDailyDocs } from '../../../api/fileApi';
import {
  getMyAttendanceRecords,
  getMySchedule,
  getStudentAttendanceStatus,
} from '../../../api/attendanceApi';
import { getFeedPosts } from '../../../api/feedApi';
import { useAuth } from '../../../context/AuthContext';
import styles from './Overview.module.css';

const ROUTES = {
  progress: '/dashboard/student/progress',
  requirements: '/dashboard/student/requirements',
  attendance: '/dashboard/student/attendance',
  documentation: '/dashboard/student/daily-documentation',
  placement: '/dashboard/student/placement-status',
  announcements: '/dashboard/student/announcements',
  chat: '/dashboard/student/group-chat',
};

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

function formatDate(value, options = {}) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...options,
  });
}

function formatRelativeTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return formatDate(value, { month: 'short', day: 'numeric' });
}

function normalizeDateKey(value) {
  if (!value) return '';
  const normalized = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
}

function getScheduleDays(schedules) {
  return (schedules || [])
    .flatMap((schedule) =>
      String(schedule.attendance_dates || '')
        .split(',')
        .map((date) => normalizeDateKey(date))
        .filter(Boolean)
        .map((date) => ({
          date,
          batchId: schedule.teacher_batch_id,
          batchLabel: schedule.batch_label || 'My batch',
          supervisorName: [schedule.supervisor_first_name, schedule.supervisor_last_name]
            .filter(Boolean)
            .join(' '),
        })),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

function getAttentionItems({ requirements, dailyDocs, schedules, attendance }) {
  const items = [];
  const submission = requirements?.submission || {};
  const requirementProgress = Number(requirements?.progress || 0);
  const documents = requirements?.documents || [];
  const docs = dailyDocs?.docs || [];

  if (requirementProgress < 100) {
    const missingCount = Number(requirements?.missingDocuments?.length || 0);
    items.push({
      id: 'requirements',
      type: 'Requirements',
      title: missingCount
        ? `${missingCount} requirement${missingCount === 1 ? '' : 's'} to upload`
        : 'Finish adding your requirements',
      detail: `${requirementProgress}% complete · ${documents.length} document${documents.length === 1 ? '' : 's'} uploaded`,
      action: 'Complete',
      to: ROUTES.requirements,
      tone: 'urgent',
    });
  } else if (!['Pending Review', 'Under Review', 'Approved'].includes(submission.status) || !submission.submitted_at) {
    items.push({
      id: 'submit-requirements',
      type: 'Requirements',
      title: 'Submit your requirements',
      detail: `All required items are ready · ${submission.status || 'Not submitted'}`,
      action: 'Submit',
      to: ROUTES.requirements,
      tone: 'urgent',
    });
  } else if (submission.status === 'Needs Revision' || submission.status === 'Rejected') {
    items.push({
      id: 'revise-requirements',
      type: 'Requirements',
      title: `Check your coordinator's feedback: ${submission.status}`,
      detail: submission.coordinator_feedback || 'Please update your requirements.',
      action: 'View',
      to: ROUTES.requirements,
      tone: 'urgent',
    });
  }

  const pendingDocs = docs.filter(
    (doc) => ['pending', 'submitted'].includes(doc.status) || !['reviewed', 'graded'].includes(doc.status),
  );
  if (pendingDocs.length > 0) {
    const latest = pendingDocs[0];
    items.push({
      id: 'documentation',
      type: 'Documentation',
      title: `${pendingDocs.length} daily ${pendingDocs.length === 1 ? 'report' : 'reports'} waiting for review`,
      detail: latest.status ? `Status: ${latest.status}` : 'Open your daily documentation',
      action: 'View',
      to: ROUTES.documentation,
      tone: 'info',
    });
  }

  const attendanceIssue = attendance?.absences?.length > 0 || attendance?.lateArrivals?.length > 0 || attendance?.issues?.length > 0;
  if (attendanceIssue) {
    const issueCount =
      (attendance.absences?.length || 0) +
      (attendance.lateArrivals?.length || 0) +
      (attendance.issues?.length || 0);
    items.push({
      id: 'attendance-issue',
      type: 'Attendance',
      title: `${issueCount} attendance ${issueCount === 1 ? 'item' : 'items'} need attention`,
      detail: attendance.absences?.[0]?.reason || attendance.issues?.[0]?.message || 'Check your attendance record',
      action: 'View',
      to: ROUTES.attendance,
      tone: 'urgent',
    });
  }

  if (schedules?.length > 0 && !attendance?.today?.check_in_time && !attendance?.today?.check_out_time) {
    const nextSchedule = getScheduleDays(schedules).find(({ date }) => date >= normalizeDateKey(new Date().toISOString()));
    if (nextSchedule) {
      items.push({
        id: 'next-attendance',
        type: 'Attendance',
        title: nextSchedule.date === normalizeDateKey(new Date().toISOString())
          ? 'Remember to time in today'
          : `Get ready for immersion on ${formatDate(nextSchedule.date, { month: 'short', day: 'numeric' })}`,
        detail: nextSchedule.batchLabel,
        action: 'View schedule',
        to: ROUTES.attendance,
        tone: 'info',
      });
    }
  }

  return items.slice(0, 4);
}

function getActivities({ progress, requirements, attendanceRecords, dailyDocs }) {
  const records = attendanceRecords?.records || [];
  const docs = dailyDocs?.docs || [];
  const items = [];

  if (progress?.completed) {
    items.push({
      id: 'completed',
      icon: CheckCircle2,
      tone: 'success',
      title: 'Immersion finished',
      detail: 'All your requirements, daily documentation, and attendance are done.',
      time: progress.certificate?.created_at || requirements?.submission?.updated_at,
    });
  }

  if (records[0]) {
    items.push({
      id: `attendance-${records[0].id || records[0].date}`,
      icon: Clock3,
      tone: 'info',
      title: records[0].check_out_time ? 'Time out recorded' : 'Time in recorded',
      detail: records[0].check_out_time
        ? `Time in ${formatTime(records[0].check_in_time)} · Time out ${formatTime(records[0].check_out_time)}`
        : `Time in at ${formatTime(records[0].check_in_time)}`,
      time: records[0].check_out_time || records[0].check_in_time || records[0].date,
    });
  }

  if (docs[0]) {
    items.push({
      id: `documentation-${docs[0].id || docs[0].date}`,
      icon: FileText,
      tone: docs[0].status === 'graded' ? 'success' : 'warning',
      title: docs[0].status === 'graded' ? 'Daily documentation graded' : 'Daily documentation updated',
      detail: docs[0].teacher_score != null
        ? `Score: ${docs[0].teacher_score}/100`
        : `Status: ${docs[0].status || 'Submitted'}`,
      time: docs[0].updated_at || docs[0].created_at || docs[0].date,
    });
  }

  const submission = requirements?.submission || {};
  if (submission.status && !progress?.completed) {
    items.push({
      id: 'requirements-status',
      icon: ClipboardCheck,
      tone: submission.status === 'Approved' ? 'success' : 'info',
      title: 'Requirements updated',
      detail: submission.status,
      time: submission.updated_at || submission.submitted_at,
    });
  }

  return items
    .filter((item) => item.time)
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .slice(0, 4);
}

function LoadingCard() {
  return (
    <div className={styles.loadingCard} role="status">
      <span className={styles.loadingPulse} />
      <span>Loading your immersion overview...</span>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className={styles.errorState} role="alert">
      <AlertCircle size={20} />
      <span>{message}</span>
      <button type="button" onClick={onRetry}>
        <RefreshCw size={15} /> Try again
      </button>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, detail, to, tone = 'neutral', action = 'View' }) {
  return (
    <Link className={`${styles.metricCard} ${styles[`metric${tone}`]}`} to={to}>
      <div className={styles.metricIcon}><Icon size={19} strokeWidth={1.9} /></div>
      <div className={styles.metricCopy}>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
      <span className={styles.metricAction}>{action}<ArrowUpRight size={14} /></span>
    </Link>
  );
}

function AttentionItem({ item }) {
  return (
    <div className={styles.attentionItem}>
      <div className={`${styles.attentionIcon} ${styles[item.tone]}`}>
        {item.tone === 'urgent' ? <AlertCircle size={17} /> : <ChevronRight size={17} />}
      </div>
      <div className={styles.attentionCopy}>
        <span className={styles.attentionType}>{item.type}</span>
        <strong>{item.title}</strong>
        <p>{item.detail}</p>
      </div>
      <Link className={styles.actionLink} to={item.to}>{item.action}<ArrowRight size={14} /></Link>
    </div>
  );
}

function AnnouncementCard({ post }) {
  const content = post.content || post.title || 'Announcement';
  return (
    <div className={styles.announcementItem}>
      <div className={styles.announcementIcon}><Bell size={16} /></div>
      <div className={styles.announcementCopy}>
        <strong>{post.title || 'Announcement'}</strong>
        <p>{content.length > 130 ? `${content.slice(0, 130).trim()}...` : content}</p>
        <span>{formatRelativeTime(post.created_at || post.updated_at)}</span>
      </div>
    </div>
  );
}

function ActivityItem({ activity }) {
  const Icon = activity.icon;
  return (
    <div className={styles.activityItem}>
      <div className={`${styles.activityIcon} ${styles[activity.tone]}`}><Icon size={15} /></div>
      <div>
        <strong>{activity.title}</strong>
        <p>{activity.detail}</p>
        <span>{formatRelativeTime(activity.time)}</span>
      </div>
    </div>
  );
}

function ChatPreview({ latestMessage, unreadCount }) {
  const sender = [latestMessage?.first_name, latestMessage?.last_name].filter(Boolean).join(' ') || 'Batch chat';
  const content = latestMessage?.content || 'No messages yet. Open the chat to start the conversation.';
  return (
    <div className={styles.chatPreview}>
      <div className={styles.chatAvatar}><MessageCircle size={19} /></div>
      <div className={styles.chatCopy}>
        <div className={styles.chatHeader}><strong>{sender}</strong><span>{unreadCount > 0 ? `${unreadCount} unread` : 'Latest message'}</span></div>
        <p>{content.length > 100 ? `${content.slice(0, 100).trim()}...` : content}</p>
      </div>
      <Link className={styles.actionLink} to={ROUTES.chat}>Open<ArrowRight size={14} /></Link>
    </div>
  );
}

export default function Overview({ user }) {
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
  const progress = useMemo(() => dashboard?.progress || {}, [dashboard]);
  const requirements = useMemo(() => dashboard?.requirements || {}, [dashboard]);
  const attendance = useMemo(() => dashboard?.attendance || {}, [dashboard]);
  const schedules = useMemo(
    () => dashboard?.schedules?.schedules || dashboard?.schedules || [],
    [dashboard],
  );
  const attendanceRecords = useMemo(() => dashboard?.attendanceRecords?.records || [], [dashboard]);
  const dailyDocs = useMemo(() => dashboard?.dailyDocs?.docs || [], [dashboard]);
  const documentation = progress.documentation || {};
  const attendanceProgress = progress.attendance || {};
  const scheduledDays = getScheduleDays(schedules).length || Number(attendanceProgress.scheduled || attendanceProgress.required || 0);
  const attendedDays = Number(attendanceProgress.days || 0);
  const requirementsProgress = Number(requirements.progress || 0);
  const attendancePercent = scheduledDays
    ? Math.round((attendedDays / scheduledDays) * 100)
    : 0;
  const progressPercent = progress.completed
    ? 100
    : Math.round((
      (progress.requirements?.approved ? 1 : 0) +
      (documentation.graded ? 1 : 0) +
      (attendanceProgress.complete ? 1 : 0)
    ) / 3 * 100);
  const todayRecord = attendance.today;
  const todayStatus = todayRecord?.check_out_time
    ? 'Completed'
    : todayRecord?.check_in_time
      ? 'Checked in'
      : attendance.in_schedule
        ? 'Ready to time in'
        : 'Not scheduled today';
  const attentionItems = useMemo(
    () => getAttentionItems({ progress, requirements, dailyDocs, schedules, attendance }),
    [progress, requirements, dailyDocs, schedules, attendance],
  );
  const activities = useMemo(
    () => getActivities({ progress, requirements, attendanceRecords, dailyDocs }),
    [progress, requirements, attendanceRecords, dailyDocs],
  );

  const [announcements, setAnnouncements] = useState([]);
  const [announcementLoading, setAnnouncementLoading] = useState(false);
  const [announcementError, setAnnouncementError] = useState('');
  const [latestMessage, setLatestMessage] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    setAnnouncementLoading(true);
    setAnnouncementError('');
    getFeedPosts({ page: 1, limit: 3, sort: 'latest', type: 'announcement' })
      .then((data) => {
        if (!mounted) return;
        const posts = (data.posts || []).filter((post) => post.post_type === 'announcement');
        setAnnouncements(posts.slice(0, 3));
      })
      .catch((err) => {
        if (mounted) setAnnouncementError(err.message);
      })
      .finally(() => {
        if (mounted) setAnnouncementLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!window.EventSource) return undefined;
    const source = new window.EventSource(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/chat/unread`);
    let mounted = true;
    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (!mounted) return;
        setUnreadCount(Number(data.unreadCount || data.count || 0));
      } catch {
        // Keep the existing chat unread state when a message is malformed.
      }
    };
    source.addEventListener('chat:unread', handleMessage);
    return () => {
      mounted = false;
      source.removeEventListener('chat:unread', handleMessage);
      source.close();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const batch = schedules[0];
    if (!batch?.teacher_batch_id) return undefined;
    fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'}/chat/batch/${batch.teacher_batch_id}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => {
        if (!response.ok) throw new Error('Unable to load chat preview.');
        return response.json();
      })
      .then((data) => {
        if (!mounted) return;
        const messages = data.messages || [];
        setLatestMessage(messages[messages.length - 1] || null);
      })
      .catch(() => {
        if (mounted) setLatestMessage(null);
      });
    return () => { mounted = false; };
  }, [schedules, token]);

  return (
    <div className={styles.dashboard}>
      <section className={styles.greeting}>
        <div>
          <h1>
  {getGreeting()}, {firstName}! <span aria-hidden="true">👋</span>
</h1>
<p className={styles.greetingText}>
  Keep track of your requirements, attendance, and progress throughout your work immersion.
</p>
        </div>
      </section>

      {loading && <LoadingCard />}
      {!loading && error && <ErrorState message={error} onRetry={loadDashboard} />}

      {!loading && !error && dashboard && (
        <>
          <section className={styles.metricGrid} aria-label="Immersion overview">
            <MetricCard
              icon={TrendingUp}
              label="Immersion progress"
              value={`${progressPercent}%`}
              detail={progress.completed ? 'All tasks done' : `${progress.requirements?.status || 'In progress'}`}
              to={ROUTES.progress}
              tone="maroon"
              action="View"
            />
            <MetricCard
              icon={UserCheck}
              label="Attendance"
              value={`${attendancePercent}%`}
              detail={`${attendedDays}/${scheduledDays} days attended`}
              to={ROUTES.attendance}
              tone={attendanceProgress.complete ? 'green' : 'neutral'}
              action="View"
            />
            <MetricCard
              icon={ClipboardCheck}
              label="Requirements"
              value={`${requirementsProgress}%`}
              detail={requirements.submission?.status || 'Not submitted'}
              to={ROUTES.requirements}
              tone={requirementsProgress >= 100 ? 'green' : 'amber'}
              action={requirementsProgress < 100 ? 'Complete' : 'View'}
            />
            <MetricCard
              icon={MapPin}
              label="Placement status"
              value={requirements.submission?.status ? 'Active' : 'Not started'}
              detail={requirements.submission?.status || 'Waiting for requirements'}
              to={ROUTES.placement}
              tone="neutral"
              action="View"
            />
          </section>

          <div className={styles.contentGrid}>
            <div className={styles.mainColumn}>
              {attentionItems.length > 0 && (
                <section className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div><p className={styles.cardEyebrow}>TAKE ACTION</p><h2>Needs Your Attention</h2></div>
                    {attentionItems.length > 1 && <span className={styles.attentionCount}>{attentionItems.length} items</span>}
                  </div>
                  <div className={styles.attentionList}>
                    {attentionItems.map((item) => <AttentionItem key={item.id} item={item} />)}
                  </div>
                </section>
              )}

              <section className={styles.card}>
                <div className={styles.cardHeader}>
                  <div><p className={styles.cardEyebrow}>STAY UPDATED</p><h2>Announcements</h2></div>
                  <Link className={styles.cardLink} to={ROUTES.announcements}>View all<ArrowUpRight size={14} /></Link>
                </div>
                {announcementLoading && <div className={styles.miniLoading}>Loading announcements...</div>}
                {!announcementLoading && announcementError && <p className={styles.inlineMessage}>{announcementError}</p>}
                {!announcementLoading && !announcementError && announcements.length === 0 && <div className={styles.emptyState}><Bell size={22} /><p>No announcements yet. Check back for updates from your coordinator.</p></div>}
                {!announcementLoading && !announcementError && announcements.length > 0 && <div className={styles.announcementList}>{announcements.map((post) => <AnnouncementCard key={post.id} post={post} />)}</div>}
              </section>

              <section className={styles.card}>
                <div className={styles.cardHeader}>
                  <div><p className={styles.cardEyebrow}>LATEST UPDATES</p><h2>Recent Activity</h2></div>
                  <Link className={styles.cardLink} to={ROUTES.progress}>View all<ArrowUpRight size={14} /></Link>
                </div>
                {activities.length > 0 ? <div className={styles.activityList}>{activities.map((activity) => <ActivityItem key={activity.id} activity={activity} />)}</div> : <div className={styles.emptyState}><Clock3 size={22} /><p>Your latest activity will show here.</p></div>}
              </section>
            </div>

            <aside className={styles.sideColumn}>
              <section className={styles.card}>
                <div className={styles.cardHeader}><div><p className={styles.cardEyebrow}>BATCH COMMUNITY</p><h2>Group Chat</h2></div><span className={styles.chatUnread}>{unreadCount > 0 ? `${unreadCount > 99 ? '99+' : unreadCount} new` : 'Live'}</span></div>
                <ChatPreview latestMessage={latestMessage} unreadCount={unreadCount} />
                <Link className={styles.cardFooterLink} to={ROUTES.chat}>Open Chat<ArrowRight size={14} /></Link>
              </section>

              <section className={styles.card}>
                <div className={styles.cardHeader}><div><p className={styles.cardEyebrow}>TODAY</p><h2>Today's Attendance</h2></div><span className={`${styles.snapshotStatus} ${todayRecord?.check_out_time ? styles.snapshotDone : styles.snapshotPending}`}>{todayStatus}</span></div>
                <div className={styles.snapshotGrid}><div><span>Time in</span><strong>{formatTime(todayRecord?.check_in_time)}</strong><small>{todayRecord?.check_in_time ? 'Recorded' : 'Not recorded'}</small></div><div><span>Time out</span><strong>{formatTime(todayRecord?.check_out_time)}</strong><small>{todayRecord?.check_out_time ? 'Completed' : 'Pending'}</small></div></div>
                <Link className={styles.cardFooterLink} to={ROUTES.attendance}>View attendance<ArrowRight size={14} /></Link>
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}