import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  User,
  Mail,
  Phone,
  Lock,
  ShieldCheck,
  GraduationCap,
  Building2,
  BriefcaseBusiness,
  Save,
  KeyRound,
  ChevronRight,
} from 'lucide-react';

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
    { name: 'student_number', label: 'Student Number', icon: GraduationCap },
    { name: 'gender', label: 'Gender', icon: User },
    { name: 'birthdate', label: 'Birthdate', type: 'date', icon: User },
    { name: 'grade_level', label: 'Grade Level', icon: GraduationCap },
    { name: 'section', label: 'Section', icon: GraduationCap },
    { name: 'track_strand', label: 'Track / Strand', icon: GraduationCap },
    { name: 'school', label: 'School', icon: Building2 },
  ],

  teacher: [
    { name: 'employee_id', label: 'Employee ID', icon: BriefcaseBusiness },
    { name: 'department', label: 'Department', icon: Building2 },
    { name: 'designation', label: 'Designation', icon: BriefcaseBusiness },
    { name: 'school', label: 'School', icon: Building2 },
  ],

  supervisor: [
    { name: 'employee_id', label: 'Employee ID', icon: BriefcaseBusiness },
    { name: 'company_name', label: 'Company Name', icon: Building2 },
    { name: 'designation', label: 'Designation', icon: BriefcaseBusiness },
    { name: 'department', label: 'Department', icon: Building2 },
    { name: 'company_address', label: 'Company Address', icon: Building2 },
  ],

  coordinator: [
    { name: 'employee_id', label: 'Employee ID', icon: BriefcaseBusiness },
    { name: 'department', label: 'Department', icon: Building2 },
    { name: 'designation', label: 'Designation', icon: BriefcaseBusiness },
    { name: 'school', label: 'School', icon: Building2 },
  ],
};

const roleLabels = {
  student: 'Student',
  teacher: 'Teacher',
  supervisor: 'Supervisor',
  coordinator: 'Coordinator',
  admin: 'Administrator',
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

  useEffect(() => {
    loadProfile();
  }, []);

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

      const data = await updateUserProfile(payload);

      setProfile(data.user);

      updateUser({
        ...data.user,
      });

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
      await changeUserPassword(
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
      const data = await uploadUserProfilePicture(file);

      setProfile((prev) => ({
        ...prev,
        photo_url: data.photoUrl,
      }));

      updateUser({
        photo_url: data.photoUrl,
      });

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
      : profile?.email || 'User';

  const initials = displayName
    .split(' ')
    .map((name) => name.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const roleFields = ROLE_FIELDS[user?.role] || [];

  return (
    <div className={styles.page}>

     

      {/* PROFILE HERO */}
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
              <div className={styles.avatarPlaceholder}>
                {initials}
              </div>
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
              <span>
                {roleLabels[user?.role] || user?.role}
              </span>

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

            {pictureUploading
              ? 'Uploading...'
              : 'Change Photo'}
          </button>

        </div>
      </section>

      {/* CONTENT GRID */}
      <div className={styles.contentGrid}>

        {/* PROFILE INFORMATION */}
        <section className={styles.card}>

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
            onSubmit={handleSaveProfile}
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
                    disabled={saving}
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
                    disabled={saving}
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
                    disabled={saving}
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
                    disabled={saving}
                  />
                </div>
              </div>

              {roleFields.map((field) => {
                const Icon = field.icon || User;

                return (
                  <div
                    className={styles.field}
                    key={field.name}
                  >
                    <label>{field.label}</label>

                    <div className={styles.inputWrapper}>
                      <Icon size={17} />

                      <input
                        type={field.type || 'text'}
                        value={profile?.[field.name] || ''}
                        onChange={(e) =>
                          handleRoleFieldChange(
                            field.name,
                            e.target.value
                          )
                        }
                        disabled={saving}
                      />
                    </div>
                  </div>
                );
              })}

            </div>

            <div className={styles.formFooter}>
              <span className={styles.helperText}>
                Keep your information up to date.
              </span>

              <button
                type="submit"
                className={styles.primaryButton}
                disabled={saving}
              >
                <Save size={17} />

                {saving
                  ? 'Saving...'
                  : 'Save Changes'}
              </button>
            </div>

          </form>
        </section>

        {/* SECURITY */}
        <section className={styles.card}>

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
                Use a strong password that you don't use
                elsewhere.
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

              {passwordSaving
                ? 'Changing...'
                : 'Change Password'}

              <ChevronRight size={17} />
            </button>

          </form>
        </section>

      </div>

      {/* ACCOUNT INFORMATION */}
      <section className={styles.accountCard}>

        <div className={styles.accountItem}>
          <div className={styles.accountItemIcon}>
            <User size={18} />
          </div>

          <div>
            <span>Account Type</span>
            <strong>
              {roleLabels[user?.role] || user?.role}
            </strong>
          </div>
        </div>

        <div className={styles.accountDivider} />

        <div className={styles.accountItem}>
          <div className={styles.accountItemIcon}>
            <ShieldCheck size={18} />
          </div>

          <div>
            <span>Account Status</span>
            <strong className={styles.activeStatus}>
              Active
            </strong>
          </div>
        </div>

        <div className={styles.accountDivider} />

        <div className={styles.accountItem}>
          <div className={styles.accountItemIcon}>
            <Mail size={18} />
          </div>

          <div>
            <span>Email</span>
            <strong>{profile?.email || 'Not provided'}</strong>
          </div>
        </div>

      </section>

    </div>
  );
}