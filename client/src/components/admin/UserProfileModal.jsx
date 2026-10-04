import { useEffect, useState } from 'react';
import {
  BadgeCheck,
  Ban,
  Briefcase,
  Building2,
  CalendarDays,
  CircleCheck,
  Clock3,
  GraduationCap,
  Mail,
  MapPin,
  Phone,
  School,
  Send,
  UserCog,
  X,
} from 'lucide-react';
import { getUserProfile, updateUserStatus, resendApprovalEmail } from '../../../src/api/adminApi';
import { useToast } from './toastContext';
import styles from './UserProfileModal.module.css';

const ROLE_META = {
  student: { label: 'Student', icon: GraduationCap, accent: '#8b1e2d' },
  teacher: { label: 'Teacher', icon: School, accent: '#37568c' },
  supervisor: { label: 'Supervisor', icon: Briefcase, accent: '#b45309' },
  coordinator: { label: 'Coordinator', icon: UserCog, accent: '#be8c3f' },
  admin: { label: 'Administrator', icon: BadgeCheck, accent: '#8b1e2d' },
};

const STATUS_META = {
  approved: { label: 'Active', tone: 'approved' },
  pending: { label: 'Pending', tone: 'pending' },
  disapproved: { label: 'Inactive', tone: 'disapproved' },
};

// Field labels differ per role, so each role gets its own readable name.
const ROLE_FIELDS = {
  student: [
    { key: 'student_number', label: 'Student number' },
    { key: 'grade_level', label: 'Grade level' },
    { key: 'section', label: 'Section' },
    { key: 'track_strand', label: 'Track & strand' },
    { key: 'school', label: 'School', icon: School },
    { key: 'gender', label: 'Gender' },
    { key: 'birthdate', label: 'Birthdate', type: 'date' },
    { key: 'home_address', label: 'Home address', icon: MapPin },
    { key: 'preferred_industry', label: 'Preferred industry' },
    { key: 'preferred_company', label: 'Preferred company' },
    { key: 'career_goal', label: 'Career goal' },
    { key: 'guardian_name', label: 'Guardian' },
    { key: 'guardian_relationship', label: 'Guardian relationship' },
    { key: 'guardian_contact', label: 'Guardian contact', icon: Phone },
    { key: 'emergency_contact', label: 'Emergency contact' },
    { key: 'emergency_contact_number', label: 'Emergency number', icon: Phone },
  ],
  teacher: [
    { key: 'employee_id', label: 'Employee ID' },
    { key: 'designation', label: 'Designation' },
    { key: 'department', label: 'Department', icon: Building2 },
    { key: 'school', label: 'School', icon: School },
  ],
  supervisor: [
    { key: 'employee_id', label: 'Employee ID' },
    { key: 'company_name', label: 'Company', icon: Building2 },
    { key: 'designation', label: 'Designation' },
    { key: 'department', label: 'Department' },
    { key: 'company_address', label: 'Company address', icon: MapPin },
  ],
  coordinator: [
    { key: 'employee_id', label: 'Employee ID' },
    { key: 'designation', label: 'Designation' },
    { key: 'department', label: 'Department', icon: Building2 },
    { key: 'school', label: 'School', icon: School },
  ],
  admin: [
    { key: 'employee_id', label: 'Employee ID' },
    { key: 'department', label: 'Department', icon: Building2 },
  ],
};

const formatDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function UserProfileModal({ user, onClose, onUpdated }) {
  const { showToast } = useToast();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const data = await getUserProfile(user.id);
        if (mounted) setProfile(data.user);
      } catch (err) {
        if (mounted) showToast(err.message, 'error');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [user, showToast]);

  // Lets Escape close the dialog, matching the other admin modals.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleStatus = async (status) => {
    setSaving(true);
    try {
      const data = await updateUserStatus(user.id, status);
      // Approving mails a one-time set-password link. A failed mail leaves the
      // account active but unable to sign in, so surface it and offer Resend.
      const emailFailed = status === 'approved' && data?.emailSent === false;
      showToast(
        data?.message || `Account ${status === 'approved' ? 'activated' : 'deactivated'}.`,
        emailFailed ? 'error' : 'success',
        emailFailed ? 8000 : undefined,
      );
      onUpdated?.();
      // Stay open on a mail failure so the Resend link is right there.
      if (!emailFailed) onClose?.();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Re-mails a brand new set-password link for an approved account.
  const handleResendLink = async () => {
    setResending(true);
    try {
      const data = await resendApprovalEmail(user.id);
      showToast(
        data?.message || 'Set-your-password link emailed.',
        data?.emailSent === false ? 'error' : 'success',
      );
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setResending(false);
    }
  };

  const p = profile || {};
  const details = p.profile || {};
  const meta = ROLE_META[p.role] || { label: p.role || 'User', icon: BadgeCheck, accent: '#8b1e2d' };
  const RoleIcon = meta.icon;
  const status = STATUS_META[p.status] || { label: p.status || 'Unknown', tone: 'pending' };
  const isActive = p.status === 'approved';

  const fullName = `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email || 'User';
  const initials = fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

  // Only show profile rows that actually carry a value, so the card stays short.
  const detailsToShow = (ROLE_FIELDS[p.role] || []).filter(({ key }) => {
    const value = details[key];
    return value !== null && value !== undefined && String(value).trim() !== '';
  });

  const photo = details.photo_url || p.photo_url;
  const joined = formatDate(p.created_at);
  const updated = formatDate(p.updated_at);

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-title"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className={styles.modal}>
        <div className={styles.topBar} style={{ '--accent': meta.accent }} aria-hidden="true" />

        <div className={styles.header}>
          {loading ? (
            <div className={styles.headerSkeleton} />
          ) : (
            <>
              <div className={styles.identity}>
                {photo ? (
                  <img className={styles.avatar} src={photo} alt="" />
                ) : (
                  <span className={styles.avatar} style={{ '--accent': meta.accent }} aria-hidden="true">
                    {initials || <RoleIcon size={22} strokeWidth={1.9} />}
                  </span>
                )}
                <div className={styles.identityCopy}>
                  <p className={styles.eyebrow}>USER PROFILE</p>
                  <h2 id="profile-title" className={styles.name}>{fullName}</h2>
                  <div className={styles.badges}>
                    <span className={styles.roleBadge} style={{ '--accent': meta.accent }}>
                      <RoleIcon size={13} strokeWidth={2} />
                      {meta.label}
                    </span>
                    <span className={`${styles.statusBadge} ${styles[status.tone]}`}>
                      {status.tone === 'approved' ? <CircleCheck size={13} strokeWidth={2} /> : <Clock3 size={13} strokeWidth={2} />}
                      {status.label}
                    </span>
                  </div>
                </div>
              </div>

              <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
                <X size={18} strokeWidth={2} />
              </button>
            </>
          )}
        </div>

        {loading ? (
          <div className={styles.loading}>
            <span className={styles.spinner} aria-hidden="true" />
            Loading profile…
          </div>
        ) : (
          <div className={styles.body}>
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Account</h3>
              <div className={styles.grid}>
                <InfoCell icon={Mail} label="Email" value={p.email} />
                <InfoCell icon={Phone} label="Phone" value={p.phone || 'Not provided'} muted={!p.phone} />
                <InfoCell icon={BadgeCheck} label="Identifier" value={p.identifier || '—'} muted={!p.identifier} />
                <InfoCell icon={CalendarDays} label="Joined" value={joined || '—'} muted={!joined} />
              </div>
            </section>

            {detailsToShow.length > 0 ? (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>{meta.label} details</h3>
                <div className={styles.grid}>
                  {detailsToShow.map(({ key, label, icon: FieldIcon, type }) => {
                    const raw = details[key];
                    const text = type === 'date' ? formatDate(raw) || '—' : String(raw);
                    return <InfoCell key={key} icon={FieldIcon} label={label} value={text} />;
                  })}
                </div>
              </section>
            ) : null}

            <p className={styles.updatedNote}>
              Last updated {updated || '—'}
            </p>
          </div>
        )}

        <div className={styles.actions}>
          {isActive ? (
            <button
              type="button"
              className={styles.dangerBtn}
              onClick={() => handleStatus('disapproved')}
              disabled={saving}
            >
              <Ban size={16} strokeWidth={2} />
              {saving ? 'Saving…' : 'Deactivate account'}
            </button>
          ) : (
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => handleStatus('approved')}
              disabled={saving}
            >
              <CircleCheck size={16} strokeWidth={2} />
              {saving ? 'Saving…' : 'Activate account'}
            </button>
          )}
          {/* Only for an approved account: the recovery path when the approval
              email bounced or expired. Mints a new one-time link. */}
          {isActive ? (
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={handleResendLink}
              disabled={saving || resending}
              title="Email a new set-password link to this account"
            >
              <Send size={16} strokeWidth={2} />
              {resending ? 'Sending…' : 'Resend link'}
            </button>
          ) : null}
          <button type="button" className={styles.secondaryBtn} onClick={onClose} disabled={saving}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// One labelled value with an optional leading icon.
function InfoCell({ icon: Icon, label, value, muted }) {
  return (
    <div className={styles.cell}>
      <span className={styles.cellLabel}>
        {Icon ? <Icon size={13} strokeWidth={2} aria-hidden="true" /> : null}
        {label}
      </span>
      <span className={`${styles.cellValue} ${muted ? styles.cellValueMuted : ''}`}>{value || '—'}</span>
    </div>
  );
}
