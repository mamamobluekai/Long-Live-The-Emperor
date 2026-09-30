import { useCallback, useEffect, useState, useMemo } from 'react';
import { getSupervisorBatches, getSupervisorBatchAttendance, reviewSupervisorAttendanceAppeal } from '../../../api/supervisorApi';
import Feedback from '../../../components/Feedback';
import AppealDrawer from './AppealDrawer';
import styles from './SupervisorAttendance.module.css';

function formatTime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// A day with no attendance record was never taken, so it is "not started"
// rather than "absent" — the student cannot be marked absent for a day
// that attendance has not covered yet.
function dayStatus(day) {
  if (!day || day.recorded === false) return 'notstarted';
  if (day.check_in_time && day.check_out_time) return 'complete';
  if (day.check_in_time) return 'in';
  if (day.status === 'absent' || day.status === 'excused') return 'absent';
  return 'notstarted';
}

const APPEAL_STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

function SupervisorAttendance() {
  const [batches, setBatches] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [attendance, setAttendance] = useState({ students: [], days: [], batch_label: null });
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [loadingAtt, setLoadingAtt] = useState(false);
  const [error, setError] = useState('');
  const [selectedDay, setSelectedDay] = useState(1);
  const [activeAppeal, setActiveAppeal] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState('');

  const openAppeal = (appeal, student, day, label) => {
    setActiveAppeal({
      id: appeal.id,
      label,
      studentName: `${student.first_name} ${student.last_name}`,
      studentNumber: student.student_number,
      gradeLevel: student.grade_level,
      trackStrand: student.track_strand,
      day,
      dayDate: student.days?.[String(day)]?.date || null,
      excuse: appeal.excuse,
      status: appeal.status,
      teacherComment: appeal.teacher_comment,
      fileUrl: appeal.file_url,
      fileName: appeal.file_name,
      submittedAt: appeal.created_at,
      reviewedAt: appeal.reviewed_at,
    });
    setReviewError('');
  };

  // Approving writes the appeal to the attendance record server-side, so reload
  // afterwards rather than guessing at the new status / check-in state.
  const handleReview = async (status, comment) => {
    if (!activeAppeal?.id || reviewing) return;
    setReviewing(true);
    setReviewError('');
    try {
      await reviewSupervisorAttendanceAppeal(activeAppeal.id, { status, comment });
      setActiveAppeal((current) => (current
        ? { ...current, status, teacherComment: comment || current.teacherComment, reviewedAt: new Date().toISOString() }
        : current));
      await loadAttendance();
    } catch (err) {
      setReviewError(err.message || 'Failed to save the decision.');
    } finally {
      setReviewing(false);
    }
  };

  const loadBatches = async () => {
    setLoadingBatches(true);
    setError('');
    try {
      const res = await getSupervisorBatches();
      const list = res.batches || [];
      setBatches(list);
      if (list.length > 0) setSelectedId(list[0].request_id);
      else setSelectedId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingBatches(false);
    }
  };

  useEffect(() => {
    loadBatches();
  }, []);

  const loadAttendance = useCallback(async () => {
    if (!selectedId) return;
    setLoadingAtt(true);
    setError('');
    try {
      const res = await getSupervisorBatchAttendance(selectedId);
      const data = res || { students: [], days: [], dates: [], batch_label: null };
      setAttendance(data);
      setSelectedDay(data.days?.[0] ?? 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingAtt(false);
    }
  }, [selectedId]);

  useEffect(() => {
    if (selectedId) loadAttendance();
  }, [selectedId, loadAttendance]);

  const students = useMemo(() => attendance.students || [], [attendance]);
  const days = useMemo(() => attendance.days || [], [attendance]);
  const dates = useMemo(() => attendance.dates || [], [attendance]);

  const dateForDay = (day) => {
    const index = days.indexOf(day);
    return index === -1 ? '' : dates[index] || '';
  };

  const formatDayLabel = (day) => {
    const value = dateForDay(day);
    if (!value) return `Day ${day}`;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return `Day ${day}`;
    return `Day ${day} · ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  // The list shows one immersion day at a time, picked from the dropdown.
  const dayRows = useMemo(() => {
    if (selectedDay === null) return [];
    return students.map((student) => ({
      student,
      record: student.days?.[String(selectedDay)] || null,
    }));
  }, [students, selectedDay]);

  const daySummary = useMemo(() => {
    const present = dayRows.filter((row) => {
      const status = dayStatus(row.record);
      return status === 'complete' || status === 'in';
    }).length;
    const absent = dayRows.filter((row) => dayStatus(row.record) === 'absent').length;
    const notStarted = dayRows.length - present - absent;
    return { present, absent, notStarted, total: dayRows.length };
  }, [dayRows]);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h2>Student Attendance</h2>
        <p>Daily attendance for the students assigned to your batches. Days are counted from each student's first attendance.</p>
      </div>

      {error && <Feedback type="error" message={error} />}

      {loadingBatches ? (
        <p className={styles.loading}>Loading batches...</p>
      ) : batches.length === 0 ? (
        <p className={styles.empty}>No approved deployment batches assigned to you yet.</p>
      ) : loadingAtt ? (
        <p className={styles.loading}>Loading attendance...</p>
      ) : students.length === 0 ? (
        <p className={styles.empty}>No attendance records for this batch yet.</p>
      ) : (
        <section className={styles.dayCard}>
          <div className={styles.dayToolbar}>
            <div className={styles.dayPicker}>
              <label htmlFor="attendance-day">Immersion day</label>
              <select
                id="attendance-day"
                className={styles.daySelect}
                value={selectedDay ?? ''}
                onChange={(event) => setSelectedDay(Number(event.target.value))}
              >
                {days.map((day) => (
                  <option key={day} value={day}>
                    {formatDayLabel(day)}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.dayStats}>
              <span className={styles.dayStatGood}>{daySummary.present} present</span>
              <span className={styles.dayStatBad}>{daySummary.absent} absent</span>
              {daySummary.notStarted > 0 && (
                <span className={styles.dayStatMuted}>{daySummary.notStarted} not started</span>
              )}
              <span className={styles.dayStatTotal}>{daySummary.total} students</span>
            </div>
          </div>

          {dayRows.length === 0 ? (
            <p className={styles.empty}>Select an immersion day to see the attendance list.</p>
          ) : (
            <ul className={styles.dayList}>
              {dayRows.map(({ student, record }) => {
                const status = dayStatus(record);
                return (
                  <li key={student.student_id} className={styles.dayListItem}>
                    <span className={styles.dayListAvatar}>
                      {`${student.first_name?.charAt(0) || ''}${student.last_name?.charAt(0) || ''}`.toUpperCase()}
                    </span>
                    <span className={styles.dayListName}>
                      <strong>{student.first_name} {student.last_name}</strong>
                      <span>
                        {student.student_number || '-'}
                        {[student.grade_level, student.track_strand].filter(Boolean).join(' - ')}
                      </span>
                    </span>
                    <span className={styles.dayListStatus}>
                      <span className={`${styles.pill} ${styles['pill_' + status]}`}>
                        {status === 'complete'
                          ? 'Present'
                          : status === 'in'
                            ? 'In'
                            : status === 'notstarted'
                              ? 'Not started'
                              : 'Absent'}
                      </span>
                      {record && (record.check_in_time || record.check_out_time) && (
                        <span className={styles.timeRow}>
                          {formatTime(record.check_in_time) || '-'} to {formatTime(record.check_out_time) || '-'}
                        </span>
                      )}
                      {record?.appeal_time_in && (
                        <button
                          type="button"
                          className={`${styles.appealButton} ${styles['appealBtn_' + (record.appeal_time_in.status || 'pending')]}`}
                          onClick={() => openAppeal(record.appeal_time_in, student, selectedDay, 'Time In')}
                          title={`Time In appeal — ${APPEAL_STATUS_LABELS[record.appeal_time_in.status] || 'Pending'}`}
                        >
                          <span className={styles.appealDot} aria-hidden="true" />
                          Time In Appeal
                          <span className={styles.appealButtonStatus}>
                            {APPEAL_STATUS_LABELS[record.appeal_time_in.status] || 'Pending'}
                          </span>
                        </button>
                      )}
                      {record?.appeal_time_out && (
                        <button
                          type="button"
                          className={`${styles.appealButton} ${styles['appealBtn_' + (record.appeal_time_out.status || 'pending')]}`}
                          onClick={() => openAppeal(record.appeal_time_out, student, selectedDay, 'Time Out')}
                          title={`Time Out appeal — ${APPEAL_STATUS_LABELS[record.appeal_time_out.status] || 'Pending'}`}
                        >
                          <span className={styles.appealDot} aria-hidden="true" />
                          Time Out Appeal
                          <span className={styles.appealButtonStatus}>
                            {APPEAL_STATUS_LABELS[record.appeal_time_out.status] || 'Pending'}
                          </span>
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {activeAppeal && (
        <AppealDrawer
          appeal={activeAppeal}
          onClose={() => setActiveAppeal(null)}
          onReview={handleReview}
          reviewing={reviewing}
          reviewError={reviewError}
        />
      )}
    </div>
  );
}

export default SupervisorAttendance;
