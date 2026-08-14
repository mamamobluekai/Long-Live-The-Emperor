import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthForm } from '../../hooks/useAuthForm';
import '../../pages/LoginAndRegister/LoginAndFRegister.css';
import { Mail, Lock, User, Phone, IdCard } from 'lucide-react';


function AuthForm({ onAuthSuccess }) {
  const navigate = useNavigate();

  const {
    mode,
    setMode,
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

  // Selected role
  const [role, setRole] = useState('student');

  useEffect(() => {
    if (loginSuccess) {
      navigate(`/dashboard/${loginSuccess}`, {
        replace: true,
      });
    }
  }, [loginSuccess, navigate]);

  return (
    <div className="auth-shell">
      <div className="auth-overlay"></div>

      <div className="auth-container">

        {/* LOGO ABOVE LOGIN FORM */}
        <div className="logo-container">
          <img
            src="/logo.png"
            alt="School Logo"
            className="login-logo"
          />
        </div>

    <div className="auth-card">

        <div className="form-panel">

          {/* =================================
              TITLE
          ================================= */}
          <h2 className="login-title">
            {mode === 'login' ? 'Login' : 'Create Account'}
          </h2>

          {/* =================================
              ROLE BUTTONS
          ================================= */}
          {mode === 'login' && (
            <div
              className="role-row"
              role="tablist"
              aria-label="User role"
            >

              <button
                type="button"
                className={`role-btn ${
                  role === 'student' ? 'active' : ''
                }`}
                onClick={() => setRole('student')}
              >
                Student
              </button>

              <button
                type="button"
                className={`role-btn ${
                  role === 'teacher' ? 'active' : ''
                }`}
                onClick={() => setRole('teacher')}
              >
                Teacher
              </button>

              <button
                type="button"
                className={`role-btn ${
                  role === 'coordinator' ? 'active' : ''
                }`}
                onClick={() => setRole('coordinator')}
              >
                Coordinator
              </button>

              <button
                type="button"
                className={`role-btn ${
                  role === 'supervisor' ? 'active' : ''
                }`}
                onClick={() => setRole('supervisor')}
              >
                Supervisor
              </button>

            </div>
          )}

          {/* =================================
              SUBTITLE
          ================================= */}
          <p className="subtitle">
            {mode === 'login'
              ? 'Sign in to continue to your dashboard.'
              : 'Register as a student and wait for approval from your coordinator.'
            }
          </p>

          {/* =================================
              MESSAGE
          ================================= */}
          {message ? (
            <div className="message">
              {message}
            </div>
          ) : null}

          {/* =================================
              ERROR
          ================================= */}
          {error ? (
            <div className="error">
              {error}
            </div>
          ) : null}

          {/* =================================
              FORM
          ================================= */}
          <form
            onSubmit={handleSubmit}
            noValidate
          >

            {/* =================================
                REGISTER FIELDS
            ================================= */}
            {mode === 'register' ? (
              <div className="form-grid two-col">

                <div className="field">
                  <label htmlFor="studentId">
                    Student ID
                  </label>
                  <div className="input-box">
                    <IdCard className="input-icon" size={18} />
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
                <Phone className="input-icon" size={18} />

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
                <User className="input-icon" size={18} />

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
                <User className="input-icon" size={18} />

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

              </div>
            ) : null}

            {/* =================================
                EMAIL / PASSWORD
            ================================= */}
            <div
              className="form-grid"
              style={{ marginTop: '14px' }}
            >

              <div className="field">
                <label htmlFor="email">
                  Email address
                </label>

                <div className="input-box">
                  <Mail className="input-icon" size={18} />

                  <input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="Enter your email"
                    value={form.email}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="field">
                  <label htmlFor="password">
                    Password
                  </label>

                  <div className="input-box">
                    <Lock className="input-icon" size={18} />

                    <input
                      id="password"
                      name="password"
                      type="password"
                      placeholder="Enter your password"
                      value={form.password}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>

              {mode === 'register' ? (
                <div className="field">
                  <label htmlFor="confirmPassword">
                    Confirm password
                  </label>
                  <div className="input-box">
                      <Lock className="input-icon" size={18} />
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      placeholder="Confirm your password"
                      value={form.confirmPassword}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>
              ) : null}

            </div>

            {/* =================================
                FORGOT PASSWORD
            ================================= */}
            {mode === 'login' && (
              <div className="forgot-password">
                <span>
                  Forgot Password?
                </span>

                <button
                  type="button"
                  onClick={() =>
                    navigate('/forgot-password')
                  }
                >
                  click here
                </button>
              </div>
            )}

            {/* =================================
                SUBMIT
            ================================= */}
            <button
              type="submit"
              className="submit-btn"
              disabled={loading}
            >
              {loading
                ? 'Please wait...'
                : mode === 'login'
                  ? 'Login'
                  : 'Create account'
              }
            </button>

          </form>

          {/* =================================
              SIGN UP / LOGIN
          ================================= */}
          <p className="helper-text">

            {mode === 'login'
              ? "Don't have an account?"
              : 'Already have an account?'
            }

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
                : 'Sign in instead'
              }
            </button>

          </p>

          {/* =================================
              ADMIN LOGIN
          ================================= */}
          <p className="admin-link">

            <button
              type="button"
              onClick={() =>
                navigate('/admin/login')
              }
            >
              Admin login
            </button>

          </p>

        </div>
      </div>
    </div>
  </div>
  );
}

export default AuthForm;