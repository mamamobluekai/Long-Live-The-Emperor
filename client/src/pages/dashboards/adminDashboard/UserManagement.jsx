import { useEffect, useState } from 'react';
import {
  getAllUsers,
  deleteUser,
  updateUserStatus,
  resetUserPassword,
} from '../../../api/adminApi';
import DataTable from '../../../components/admin/DataTable';
import ConfirmModal from '../../../components/admin/ConfirmModal';
import LoadingSkeleton from '../../../components/admin/LoadingSkeleton';
import Pagination from '../../../components/admin/Pagination';
import UserProfileModal from '../../../components/admin/UserProfileModal';
import styles from './UserManagement.module.css';
import { useToast } from '../../../components/admin/ToastContainer';

const ROLE_OPTIONS = [
  { value: '', label: 'All Roles' },
  { value: 'admin', label: 'Admin' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'student', label: 'Student' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'coordinator', label: 'Coordinator' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'disapproved', label: 'Disapproved' },
];

export default function UserManagement() {
  const { showToast } = useToast();
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [filters, setFilters] = useState({ search: '', role: '', status: '' });
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [deleteModal, setDeleteModal] = useState({ open: false, id: null, name: '' });
  const [resetModal, setResetModal] = useState({ open: false, id: null, name: '' });
  const [profile, setProfile] = useState(null);

  const fetchUsers = async (page = pagination.page) => {
    setLoading(true);
    try {
      const params = {
        ...filters,
        page,
        limit: pagination.limit,
      };
      const data = await getAllUsers(params);
      setUsers(data.users || []);
      setPagination((p) => ({ page: Number(data.pagination?.page) || page, limit: Number(data.pagination?.limit) || p.limit, total: Number(data.pagination?.total) || 0 }));
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.role, filters.status]);

  const applyFilters = () => {
    setFilters((f) => ({ ...f, search: searchInput }));
    setPagination((p) => ({ ...p, page: 1 }));
    fetchUsers(1);
  };

  const clearFilters = () => {
    setSearchInput('');
    setFilters({ search: '', role: '', status: '' });
    setPagination((p) => ({ ...p, page: 1 }));
  };

  const handleStatusChange = async (id, status) => {
    try {
      await updateUserStatus(id, status);
      showToast(`User status updated to ${status}.`, 'success');
      fetchUsers(pagination.page);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleResetPassword = async () => {
    const { id, name } = resetModal;
    try {
      const data = await resetUserPassword(id, null);
      showToast(
        `Password reset. New temporary password for ${name || id}: ${data.tempPassword || ''}`,
        'success',
        10000
      );
      setResetModal({ open: false, id: null, name: '' });
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = async () => {
    const { id } = deleteModal;
    try {
      await deleteUser(id);
      showToast('User deleted.', 'success');
      setDeleteModal({ open: false, id: null, name: '' });
      fetchUsers(pagination.page);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const columns = [
    { key: 'id', header: 'ID' },
    {
      header: 'Name',
      key: 'first_name',
      render: (_, row) => `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.email,
    },
    { key: 'email', header: 'Email' },
    { key: 'identifier', header: 'Identifier' },
    { key: 'role', header: 'Role' },
    { key: 'status', header: 'Status' },
    { key: 'created_at', header: 'Joined', render: (v) => new Date(v).toLocaleDateString() },
  ];

  const actions = (row) => {
    const isStaff = ['teacher', 'supervisor', 'coordinator'].includes(row.role) && row.status === 'pending';
    return (
      <div className={styles.rowActions}>
        <button type="button" className={styles.viewBtn} title="View" onClick={() => setProfile(row)}>👁</button>
        {row.status !== 'approved' ? (
          <button type="button" className={styles.approveBtn} title="Activate" onClick={() => handleStatusChange(row.id, 'approved')}>Activate</button>
        ) : (
          <button type="button" className={styles.disapproveBtn} title="Deactivate" onClick={() => handleStatusChange(row.id, 'disapproved')}>Deactivate</button>
        )}
        <button type="button" className={styles.resetBtn} title="Reset password" onClick={() => setResetModal({ open: true, id: row.id, name: `${row.first_name || ''} ${row.last_name || ''}`.trim() })}>Reset</button>
        {isStaff ? (
          <button type="button" className={styles.approveBtn} title="Approve staff" onClick={() => handleStatusChange(row.id, 'approved')}>Approve</button>
        ) : null}
        <button type="button" className={styles.deleteBtn} title="Delete" onClick={() => setDeleteModal({ open: true, id: row.id, name: `${row.first_name || ''} ${row.last_name || ''}`.trim() })}>Del</button>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>User Management</h2>
        <div className={styles.filters}>
          <input
            type="search"
            placeholder="Search name, email, ID..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className={styles.searchInput}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
          />
          <select value={filters.role} onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value }))} className={styles.filterSelect}>
            {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className={styles.filterSelect}>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button type="button" className={styles.applyBtn} onClick={applyFilters}>Apply</button>
          <button type="button" className={styles.clearBtn} onClick={clearFilters}>Clear</button>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton rows={8} />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={users}
            actions={actions}
            emptyMessage="No users found."
          />
          <Pagination
            current={pagination.page}
            total={pagination.total}
            limit={pagination.limit}
            onPageChange={(page) => {
              setPagination((p) => ({ ...p, page }));
              fetchUsers(page);
            }}
          />
        </>
      )}

      <ConfirmModal
        isOpen={deleteModal.open}
        title="Delete User"
        message={`Are you sure you want to delete "${deleteModal.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        isDestructive
        onConfirm={handleDelete}
        onClose={() => setDeleteModal({ open: false, id: null, name: '' })}
      />
      <ConfirmModal
        isOpen={resetModal.open}
        title="Reset Password"
        message={`Reset the password for "${resetModal.name}"? A new temporary password will be generated.`}
        confirmLabel="Reset"
        onConfirm={handleResetPassword}
        onClose={() => setResetModal({ open: false, id: null, name: '' })}
      />
      {profile ? (
        <UserProfileModal user={profile} onClose={() => setProfile(null)} onUpdated={() => fetchUsers(pagination.page)} />
      ) : null}
    </div>
  );
}
