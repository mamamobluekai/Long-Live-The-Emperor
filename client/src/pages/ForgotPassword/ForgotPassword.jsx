import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Mail,
  Send,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Loader2,
} from 'lucide-react';

import { forgotPassword } from '../../api/authApi';
import styles from '../SetPassword/SetPassword.module.css';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const validate = () => {
    if (!email.trim()) {
      return 'Email address is required.';
    }

    if (!EMAIL_REGEX.test(email.trim())) {
      return 'Please enter a valid email address.';
    }

    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const validationError = validate();

    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const data = await forgotPassword(email.trim());

      setMessage(
        data.message ||
          'If an accepted account exists for that email, a password reset link has been sent.',
      );
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTryAnother = () => {
    setSent(false);
    setMessage('');
    setError('');
  };

  if (sent) {
    return (
      <div className={styles.shell}>
        <div className={styles.container}>
          <div className={styles.card}>
            <div className={styles.sentIcon}>
              <CheckCircle2 size={30} />
            </div>

            <h1 className={styles.successTitle}>Check your inbox</h1>

            <p className={styles.successText}>
              We sent a password reset link. Follow it to create a new
              password. The link expires in 3 days.
            </p>

            <div className={styles.sentTo}>
              <span>Sent to</span>
              {email.trim()}
            </div>

            {message && (
              <div className={`${styles.alert} ${styles.infoAlert}`}>
                <ShieldCheck size={17} />
                <span>{message}</span>
              </div>
            )}

            <div className={styles.buttonStack}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={handleTryAnother}
              >
                <Mail size={16} />
                Use a different email
              </button>

              <Link to="/login" className={styles.btn}>
                <ArrowLeft size={16} />
                Back to login
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.headerIcon}>
              <ShieldCheck size={24} />
            </div>

            <h1>Forgot password</h1>

            <p>
              Enter the email of your accepted account and we&apos;ll send you a
              link to set a new password.
            </p>
          </div>

          {error && (
            <div className={`${styles.alert} ${styles.errorAlert}`}>
              <AlertCircle size={17} />
              <span>{error}</span>
            </div>
          )}

          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <div className={styles.field}>
              <label htmlFor="email">Email address</label>

              <div className={styles.inputWrapper}>
                <Mail size={18} />

                <input
                  id="email"
                  type="email"
                  placeholder="you@school.edu.ph"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError('');
                  }}
                  disabled={loading}
                  autoComplete="email"
                />
              </div>

              <p className={styles.hint}>
                Use the same email you registered with.
              </p>
            </div>

            <button type="submit" disabled={loading} className={styles.btn}>
              {loading ? (
                <Loader2 size={17} className={styles.spin} />
              ) : (
                <Send size={17} />
              )}
              {loading ? 'Sending link...' : 'Send reset link'}
            </button>
          </form>

          <p className={styles.footer}>
            Remembered it?{' '}
            <Link to="/login" className={styles.backLink}>
              Back to login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
