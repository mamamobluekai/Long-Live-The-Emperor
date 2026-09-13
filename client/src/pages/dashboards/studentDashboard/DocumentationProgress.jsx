import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { getMySchedule, getMyAttendanceRecords } from '../../../api/attendanceApi';
import { getMyDailyDocs } from '../../../api/fileApi';
import styles from './DocumentationProgress.module.css';

const TOTAL_EXPECTED_DAYS = 10;

function normalizeDateKey(value) {
  if (!value) return '';
  const str = String(value);
  if (str.includes('T')) return str.substring(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  return str.slice(0, 10);
}

function formatDateLabel(value) {
  const key = normalizeDateKey(value);
  if (!key) return '';
  const d = new Date(`${key}T00:00:00`);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function DocumentationProgress() {
  const { token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scheduleDays, setScheduleDays] = useState([]);
  const [attendanceMap, setAttendanceMap] = useState({});
  const [docMap, setDocMap] = useState({});

  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const [scheduleRes, attendanceRes, docsRes] = await Promise.all([
        getMySchedule(token),
        getMyAttendanceRecords(token),
        getMyDailyDocs({}),
      ]);

      const schedules = scheduleRes?.schedules || [];
      const attendance = {};
      (attendanceRes?.records || []).forEach((r) => {
        attendance[normalizeDateKey(r.date)] = r;
      });

      const docs = {};
      (docsRes?.docs || []).forEach((d) => {
        docs[normalizeDateKey(d.date)] = d;
      });

      const days = [];
      schedules.forEach((s) => {
        const dates = s.attendance_dates
          ? String(s.attendance_dates)
              .split(',')
              .map((d) => normalizeDateKey(d))
              .filter(Boolean)
          : [];
        dates.forEach((date, idx) => {
          days.push({
            key: `${s.id}-${date}`,
            batchLabel: s.batch_label,
            supervisorName: [s.supervisor_first_name, s.supervisor_last_name]
              .filter(Boolean)
              .join(' '),
            date,
            dayNumber: idx + 1,
          });
        });
      });

      days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

      setScheduleDays(days);
      setAttendanceMap(attendance);
      setDocMap(docs);
    } catch (err) {
      setError(err.message || 'Failed to load documentation progress.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const entries = useMemo(() => {
    const list = [];
    scheduleDays.forEach((day) => {
      list.push({
        dayNumber: day.dayNumber,
        date: day.date,
        dateLabel: formatDateLabel(day.date),
        doc: docMap[day.date] || null,
        batchLabel: day.batchLabel,
        supervisorName: day.supervisorName,
        inTime: attendanceMap[day.date]?.check_in_time || null,
        outTime: attendanceMap[day.date]?.check_out_time || null,
      });
    });

    const maxDay = list.length ? Math.max(...list.map((e) => e.dayNumber)) : 0;
    for (let i = maxDay + 1; i <= TOTAL_EXPECTED_DAYS; i++) {
      list.push({
        dayNumber: i,
        date: null,
        dateLabel: '—',
        doc: null,
        batchLabel: '',
        supervisorName: '',
        inTime: null,
        outTime: null,
      });
    }
    return list;
  }, [scheduleDays, docMap, attendanceMap]);

  const progress = useMemo(() => {
    const submitted = entries.filter(
      (e) => e.doc && ['submitted', 'reviewed', 'graded'].includes(e.doc.status)
    ).length;
    const graded = entries.filter(
      (e) => e.doc && ['reviewed', 'graded'].includes(e.doc.status)
    ).length;
    const hasScheduled = entries.filter((e) => e.date).length;
    const totalDisplay = hasScheduled || TOTAL_EXPECTED_DAYS;
    // "Completed" only when every scheduled day has a graded doc entry.
    const completed = hasScheduled > 0 && graded >= hasScheduled;
    return { submitted, graded, total: totalDisplay, completed };
  }, [entries]);

  function getDocStatusInfo(doc) {
    if (!doc) return { label: 'Not Submitted', badgeClass: 'badgeNotSubmitted' };
    switch (doc.status) {
      case 'pending':
        return { label: 'Pending Review', badgeClass: 'badgePending' };
      case 'submitted':
        return { label: 'Submitted', badgeClass: 'badgeSubmitted' };
      case 'reviewed':
        return { label: 'Reviewed', badgeClass: 'badgeReviewed' };
      case 'graded':
        return {
          label:
            doc.teacher_score != null
              ? `Graded: ${doc.teacher_score}/100`
              : 'Graded',
          badgeClass: 'badgeGraded',
        };
      default:
        return { label: doc.status || 'Unknown', badgeClass: 'badgeNotSubmitted' };
    }
  }

  function getDayCardClass(entry) {
    const { doc } = entry;
    if (!doc && !entry.date) return `${styles.dayCard} ${styles.empty}`;
    if (doc && ['reviewed', 'graded'].includes(doc.status)) return `${styles.dayCard} ${styles.done}`;
    if (doc && doc.status === 'submitted') return `${styles.dayCard} ${styles.submitted}`;
    if (doc && doc.status === 'pending') return `${styles.dayCard} ${styles.pending}`;
    if (doc) return `${styles.dayCard} ${styles.pending}`;
    return `${styles.dayCard} ${styles.empty}`;
  }

  function getDayNumberClass(entry) {
    const { doc } = entry;
    if (!doc && !entry.date) return `${styles.dayNumber} ${styles.empty}`;
    if (doc && ['reviewed', 'graded'].includes(doc.status)) return `${styles.dayNumber} ${styles.done}`;
    if (doc && doc.status === 'submitted') return `${styles.dayNumber} ${styles.submitted}`;
    if (doc) return `${styles.dayNumber} ${styles.pending}`;
    return `${styles.dayNumber} ${styles.empty}`;
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.pageHeader}>
          <h2>Documentation Progress</h2>
          <p>Track your daily documentation submissions and grading status.</p>
        </div>
        <p className={styles.loading}>Loading your documentation progress…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.pageHeader}>
          <h2>Documentation Progress</h2>
          <p>Track your daily documentation submissions and grading status.</p>
        </div>
        <div className={styles.error}>{error}</div>
        <button className={styles.primaryBtn} onClick={loadAll}>
          Retry
        </button>
      </div>
    );
  }

  const overallCompleted = progress.completed;
  const overallBadgeClass = overallCompleted ? styles.completed : styles.inProgress;
  const overallBadgeText = overallCompleted ? 'Completed' : 'In Progress';
  const overallBadgeDotClass = overallCompleted ? styles.completed : styles.inProgress;
  const progressPercent = progress.total > 0 ? Math.round((progress.graded / progress.total) * 100) : 0;
  const progressBarClass = overallCompleted ? styles.completed : styles.inProgress;

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h2>Documentation Progress</h2>
        <p>
          Daily documentation completion across all {progress.total} immersion days.
          Once all days are graded, your documentation is marked as completed.
        </p>
      </div>

      {/* Overall status card */}
      <div className={`${styles.statusCard} ${overallBadgeClass}`}>
        <div className={styles.statusHeader}>
          <h3 className={styles.statusTitle}>Documentation Status</h3>
          <span
            className={`${styles.statusBadge} ${
              overallBadgeDotClass === styles.completed
                ? styles.completed
                : styles.inProgress
            }`}
          >
            <span
              className={`${styles.statusBadgeDot} ${
                overallBadgeDotClass === styles.completed ? styles.completed : styles.inProgress
              }`}
            />
            {overallBadgeText}
          </span>
        </div>

        <div className={styles.progressScore}>
          <span className={styles.scoreText}>
            {progress.graded}/{progress.total}
          </span>
          <span className={styles.scoreSub}>
            {progress.graded} graded · {progress.submitted} submitted
          </span>
        </div>

        <div className={styles.progressBarWrap}>
          <div className={styles.progressBar}>
            <div
              className={`${styles.progressBarFill} ${progressBarClass}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Days list */}
      <div className={styles.daysGrid}>
        {entries.map((entry) => {
          const { label, badgeClass } = getDocStatusInfo(entry.doc);
          return (
            <div key={entry.dayNumber} className={getDayCardClass(entry)}>
              <div className={getDayNumberClass(entry)}>Day {entry.dayNumber}</div>
              <div className={styles.dayBody}>
                <div className={styles.dayDate}>
                  {entry.dateLabel}
                  {entry.batchLabel ? ` · ${entry.batchLabel}` : ''}
                </div>
                {entry.date && (
                  <div className={styles.dayMeta}>
                    {entry.inTime ? `Time In: ${formatTime(entry.inTime)}` : 'Time In: —'}
                    {entry.outTime ? ` · Time Out: ${formatTime(entry.outTime)}` : ' · Time Out: —'}
                  </div>
                )}
                <div className={styles.dayDocStatus}>
                  <span className={`${styles.docBadge} ${styles[badgeClass]}`}>{label}</span>
                </div>
                {entry.doc && (
                  <>
                    {entry.doc.teacher_score != null && (
                      <div className={styles.dayScore}>Score: {entry.doc.teacher_score}/100</div>
                    )}
                    {entry.doc.teacher_feedback && (
                      <div className={styles.dayFeedback}>{entry.doc.teacher_feedback}</div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => window.open('/dashboard/student/daily-documentation', '_self')}
        >
          Upload Daily Documentation
        </button>
      </div>

      {scheduleDays.length === 0 && entries.length === 0 && !loading && (
        <div className={styles.info}>
          No scheduled immersion days yet. Your teacher or coordinator will set the
          schedule, and your documentation entries will appear here.
        </div>
      )}
    </div>
  );
}

export default DocumentationProgress;
