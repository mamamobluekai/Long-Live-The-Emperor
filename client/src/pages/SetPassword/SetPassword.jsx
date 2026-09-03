import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword, verifyResetToken } from '../../api/authApi';
import styles from './SetPassword.module.css';

function SetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const email = searchParams.get('email');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingToken, setLoadingToken] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (token) {
      setLoadingToken(true);
      verifyResetToken(token)
        .then(() => setError(''))
        .catch((err) => setError(err.message))
        .finally(() => setLoadingToken(false));
    }
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (token) {
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    } else if (!email) {
      setError('Invalid or missing reset information.');
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
      let data;
      if (token) {
        data = await resetPassword({ token, password, confirmPassword });
      } else {
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'}/users/set-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password }),
        });
        data = await res.json();
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
      <div className={styles.card}>
        <h1>Set Your Password</h1>
        {loadingToken ? (
          <p style={{ textAlign: 'center', color: '#64748b' }}>Verifying reset link...</p>
        ) : null}
        {email && !token ? (
          <p style={{ textAlign: 'center', color: '#64748b', marginBottom: 20 }}>
            Welcome, {email}. Please create your password.
          </p>
        ) : null}

        {message && <div className={styles.message}>{message}</div>}
        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading || loadingToken}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={loading || loadingToken}
            />
          </div>
          <button type="submit" disabled={loading || loadingToken} className={styles.btn}>
            {loading ? 'Saving...' : 'Set Password'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default SetPassword;