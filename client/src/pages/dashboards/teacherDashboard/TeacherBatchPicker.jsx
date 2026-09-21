import { useTeacherBatch } from '../../../hooks/useTeacherBatch';
import styles from './TeacherStudents.module.css';

// Shared batch switcher for the teacher dashboard. A teacher may handle
// several batches, so every batch-scoped page (students, live map,
// attendance monitor, reports) reads the same persisted selection.
function TeacherBatchPicker() {
  const { batches, selectedId, selectBatch, loading } = useTeacherBatch();

  if (loading) return null;
  if (!batches || batches.length <= 1) return null;

  return (
    <label className={styles.batchPicker}>
      <span className={styles.batchPickerLabel}>Batch</span>
      <select
        className={styles.batchPickerSelect}
        value={selectedId || ''}
        onChange={(e) => selectBatch(e.target.value)}
        aria-label="Select batch"
      >
        {batches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.batch_label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default TeacherBatchPicker;