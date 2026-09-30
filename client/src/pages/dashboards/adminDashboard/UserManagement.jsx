// User management.
// Design system: Lexend + the RequirementsReview maroon palette.
import { useEffect, useState, useCallback } from 'react';
import {
  ArrowRight,
  Ban,
  Briefcase,
  CircleCheck,
  Clock3,
  Eye,
  GraduationCap,
  Power,
  PowerOff,
  School,
  Search,
  Trash2,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import {
  getAllUsers,
  deleteUser,
  updateUserStatus,
} from '../../../api/adminApi';
import ConfirmModal from '../../../components/admin/ConfirmModal';
import UserProfileModal from '../../../components/admin/UserProfileModal';
import styles from './UserManagement.module.css';
import { useToast } from '../../../components/admin/toastContext';

// The role modal lists every member in one scrollable list, so the API is asked
// for a large page instead of a small paginated one.
const ROLE_USER_LIMIT = 500;

// Status chips above the role modal's table. Values match the user status column.
const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'approved', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'disapproved', label: 'Inactive' },
];

// The four role shortcuts shown as buttons. Clicking one opens a modal listing
// every account holding that role, paginated straight from the API.
const ROLE_SHORTCUTS = [
  { key: 'supervisor', label: 'Supervisors', icon: Briefcase, color: '#b45309' },
  { key: 'coordinator', label: 'Coordinators', icon: UserCog, color: '#be8c3f' },
  { key: 'student', label: 'Students', icon: GraduationCap, color: '#8b1e2d' },
  { key: 'teacher', label: 'Teachers', icon: School, color: '#37568c' },
];

export default function UserManagement() {
  const { showToast } = useToast();
  // The directory table was removed; this fetch now only feeds the summary cards
  // at the top of the page.
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 200, total: 0 });
  const [deleteModal, setDeleteModal] = useState({ open: false, id: null, name: '' });
  const [statusModal, setStatusModal] = useState({ open: false, id: null, name: '', next: '' });
  const [profile, setProfile] = useState(null);

  // Role shortcut modal: which role is open, its rows, and its own pagination.
  const [roleCounts, setRoleCounts] = useState({});
  const [roleModal, setRoleModal] = useState({ open: false, key: '', label: '', color: '', icon: null });
  const [roleUsers, setRoleUsers] = useState([]);
  const [roleTotal, setRoleTotal] = useState(0);
  const [roleLoading, setRoleLoading] = useState(false);

  // Loads every account once so the summary cards can count roles and statuses.
  // The server passes `limit` straight into SQL with no cap, and 200 is well
  // above any realistic account count for a single school.
  const fetchUsers = useCallback(async () => {
    try {
      const data = await getAllUsers({ page: 1, limit: pagination.limit });
      setUsers(data.users || []);
      setPagination((p) => ({
        ...p,
        total: Number(data.pagination?.total) || 0,
      }));
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [pagination.limit, showToast]);

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Badge counts for the four role buttons. The summary cards above are fed by the
  // full account list, but these totals come straight from the server so they stay
  // correct regardless of the list's page size. limit:1 fetches only the count.
  const fetchRoleCounts = useCallback(async () => {
    try {
      const results = await Promise.all(
        ROLE_SHORTCUTS.map((role) => getAllUsers({ role: role.key, page: 1, limit: 1 })),
      );
      const counts = {};
      ROLE_SHORTCUTS.forEach((role, i) => {
        counts[role.key] = Number(results[i]?.pagination?.total) || 0;
      });
      setRoleCounts(counts);
    } catch {
      // Badge counts are decorative; leave them blank rather than erroring.
    }
  }, []);

  useEffect(() => {
    fetchRoleCounts();
  }, [fetchRoleCounts]);

  // Loads every member of a role in one request; the modal scrolls instead of paginating.
  const fetchRoleUsers = useCallback(async (role) => {
    setRoleLoading(true);
    try {
      const data = await getAllUsers({ role, page: 1, limit: ROLE_USER_LIMIT });
      setRoleUsers(data.users || []);
      setRoleTotal(Number(data.pagination?.total) || (data.users || []).length);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setRoleLoading(false);
    }
  }, [showToast]);

  const openRoleModal = (role) => {
    setRoleModal({
      open: true,
      key: role.key,
      label: role.label,
      color: role.color,
      icon: role.icon,
    });
    setRoleTotal(0);
    fetchRoleUsers(role.key);
  };

  const handleStatusChange = async (id, status) => {
    try {
      await updateUserStatus(id, status);
      showToast(`User status updated to ${status}.`, 'success');
      // Refresh the summary cards, the role badges, and the open role modal.
      fetchUsers();
      fetchRoleCounts();
      if (roleModal.open) fetchRoleUsers(roleModal.key);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const confirmStatusChange = async () => {
    const { id, next } = statusModal;
    await handleStatusChange(id, next);
    setStatusModal({ open: false, id: null, name: '', next: '' });
  };

  const handleDelete = async () => {
    const { id } = deleteModal;
    try {
      await deleteUser(id);
      showToast('User deleted.', 'success');
      setDeleteModal({ open: false, id: null, name: '' });
      fetchUsers();
      fetchRoleCounts();
      // The deleted row may have been the only one on the last page.
      if (roleModal.open) fetchRoleUsers(roleModal.key);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const totalUsers = pagination.total;
  const activeCount = users.filter((u) => u.status === 'approved').length;
  const pendingCount = users.filter((u) => u.status === 'pending').length;
  const inactiveCount = users.filter((u) => u.status === 'disapproved').length;

  const fullName = (row) => `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.email;

  // Four always-visible actions per row. Each opens its own modal so the
  // outcome is confirmed before anything is written.
  const actions = (row) => {
    const isActive = row.status === 'approved';
    const nextStatus = isActive ? 'disapproved' : 'approved';

    return (
      <div className={styles.rowActions}>
        <button
          type="button"
          className={`${styles.rowAction} ${styles.rowActionView}`}
          onClick={() => setProfile(row)}
          title="View details"
          aria-label={`View details for ${fullName(row)}`}
        >
          <Eye size={16} strokeWidth={1.9} />
        </button>

        <button
          type="button"
          className={isActive ? styles.rowActionWarn : styles.rowActionGood}
          onClick={() => setStatusModal({ open: true, id: row.id, name: fullName(row), next: nextStatus })}
          title={isActive ? 'Deactivate account' : 'Activate account'}
          aria-label={`${isActive ? 'Deactivate' : 'Activate'} account for ${fullName(row)}`}
        >
          {isActive ? <PowerOff size={16} strokeWidth={1.9} /> : <Power size={16} strokeWidth={1.9} />}
        </button>

        <button
          type="button"
          className={`${styles.rowAction} ${styles.rowActionDanger}`}
          onClick={() => setDeleteModal({ open: true, id: row.id, name: fullName(row) })}
          title="Delete account"
          aria-label={`Delete account for ${fullName(row)}`}
        >
          <Trash2 size={16} strokeWidth={1.9} />
        </button>
      </div>
    );
  };

  const statCards = [
    { id: 'total', icon: Users, label: 'Total Users', value: totalUsers, tone: 'maroon' },
    { id: 'active', icon: CircleCheck, label: 'Active', value: activeCount, tone: 'green' },
    { id: 'pending', icon: Clock3, label: 'Pending', value: pendingCount, tone: 'amber' },
    { id: 'inactive', icon: Ban, label: 'Inactive', value: inactiveCount, tone: 'blue' },
  ];

  // Counts derived from the full account list, so they reflect every account
  // rather than a single page. The role shortcut badges use the server-side
  // `roleCounts` state instead.
  return (
    <div className={styles.page}>
      <section className={styles.pageHeader}>
        <div className={styles.headerCopy}>
          <p className={styles.eyebrow}>ACCOUNTS</p>
          <h1>User Management</h1>
          <p className={styles.headerText}>
            Browse every account registered in the Work Immersion System by role.
            Activate or deactivate accounts at any time.
          </p>
        </div>

        <span className={styles.headerIcon} aria-hidden="true">
          <Users size={22} strokeWidth={1.9} />
        </span>
      </section>

      <section className={styles.statsGrid} aria-label="Account summary">
        {statCards.map((card) => (
          <StatCard
            key={card.id}
            icon={card.icon}
            label={card.label}
            value={card.value}
            tone={card.tone}
          />
        ))}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2>User</h2>
            <p className={styles.cardText}>
              Review every account on the system by role. Pick a role below to open a paginated
              list of its members, check their status and details, and act on the account without
              leaving this page.
            </p>
          </div>
          <span className={styles.totalBadge}>{totalUsers} total</span>
        </div>

        <div className={styles.roleGrid}>
          {ROLE_SHORTCUTS.map((role) => {
            const Icon = role.icon;
            return (
              <button
                key={role.key}
                type="button"
                className={styles.roleButton}
                style={{ '--role-accent': role.color }}
                onClick={() => openRoleModal(role)}
                aria-label={`View all ${role.label}`}
              >
                <span className={styles.roleButtonIcon} aria-hidden="true">
                  <Icon size={19} strokeWidth={1.9} />
                </span>
                <span className={styles.roleButtonCopy}>
                  <span className={styles.roleButtonLabel}>{role.label}</span>
                  <strong className={styles.roleButtonCount}>
                    {roleCounts[role.key] ?? '—'}
                  </strong>
                </span>
                <ArrowRight size={16} strokeWidth={2} className={styles.roleButtonArrow} />
              </button>
            );
          })}
        </div>
      </section>

      <ConfirmModal
        isOpen={deleteModal.open}
        title="Delete User"
        message={`Are you sure you want to delete "${deleteModal.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        isDestructive
        onConfirm={handleDelete}
        onClose={() => setDeleteModal({ open: false, id: null, name: '' })}
      />
      <RoleUsersModal
        isOpen={roleModal.open}
        role={roleModal}
        users={roleUsers}
        total={roleTotal}
        loading={roleLoading}
        actions={actions}
        onClose={() => setRoleModal((m) => ({ ...m, open: false }))}
      />
      <ConfirmModal
        isOpen={statusModal.open}
        title={statusModal.next === 'approved' ? 'Activate Account' : 'Deactivate Account'}
        message={
          statusModal.next === 'approved'
            ? `Activate "${statusModal.name}"? The user will be able to sign in and use the system.`
            : `Deactivate "${statusModal.name}"? The user will no longer be able to sign in.`
        }
        confirmLabel={statusModal.next === 'approved' ? 'Activate' : 'Deactivate'}
        isDestructive={statusModal.next !== 'approved'}
        onConfirm={confirmStatusChange}
        onClose={() => setStatusModal({ open: false, id: null, name: '', next: '' })}
      />
      {profile ? (
        <UserProfileModal user={profile} onClose={() => setProfile(null)} onUpdated={() => {
          fetchUsers();
          // A profile edit can change the name, email, or role shown in the modal.
          fetchRoleCounts();
          if (roleModal.open) fetchRoleUsers(roleModal.key);
        }} />
      ) : null}
    </div>
  );
}

// Lists every account holding one role in a single scrollable list. Rows carry
// the four action buttons, so an admin can manage a user without closing the modal.
function RoleUsersModal({
  isOpen,
  role,
  users,
  total,
  loading,
  actions,
  onClose,
}) {
  // Filters are local to the dialog and reset whenever a new role is opened.
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    if (isOpen) {
      setSearchInput('');
      setStatusFilter('all');
    }
  }, [isOpen, role.key]);

  if (!isOpen) return null;
  const Icon = role.icon;
  const search = searchInput.trim().toLowerCase();
  const visible = users.filter((row) => {
    if (statusFilter !== 'all' && row.status !== statusFilter) return false;
    if (!search) return true;
    const haystack = [
      row.first_name,
      row.last_name,
      row.email,
      row.role,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(search);
  });

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="role-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`${styles.modal} ${styles.modalWide}`}>
        <div className={styles.modalHeader}>
          <div className={styles.roleModalTitle}>
            <span
              className={styles.roleModalIcon}
              style={{ '--role-accent': role.color }}
              aria-hidden="true"
            >
              {Icon ? <Icon size={18} strokeWidth={1.9} /> : null}
            </span>
            <div>
              <p className={styles.modalEyebrow}>DIRECTORY</p>
              <h2 id="role-modal-title" className={styles.modalTitle}>{role.label}</h2>
            </div>
          </div>

          <div className={styles.modalHeaderRight}>
            <span className={styles.totalBadge}>{total} total</span>
            <button
              type="button"
              className={styles.modalClose}
              onClick={onClose}
              aria-label="Close"
            >
              <X size={17} strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className={styles.modalToolbar}>
          <div className={styles.modalSearch}>
            <Search size={16} strokeWidth={2} aria-hidden="true" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={`Search ${role.label.toLowerCase()} by name, email or role`}
              aria-label={`Search ${role.label}`}
            />
            {searchInput ? (
              <button
                type="button"
                className={styles.modalSearchClear}
                onClick={() => setSearchInput('')}
                aria-label="Clear search"
              >
                <X size={14} strokeWidth={2} />
              </button>
            ) : null}
          </div>

          <div className={styles.statusFilter} role="group" aria-label="Filter by status">
            {STATUS_FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`${styles.statusFilterChip} ${
                  statusFilter === option.value ? styles.statusFilterChipActive : ''
                }`}
                onClick={() => setStatusFilter(option.value)}
                aria-pressed={statusFilter === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.modalBody}>
          {loading ? (
            <div className={styles.modalLoading}>
              <span className={styles.spinner} aria-hidden="true" />
              Loading {role.label.toLowerCase()}...
            </div>
          ) : users.length === 0 ? (
            <div className={styles.modalEmpty}>No {role.label.toLowerCase()} found.</div>
          ) : visible.length === 0 ? (
            <div className={styles.modalEmpty}>
              No {role.label.toLowerCase()} match the current filters.
            </div>
          ) : (
            <div className={styles.modalTableWrap}>
              <table className={styles.modalTable}>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Joined</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div className={styles.userCell}>
                          <div className={styles.avatar}>
                            {`${row.first_name || ''} ${row.last_name || ''}`.trim().charAt(0).toUpperCase() || row.email.charAt(0).toUpperCase()}
                          </div>
                          <div className={styles.userInfo}>
                            <span className={styles.userName}>
                              {`${row.first_name || ''} ${row.last_name || ''}`.trim() || row.email}
                            </span>
                            <span className={styles.userEmail}>{row.email}</span>
                          </div>
                        </div>
                      </td>
                      <td><span className={styles.roleBadge}>{row.role}</span></td>
                      <td><StatusBadge status={row.status} /></td>
                      <td className={styles.modalTableDate}>
                        <FormatDate value={row.created_at} />
                      </td>
                      <td><div className={styles.modalTableActions}>{actions(row)}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className={styles.modalScrollHint}>
          {visible.length === users.length
            ? `Showing all ${users.length} ${role.label.toLowerCase()}`
            : `Showing ${visible.length} of ${users.length} ${role.label.toLowerCase()}`}
        </p>
      </div>
    </div>
  );
}

// Renders a date as e.g. "12 Mar 2026" with the relative age underneath, so
// joining dates stay readable in the narrow table column.
function FormatDate({ value }) {
  if (!value) return <span className={styles.dateDash}>—</span>;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <span className={styles.dateDash}>—</span>;

  const day = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  const relative = days < 1 ? 'Today' : days < 30 ? `${days} day${days === 1 ? '' : 's'} ago` : null;

  return (
    <span className={styles.dateCell}>
      <span className={styles.datePrimary}>{day}</span>
      {relative ? <span className={styles.dateRelative}>{relative}</span> : null}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, tone }) {  return (
    <div className={`${styles.statCard} ${styles[`tone${tone}`]}`}>
      <span className={styles.statIcon} aria-hidden="true">
        <Icon size={17} strokeWidth={1.9} />
      </span>
      <span className={styles.statCopy}>
        <span className={styles.statLabel}>{label}</span>
        <strong className={styles.statValue}>{value}</strong>
      </span>
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
