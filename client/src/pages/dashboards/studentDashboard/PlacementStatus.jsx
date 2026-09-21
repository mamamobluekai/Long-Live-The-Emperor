import { useEffect, useState } from 'react';
import {
  GraduationCap,
  UserRound,
  Users,
  ShieldCheck,
  Building2,
  Mail,
  BadgeCheck,
  CalendarDays,
  AlertCircle,
} from 'lucide-react';
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

function initials(person) {
  if (!person) return '?';
  const first = (person.first_name || '').trim();
  const last = (person.last_name || '').trim();
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || '?';
}

function PersonCard({ icon: Icon, roleLabel, person, fallback, accent }) {
  const name = fullName(person) || fallback;
  return (
    <div className={`${styles.personCard} ${styles[accent] || ''}`}>
      <div className={styles.personAvatar}>
        {person ? <span>{initials(person)}</span> : <Icon size={20} />}
      </div>
      <div className={styles.personInfo}>
        <span className={styles.personRole}>{roleLabel}</span>
        <strong className={styles.personName}>{name}</strong>
        {person?.department && <span className={styles.personMeta}>{person.department}</span>}
        {person?.email && (
          <span className={styles.personMeta}>
            <Mail size={12} /> {person.email}
          </span>
        )}
      </div>
    </div>
  );
}

function PlacementStatus({ user }) {
  const [submission, setSubmission] = useState(null);
  const [placement, setPlacement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  const classmates = placement?.classmates || [];
  const otherCount = classmates.filter((c) => !c.is_me).length;

  return (
    <div>
      <div className={styles.greeting}>
        <div>
          <h2>{getGreeting()}, {firstName}! 👋</h2>
          <p>
            {placement
              ? `You are assigned to ${placement.batch_label || 'your immersion batch'}. Here is your deployment team.`
              : 'Track your deployment and placement status here.'}
          </p>
        </div>
        {placement && (
          <div className={styles.batchPill}>
            <Users size={16} />
            <span>{placement.batch_label || 'My Batch'}</span>
          </div>
        )}
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {placement && (
        <>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              <BadgeCheck size={18} /> My Deployment Team
            </div>
            <div className={styles.peopleGrid}>
              <PersonCard
                icon={GraduationCap}
                roleLabel="Teacher"
                person={placement.teacher}
                fallback="Not assigned yet"
                accent="accentTeacher"
              />
              <PersonCard
                icon={ShieldCheck}
                roleLabel="Supervisor"
                person={placement.supervisor}
                fallback="Not assigned yet"
                accent="accentSupervisor"
              />
              <PersonCard
                icon={Building2}
                roleLabel="Coordinator"
                person={placement.coordinator}
                fallback="Not assigned yet"
                accent="accentCoordinator"
              />
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              <Users size={18} /> My Batchmates
              <span className={styles.countChip}>
                {otherCount} {otherCount === 1 ? 'classmate' : 'classmates'}
              </span>
            </div>
            {classmates.length === 0 ? (
              <p className={styles.empty}>No classmates assigned to your batch yet.</p>
            ) : (
              <div className={styles.classmateList}>
                {classmates.map((mate) => (
                  <div
                    key={mate.student_id}
                    className={`${styles.classmateItem} ${mate.is_me ? styles.classmateMe : ''}`}
                  >
                    <div className={styles.classmateAvatar}>
                      {initials(mate)}
                    </div>
                    <div className={styles.classmateInfo}>
                      <strong>
                        {fullName(mate) || 'Student'}
                        {mate.is_me && <span className={styles.youTag}>You</span>}
                      </strong>
                      <span className={styles.classmateMeta}>
                        {mate.student_number ? `#${mate.student_number}` : mate.email || 'Student'}
                        {mate.track_strand ? ` · ${mate.track_strand}` : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          <UserRound size={18} /> Submission Status
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
            <AlertCircle size={18} />
            <div>
              <strong>You are not assigned to a batch yet</strong>
              <p>Once your coordinator approves your requirements and places you in a batch, your teacher, supervisor, and batchmates will appear here.</p>
            </div>
          </div>
        </div>
      )}

      {placement?.created_at && (
        <p className={styles.footerNote}>
          <CalendarDays size={14} /> Batch assigned on {new Date(placement.created_at).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      )}
    </div>
  );
}

export default PlacementStatus;