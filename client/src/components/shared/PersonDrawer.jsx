// Shared side drawer for a person's profile (teacher / coordinator).
// Slides in from the right at half the screen width, matching the
// Lexend + maroon design system used across the dashboards.
import { useEffect } from 'react';
import styles from './PersonDrawer.module.css';

function PersonDrawer({ person, onClose }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (!person) return null;

  const { role, firstName, lastName, batchLabel, fields } = person;
  const fullName = `${firstName || ''} ${lastName || ''}`.trim() || 'Unnamed';
  const initials = `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`.toUpperCase().slice(0, 2) || 'NA';

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="person-drawer-title">
        <div className={styles.header}>
          <div className={styles.identityBlock}>
            <div className={styles.avatarFallback}>{initials}</div>
            <div>
              <span className={styles.eyebrow}>{role}</span>
              <h2 id="person-drawer-title">{fullName}</h2>
              {batchLabel ? <p>{batchLabel}</p> : null}
            </div>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            x
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.detailGrid}>
            {fields.map((field) => (
              <div key={field.label} className={styles.detailItem}>
                <span>{field.label}</span>
                <strong>{field.value || 'Not provided'}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export default PersonDrawer;
