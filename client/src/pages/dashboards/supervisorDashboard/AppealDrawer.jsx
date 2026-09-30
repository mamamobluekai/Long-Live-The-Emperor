// Side drawer showing a student's time in / time out attendance appeal:
// the reason they gave, when it was filed, and its review status.
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import styles from './AppealDrawer.module.css';

const STATUS_LABELS = {
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
};

function formatDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateOnly(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function AppealDrawer({ appeal, onClose, onReview, reviewing = false, reviewError = '' }) {
  const [comment, setComment] = useState('');

  // Reset the comment box whenever a different appeal is opened.
  useEffect(() => {
    setComment('');
  }, [appeal?.id]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (!appeal) return null;

  const statusKey = appeal.status || 'pending';

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="appeal-drawer-title">
        <div className={styles.header}>
          <div>
            <span className={styles.eyebrow}>{appeal.label} Appeal</span>
            <h2 id="appeal-drawer-title">{appeal.studentName}</h2>
            <p>
              {appeal.studentNumber || 'No student number'}
              {[appeal.gradeLevel, appeal.trackStrand].filter(Boolean).join(' - ')}
              {appeal.day ? ` · Day ${appeal.day}` : ''}
              {appeal.dayDate ? ` · ${formatDateOnly(appeal.dayDate)}` : ''}
            </p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.statusRow}>
            <span className={`${styles.statusPill} ${styles['status_' + statusKey]}`}>
              {STATUS_LABELS[statusKey] || statusKey}
            </span>
            {formatDateTime(appeal.submittedAt) && (
              <span className={styles.submittedAt}>Filed {formatDateTime(appeal.submittedAt)}</span>
            )}
          </div>

          <dl className={styles.metaList}>
            <div className={styles.metaRow}>
              <dt>Appeal type</dt>
              <dd>{appeal.label}</dd>
            </div>
            <div className={styles.metaRow}>
              <dt>Day appealed</dt>
              <dd>
                {appeal.day ? `Day ${appeal.day}` : '—'}
                {appeal.dayDate ? ` · ${formatDateOnly(appeal.dayDate)}` : ''}
              </dd>
            </div>
            {formatDateTime(appeal.reviewedAt) && (
              <div className={styles.metaRow}>
                <dt>Reviewed</dt>
                <dd>{formatDateTime(appeal.reviewedAt)}</dd>
              </div>
            )}
          </dl>

          <section className={styles.section}>
            <h3>Reason for absence</h3>
            <p className={styles.excuse}>{appeal.excuse || 'No reason provided.'}</p>
            {appeal.fileUrl && (
              <a className={styles.fileLink} href={appeal.fileUrl} target="_blank" rel="noreferrer">
                {appeal.fileName || 'View attached file'}
              </a>
            )}
          </section>

          {appeal.teacherComment && (
            <section className={styles.section}>
              <h3>Reviewer comment</h3>
              <p className={styles.excuse}>{appeal.teacherComment}</p>
            </section>
          )}

          {onReview && (
            <section className={styles.section}>
              <h3>Decision</h3>

              {statusKey === 'pending' ? (
                <>
                  <p className={styles.decisionHint}>
                    Approving marks this student&rsquo;s{' '}
                    <strong>{appeal.label === 'Time Out' ? 'time out' : 'time in'}</strong> as
                    present for {appeal.day ? `Day ${appeal.day}` : 'that day'}. Rejecting leaves
                    the attendance record as it is.
                  </p>

                  <label className={styles.commentLabel} htmlFor="appeal-comment">
                    Comment (optional)
                  </label>
                  <textarea
                    id="appeal-comment"
                    className={styles.commentBox}
                    rows={3}
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="Add a note for the student..."
                    disabled={reviewing}
                  />

                  {reviewError && <p className={styles.reviewError}>{reviewError}</p>}

                  <div className={styles.decisionActions}>
                    <button
                      type="button"
                      className={styles.approveBtn}
                      onClick={() => onReview('approved', comment)}
                      disabled={reviewing}
                    >
                      {reviewing ? 'Saving...' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      className={styles.rejectBtn}
                      onClick={() => onReview('rejected', comment)}
                      disabled={reviewing}
                    >
                      Reject
                    </button>
                  </div>
                </>
              ) : (
                <p className={styles.decisionHint}>
                  This appeal was {STATUS_LABELS[statusKey] || statusKey}
                  {appeal.reviewedAt ? ` on ${formatDateTime(appeal.reviewedAt)}` : ''}. It can no
                  longer be changed from here.
                </p>
              )}
            </section>
          )}
        </div>
      </section>
    </div>
  );
}

export default AppealDrawer;
