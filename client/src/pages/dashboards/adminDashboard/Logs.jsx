import { useCallback, useEffect, useState } from 'react';
import { getAdminLogs } from '../../../api/adminApi';
import DataTable from '../../../components/admin/DataTable';
import LoadingSkeleton from '../../../components/admin/LoadingSkeleton';
import Pagination from '../../../components/admin/Pagination';
import styles from './Logs.module.css';

const columns = [
  { key: 'id', header: 'ID' },
  {
    key: 'action',
    header: 'Action',
    render: (v) => <span className={styles.actionBadge}>{v}</span>,
  },
  { key: 'details', header: 'Details' },
  { key: 'ip_address', header: 'IP Address' },
  {
    key: 'created_at',
    header: 'Timestamp',
    render: (v) => (v ? new Date(v).toLocaleString() : ''),
  },
];

export default function LogsPage() {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0 });
  const [actionFilter, setActionFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (page = pagination.page) => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: pagination.limit, ...(actionFilter ? { action: actionFilter } : {}) };
      const qs = new URLSearchParams(params).toString();
      const data = await getAdminLogs(qs ? `?${qs}` : '');
      setLogs(data.logs || []);
      setPagination((p) => ({
        page: Number(data.pagination?.page) || page,
        limit: Number(data.pagination?.limit) || p.limit,
        total: Number(data.pagination?.total) || 0,
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [actionFilter, pagination.limit]);

  useEffect(() => {
    load(1);
  }, [load]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Audit Logs</h2>
        <div className={styles.filters}>
          <input
            type="search"
            placeholder="Filter by action (e.g. login, password_reset)…"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className={styles.searchInput}
          />
          <button type="button" className={styles.clearBtn} onClick={() => setActionFilter('')}>Clear</button>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {loading ? (
        <LoadingSkeleton rows={8} />
      ) : (
        <>
          <DataTable columns={columns} data={logs} emptyMessage="No logs found." />
          <Pagination
            current={pagination.page}
            total={pagination.total}
            limit={pagination.limit}
            onPageChange={(page) => { setPagination((p) => ({ ...p, page })); load(page); }}
          />
        </>
      )}
    </div>
  );
}
