import { useEffect, useState, useCallback } from 'react';
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
import { useToast } from '../../../components/admin/toastContext';

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
  { value: 'approved', label: 'Active' },
  { value: 'disapproved', label: 'Inactive' },
];

const ROLE_COLORS = {
  student: '#3b82f6',
  teacher: '#22c55e',
  supervisor: '#f59e0b',
  coordinator: '#8b5cf6',
  admin: '#ef4444',
};

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
  const [openMenuId, setOpenMenuId] = useState(null);

  const fetchUsers = useCallback(async (page = pagination.page) => {
    setLoading(true);
    try {
      const params = {
        ...filters,
        page,
        limit: pagination.limit,
      };
      const data = await getAllUsers(params);
      setUsers(data.users || []);
      setPagination((p) => ({
        page: Number(data.pagination?.page) || page,
        limit: Number(data.pagination?.limit) || p.limit,
        total: Number(data.pagination?.total) || 0,
      }));
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.page, pagination.limit, showToast]);

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
    } finally {
      setOpenMenuId(null);
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

  const totalUsers = pagination.total;
  const activeCount = users.filter((u) => u.status === 'approved').length;
  const pendingCount = users.filter((u) => u.status === 'pending').length;
  const inactiveCount = users.filter((u) => u.status === 'disapproved').length;

  const roleCounts = users.reduce((acc, u) => {
    acc[u.role] = (acc[u.role] || 0) + 1;
    return acc;
  }, {});

  const maxRoleCount = Math.max(...Object.values(roleCounts), 1);

  const columns = [
    {
      header: 'User',
      key: 'first_name',
      render: (_, row) => {
        const name = `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.email;
        return (
          <div className={styles.userCell}>
            <div className={styles.avatar}>{name.charAt(0).toUpperCase()}</div>
            <div className={styles.userInfo}>
              <span className={styles.userName}>{name}</span>
              <span className={styles.userEmail}>{row.email}</span>
            </div>
          </div>
        );
      },
    },
    { key: 'role', header: 'Role', render: (v) => <span className={styles.roleBadge}>{v}</span> },
    { key: 'status', header: 'Status', render: (v) => <StatusBadge status={v} /> },
    { key: 'created_at', header: 'Joined', render: (v) => new Date(v).toLocaleDateString() },
  ];

  const actions = (row) => {
    const isOpen = openMenuId === row.id;
    return (
      <div className={styles.actionWrapper}>
        <button
          type="button"
          className={styles.menuTrigger}
          onClick={() => setOpenMenuId(isOpen ? null : row.id)}
          aria-label="Actions"
        >
          •••
        </button>
        {isOpen && (
          <div className={styles.dropdown}>
            <button type="button" className={styles.dropdownItem} onClick={() => { setProfile(row); setOpenMenuId(null); }}>
              View Profile
            </button>
            <button
              type="button"
              className={styles.dropdownItem}
              onClick={() => { setResetModal({ open: true, id: row.id, name: `${row.first_name || ''} ${row.last_name || ''}`.trim() }); setOpenMenuId(null); }}
            >
              Reset Password
            </button>
            {row.status === 'approved' ? (
              <button type="button" className={styles.dropdownItem} onClick={() => handleStatusChange(row.id, 'disapproved')}>
                Deactivate Account
              </button>
            ) : (
              <button type="button" className={styles.dropdownItem} onClick={() => handleStatusChange(row.id, 'approved')}>
                Activate Account
              </button>
            )}
            <button
              type="button"
              className={styles.dropdownItemDanger}
              onClick={() => { setDeleteModal({ open: true, id: row.id, name: `${row.first_name || ''} ${row.last_name || ''}`.trim() }); setOpenMenuId(null); }}
            >
              Delete Account
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>User Management</h1>
          <p className={styles.subtitle}>Manage system accounts and access</p>
        </div>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{totalUsers}</span>
          <span className={styles.statLabel}>Total Users</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{activeCount}</span>
          <span className={styles.statLabel}>Active</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{pendingCount}</span>
          <span className={styles.statLabel}>Pending</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{inactiveCount}</span>
          <span className={styles.statLabel}>Inactive</span>
        </div>
      </div>

      <div className={styles.chartCard}>
        <h3 className={styles.chartTitle}>Users by Role</h3>
        <div className={styles.roleBars}>
          {Object.entries(roleCounts).map(([role, count]) => (
            <div key={role} className={styles.roleBarRow}>
              <span className={styles.roleBarLabel}>{role.charAt(0).toUpperCase() + role.slice(1)}</span>
              <div className={styles.roleBarTrack}>
                <div
                  className={styles.roleBarFill}
                  style={{ width: `${(count / maxRoleCount) * 100}%`, background: ROLE_COLORS[role] || '#64748b' }}
                />
              </div>
              <span className={styles.roleBarCount}>{count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.tableSection}>
        <div className={styles.filters}>
          <input
            type="search"
            placeholder="Search users..."
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
      </div>

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

function StatusBadge({ status }) {
  const statusClass = {
    approved: styles.statusActive,
    pending: styles.statusPending,
    disapproved: styles.statusInactive,
  }[status] || styles.statusPending;

  const label = {
    approved: 'Active',
    pending: 'Pending',
    disapproved: 'Inactive',
  }[status] || status;

  return <span className={`${styles.statusBadge} ${statusClass}`}>{label}</span>;
}
