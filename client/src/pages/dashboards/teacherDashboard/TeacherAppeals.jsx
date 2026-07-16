import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useTeacherBatch } from '../../../hooks/useTeacherBatch';
import { getBatchAppeals, reviewAppeal } from '../../../api/attendanceApi';
import styles from './TeacherAppeals.module.css';

function TeacherAppeals() {
  const { token } = useAuth();
  const { batchId: selectedBatchId, batchLabel } = useTeacherBatch();
  const [filter, setFilter] = useState('pending');
  const [appeals, setAppeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState(null);
  const [comment, setComment] = useState('');
  const [notice, setNotice] = useState(null);

  const flash = (type, text) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 4000);
  };

  const loadAppeals = useCallback(async () => {
    if (!selectedBatchId) return;
    setLoading(true);
    try {
      const data = await getBatchAppeals(selectedBatchId, filter === 'all' ? null : filter, token);
      setAppeals(data.appeals || []);
    } catch {
      flash('error', 'Failed to load appeals.');
    } finally {
      setLoading(false);
    }
  }, [selectedBatchId, filter, token]);

  useEffect(() => { loadAppeals(); }, [loadAppeals]);

  const submitReview = async (appealId, status) => {
    setReviewingId(appealId);
    try {
      await reviewAppeal(appealId, { status, comment: comment || null }, token);
      flash('success', `Appeal ${status}.`);
      setComment('');
      loadAppeals();
    } catch (err) {
      flash('error', err.response?.data?.message || 'Review failed.');
    } finally {
      setReviewingId(null);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Attendance Appeals</h2>
          {batchLabel && <p className={styles.batchTag}>Batch: {batchLabel}</p>}
        </div>
      </div>

      {notice && <div className={`${styles.notice} ${styles['notice_' + notice.type]}`}>{notice.text}</div>}

      <div className={styles.filterRow}>
        {['pending', 'approved', 'rejected', 'all'].map((f) => (
          <button
            key={f}
            className={filter === f ? `${styles.filterBtn} ${styles.filterActive}` : styles.filterBtn}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading && <p className={styles.info}>Loading…</p>}

      <ul className={styles.list}>
        {!loading && appeals.length === 0 && <li className={styles.empty}>No {filter} appeals.</li>}
        {appeals.map((a) => (
          <li key={a.id} className={styles.item}>
            <div className={styles.itemTop}>
              <div>
                <strong>{a.first_name} {a.last_name}</strong>
                <span className={styles.meta}> · {a.student_number || '—'} · {a.attendance_type === 'time_in' ? 'Time In' : 'Time Out'}</span>
              </div>
              <span className={`${styles.badge} ${styles['badge_' + a.status]}`}>{a.status}</span>
            </div>
            <p className={styles.excuse}>{a.excuse}</p>
            {a.file_url && <a className={styles.fileLink} href={a.file_url} target="_blank" rel="noreferrer">View attachment</a>}
            {a.teacher_comment && <p className={styles.comment}>Your comment: {a.teacher_comment}</p>}
            {a.status === 'pending' && (
              <div className={styles.reviewBox}>
                <textarea
                  className={styles.commentInput}
                  placeholder="Leave a comment (optional)…"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                />
                <div className={styles.reviewActions}>
                  <button className={styles.approveBtn} disabled={reviewingId === a.id} onClick={() => submitReview(a.id, 'approved')}>
                    Approve
                  </button>
                  <button className={styles.rejectBtn} disabled={reviewingId === a.id} onClick={() => submitReview(a.id, 'rejected')}>
                    Reject
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default TeacherAppeals;
