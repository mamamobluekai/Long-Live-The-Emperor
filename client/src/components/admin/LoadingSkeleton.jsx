import styles from './LoadingSkeleton.module.css';

export default function LoadingSkeleton({ rows = 6, variant = 'table' }) {
  if (variant === 'cards') {
    return (
      <div className={styles.cardsGrid}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className={styles.cardSkeleton} />
        ))}
      </div>
    );
  }

  return (
    <div className={styles.tableSkeleton}>
      <div className={styles.skeletonHeader} />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={styles.skeletonRow} />
      ))}
    </div>
  );
}
