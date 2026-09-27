import { Layers } from 'lucide-react';
import { useTeacherBatch } from '../../../hooks/useTeacherBatch';
import styles from './TeacherSidebarBatch.module.css';

// Sidebar batch switcher. One selection drives every batch-scoped page
// (students, attendance, documentation, evaluations, reports, overview).
// The Live Map is intentionally excluded: it always shows all batches and
// colors markers by batch.
function TeacherSidebarBatchSwitcher() {
  const { batches, batchId, batchLabel, selectBatch, loading, error, reload } = useTeacherBatch();

  if (loading) {
    return (
      <div className={styles.block}>
        <div className={styles.label}>
          <Layers size={14} strokeWidth={2} />
          <span>Batch</span>
        </div>
        <div className={styles.loading}>Loading batches...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.block}>
        <div className={styles.label}>
          <Layers size={14} strokeWidth={2} />
          <span>Batch</span>
        </div>
        <div className={styles.error}>{error}</div>
        <button type="button" className={styles.retry} onClick={reload}>
          Retry
        </button>
      </div>
    );
  }

  if (!batches || batches.length === 0) {
    return (
      <div className={styles.block}>
        <div className={styles.label}>
          <Layers size={14} strokeWidth={2} />
          <span>Batch</span>
        </div>
        <div className={styles.empty}>No batch assigned</div>
      </div>
    );
  }

  if (batches.length === 1) {
    return (
      <div className={styles.block}>
        <div className={styles.label}>
          <Layers size={14} strokeWidth={2} />
          <span>Batch</span>
        </div>
        <div className={styles.single} title={batchLabel}>
          {batchLabel}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.block}>
      <label className={styles.label} htmlFor="teacher-sidebar-batch">
        <Layers size={14} strokeWidth={2} />
        <span>Batch</span>
      </label>
      <select
        id="teacher-sidebar-batch"
        className={styles.select}
        value={batchId || ''}
        onChange={(e) => selectBatch(e.target.value)}
      >
        {batches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.batch_label}
          </option>
        ))}
      </select>
      <p className={styles.hint} title="Applies to all dashboard data. The Live Map always shows every batch.">
        Live Map shows all batches
      </p>
    </div>
  );
}

export default TeacherSidebarBatchSwitcher;
