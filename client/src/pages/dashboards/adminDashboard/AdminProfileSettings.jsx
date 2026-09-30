import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  User,
  Mail,
  Phone,
  Lock,
  ShieldCheck,
  Building2,
  Edit,
  Save,
  KeyRound,
  ChevronRight,
  X,
} from 'lucide-react';

import {
  getAdminProfile,
  updateAdminProfile,
  changeAdminPassword,
  uploadAdminProfilePicture,
} from '../../../api/adminApi';

import { useToast } from '../../../components/admin/toastContext';
import { useAuth } from '../../../context/AuthContext';
import styles from './AdminProfileSettings.module.css';

const ROLE_FIELDS = {
  admin: [{ name: 'department', label: 'Department', icon: Building2 }],
};

const roleLabels = {
  admin: 'Administrator',
};

export default function AdminProfileSettings() {
  const { showToast } = useToast();
  const { user, updateUser } = useAuth();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [pictureUploading, setPictureUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [activeSection, setActiveSection] = useState('profile');

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
  });

  const [originalForm, setOriginalForm] = useState({
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

  useEffect(() => {
    if (!window.visualViewport) return undefined;
    const viewport = window.visualViewport;
    const handleResize = () => {
      if (viewport.height < window.innerHeight * 0.85) {
        const active = document.activeElement;
        if (active && typeof active.scrollIntoView === 'function') {
          active.scrollIntoView({ block: 'center' });
        }
      }
    };
    viewport.addEventListener('resize', handleResize);
    return () => viewport.removeEventListener('resize', handleResize);
  }, []);

  const loadProfile = useCallback(async () => {
    setLoading(true);

    try {
      const data = await getAdminProfile();

      setProfile(data.user);

      const initialForm = {
        first_name: data.user.first_name || '',
        last_name: data.user.last_name || '',
        email: data.user.email || '',
        phone: data.user.phone || '',
      };

      setForm(initialForm);
      setOriginalForm(initialForm);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleFieldChange = (e) => {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handlePwdChange = (e) => {
    const { name, value } = e.target;

    setPwdForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleRoleFieldChange = (name, value) => {
    setProfile((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleEdit = () => {
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setForm(originalForm);
    setEditing(false);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();

    setSaving(true);

    try {
      const payload = { ...form };

      const roleFields = ROLE_FIELDS[user?.role] || [];

      for (const field of roleFields) {
        if (
          profile &&
          Object.prototype.hasOwnProperty.call(profile, field.name)
        ) {
          payload[field.name] = profile[field.name] || '';
        }
      }

      const data = await updateAdminProfile(payload);

      setProfile(data.user);
      setOriginalForm(form);

      updateUser({ ...data.user });

      showToast('Profile updated successfully.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
      setEditing(false);
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
      await changeAdminPassword(
        pwdForm.currentPassword,
        pwdForm.newPassword
      );

      showToast('Password changed successfully.', 'success');

      setPwdForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
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
      showToast('Please upload an image file.', 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('Image must be smaller than 5 MB.', 'error');
      return;
    }

    setPictureUploading(true);

    try {
      const data = await uploadAdminProfilePicture(file);

      setProfile((prev) => ({
        ...prev,
        photo_url: data.photoUrl,
      }));

      updateUser({ photo_url: data.photoUrl });

      showToast('Profile picture updated.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setPictureUploading(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingPage}>
        <div className={styles.loadingSpinner} />
        <p>Loading your profile...</p>
      </div>
    );
  }

  const displayName =
    profile?.first_name || profile?.last_name
      ? `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim()
      : profile?.email || 'Administrator';

  const initials = displayName
    .split(' ')
    .map((name) => name.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const roleFields = ROLE_FIELDS[user?.role] || ROLE_FIELDS.admin;

  return (
    <div className={styles.page}>
      <section className={styles.profileHero}>
        <div className={styles.heroBackground} />

        <div className={styles.profileContent}>
          <div className={styles.avatarWrapper}>
            {profile?.photo_url ? (
              <img
                src={profile.photo_url}
                alt="Profile"
                className={styles.avatar}
              />
            ) : (
              <div className={styles.avatarPlaceholder}>{initials}</div>
            )}

            <button
              type="button"
              className={styles.cameraButton}
              onClick={() => fileInputRef.current?.click()}
              disabled={pictureUploading}
              title="Change profile picture"
            >
              <Camera size={16} />
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePictureUpload}
              className={styles.hiddenInput}
            />
          </div>

          <div className={styles.profileIdentity}>
            <h2>{displayName}</h2>

            <div className={styles.profileMeta}>
              <span>{roleLabels[user?.role] || 'Administrator'}</span>

              <span className={styles.dot}>•</span>

              <span>{profile?.email}</span>
            </div>
          </div>

          <button
            type="button"
            className={styles.photoButton}
            onClick={() => fileInputRef.current?.click()}
            disabled={pictureUploading}
          >
            <Camera size={16} />

            {pictureUploading ? 'Uploading...' : 'Change Photo'}
          </button>
        </div>
      </section>

      <div className={styles.sectionSwitcher}>
        <button
          type="button"
          className={`${styles.switcherButton} ${activeSection === 'profile' ? styles.switcherButtonActive : ''}`}
          onClick={() => setActiveSection('profile')}
        >
          <User size={16} />
          Profile Info
        </button>
        <button
          type="button"
          className={`${styles.switcherButton} ${activeSection === 'security' ? styles.switcherButtonActive : ''}`}
          onClick={() => setActiveSection('security')}
        >
          <ShieldCheck size={16} />
          Account Security
        </button>
      </div>

      <div className={styles.contentGrid}>
        <section className={`${styles.card} ${activeSection === 'profile' ? styles.cardActiveMobile : ''}`}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIcon}>
              <User size={18} />
            </div>

            <div>
              <h3>Profile Information</h3>
              <p>Update your personal information.</p>
            </div>
          </div>

          <form
            className={styles.form}
            onSubmit={editing ? handleSaveProfile : undefined}
            noValidate
          >
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label>First Name</label>

                <div className={styles.inputWrapper}>
                  <User size={17} />

                  <input
                    name="first_name"
                    value={form.first_name}
                    onChange={handleFieldChange}
                    disabled={!editing || saving}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label>Last Name</label>

                <div className={styles.inputWrapper}>
                  <User size={17} />

                  <input
                    name="last_name"
                    value={form.last_name}
                    onChange={handleFieldChange}
                    disabled={!editing || saving}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label>Email</label>

                <div className={styles.inputWrapper}>
                  <Mail size={17} />

                  <input
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleFieldChange}
                    disabled={!editing || saving}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label>Phone</label>

                <div className={styles.inputWrapper}>
                  <Phone size={17} />

                  <input
                    name="phone"
                    value={form.phone}
                    onChange={handleFieldChange}
                    disabled={!editing || saving}
                  />
                </div>
              </div>

              {roleFields.map((field) => {
                const Icon = field.icon || User;

                return (
                  <div className={styles.field} key={field.name}>
                    <label>{field.label}</label>

                    <div className={styles.inputWrapper}>
                      <Icon size={17} />

                      <input
                        type={field.type || 'text'}
                        value={profile?.[field.name] || ''}
                        onChange={(e) =>
                          handleRoleFieldChange(field.name, e.target.value)
                        }
                        disabled={!editing || saving}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={styles.formFooter}>
              {editing ? (
                <>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={handleCancelEdit}
                    disabled={saving}
                  >
                    <X size={17} />
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className={styles.primaryButton}
                    disabled={saving}
                  >
                    <Save size={17} />

                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={handleEdit}
                >
                  <Edit size={17} />
                  Edit Profile
                </button>
              )}
            </div>
          </form>
        </section>

        <section className={`${styles.card} ${activeSection === 'security' ? styles.cardActiveMobile : ''}`}>
          <div className={styles.cardHeader}>
            <div className={styles.cardIcon}>
              <ShieldCheck size={18} />
            </div>

            <div>
              <h3>Account Security</h3>
              <p>Protect your account and password.</p>
            </div>
          </div>

          <div className={styles.securityBanner}>
            <div className={styles.securityIcon}>
              <Lock size={20} />
            </div>

            <div>
              <strong>Password</strong>

              <p>
                Use a strong password that you don't use elsewhere.
              </p>
            </div>
          </div>

          <form
            className={styles.form}
            onSubmit={handleChangePassword}
            noValidate
          >
            <div className={styles.field}>
              <label>Current Password</label>

              <div className={styles.inputWrapper}>
                <Lock size={17} />

                <input
                  type="password"
                  name="currentPassword"
                  value={pwdForm.currentPassword}
                  onChange={handlePwdChange}
                  disabled={passwordSaving}
                  required
                />
              </div>
            </div>

            <div className={styles.field}>
              <label>New Password</label>

              <div className={styles.inputWrapper}>
                <KeyRound size={17} />

                <input
                  type="password"
                  name="newPassword"
                  value={pwdForm.newPassword}
                  onChange={handlePwdChange}
                  disabled={passwordSaving}
                  minLength={8}
                  required
                />
              </div>
            </div>

            <div className={styles.field}>
              <label>Confirm New Password</label>

              <div className={styles.inputWrapper}>
                <KeyRound size={17} />

                <input
                  type="password"
                  name="confirmPassword"
                  value={pwdForm.confirmPassword}
                  onChange={handlePwdChange}
                  disabled={passwordSaving}
                  minLength={8}
                  required
                />
              </div>
            </div>

            <div className={styles.passwordHint}>
              <span className={styles.checkCircle}>✓</span>
              Password must contain at least 8 characters.
            </div>

            <button
              type="submit"
              className={styles.secondaryButton}
              disabled={passwordSaving}
            >
              <Lock size={17} />

              {passwordSaving ? 'Changing...' : 'Change Password'}

              <ChevronRight size={17} />
            </button>
          </form>
        </section>
      </div>

      <section className={styles.accountCard}>
        <div className={styles.accountItem}>
          <div className={styles.accountItemIcon}>
            <User size={18} />
          </div>

          <div className={styles.accountItemText}>
            <span>Account Type</span>
            <strong>{roleLabels[user?.role] || 'Administrator'}</strong>
          </div>
        </div>

        <div className={styles.accountItem}>
          <div className={styles.accountItemIcon}>
            <ShieldCheck size={18} />
          </div>

          <div className={styles.accountItemText}>
            <span>Account Status</span>
            <strong className={styles.activeStatus}>Active</strong>
          </div>
        </div>

        <div className={styles.accountItem}>
          <div className={styles.accountItemIcon}>
            <Mail size={18} />
          </div>

          <div className={styles.accountItemText}>
            <span>Email</span>
            <strong>{profile?.email || 'Not provided'}</strong>
          </div>
        </div>
      </section>
    </div>
  );
}
