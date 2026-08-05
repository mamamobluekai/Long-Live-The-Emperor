import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAccessLogs, getAccessLogsExportUrl } from '../../../api/adminApi';
import DataTable from '../../../components/admin/DataTable';
import LoadingSkeleton from '../../../components/admin/LoadingSkeleton';
import Pagination from '../../../components/admin/Pagination';
import { useToast } from '../../../components/admin/ToastContainer';
import styles from './AccessLogs.module.css';

const ACTION_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'login', label: 'Login' },
  { value: 'logout', label: 'Logout' },
  { value: 'failed_login', label: 'Failed Login' },
  { value: 'password_reset', label: 'Password Reset' },
  { value: 'password_change', label: 'Change Password' },
  { value: 'create_user', label: 'Create User' },
  { value: 'edit_user', label: 'Edit User' },
  { value: 'delete_user', label: 'Delete User' },
  { value: 'approve_account', label: 'Approve Account' },
  { value: 'reject_account', label: 'Reject Account' },
  { value: 'disable_account', label: 'Disable Account' },
  { value: 'activate_account', label: 'Activate Account' },
  { value: 'change_user_role', label: 'Change User Role' },
  { value: 'backup_database', label: 'Backup Database' },
  { value: 'restore_database', label: 'Restore Database' },
  { value: 'export_reports', label: 'Export Reports' },
  { value: 'update_system_settings', label: 'Update System Settings' },
  { value: 'upload_student_excel', label: 'Upload Student Excel' },
  { value: 'upload_teacher_excel', label: 'Upload Teacher Excel' },
  { value: 'upload_supervisor_excel', label: 'Upload Supervisor Excel' },
  { value: 'assign_teacher', label: 'Assign Teacher' },
  { value: 'assign_supervisor', label: 'Assign Supervisor' },
  { value: 'assign_company', label: 'Assign Company' },
  { value: 'approve_student', label: 'Approve Student' },
  { value: 'reject_student', label: 'Reject Student' },
  { value: 'view_assigned_students', label: 'View Assigned Students' },
  { value: 'monitor_attendance', label: 'Monitor Attendance' },
  { value: 'verify_attendance', label: 'Verify Attendance' },
  { value: 'approve_daily_logs', label: 'Approve Daily Logs' },
  { value: 'reject_daily_logs', label: 'Reject Daily Logs' },
  { value: 'submit_evaluation', label: 'Submit Evaluation' },
  { value: 'evaluate_student', label: 'Evaluate Student' },
  { value: 'view_student_progress', label: 'View Student Progress' },
  { value: 'time_in', label: 'Time In' },
  { value: 'time_out', label: 'Time Out' },
  { value: 'submit_daily_log', label: 'Submit Daily Log' },
  { value: 'upload_requirement', label: 'Upload Requirement' },
  { value: 'update_profile', label: 'Update Profile' },
  { value: 'profile_photo_update', label: 'Profile Photo Update' },
  { value: 'report_view', label: 'Report View' },
  { value: 'notifications_read', label: 'Notifications Read' },
  { value: 'coordinator_approval', label: 'Coordinator Approval' },
  { value: 'coordinator_rejection', label: 'Coordinator Rejection' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'success', label: 'Success' },
  { value: 'failed', label: 'Failed' },
  { value: 'warning', label: 'Warning' },
  { value: 'info', label: 'Information' },
];

const ROLE_OPTIONS = [
  { value: '', label: 'All Roles' },
  { value: 'admin', label: 'Admin' },
  { value: 'coordinator', label: 'Coordinator' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'student', label: 'Student' },
];

const EXPORT_FORMATS = [
  { value: 'csv', label: 'CSV' },
  { value: 'xlsx', label: 'Excel' },
  { value: 'pdf', label: 'PDF' },
];

function statusBadgeClass(status) {
  switch ((status || '').toLowerCase()) {
    case 'success':
      return styles.badgeSuccess;
    case 'failed':
      return styles.badgeFailed;
    case 'warning':
      return styles.badgeWarning;
    case 'info':
      return styles.badgeInfo;
    default:
      return styles.badgeDefault;
  }
}

export default function AccessLogs() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState({
    action: '',
    status: '',
    role: '',
    dateFrom: '',
    dateTo: '',
  });
  const [exportFormat, setExportFormat] = useState('csv');

  const loadLogs = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = {
        page,
        limit: pagination.limit,
        ...(filters.action ? { action: filters.action } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.role ? { role: filters.role } : {}),
        ...(filters.dateFrom ? { dateFrom: filters.dateFrom } : {}),
        ...(filters.dateTo ? { dateTo: filters.dateTo } : {}),
        ...(searchInput ? { search: searchInput } : {}),
      };
      const data = await getAccessLogs(params);
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
  }, [filters, searchInput, pagination.limit]);

  useEffect(() => {
    loadLogs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilters = () => {
    loadLogs(1);
  };

  const resetFilters = () => {
    setSearchInput('');
    setFilters({ action: '', status: '', role: '', dateFrom: '', dateTo: '' });
    setPagination((p) => ({ ...p, page: 1 }));
  };

  const handleExport = () => {
    const params = {
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.role ? { role: filters.role } : {}),
      ...(filters.dateFrom ? { dateFrom: filters.dateFrom } : {}),
      ...(filters.dateTo ? { dateTo: filters.dateTo } : {}),
      ...(searchInput ? { search: searchInput } : {}),
    };
    const url = getAccessLogsExportUrl(exportFormat, params);
    window.open(url, '_blank');
    showToast(`Exporting ${exportFormat.toUpperCase()}...`, 'success');
  };

  const columns = [
    { key: 'id', header: 'Log ID', width: '80px' },
    {
      key: 'user',
      header: 'User',
      render: (_, row) => {
        if (!row.user_id) return 'System';
        const name = `${row.first_name || ''} ${row.last_name || ''}`.trim();
        return name || row.email || `User #${row.user_id}`;
      },
    },
    { key: 'role', header: 'Role', render: (v) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : 'System') },
    {
      key: 'action',
      header: 'Action',
      render: (v) => <span className={styles.actionBadge}>{v}</span>,
    },
    { key: 'module', header: 'Module', render: (v) => v || '-' },
    { key: 'details', header: 'Description', render: (v) => v || '-' },
    { key: 'ip_address', header: 'IP Address', render: (v) => v || '-' },
    { key: 'device', header: 'Device', render: (v) => v || '-' },
    {
      key: 'created_at',
      header: 'Timestamp',
      render: (v) => (v ? new Date(v).toLocaleString() : '-'),
    },
    {
      key: 'status',
      header: 'Status',
      render: (v) => (
        <span className={`${styles.statusBadge} ${statusBadgeClass(v)}`}>
          {v ? v.charAt(0).toUpperCase() + v.slice(1) : 'Success'}
        </span>
      ),
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Access Logs</h1>
          <p className={styles.subtitle}>Monitor all user activities and security events across the Work Immersion Monitoring System.</p>
        </div>
        <button type="button" className={styles.backBtn} onClick={() => navigate('/dashboard/admin/dashboard')}>
          ← Back to Dashboard
        </button>
      </div>

      <div className={styles.card}>
        <div className={styles.filterGrid}>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Date From</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
              className={styles.filterInput}
            />
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Date To</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
              className={styles.filterInput}
            />
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Action</label>
            <select
              value={filters.action}
              onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
              className={styles.filterSelect}
            >
              {ACTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              className={styles.filterSelect}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Role</label>
            <select
              value={filters.role}
              onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value }))}
              className={styles.filterSelect}
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Search User</label>
            <input
              type="search"
              placeholder="Name, email, action..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
              className={styles.filterInput}
            />
          </div>
        </div>

        <div className={styles.actionBar}>
          <div className={styles.filterActions}>
            <button type="button" className={styles.filterBtn} onClick={applyFilters} disabled={loading}>
              {loading ? 'Loading…' : 'Filter Logs'}
            </button>
            <button type="button" className={styles.resetBtn} onClick={resetFilters}>
              Reset Filters
            </button>
          </div>
          <div className={styles.exportGroup}>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value)}
              className={styles.exportSelect}
            >
              {EXPORT_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <button type="button" className={styles.exportBtn} onClick={handleExport}>
              Export Logs
            </button>
          </div>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {loading ? (
        <LoadingSkeleton rows={8} />
      ) : (
        <>
          <div className={styles.tableCard}>
            <DataTable
              columns={columns}
              data={logs}
              emptyMessage="No access logs found."
            />
          </div>
          <Pagination
            current={pagination.page}
            total={pagination.total}
            limit={pagination.limit}
            onPageChange={(page) => {
              setPagination((p) => ({ ...p, page }));
              loadLogs(page);
            }}
          />
        </>
      )}
    </div>
  );
}
