import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { getMyTeacherBatch } from '../api/teacherApi';

const STORAGE_KEY = 'wim-teacher-batch-id';

// A teacher may now handle MULTIPLE batches (coordinators can assign a
// teacher to several batches). This hook loads every batch assigned to the
// teacher and keeps a persisted "selected batch" so all teacher pages
// (students, live map, attendance monitor, reports) stay in sync.
//
// Backwards compatible: `batchId` / `batchLabel` still refer to the
// currently selected batch, so existing pages keep working.
export function useTeacherBatch() {
  const { token } = useAuth();
  const [batches, setBatches] = useState([]); // [{ id, batch_label, ... }]
  const [selectedId, setSelectedId] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? Number(raw) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await getMyTeacherBatch(token);
      const list = res?.batches || [];
      setBatches(list);
      setError(null);
      // Keep the persisted selection if it still exists, otherwise default
      // to the first batch.
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
      if (next) localStorage.setItem(STORAGE_KEY, String(next));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

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
}