import { useEffect, useState } from 'react';
import { getMySubmissionStatus } from '../../../api/studentApi';
import styles from './PlacementStatus.module.css';

function PlacementStatus() {
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      setError('');
      try {
        const result = await getMySubmissionStatus();
        if (!cancelled) setSubmission(result.submission || {});
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  const statusMap = {
    Pending: { label: 'Pending', cls: styles.badgePending },
    'Pending Review': { label: 'Pending Review', cls: styles.badgeReview },
    'Under Review': { label: 'Under Review', cls: styles.badgeReview },
    Approved: { label: 'Approved', cls: styles.badgeApproved },
    Rejected: { label: 'Rejected', cls: styles.badgeRejected },
    'Needs Revision': { label: 'Needs Revision', cls: styles.badgeNeeds },
  };

  const statusInfo = statusMap[submission?.status] || { label: submission?.status || 'Not started', cls: styles.badgePending };

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2>Placement Status</h2>
        <p>Track your deployment and placement status.</p>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Submission Status</div>
        {loading ? (
          <p className={styles.empty}>Loading...</p>
        ) : (
          <>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Status</span>
              <span className={`${styles.badge} ${statusInfo.cls}`}>{statusInfo.label}</span>
            </div>
            {submission.submitted_at && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Submitted On</span>
                <span className={styles.infoValue}>{new Date(submission.submitted_at).toLocaleDateString()}</span>
              </div>
            )}
            {submission.reviewed_at && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Reviewed On</span>
                <span className={styles.infoValue}>{new Date(submission.reviewed_at).toLocaleDateString()}</span>
              </div>
            )}
            {submission.coordinator_feedback && (
              <div className={styles.infoRow} style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                <span className={styles.infoLabel}>Coordinator Feedback</span>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#0f172a' }}>{submission.coordinator_feedback}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default PlacementStatus;
