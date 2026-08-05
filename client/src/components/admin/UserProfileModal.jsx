import { useEffect, useState } from 'react';
import { getUserProfile, updateUserStatus, resetUserPassword } from '../../../src/api/adminApi';
import { useToast } from './ToastContainer';
import styles from './UserProfileModal.module.css';

export default function UserProfileModal({ user, onClose, onUpdated }) {
  const { showToast } = useToast();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

  const handleStatus = async (status) => {
    setSaving(true);
    try {
      await updateUserStatus(user.id, status);
      showToast(`Status updated to ${status}.`, 'success');
      onUpdated?.();
      onClose?.();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    setSaving(true);
    try {
      const data = await resetUserPassword(user.id, null);
      showToast(`Temporary password: ${data.tempPassword || ''}`, 'success', 10000);
      onUpdated?.();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const p = profile || {};
  const fullName = `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="profile-title">
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 id="profile-title">User Profile</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} title="Close">✕</button>
        </div>

        {loading ? (
          <p className={styles.loading}>Loading profile…</p>
        ) : (
          <div className={styles.body}>
            <div className={styles.field}>
              <span className={styles.label}>Name</span>
              <span className={styles.value}>{fullName}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Email</span>
              <span className={styles.value}>{p.email}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Role</span>
              <span className={styles.value}>{p.role}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Status</span>
              <span className={styles.value}>{p.status}</span>
            </div>
            {(p.identifier || p.employee_id || p.student_number) ? (
              <div className={styles.field}>
                <span className={styles.label}>Identifier</span>
                <span className={styles.value}>{p.identifier || p.employee_id || p.student_number}</span>
              </div>
            ) : null}
            {p.department ? (
              <div className={styles.field}>
                <span className={styles.label}>Department</span>
                <span className={styles.value}>{p.department}</span>
              </div>
            ) : null}
            {p.phone ? (
              <div className={styles.field}>
                <span className={styles.label}>Phone</span>
                <span className={styles.value}>{p.phone}</span>
              </div>
            ) : null}
            {p.created_at ? (
              <div className={styles.field}>
                <span className={styles.label}>Created</span>
                <span className={styles.value}>{new Date(p.created_at).toLocaleString()}</span>
              </div>
            ) : null}
          </div>
        )}

        <div className={styles.actions}>
          {p.status !== 'approved' ? (
            <button type="button" className={styles.actionBtn} onClick={() => handleStatus('approved')} disabled={saving}>
              {saving ? 'Saving…' : 'Activate'}
            </button>
          ) : (
            <button type="button" className={styles.actionBtnSecondary} onClick={() => handleStatus('disapproved')} disabled={saving}>
              {saving ? 'Saving…' : 'Deactivate'}
            </button>
          )}
          <button type="button" className={styles.actionBtnSecondary} onClick={handleResetPassword} disabled={saving}>
            {saving ? 'Saving…' : 'Reset Password'}
          </button>
        </div>
      </div>
    </div>
  );
}
