import { useContext } from 'react';
import { TeacherBatchContext } from '../context/teacherBatchContext';

// Consumer hook for the shared teacher batch selection. A teacher may handle
// MULTIPLE batches; `TeacherBatchProvider` owns the list and the persisted
// selection so the sidebar switcher, inline pickers and every teacher page stay
// in sync. Falls back to an empty selection when used outside the provider.
export function useTeacherBatch() {
  const ctx = useContext(TeacherBatchContext);

  if (ctx) return ctx;

  return {
    batches: [],
    batch: null,
    batchId: null,
    batchLabel: '',
    selectedId: null,
    selectBatch: () => {},
    loading: false,
    error: null,
    reload: () => {},
  };
}
