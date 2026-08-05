import styles from './Pagination.module.css';

export default function Pagination({ current, total, limit, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  if (totalPages <= 1) return null;

  const pages = [];
  const start = Math.max(1, current - 2);
  const end = Math.min(totalPages, current + 2);
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  return (
    <div className={styles.pagination}>
      <button
        className={styles.pageBtn}
        disabled={current <= 1}
        onClick={() => onPageChange(current - 1)}
      >
        Previous
      </button>
      {start > 1 && <span className={styles.ellipsis}>…</span>}
      {pages.map((p) => (
        <button
          key={p}
          className={`${styles.pageBtn} ${p === current ? styles.active : ''}`}
          onClick={() => onPageChange(p)}
        >
          {p}
        </button>
      ))}
      {end < totalPages && <span className={styles.ellipsis}>…</span>}
      <button
        className={styles.pageBtn}
        disabled={current >= totalPages}
        onClick={() => onPageChange(current + 1)}
      >
        Next
      </button>
    </div>
  );
}
