import { useEffect, useState, useRef } from 'react';
import {
  getUserProfile,
  updateUserProfile,
  changeUserPassword,
  uploadUserProfilePicture,
} from '../../api/userApi';
import { useToast } from '../../components/admin/ToastContainer';
import { useAuth } from '../../context/AuthContext';
import styles from './UserProfileSettings.module.css';

const ROLE_FIELDS = {
  student: [
    { name: 'student_number', label: 'Student Number' },
    { name: 'gender', label: 'Gender' },
    { name: 'birthdate', label: 'Birthdate', type: 'date' },
    { name: 'grade_level', label: 'Grade Level' },
    { name: 'section', label: 'Section' },
    { name: 'track_strand', label: 'Track/Strand' },
    { name: 'school', label: 'School' },
  ],
  teacher: [
    { name: 'employee_id', label: 'Employee ID' },
    { name: 'department', label: 'Department' },
    { name: 'designation', label: 'Designation' },
    { name: 'school', label: 'School' },
  ],
  supervisor: [
    { name: 'employee_id', label: 'Employee ID' },
    { name: 'company_name', label: 'Company Name' },
    { name: 'designation', label: 'Designation' },
    { name: 'department', label: 'Department' },
    { name: 'company_address', label: 'Company Address' },
  ],
  coordinator: [
    { name: 'employee_id', label: 'Employee ID' },
    { name: 'department', label: 'Department' },
    { name: 'designation', label: 'Designation' },
    { name: 'school', label: 'School' },
  ],
};

export default function UserProfileSettings() {
  const { showToast } = useToast();
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [pictureUploading, setPictureUploading] = useState(false);

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
  });

  const [pwdForm, setPwdForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const fileInputRef = useRef(null);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const data = await getUserProfile();
      setProfile(data.user);
      setForm({
        first_name: data.user.first_name || '',
        last_name: data.user.last_name || '',
        email: data.user.email || '',
        phone: data.user.phone || '',
      });
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProfile(); }, []);

  const handleFieldChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handlePwdChange = (e) => {
    const { name, value } = e.target;
    setPwdForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form };
      const roleFields = ROLE_FIELDS[user?.role] || [];
      for (const field of roleFields) {
        if (profile && Object.prototype.hasOwnProperty.call(profile, field.name)) {
          payload[field.name] = profile[field.name] || '';
        }
      }
      const data = await updateUserProfile(payload);
      setProfile(data.user);
      showToast('Profile updated successfully.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pwdForm.newPassword !== pwdForm.confirmPassword) {
      showToast('New passwords do not match.', 'error');
      return;
    }
    if (pwdForm.newPassword.length < 8) {
      showToast('Password must be at least 8 characters.', 'error');
      return;
    }
    setPasswordSaving(true);
    try {
      await changeUserPassword(pwdForm.currentPassword, pwdForm.newPassword);
      showToast('Password changed successfully.', 'success');
      setPwdForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setPasswordSaving(false);
    }
  };

  const handlePictureUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please upload an image file (JPG, PNG, GIF).', 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('Image must be smaller than 5 MB.', 'error');
      return;
    }

    setPictureUploading(true);
    try {
      const data = await uploadUserProfilePicture(file);
      setProfile((prev) => ({ ...prev, photo_url: data.photoUrl }));
      updateUser({ photo_url: data.photoUrl });
      showToast('Profile picture uploaded.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setPictureUploading(false);
    }
  };

  const handleRoleFieldChange = (name, value) => {
    setProfile((prev) => ({ ...prev, [name]: value }));
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <h2>Profile Settings</h2>
        <p>Loading…</p>
      </div>
    );
  }

  const displayName = profile?.first_name || profile?.last_name
    ? `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim()
    : profile?.email;

  const roleFields = ROLE_FIELDS[user?.role] || [];

  return (
    <div className={styles.container}>
      <h2>Profile Settings</h2>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h3>Profile Picture</h3>
        </div>
        <div className={styles.pictureSection}>
          {profile?.photo_url ? (
            <img src={profile.photo_url} alt="Profile" className={styles.avatar} />
          ) : (
            <div className={styles.avatarPlaceholder}>
              {displayName?.charAt(0) || '👤'}
            </div>
          )}
          <div className={styles.pictureControls}>
            <label className={styles.pictureBtn} htmlFor="photo">
              {pictureUploading ? 'Uploading…' : 'Choose Photo'}
            </label>
            <input
              id="photo"
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handlePictureUpload}
              disabled={pictureUploading}
              className={styles.hiddenInput}
            />
            <span className={styles.note}>JPG, PNG, GIF up to 5 MB</span>
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h3>Profile Information</h3>
        </div>
        <form className={styles.form} onSubmit={handleSaveProfile} noValidate>
          <div className={styles.field}>
            <label htmlFor="first_name">First Name</label>
            <input
              id="first_name"
              name="first_name"
              value={form.first_name}
              onChange={handleFieldChange}
              disabled={saving}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="last_name">Last Name</label>
            <input
              id="last_name"
              name="last_name"
              value={form.last_name}
              onChange={handleFieldChange}
              disabled={saving}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleFieldChange}
              disabled={saving}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="phone">Phone</label>
            <input
              id="phone"
              name="phone"
              value={form.phone}
              onChange={handleFieldChange}
              disabled={saving}
            />
          </div>
          {roleFields.map((field) => (
            <div className={styles.field} key={field.name}>
              <label htmlFor={field.name}>{field.label}</label>
              <input
                id={field.name}
                name={field.name}
                type={field.type || 'text'}
                value={profile?.[field.name] || ''}
                onChange={(e) => handleRoleFieldChange(field.name, e.target.value)}
                disabled={saving}
              />
            </div>
          ))}
          <div className={styles.actions}>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? 'Saving…' : 'Save Profile'}
            </button>
          </div>
        </form>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h3>Change Password</h3>
        </div>
        <form className={styles.form} onSubmit={handleChangePassword} noValidate>
          <div className={styles.fieldFull}>
            <label htmlFor="currentPassword">Current Password</label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              value={pwdForm.currentPassword}
              onChange={handlePwdChange}
              disabled={passwordSaving}
              required
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="newPassword">New Password</label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              value={pwdForm.newPassword}
              onChange={handlePwdChange}
              disabled={passwordSaving}
              required
              minLength={8}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="confirmPassword">Confirm New Password</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              value={pwdForm.confirmPassword}
              onChange={handlePwdChange}
              disabled={passwordSaving}
              required
              minLength={8}
            />
          </div>
          <div className={styles.actions}>
            <button type="submit" className={styles.saveBtn} disabled={passwordSaving}>
              {passwordSaving ? 'Changing…' : 'Change Password'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
