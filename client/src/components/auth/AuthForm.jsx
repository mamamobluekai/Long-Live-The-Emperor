import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthForm } from '../../hooks/useAuthForm';
import SplashScreen from './SplashScreen';
import '../../pages/LoginAndRegister/LoginAndFRegister.css';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  GraduationCap,
  LogIn,
  ShieldCheck,
  UserCog,
  Users,
} from 'lucide-react';

const ROLES = [
  { id: 'student', label: 'Student', Icon: GraduationCap },
  { id: 'teacher', label: 'Teacher', Icon: Users },
  { id: 'coordinator', label: 'Coordinator', Icon: UserCog },
  { id: 'supervisor', label: 'Supervisor', Icon: ShieldCheck },
];

const ROLE_COPY = {
  student: {
    label: 'Student',
    description:
      'Log your daily immersion hours, upload your documentation, check your requirement progress, and raise concerns from one dashboard built for your whole work immersion journey.',
  },
  teacher: {
    label: 'Teacher',
    description:
      'Monitor your class attendance in the field, review student documentation, read attendance insights, and file concerns so every student you handle is accounted for.',
  },
  coordinator: {
    label: 'Coordinator',
    description:
      'Approve student requirements, assign and manage supervisors, upload batches, and track deployment requests so every batch stays on schedule all year round.',
  },
  supervisor: {
    label: 'Supervisor',
    description:
      'Evaluate your interns, verify attendance at the host site, certify completed requirements, and keep deployment schedules organised for your team.',
  },
};
function AuthForm({ onAuthSuccess }) {
  const navigate = useNavigate();

  const {
    mode,
    setMode,
    role,
    setRole,
    form,
    handleChange,
    loading,
    message,
    error,
    handleSubmit,
    loginSuccess,
  } = useAuthForm((data) => {
    onAuthSuccess?.(data);
  });

  useEffect(() => {
    if (loginSuccess) {
      navigate(`/dashboard/${loginSuccess}`, {
        replace: true,
      });
    }
  }, [loginSuccess, navigate]);

  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);

  /* Registration runs as two screens so the form stays short on phones. */
const [regStep, setRegStep] = useState(1);

useEffect(() => {
    setRegStep(1);
  }, [mode]);

  const showProfileFields =
    mode === 'register' && regStep === 1;

  const showAccountFields =
    mode === 'login' || regStep === 2;

  const roleCopy = ROLE_COPY[role] || ROLE_COPY.student;

  return (
    <SplashScreen variant="user">
      <div className="auth-shell">
        <div className="auth-layout">
          {/* ================= BRAND SIDE ================= */}
          <aside className="brand-panel">
            <img
              src="/logo.png"
              alt="School Logo"
              className="brand-logo"
            />

            <h1 className="brand-name">e-MMERSION</h1>

            {mode === 'login' ? (
              <>
                <p className="brand-tag">
                  {roleCopy.label} portal
                </p>

                <p className="brand-description">
                  {roleCopy.description}
                </p>
              </>
            ) : (
              <>
                <p className="brand-tag">
                  Student registration
                </p>

                <p className="brand-description">
                  Create your student account and wait for approval from
                  your coordinator before you can sign in.
                </p>
              </>
            )}
          </aside>

          {/* ================= FORM SIDE ================= */}
          <section className="form-panel-card">
            <div className="eyebrow">
              <span className="eyebrow-line" />

              <span className="eyebrow-text">
                Work Immersion Monitoring System
              </span>

              <span className="eyebrow-line" />
            </div>

            <h2 className="panel-title">
              {mode === 'login' ? 'Welcome Back' : 'Create Account'}
            </h2>

            <p className="panel-subtitle">
              {mode === 'login'
                ? 'Sign in to continue to your account'
                : 'Register as a student to get started'}
            </p>

            {message ? (
              <div className="alert alert-success" role="alert">
                <AlertCircle className="alert-icon" size={16} />
                <span className="alert-text">
                  {message}
                </span>
              </div>
            ) : null}

            {error ? (
              <div className="alert alert-error" role="alert">
                <AlertCircle className="alert-icon" size={16} />
                <span className="alert-text">
                  {error}
                </span>
              </div>
            ) : null}

            <form
              onSubmit={handleSubmit}
              noValidate
            >
              {mode === 'login' ? (
                <div
                  className="role-row"
                  role="tablist"
                  aria-label="User role"
                >
                  {ROLES.map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={role === id}
                      className={`role-btn ${
                        role === id ? 'active' : ''
                      }`}
                      onClick={() => setRole(id)}
                    >
                      <Icon size={16} />

                      {label}
                    </button>
                  ))}
                </div>
              ) : null}

              {mode === 'register' ? (
                <div className="step-dots">
                  <span
                    className={`step-dot ${
                      regStep >= 1 ? 'done' : ''
                    }`}
                  />

                  <span
                    className={`step-dot ${
                      regStep >= 2 ? 'done' : ''
                    }`}
                  />
                </div>
              ) : null}

              {showProfileFields ? (
                <div className="form-grid two-col">
                  <div className="field">
                    <label htmlFor="studentId">
                      Student ID
                    </label>

                    <div className="input-box">
                      <input
                        id="studentId"
                        name="studentId"
                        type="text"
                        placeholder="Enter your student ID"
                        value={form.studentId}
                        onChange={handleChange}
                        required
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="phone">
                      Phone
                    </label>

                    <div className="input-box">
                      <input
                        id="phone"
                        name="phone"
                        type="tel"
                        placeholder="Enter your phone number"
                        value={form.phone}
                        onChange={handleChange}
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="firstName">
                      First name
                    </label>

                    <div className="input-box">
                      <input
                        id="firstName"
                        name="firstName"
                        type="text"
                        placeholder="Enter your first name"
                        value={form.firstName}
                        onChange={handleChange}
                        required
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="lastName">
                      Last name
                    </label>

                    <div className="input-box">
                      <input
                        id="lastName"
                        name="lastName"
                        type="text"
                        placeholder="Enter your last name"
                        value={form.lastName}
                        onChange={handleChange}
                        required
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="middleName">
                      Middle name
                    </label>

                    <div className="input-box">
                      <input
                        id="middleName"
                        name="middleName"
                        type="text"
                        placeholder="Enter your middle name"
                        value={form.middleName}
                        onChange={handleChange}
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="gender">
                      Gender
                    </label>

                    <div className="input-box">
                      <select
                        id="gender"
                        name="gender"
                        value={form.gender}
                        onChange={handleChange}
                        required
                      >
                        <option value="">
                          Select your gender
                        </option>

                        <option value="Male">
                          Male
                        </option>

                        <option value="Female">
                          Female
                        </option>
                      </select>
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="section">
                      Section
                    </label>

                    <div className="input-box">
                      <input
                        id="section"
                        name="section"
                        type="text"
                        placeholder="Enter your section"
                        value={form.section}
                        onChange={handleChange}
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="strand">
                      Strand
                    </label>

                    <div className="input-box">
                      <select
                        id="strand"
                        name="strand"
                        value={form.strand}
                        onChange={handleChange}
                        required
                      >
                        <option value="">
                          Select your strand
                        </option>

                        <option value="STEM">STEM</option>
                        <option value="ABM">ABM</option>
                        <option value="HUMSS">HUMSS</option>
                        <option value="GAS">GAS</option>
                        <option value="TVL">TVL</option>
                      </select>
                    </div>
                  </div>
                </div>
              ) : null}

              {mode === 'register' && regStep === 1 ? (
                <button
                  type="button"
                  className="submit-btn"
                  onClick={() => setRegStep(2)}
                >
                  <>
                    <ArrowRight size={18} />

                    Next
                  </>
                </button>
              ) : null}

              {showAccountFields ? (
                <>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="email">
                    Email address
                  </label>

                  <div className="input-box">
                    <input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="student1@wims.edu.ph"
                      value={form.email}
                      onChange={handleChange}
                      autoComplete="username"
                      required
                    />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="password">
                    Password
                  </label>

                  <div className="input-box">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={form.password}
                      onChange={handleChange}
                      autoComplete="current-password"
                      required
                    />

                    <button
                      type="button"
                      className="reveal-btn"
                      onClick={() =>
                        setShowPassword((value) => !value)
                      }
                      aria-label={
                        showPassword
                          ? 'Hide password'
                          : 'Show password'
                      }
                    >
                      {showPassword ? (
                        <EyeOff size={18} />
                      ) : (
                        <Eye size={18} />
                      )}
                    </button>
                  </div>
                </div>

                {mode === 'register' ? (
                  <div className="field">
                    <label htmlFor="confirmPassword">
                      Confirm password
                    </label>

                    <div className="input-box">
                      <input
                        id="confirmPassword"
                        name="confirmPassword"
                        type="password"
                        placeholder="Confirm your password"
                        value={form.confirmPassword}
                        onChange={handleChange}
                        autoComplete="new-password"
                        required
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="field-row">
                <label className="remember-row">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) =>
                      setRemember(e.target.checked)
                    }
                  />

                  <span>Remember me</span>
                </label>

                {mode === 'login' ? (
                  <button
                    type="button"
                    className="forgot-link"
                    onClick={() =>
                      navigate('/forgot-password')
                    }
                  >
                    Forgot Password?
                  </button>
                ) : null}
              </div>

              {mode === 'register' ? (
                <button
                  type="button"
                  className="back-btn"
                  onClick={() => setRegStep(1)}
                >
                  <ArrowLeft size={16} />

                  Back
                </button>
              ) : null}

              <button
                type="submit"
                className="submit-btn"
                disabled={loading}
              >
                {loading ? (
                  'Please wait...'
                ) : (
                  <>
                    <LogIn size={18} />

                    {mode === 'login'
                      ? 'Login'
                      : 'Create account'}
                  </>
                )}
              </button>
                </>
              ) : null}
            </form>

            <p className="helper-text">
              {mode === 'login'
                ? "Don't have an account?"
                : 'Already have an account?'}

              {' '}

              <button
                type="button"
                onClick={() =>
                  setMode(
                    mode === 'login'
                      ? 'register'
                      : 'login'
                  )
                }
              >
                {mode === 'login'
                  ? 'Sign up now'
                  : 'Sign in instead'}
              </button>
            </p>
          </section>
        </div>
      </div>
    </SplashScreen>
  );
}

export default AuthForm;