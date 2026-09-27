import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTeacherBatch } from './useTeacherBatch';
import { getBatchAttendanceReport } from '../api/teacherApi';
import { reportRows } from '../utils/attendanceAnalytics';

const EMPTY = { dates: [], records: [] };

// Shared attendance report for the batch selected in the sidebar. Fetched once
// per batch and reused by the records modal and the attendance insights, so the
// data is not requested twice and a batch switch clears everything in one place.
//
// Pass `{ enabled: false }` to read the hook without triggering a fetch (when a
// parent already owns the loaded report).
export function useTeacherAttendanceReport({ batchId: batchIdOverride, enabled = true } = {}) {
  const { token } = useAuth();
  const { batchId: contextBatchId } = useTeacherBatch();
  const batchId = batchIdOverride ?? contextBatchId;
  const [report, setReport] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadReport = useCallback(async () => {
    if (!batchId || !enabled) {
      setReport(EMPTY);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setError('');
    try {
      const data = await getBatchAttendanceReport(batchId, token);
      setReport(data || EMPTY);
    } catch (err) {
      setError(err.message || 'Failed to load attendance report.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [batchId, enabled, token]);

  useEffect(() => {
    // Clear the previous batch's table so a switch never shows stale rows.
    setReport(EMPTY);
    setRefreshing(false);
    setLoading(true);
    loadReport();
  }, [loadReport]);

  const rows = useMemo(() => reportRows(report.records || []), [report.records]);

  return {
    dates: report.dates || [],
    records: report.records || [],
    rows,
    loading,
    refreshing,
    error,
    refresh: loadReport,
  };
}
