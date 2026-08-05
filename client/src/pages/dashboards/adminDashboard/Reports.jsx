import { useEffect, useState } from 'react';
import { getAdminReport, getReportUrl } from '../../../api/adminApi';
import DataTable from '../../../components/admin/DataTable';
import LoadingSkeleton from '../../../components/admin/LoadingSkeleton';
import styles from './Reports.module.css';

const REPORT_TYPES = [
  { value: 'attendance', label: 'Attendance' },
  { value: 'students', label: 'Student Progress' },
  { value: 'requirements', label: 'Requirements' },
  { value: 'evaluations', label: 'Evaluations' },
  { value: 'coordinators', label: 'User Accounts (Coordinators)' },
  { value: 'users', label: 'User Accounts (All)' },
];

const FORMATS = [
  { value: 'json', label: 'JSON' },
  { value: 'csv', label: 'CSV' },
  { value: 'xlsx', label: 'Excel' },
  { value: 'pdf', label: 'PDF' },
];

export default function ReportsPage() {
  const [selected, setSelected] = useState('attendance');
  const [format, setFormat] = useState('json');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchData = async (type, fmt) => {
    setLoading(true);
    setError('');
    try {
      if (fmt === 'json') {
        const res = await getAdminReport(type, 'json');
        setData(res.report || []);
      } else {
        window.open(getReportUrl(type, fmt), '_blank');
        setData([]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(selected, format);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, format]);

  const columns = data.length
    ? Object.keys(data[0]).map((key) => ({
        key,
        header: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
        render: (v) => (v === null || v === undefined ? '' : String(v)),
      }))
    : [];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Reports</h2>
        <div className={styles.controls}>
          <select value={selected} onChange={(e) => setSelected(e.target.value)} className={styles.select}>
            {REPORT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select value={format} onChange={(e) => setFormat(e.target.value)} className={styles.select}>
            {FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <button type="button" className={styles.fetchBtn} onClick={() => fetchData(selected, format)} disabled={loading}>
            {loading ? 'Loading…' : format === 'json' ? 'Refresh' : 'Export'}
          </button>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : (
        <DataTable columns={columns} data={data} emptyMessage={`No ${selected} records to display.`} />
      )}
    </div>
  );
}
