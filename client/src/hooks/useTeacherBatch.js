import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

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
      const res = await axios.get(`${API_URL}/coordinator/teacher-batches/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const list = res.data?.batches || [];
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
