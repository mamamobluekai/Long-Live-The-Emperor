// Full-screen notice shown to non-admin users while maintenance mode is on.
// Admins are exempt from the server gate, so this never renders for them.
import { Clock3, Wrench } from 'lucide-react';
import { useMaintenance } from '../../context/maintenanceContextValue';
import styles from './MaintenanceScreen.module.css';

const formatTimestamp = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function MaintenanceScreen() {
  const { status } = useMaintenance();
  const started = formatTimestamp(status.startedAt);
  const estimatedEnd = formatTimestamp(status.estimatedEnd);

  return (
    <div className={styles.screen}>
      <div className={styles.panel} role="alert" aria-live="assertive">
        <span className={styles.icon} aria-hidden="true">
          <Wrench size={26} strokeWidth={1.8} />
        </span>

        <p className={styles.eyebrow}>SYSTEM UNAVAILABLE</p>
        <h1 className={styles.title}>We'll be right back</h1>
        <p className={styles.message}>{status.message}</p>

        <dl className={styles.details}>
          {started ? (
            <div className={styles.detail}>
              <dt>
                <Clock3 size={13} strokeWidth={2} aria-hidden="true" />
                Started
              </dt>
              <dd>{started}</dd>
            </div>
          ) : null}
          {estimatedEnd ? (
            <div className={styles.detail}>
              <dt>
                <Clock3 size={13} strokeWidth={2} aria-hidden="true" />
                Expected back by
              </dt>
              <dd>{estimatedEnd}</dd>
            </div>
          ) : null}
        </dl>

        <p className={styles.note}>
          This page refreshes on its own. You'll be able to sign in again as soon as maintenance
          is finished.
        </p>
      </div>
    </div>
  );
}
