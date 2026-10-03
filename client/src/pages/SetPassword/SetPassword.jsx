import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShieldCheck,
  Loader2,
  ArrowLeft,
  Info,
} from 'lucide-react';

import { resetPassword, verifyResetToken } from '../../api/authApi';
import { getPasswordFormProblem } from '../../utils/passwordPolicy';
import { API_BASE } from '../../config/api';
import styles from './SetPassword.module.css';

// Mirrors the server rule in server/utils/passwordPolicy.js. The displayed
// checklist and the actual enforcement must agree, so both read the same tests.
const PASSWORD_RULES = [
  { key: 'length', label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { key: 'lowercase', label: 'Contains a lowercase letter', test: (v) => /[a-z]/.test(v) },
  { key: 'uppercase', label: 'Contains an uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { key: 'number', label: 'Contains a number', test: (v) => /\d/.test(v) },
];

export default function SetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const token = searchParams.get('token');
  const email = searchParams.get('email');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [tokenState, setTokenState] = useState(
    token ? 'verifying' : email ? 'email' : 'missing',
  );
  const [tokenError, setTokenError] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;

    let active = true;
    setTokenState('verifying');

    verifyResetToken(token)
      .then(() => {
        if (active) setTokenState('valid');
      })
      .catch((err) => {
        if (!active) return;
        setTokenState('invalid');
        setTokenError(err.message);
      });

    return () => {
      active = false;
    };
  }, [token]);

  const results = useMemo(
    () => PASSWORD_RULES.map((rule) => ({ ...rule, met: rule.test(password) })),
    [password],
  );

  const metCount = results.filter((rule) => rule.met).length;
  const strengthLabel = !password
    ? 'Enter a password'
    : metCount === 3
      ? 'Strong password'
      : metCount === 2
        ? 'Almost there'
        : 'Too weak';

  const passwordsMatch =
    confirmPassword.length > 0 && password === confirmPassword;

  const blocked =
    tokenState === 'verifying' ||
    tokenState === 'missing' ||
    tokenState === 'invalid' ||
    loading;

  const handleSubmit = async (e) => {
    e.preventDefault();

    const problem = getPasswordFormProblem(password, confirmPassword);
    if (problem) {
      setError(problem);
      return;
    }

    if (!token && !email) {
      setError('Invalid or missing reset information.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      if (token) {
        await resetPassword({ token, password, confirmPassword });
      } else {
        const res = await fetch(
          `${API_BASE}/users/set-password`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email, password, confirmPassword }),
          },
        );

        // Guarded like every other api module: a gateway/proxy error page or an empty
// body would otherwise throw a SyntaxError here, which replaces the server's
        // real message and skips the `!res.ok` branch entirely.
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.error || data.message || 'Failed to set password');
        }
      }

      setMessage('Password set successfully. Redirecting to login...');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.shell}>
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.headerIcon}>
              <KeyRound size={24} />
            </div>

            <h1>Set your password</h1>

            {tokenState === 'email' && email ? (
              <p>
                Welcome, <strong>{email}</strong>. Create a password to activate
                your account.
              </p>
            ) : (
              <p>
                Choose a strong password you don&apos;t use anywhere else.
              </p>
            )}
          </div>

          {tokenState === 'verifying' && (
            <div className={styles.loadingState}>
              <div className={styles.spinner} />
              Verifying your reset link...
            </div>
          )}

          {tokenState === 'invalid' && (
            <>
              <div className={`${styles.alert} ${styles.errorAlert}`}>
                <AlertCircle size={17} />
                <span>
                  {tokenError || 'This reset link is invalid or has expired.'}
                </span>
              </div>

              <div className={styles.buttonStack} style={{ marginTop: 16 }}>
                <Link to="/forgot-password" className={styles.btn}>
                  Request a new link
                </Link>
                <Link to="/login" className={styles.secondaryBtn}>
                  <ArrowLeft size={16} />
                  Back to login
                </Link>
              </div>
            </>
          )}

          {tokenState === 'missing' && (
            <>
              <div className={`${styles.alert} ${styles.errorAlert}`}>
                <AlertCircle size={17} />
                <span>
                  This page needs a valid reset link or an activation email.
                </span>
              </div>

              <div className={styles.buttonStack} style={{ marginTop: 16 }}>
                <Link to="/forgot-password" className={styles.btn}>
                  Request a reset link
                </Link>
                <Link to="/login" className={styles.secondaryBtn}>
                  <ArrowLeft size={16} />
                  Back to login
                </Link>
              </div>
            </>
          )}

          {(tokenState === 'valid' || tokenState === 'email') && (
            <>
              {tokenState === 'valid' && (
                <div className={`${styles.alert} ${styles.successAlert}`}>
                  <CheckCircle2 size={17} />
                  <span>Your reset link is verified. Set a new password.</span>
                </div>
              )}

              {message && (
                <div className={`${styles.alert} ${styles.successAlert}`}>
                  <CheckCircle2 size={17} />
                  <span>{message}</span>
                </div>
              )}

              {error && (
                <div className={`${styles.alert} ${styles.errorAlert}`}>
                  <AlertCircle size={17} />
                  <span>{error}</span>
                </div>
              )}

              <form
                className={styles.form}
                onSubmit={handleSubmit}
                style={{ marginTop: 18 }}
                noValidate
              >
                <div className={styles.field}>
                  <label htmlFor="password">New password</label>

                  <div className={styles.inputWrapper}>
                    <Lock size={18} />

                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter a new password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (error) setError('');
                      }}
                      disabled={blocked}
                      autoComplete="new-password"
                    />

                    <button
                      type="button"
                      className={styles.toggleBtn}
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      disabled={blocked}
                    >
                      {showPassword ? (
                        <EyeOff size={17} />
                      ) : (
                        <Eye size={17} />
                      )}
                    </button>
                  </div>

                  <div className={styles.strength}>
                    <div className={styles.strengthTrack}>
                      {[1, 2, 3, 4].map((step) => (
                        <span
                          key={step}
                          className={`${styles.strengthBar} ${
                            metCount >= step
                              ? styles[`strengthBarActive${metCount}`]
                              : ''
                          }`}
                        />
                      ))}
                    </div>

                    <span className={styles.strengthLabel}>{strengthLabel}</span>

                    <div className={styles.rules}>
                      {results.map((rule) => (
                        <span
                          key={rule.key}
                          className={`${styles.rule} ${rule.met ? styles.ruleMet : ''}`}
                        >
                          {rule.met ? (
                            <CheckCircle2 size={13} />
                          ) : (
                            <XCircle size={13} />
                          )}
                          {rule.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className={styles.field}>
                  <label htmlFor="confirmPassword">Confirm password</label>

                  <div className={styles.inputWrapper}>
                    <ShieldCheck size={18} />

                    <input
                      id="confirmPassword"
                      type={showConfirm ? 'text' : 'password'}
                      placeholder="Repeat your new password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        if (error) setError('');
                      }}
                      disabled={blocked}
                      autoComplete="new-password"
                    />

                    <button
                      type="button"
                      className={styles.toggleBtn}
                      onClick={() => setShowConfirm((v) => !v)}
                      aria-label={
                        showConfirm ? 'Hide password' : 'Show password'
                      }
                      disabled={blocked}
                    >
                      {showConfirm ? (
                        <EyeOff size={17} />
                      ) : (
                        <Eye size={17} />
                      )}
                    </button>
                  </div>

                  {confirmPassword.length > 0 && (
                    <p
                      className={`${styles.matchLine} ${
                        passwordsMatch ? styles.matchLineMet : styles.matchLineBad
                      }`}
                    >
                      {passwordsMatch ? (
                        <CheckCircle2 size={14} />
                      ) : (
                        <XCircle size={14} />
                      )}
                      {passwordsMatch
                        ? 'Passwords match'
                        : 'Passwords do not match'}
                    </p>
                  )}
                </div>

                <div className={`${styles.alert} ${styles.infoAlert}`}>
                  <Info size={17} />
                  <span>
                    You will be signed out of other devices after this change.
                  </span>
                </div>

                <button type="submit" disabled={blocked} className={styles.btn}>
                  {loading ? (
                    <Loader2 size={17} className={styles.spin} />
                  ) : (
                    <KeyRound size={17} />
                  )}
                  {loading ? 'Saving...' : 'Set password'}
                </button>
              </form>

              <p className={styles.footer}>
                <Link to="/login" className={styles.backLink}>
                  <ArrowLeft size={13} /> Back to login
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
