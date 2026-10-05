import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  Edit,
  Save,
  KeyRound,
  ChevronRight,
  X,
  Settings,
} from 'lucide-react';

import {
  getUserProfile,
  updateUserProfile,
  changeUserPassword,
  uploadUserProfilePicture,
} from '../../api/userApi';

import { useToast } from '../../components/admin/toastContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/themeContextValue';
import { getPasswordFormProblem } from '../../utils/passwordPolicy';
import styles from './UserProfileSettings.module.css';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const { theme, toggleTheme } = useTheme();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [pictureUploading, setPictureUploading] = useState(false);
  const [editing, setEditing] = useState(false);

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
  const [activeSection, setActiveSection] = useState('profile');

  // Which section, if any, is open as a modal. Only the Profile Info / Account
  // Security buttons set this, and the stylesheet hides those buttons on desktop
  // (.sectionSwitcher is display:none above 900px), so no viewport detection is
  // needed: on a wide screen the buttons do not exist and the cards stay inline.
  const [modalSection, setModalSection] = useState(null);

  const closeModal = useCallback(() => setModalSection(null), []);

  // Escape closes the modal, matching the other dialogs in the app.
  useEffect(() => {
    if (!modalSection) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setModalSection(null);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modalSection]);

  // Stops the page behind the modal scrolling while it is open. Restores the
  // previous inline value rather than clearing it.
  useEffect(() => {
    if (!modalSection) return undefined;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';

    return () => {
      body.style.overflow = previousOverflow;
    };
  }, [modalSection]);

  const openSectionModal = (section) => {
    setActiveSection(section);
    setModalSection(section);
  };

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
      const data = await getUserProfile();

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

    const trimmedEmail = (form.email || '').trim();

    if (trimmedEmail !== (originalForm.email || '').trim()) {
      if (!EMAIL_PATTERN.test(trimmedEmail)) {
        showToast('Please enter a valid email address.', 'error');
        return;
      }

      if (trimmedEmail !== trimmedEmail.toLowerCase()) {
        showToast('Email must be in lowercase.', 'error');
        return;
      }
    }

    setSaving(true);

    try {
      const payload = { ...form, email: trimmedEmail };

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
      setOriginalForm(form);

      updateUser({
        ...data.user,
      });

      showToast('Profile updated successfully.', 'success');
      setEditing(false);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();

    const problem = getPasswordFormProblem(pwdForm.newPassword, pwdForm.confirmPassword);
    if (problem) {
      showToast(problem, 'error');
      return;
    }

    setPasswordSaving(true);

    try {
      await changeUserPassword(
        pwdForm.currentPassword,
        pwdForm.newPassword,
        pwdForm.confirmPassword
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

  // The two section cards, rendered either inline in the page (desktop) or inside
  // the phone-only modal. Defined once and mounted in a single place at a time, so
  // there is never a duplicate copy of these forms in the DOM - the shared input
  // ids and the single fileInputRef stay valid.
  const contentGrid = (
      <div className={styles.contentGrid}>

        {/* PROFILE INFORMATION */}
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

                <small className={styles.helperText}>
                  This is the email you use to sign in.
                </small>
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

                    {saving
                      ? 'Saving...'
                      : 'Save Changes'}
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

        {/* SECURITY */}
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

        {/* ADDITIONAL SETTINGS */}
        <section className={`${styles.card} ${activeSection === 'additional' ? styles.cardActiveMobile : ''}`}>

          <div className={styles.cardHeader}>
            <div className={styles.cardIcon}>
              <Settings size={18} />
            </div>

            <div>
              <h3>Additional Settings</h3>
              <p>Customize your experience.</p>
            </div>
          </div>

          <div className={styles.form}>
            <div className={styles.field}>
              <label>Theme</label>
              <div className={styles.inputWrapper} style={{ height: 'auto', minHeight: '43px' }}>
                <button
                  type="button"
                  className={styles.themeButton}
                  onClick={toggleTheme}
                  aria-pressed={theme === 'dark'}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #dcc9cf',
                    borderRadius: '9px',
                    background: '#ffffff',
                    color: '#26313f',
                    fontFamily: 'inherit',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
                  <span
                    style={{
                      width: '38px',
                      height: '20px',
                      borderRadius: '999px',
                      background: theme === 'dark' ? '#8b1e2d' : '#dcc9cf',
                      position: 'relative',
                      transition: 'background 0.15s ease',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: '2px',
                        left: theme === 'dark' ? '20px' : '2px',
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        background: '#ffffff',
                        transition: 'left 0.15s ease',
                      }}
                    />
                  </span>
                </button>
              </div>
            </div>
          </div>
        </section>

      </div>
    );

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

      {/* MOBILE SECTION SWITCHER
          Hidden by the stylesheet on desktop, so on a phone each button opens
          its section as a modal. */}
      <div className={styles.sectionSwitcher}>
        <button
          type="button"
          className={`${styles.switcherButton} ${activeSection === 'profile' ? styles.switcherButtonActive : ''}`}
          onClick={() => openSectionModal('profile')}
        >
          <User size={16} />
          Profile Info
        </button>
        <button
          type="button"
          className={`${styles.switcherButton} ${activeSection === 'security' ? styles.switcherButtonActive : ''}`}
          onClick={() => openSectionModal('security')}
        >
          <ShieldCheck size={16} />
          Account Security
        </button>
      </div>

      {/* CONTENT GRID */}
      {/* Hidden while a section is open in a modal, so the page behind the
          overlay does not show a second copy of the same form. */}
      {!modalSection && contentGrid}

      {/* =========================================
          PHONE SECTION MODAL
          Portalled to <body> so it is not clipped by .page or trapped behind the
          dashboard sidebar. Only mounts on phones, from the two switcher buttons.
      ========================================= */}
      {modalSection
        && createPortal(
          <div
            className={styles.sectionModalOverlay}
            onClick={closeModal}
            role="presentation"
          >
            <div
              className={styles.sectionModal}
              role="dialog"
              aria-modal="true"
              aria-label={modalSection === 'profile' ? 'Profile Information' : 'Account Security'}
              // Clicks inside must not reach the overlay's dismiss handler.
              onClick={(event) => event.stopPropagation()}
            >
              <header className={styles.sectionModalHeader}>
                <h2 className={styles.sectionModalTitle}>
                  {modalSection === 'profile' ? 'Profile Information' : 'Account Security'}
                </h2>

                <button
                  type="button"
                  className={styles.sectionModalClose}
                  onClick={closeModal}
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </header>

              <div className={styles.sectionModalBody}>
                {contentGrid}
              </div>
            </div>
          </div>,
          document.body
        )}

    </div>
  );
}
