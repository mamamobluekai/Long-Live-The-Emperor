import { useNavigate } from 'react-router-dom';
import { useAuthForm } from '../../hooks/useAuthForm';
import '../../pages/LoginAndRegister/LoginAndFRegister.css';
import { useEffect } from 'react';

function AuthForm({ onAuthSuccess }) {
  const navigate = useNavigate();
  
  const { mode, setMode, form, handleChange, loading, message, error, handleSubmit, loginSuccess } = useAuthForm((data) => {
    onAuthSuccess?.(data);
  });

  useEffect(() => {
    if (loginSuccess) {
      navigate(`/dashboard/${loginSuccess}`, { replace: true });
    }
  }, [loginSuccess, navigate]);

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand-panel">
          <div>
            <span className="brand-pill">Work Immersion Portal</span>
            <h1>Access your placement journey in one secure place.</h1>
            <p>A polished entry point for students to sign in or create an account for the work immersion system.</p>
            <div className="brand-highlights">
              <span>Fast onboarding</span>
              <span>Secure access</span>
              <span>Modern experience</span>
            </div>
          </div>
        </div>

        <div className="form-panel">
          <div className="toggle-row" role="tablist" aria-label="Auth mode">
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); }}>Login</button>
            <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); }}>Register</button>
          </div>

          <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="subtitle">{mode === 'login' ? 'Sign in to continue to your dashboard.' : 'Register as a student and wait for approval from your coordinator.'}</p>

          {message ? <div className="message">{message}</div> : null}
          {error ? <div className="error">{error}</div> : null}

          <form onSubmit={handleSubmit} noValidate>
            {mode === 'register' ? (
              <div className="form-grid two-col">
                <div className="field">
                  <label htmlFor="studentId">Student ID</label>
                  <input id="studentId" name="studentId" value={form.studentId} onChange={handleChange} required />
                </div>
                <div className="field">
                  <label htmlFor="phone">Phone</label>
                  <input id="phone" name="phone" value={form.phone} onChange={handleChange} />
                </div>
                <div className="field">
                  <label htmlFor="firstName">First name</label>
                  <input id="firstName" name="firstName" value={form.firstName} onChange={handleChange} required />
                </div>
                <div className="field">
                  <label htmlFor="lastName">Last name</label>
                  <input id="lastName" name="lastName" value={form.lastName} onChange={handleChange} required />
                </div>
              </div>
            ) : null}

            <div className="form-grid" style={{ marginTop: '14px' }}>
              <div className="field">
                <label htmlFor="email">Email address</label>
                <input id="email" name="email" type="email" value={form.email} onChange={handleChange} required />
              </div>
              <div className="field">
                <label htmlFor="password">Password</label>
                <input id="password" name="password" type="password" value={form.password} onChange={handleChange} required />
              </div>
              {mode === 'register' ? (
                <div className="field">
                  <label htmlFor="confirmPassword">Confirm password</label>
                  <input id="confirmPassword" name="confirmPassword" type="password" value={form.confirmPassword} onChange={handleChange} required />
                </div>
              ) : null}
            </div>

            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <p className="helper-text">
            {mode === 'login' ? 'New here?' : 'Already have an account?'}{' '}
            <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? 'Create an account' : 'Sign in instead'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default AuthForm;
