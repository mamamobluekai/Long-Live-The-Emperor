import { useEffect, useState } from 'react';
import { getMySubmissionStatus, getMyPlacementInfo } from '../../../api/studentApi';
import styles from './PlacementStatus.module.css';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function fullName(person) {
  if (!person) return '';
  return [person.first_name, person.last_name].filter(Boolean).join(' ').trim();
}

// Written-out dates (e.g. "September 28, 2026") rather than numeric ones.
const LONG_DATE = { month: 'long', day: 'numeric', year: 'numeric' };

function formatLongDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-PH', LONG_DATE);
}

function initials(person) {
  if (!person) return '?';
  const first = (person.first_name || '').trim();
  const last = (person.last_name || '').trim();
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || '?';
}

function PersonCard({ roleLabel, person, fallback, accent, onClick }) {
  const name = fullName(person) || fallback;
  const clickable = !!person;
  return (
    <button
      type="button"
      className={`${styles.personCard} ${styles[accent] || ''} ${clickable ? styles.clickable : ''}`}
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      title={clickable ? `View ${roleLabel.toLowerCase()} details` : fallback}
    >
      <div className={styles.personAvatar}>
        {person ? <span>{initials(person)}</span> : <span className={styles.avatarDash}>—</span>}
      </div>
      <div className={styles.personInfo}>
        <span className={styles.personRole}>{roleLabel}</span>
        <strong className={styles.personName}>{name}</strong>
        {person?.department && <span className={styles.personMeta}>{person.department}</span>}
        {person?.email && (
          <span className={styles.personMeta}>{person.email}</span>
        )}
        {clickable && <span className={styles.viewHint}>View details</span>}
      </div>
    </button>
  );
}

function PlacementStatus({ user }) {
  const [submission, setSubmission] = useState(null);
  const [placement, setPlacement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Details popup: { role, person } for the team or a batchmate.
  const [infoModal, setInfoModal] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      setError('');
      try {
        const [statusResult, placementResult] = await Promise.all([
          getMySubmissionStatus(),
          getMyPlacementInfo().catch(() => ({ placement: null })),
        ]);
        if (!cancelled) {
          setSubmission(statusResult.submission || {});
          setPlacement(placementResult.placement || null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  const firstName = user?.first_name || user?.email?.split('@')[0] || 'Student';

  const statusMap = {
    Pending: { label: 'Pending', cls: styles.badgePending },
    'Pending Review': { label: 'Pending Review', cls: styles.badgeReview },
    'Under Review': { label: 'Under Review', cls: styles.badgeReview },
    Approved: { label: 'Approved', cls: styles.badgeApproved },
    Rejected: { label: 'Rejected', cls: styles.badgeRejected },
    'Needs Revision': { label: 'Needs Revision', cls: styles.badgeNeeds },
  };

  const statusInfo = statusMap[submission?.status] || { label: submission?.status || 'Not started', cls: styles.badgePending };

  // The list shows classmates only — the signed-in student is excluded.
  const classmates = (placement?.classmates || []).filter((c) => !c.is_me);
  const otherCount = classmates.length;

  return (
    <div className={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700;800&display=swap');
      `}</style>

      <div className={styles.greeting}>
        <div>
          <div className={styles.eyebrow}>Student Portal</div>
          <h2>{getGreeting()}, {firstName}! 👋</h2>
          <p>
            {placement
              ? `You are assigned to ${placement.batch_label || 'your immersion batch'}. Here is your deployment team.`
              : 'Track your deployment and placement status here.'}
          </p>
        </div>
        {placement && (
          <div className={styles.batchPill}>
            <span>{placement.batch_label || 'My Batch'}</span>
          </div>
        )}
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {placement && (
        <>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              My Deployment Team
            </div>
            <div className={styles.peopleGrid}>
              <PersonCard
                roleLabel="Teacher"
                person={placement.teacher}
                fallback="Not assigned yet"
                accent="accentTeacher"
                onClick={() =>
                  setInfoModal({ role: 'Teacher', person: placement.teacher })
                }
              />
              <PersonCard
                roleLabel="Supervisor"
                person={placement.supervisor}
                fallback="Not assigned yet"
                accent="accentSupervisor"
                onClick={() =>
                  setInfoModal({ role: 'Supervisor', person: placement.supervisor })
                }
              />
              <PersonCard
                roleLabel="Coordinator"
                person={placement.coordinator}
                fallback="Not assigned yet"
                accent="accentCoordinator"
                onClick={() =>
                  setInfoModal({ role: 'Coordinator', person: placement.coordinator })
                }
              />
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              My Batchmates
              <span className={styles.countChip}>
                {otherCount} {otherCount === 1 ? 'classmate' : 'classmates'}
              </span>
            </div>
            {classmates.length === 0 ? (
              <p className={styles.empty}>No classmates assigned to your batch yet.</p>
            ) : (
              <div className={styles.classmateList}>
                {classmates.map((mate) => (
                  <button
                    type="button"
                    key={mate.student_id}
                    className={`${styles.classmateItem} ${styles.clickable}`}
                    onClick={() => setInfoModal({ role: 'Classmate', person: mate, isMate: true })}
                    title="View classmate details"
                  >
                    <div className={styles.classmateAvatar}>
                      {initials(mate)}
                    </div>
                    <div className={styles.classmateInfo}>
                      <strong>{fullName(mate) || 'Student'}</strong>
                      <span className={styles.classmateMeta}>
                        {mate.student_number ? `#${mate.student_number}` : mate.email || 'Student'}
                        {mate.track_strand ? ` · ${mate.track_strand}` : ''}
                      </span>
                    </div>
                    <span className={styles.chevron} aria-hidden="true">›</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          Submission Status
        </div>
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
                <span className={styles.infoValue}>{formatLongDate(submission.submitted_at)}</span>
              </div>
            )}
            {submission.reviewed_at && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Reviewed On</span>
                <span className={styles.infoValue}>{formatLongDate(submission.reviewed_at)}</span>
              </div>
            )}
            {submission.coordinator_feedback && (
              <div className={styles.feedbackRow}>
                <span className={styles.infoLabel}>Coordinator Feedback</span>
                <p className={styles.feedbackText}>{submission.coordinator_feedback}</p>
              </div>
            )}
          </>
        )}
      </div>

      {!loading && !placement && (
        <div className={styles.section}>
          <div className={styles.pendingNote}>
            <div>
              <strong>You are not assigned to a batch yet</strong>
              <p>Once your coordinator approves your requirements and places you in a batch, your teacher, supervisor, and batchmates will appear here.</p>
            </div>
          </div>
        </div>
      )}

      {placement?.created_at && (
        <p className={styles.footerNote}>
          Batch assigned on {formatLongDate(placement.created_at)}
        </p>
      )}
      {infoModal && (
        <div
          className={styles.modalBackdrop}
          onClick={() => setInfoModal(null)}
        >
          <div
            className={styles.infoModal}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.infoModalHeader}>
              <div className={styles.infoModalAvatar}>
                {initials(infoModal.person)}
              </div>
              <div>
                <span className={styles.infoModalRole}>{infoModal.role}</span>
                <h3 className={styles.infoModalName}>
                  {fullName(infoModal.person) || 'Student'}
                </h3>
              </div>
              <button
                type="button"
                className={styles.infoModalClose}
                onClick={() => setInfoModal(null)}
                aria-label="Close details"
              >
                ×
              </button>
            </div>

            <div className={styles.infoModalBody}>
              {!infoModal.isMate && (
                <>
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Role</span>
                    <span className={styles.infoValue}>{infoModal.role}</span>
                  </div>
                  {infoModal.person.department && (
                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>Department</span>
                      <span className={styles.infoValue}>
                        {infoModal.person.department}
                      </span>
                    </div>
                  )}
                  {infoModal.person.email && (
                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>Email</span>
                      <span className={styles.infoValue}>
                        {infoModal.person.email}
                      </span>
                    </div>
                  )}
                </>
              )}

              {infoModal.isMate && (
                <>
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Student No.</span>
                    <span className={styles.infoValue}>
                      {infoModal.person.student_number
                        ? `#${infoModal.person.student_number}`
                        : '—'}
                    </span>
                  </div>
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Track & Strand</span>
                    <span className={styles.infoValue}>
                      {infoModal.person.track_strand || '—'}
                    </span>
                  </div>
                  {infoModal.person.grade_level && (
                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>Grade Level</span>
                      <span className={styles.infoValue}>
                        {infoModal.person.grade_level}
                      </span>
                    </div>
                  )}
                  {infoModal.person.email && (
                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>Email</span>
                      <span className={styles.infoValue}>
                        {infoModal.person.email}
                      </span>
                    </div>
                  )}
                </>
              )}

              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Batch</span>
                <span className={styles.infoValue}>
                  {placement?.batch_label || '—'}
                </span>
              </div>
            </div>

            <div className={styles.infoModalFooter}>
              <button
                type="button"
                className={styles.infoModalBtn}
                onClick={() => setInfoModal(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PlacementStatus;