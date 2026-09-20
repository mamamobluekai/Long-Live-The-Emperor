import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { getErrorMessage } from '../../utils/errors';
import styles from './AdminLogin.module.css';


export default function AdminLogin() {
  const navigate = useNavigate();
  const { login } = useAdminAuth();

  const [form, setForm] = useState({
    email: '',
    password: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (error) {
      setError('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setLoading(true);
    setError('');

    try {
      const data = await login({
        email: form.email,
        password: form.password,
      });

      const role = data.user?.role;

      if (role === 'admin') {
        navigate('/dashboard/admin', { replace: true });
      } else {
        navigate(`/dashboard/${role}`, { replace: true });
      }
    } catch (err) {
      setError(getErrorMessage(err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.shell}>
      <div className={styles.overlay} />

      <div className={styles.card}>
        <div className={styles.brand}>
          <img
            src="/logo.png"
            alt="e-MMERSION Logo"
            className={styles.logo}
          />

          <h2>e-MMERSION</h2>

          <p>Work Immersion Monitoring System</p>
        </div>

        <div className={styles.divider} />

        <div className={styles.headerBlock}>
          <h1>Admin Login</h1>
          <p>Sign in to access the administration dashboard.</p>
        </div>

        {error && (
          <div className={styles.errorMessage}>
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          noValidate
          className={styles.form}
        >
          <div className={styles.field}>
            <label htmlFor="email">
              Email address
            </label>

            <div className={styles.inputWrap}>
              <svg
                className={styles.inputIcon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <rect
                  x="3"
                  y="5"
                  width="18"
                  height="14"
                  rx="2"
                />
                <path d="m3 7 9 6 9-6" />
              </svg>

              <input
                id="email"
                name="email"
                type="email"
                placeholder="admin@wims.edu.ph"
                value={form.email}
                onChange={handleChange}
                required
                autoComplete="username"
              />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="password">
              Password
            </label>

            <div className={styles.inputWrap}>
              <svg
                className={styles.inputIcon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <rect
                  x="4"
                  y="10"
                  width="16"
                  height="11"
                  rx="2"
                />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>

              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={form.password}
                onChange={handleChange}
                required
                autoComplete="current-password"
                className={styles.passwordInput}
              />

              <button
                type="button"
                className={styles.eyeBtn}
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
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M3 3l18 18" />
                    <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                    <path d="M9.9 4.2A10.7 10.7 0 0 1 12 4c5 0 8.5 4 9.5 6-.4.9-1.4 2.4-3 3.7" />
                    <path d="M6.2 6.2C3.9 7.7 2.8 9.5 2.5 10c1 2 4.5 6 9.5 6 1 0 2-.2 2.9-.5" />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                    <circle
                      cx="12"
                      cy="12"
                      r="2.5"
                    />
                  </svg>
                )}
              </button>
            </div>

            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(e) =>
                  setShowPassword(e.target.checked)
                }
              />

              <span>Show password</span>
            </label>
          </div>

          <div className={styles.forgotRow}>
            <span>Forgot Password?</span>

            <button
              type="button"
              className={styles.forgotBtn}
            >
              click here
            </button>
          </div>

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={loading}
          >
            {loading ? (
              <>
                <span
                  className={styles.spinner}
                  aria-hidden="true"
                />
                Signing in...
              </>
            ) : (
              'Login'
            )}
          </button>
        </form>

        <div className={styles.signupText}>
          <span>Not an admin?</span>{' '}
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => navigate('/login')}
          >
            Student/Teacher login
          </button>
        </div>
      </div>
    </div>
  );
}