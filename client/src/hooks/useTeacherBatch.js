import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { getMyTeacherBatch } from '../api/teacherApi';

// A teacher is assigned to exactly one batch by the coordinator
// (teacher_batches.teacher_id is UNIQUE). This hook resolves that single
// batch automatically so the teacher dashboard never needs a batch picker.
export function useTeacherBatch() {
  const { token } = useAuth();
  const [batch, setBatch] = useState(null); // { id, batch_label }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await getMyTeacherBatch(token);
      const list = res?.batches || [];
      // Take the first (and typically only) assigned batch.
      setBatch(list.length ? { id: list[0].id, batch_label: list[0].batch_label } : null);
      setError(null);
    } catch (err) {
      console.error('Failed to load teacher batch:', err);
      setError(err.response?.data?.error || 'Could not load your assigned batch.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return { batchId: batch?.id || null, batchLabel: batch?.batch_label || '', batch, loading, error, reload: load };
}
