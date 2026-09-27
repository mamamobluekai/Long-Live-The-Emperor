import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { getMyTeacherBatch } from '../api/teacherApi';
import { TeacherBatchContext } from './teacherBatchContext';

export const TEACHER_BATCH_STORAGE_KEY = 'wim-teacher-batch-id';

// A teacher may handle MULTIPLE batches. This provider loads every assigned
// batch once and owns the persisted "selected batch" so the sidebar switcher,
// the inline pickers and every teacher page share a single source of truth.
export function TeacherBatchProvider({ children }) {
  const { token } = useAuth();
  const [batches, setBatches] = useState([]);
  const [selectedId, setSelectedId] = useState(() => {
    try {
      const raw = localStorage.getItem(TEACHER_BATCH_STORAGE_KEY);
      return raw ? Number(raw) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!token) {
      setBatches([]);
      setSelectedId(null);
      setLoading(false);
      return;
    }
    try {
      const res = await getMyTeacherBatch(token);
      const list = res?.batches || [];
      setBatches(list);
      setError(null);
      setSelectedId((prev) => {
        if (prev && list.some((b) => Number(b.id) === Number(prev))) return prev;
        return list.length ? Number(list[0].id) : null;
      });
    } catch (err) {
      console.error('Failed to load teacher batches:', err);
      setError(err.response?.data?.error || 'Could not load your assigned batches.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const selectBatch = useCallback((id) => {
    const next = id ? Number(id) : null;
    setSelectedId(next);
    try {
      if (next) localStorage.setItem(TEACHER_BATCH_STORAGE_KEY, String(next));
      else localStorage.removeItem(TEACHER_BATCH_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  // Keep other tabs of the same teacher in sync with the sidebar switcher.
  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key !== TEACHER_BATCH_STORAGE_KEY) return;
      const next = event.newValue ? Number(event.newValue) : null;
      setSelectedId(next);
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const value = useMemo(() => {
    const batch = batches.find((b) => Number(b.id) === Number(selectedId)) || null;
    return {
      batches,
      batch,
      batchId: batch?.id || null,
      batchLabel: batch?.batch_label || '',
      selectedId,
      selectBatch,
      loading,
      error,
      reload: load,
    };
  }, [batches, selectedId, selectBatch, loading, error, load]);

  return <TeacherBatchContext.Provider value={value}>{children}</TeacherBatchContext.Provider>;
}
