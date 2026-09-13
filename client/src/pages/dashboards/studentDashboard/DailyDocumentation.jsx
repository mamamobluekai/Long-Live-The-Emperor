import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../../../context/AuthContext';
import {
  getMySchedule,
  getMyAttendanceRecords,
} from '../../../api/attendanceApi';
import {
  uploadMyFile,
  submitDailyDoc,
  getMyDailyDocs,
} from '../../../api/fileApi';
import styles from './DailyDocumentation.module.css';

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

function todayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function DailyDocumentation() {
  const { token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scheduleDays, setScheduleDays] = useState([]);
  const [attendanceMap, setAttendanceMap] = useState({});
  const [docMap, setDocMap] = useState({});

  const [showModal, setShowModal] = useState(false);
  const [activeDay, setActiveDay] = useState(null);
  const [docFile, setDocFile] = useState(null);
  const [reasoning, setReasoning] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [modalError, setModalError] = useState('');

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
          ? String(s.attendance_dates).split(',').map((d) => normalizeDateKey(d)).filter(Boolean)
          : [];
        dates.forEach((date, idx) => {
          days.push({
            key: `${s.id}-${date}`,
            batchId: s.teacher_batch_id,
            batchLabel: s.batch_label,
            supervisorName: [s.supervisor_first_name, s.supervisor_last_name].filter(Boolean).join(' '),
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
      setError(err.message || 'Failed to load daily documentation.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const today = useMemo(() => todayKey(), []);

  function openModal(day) {
    setActiveDay(day);
    setDocFile(null);
    setReasoning('');
    setModalError('');
    setShowModal(true);
  }

  function closeModal() {
    if (submitting || uploading) return;
    setShowModal(false);
    setActiveDay(null);
    setDocFile(null);
    setReasoning('');
    setModalError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!activeDay) return;
    setModalError('');

    if (!docFile && !reasoning.trim()) {
      setModalError('Please attach a file or enter a description.');
      return;
    }

    setSubmitting(true);
    try {
      let fileId = null;
      if (docFile) {
        setUploading(true);
        const uploadRes = await uploadMyFile(docFile);
        setUploading(false);
        fileId = uploadRes?.id || uploadRes?.file?.id || null;
      }
      await submitDailyDoc({
        date: normalizeDateKey(activeDay.date),
        reasoning: reasoning.trim(),
        fileId,
        batchId: activeDay.batchId,
        day_number: activeDay.dayNumber,
      });
      await loadAll();
      closeModal();
    } catch (err) {
      setUploading(false);
      setModalError(err.message || 'Failed to submit documentation.');
    } finally {
      setSubmitting(false);
    }
  }

  function docStatusLabel(doc) {
    if (!doc) return 'Not Submitted';
    switch (doc.status) {
      case 'pending':
        return 'Pending Review';
      case 'submitted':
        return 'Submitted';
      case 'reviewed':
        return 'Reviewed';
      case 'graded':
        return doc.teacher_score != null ? `Graded: ${doc.teacher_score}/100` : 'Graded';
      default:
        return doc.status;
    }
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>Daily Documentation</h1>
        <p className={styles.subtitle}>Loading your daily documentation…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>Daily Documentation</h1>
        <p className={styles.error}>{error}</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Daily Documentation</h1>
      <p className={styles.subtitle}>
        Upload your daily work immersion documentation. You must be present (Time In or Time Out) for the day to upload.
      </p>

      {scheduleDays.length === 0 ? (
        <div className={styles.empty}>
          <p>No scheduled immersion days yet. Your teacher/coordinator will set the schedule.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {scheduleDays.map((day) => {
            const key = normalizeDateKey(day.date);
            const rec = attendanceMap[key];
            const doc = docMap[key];
            const inTime = rec?.check_in_time ? formatTime(rec.check_in_time) : null;
            const outTime = rec?.check_out_time ? formatTime(rec.check_out_time) : null;
            const isToday = key === today;
            const isFuture = key > today;
            const docLabel = docStatusLabel(doc);
            // Upload is allowed for any scheduled (non-future) day where the
            // student was present (at least Time In OR Time Out). Days where
            // the student was absent (neither recorded) or future days are locked.
            // Finalized (graded/rejected) docs also block the action.
            const isPresent = !!inTime || !!outTime;
            const editable = !isFuture && isPresent && (!doc || doc.status === 'pending' || doc.status === 'submitted');
            const lockedReason = isFuture
              ? 'Not yet scheduled'
              : !isPresent
                ? 'Attendance required to upload'
                : '';

            return (
              <div key={day.key} className={`${styles.item} ${isToday ? styles.itemToday : ''}`}>
                <div className={styles.itemMain}>
                  <div className={styles.itemHeader}>
                    <span className={styles.dayNumber}>Day {day.dayNumber}</span>
                    <span className={styles.itemDate}>{formatDateLabel(day.date)}</span>
                  </div>
                  <div className={styles.itemMeta}>
                    {day.batchLabel ? `${day.batchLabel}` : 'Batch'}
                    {day.supervisorName ? ` · ${day.supervisorName}` : ''}
                  </div>
                  <div className={styles.itemAttendance}>
                    <span className={inTime ? styles.attDone : styles.attPending}>
                      Time In: {inTime || '—'}
                    </span>
                    <span className={outTime ? styles.attDone : styles.attPending}>
                      Time Out: {outTime || '—'}
                    </span>
                  </div>
                  <div className={styles.itemDoc}>
                    Documentation: <strong>{docLabel}</strong>
                  </div>
                </div>
                <div className={styles.itemActions}>
                  {editable ? (
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      onClick={() => openModal(day)}
                    >
                      {doc ? 'Already Submitted · Edit' : 'Upload Documentation'}
                    </button>
                  ) : isFuture || !isPresent ? (
                    <div className={styles.locked}>
                      <span className={styles.lockedBadge}>Locked</span>
                      <span className={styles.lockedReason}>{lockedReason}</span>
                    </div>
                  ) : (
                    <button type="button" className={styles.secondaryBtn} disabled>
                      {docLabel}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && activeDay && (
        <div className={styles.modalBackdrop} onClick={closeModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>
                Day {activeDay.dayNumber} — {formatDateLabel(activeDay.date)}
              </h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={closeModal}
                disabled={submitting || uploading}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit} className={styles.modalBody}>
              <div className={styles.modalInfo}>
                Time In: {formatTime(attendanceMap[normalizeDateKey(activeDay.date)]?.check_in_time) || '—'} ·
                Time Out: {formatTime(attendanceMap[normalizeDateKey(activeDay.date)]?.check_out_time) || '—'}
              </div>

              {modalError && <div className={styles.error}>{modalError}</div>}

              <label className={styles.label}>
                Description / Reflection
                <textarea
                  rows={5}
                  value={reasoning}
                  onChange={(e) => setReasoning(e.target.value)}
                  placeholder="Describe the activities, what you learned, and any challenges faced today."
                />
              </label>

              <label className={styles.label}>
                Attach File (optional)
                <input
                  type="file"
                  onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                />
              </label>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={closeModal}
                  disabled={submitting || uploading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={submitting || uploading}
                >
                  {uploading ? 'Uploading…' : submitting ? 'Submitting…' : 'Submit Documentation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default DailyDocumentation;
