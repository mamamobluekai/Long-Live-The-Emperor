import { useEffect, useState } from 'react';
import styles from './SplashScreen.module.css';

const COPY = {
  user: {
    title: 'e-MMERSION',
    badge:
      'Tracking student attendance, daily documentation, and supervisor evaluations in one place.',
    status: 'Preparing your workspace',
  },
  admin: {
    title: 'e-MMERSION Admin',
    badge:
      'Overseeing students, supervisors, and immersion records across the whole school.',
    status: 'Securing admin console',
  },
};

/**
 * Full-screen branded splash shown on mount, then dissolved to reveal the
 * login content underneath.
 */
export default function SplashScreen({
  variant = 'user',
  duration = 1900,
  children,
}) {
  const [state, setState] = useState('visible');

  const copy = COPY[variant] || COPY.user;

  useEffect(() => {
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    const total = reduced ? 120 : duration;

    const dismiss = setTimeout(() => setState('hidden'), total);
    const unmount = setTimeout(() => setState('done'), total + 800);

    return () => {
      clearTimeout(dismiss);
      clearTimeout(unmount);
    };
  }, [duration]);

  if (state === 'done') {
    return children ?? null;
  }

  return (
    <div
      className={styles.root}
      data-state={state}
      style={{ '--splash-exit': '600ms' }}
      role="status"
      aria-live="polite"
      aria-label="Loading e-MMERSION"
    >
      <div className={styles.aurora} />
      <div className={styles.grid} />

      <div className={styles.content} data-state={state}>
        <div className={styles.markWrap}>
          <span className={styles.ring} />
          <span className={styles.ring} />
          <span className={styles.ring} />

          <img
            src="/logo.png"
            alt=""
            className={styles.mark}
          />
        </div>

        <div className={styles.brand}>
          <h1 className={styles.title}>
            {copy.title}
          </h1>

          <p className={styles.subtitle}>
            {copy.subtitle}
          </p>

          <span className={styles.badge}>
            {copy.badge}
          </span>
        </div>

        <div
          className={styles.bar}
          style={{ '--splash-duration': `${duration}ms` }}
        >
          <span className={styles.barFill} />
        </div>

        <p className={styles.status}>
          {copy.status}
        </p>
      </div>
    </div>
  );
}