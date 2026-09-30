import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollText,
  Search,
  X,
  Filter,
  Download,
  ChevronRight,
  AlertCircle,
  CalendarDays,
  Clock3,
  Trash2,
  Layers,
  UsersRound,
} from 'lucide-react';

import {
  getAccessLogs,
  getAccessLogsExportUrl,
  deleteAccessLog,
  deleteAccessLogs,
  deleteAllAccessLogs,
} from '../../../api/adminApi';
import { useToast } from '../../../components/admin/toastContext';
import styles from './AccessLogs.module.css';

const ACTION_OPTIONS = [
  'login',
  'logout',
  'failed_login',
  'password_change',
  'password_reset',
  'create_user',
  'edit_user',
  'delete_user',
  'approve_account',
  'reject_account',
  'disable_account',
  'activate_account',
  'change_user_role',
  'backup_database',
  'restore_database',
  'update_system_settings',
  'upload_requirement',
  'update_profile',
  'report_view',
  'time_in',
  'time_out',
  'submit_daily_log',
  'approve_daily_logs',
  'verify_attendance',
  'evaluate_student',
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

const DAY_LIMIT = 500;
const ALL_LIMIT = 5000;

const titleCase = (value) => {
  if (!value) return '';
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const statusBadgeClass = (status) => {
  switch (String(status || 'success').toLowerCase()) {
    case 'failed':
      return styles.badgeRejected;
    case 'warning':
      return styles.badgePending;
    case 'info':
      return styles.badgeReview;
    default:
      return styles.badgeApproved;
  }
};

const getInitials = (log) => {
  const name = `${log.first_name || ''} ${log.last_name || ''}`.trim();

  if (!name) return 'SYS';

  return name
    .split(' ')
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();
};

const getUserName = (log) => {
  if (!log.user_id) return 'System';
  const name = `${log.first_name || ''} ${log.last_name || ''}`.trim();
  return name || log.email || `User #${log.user_id}`;
};

const formatTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Local calendar key (YYYY-MM-DD) so logs are grouped by the user's own day.
const dayKey = (value) => {
  if (!value) return 'unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';

  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
};

const dayLabel = (key) => {
  if (key === 'unknown') return 'Unknown date';

  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  const formatted = date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  if (isToday) return `Today - ${formatted}`;
  if (isYesterday) return `Yesterday - ${formatted}`;
  return formatted;
};

export default function AccessLogs() {
  const { showToast } = useToast();

  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [exportFormat, setExportFormat] = useState('csv');

  const [activeDay, setActiveDay] = useState(null);
  const [dayLogs, setDayLogs] = useState([]);
  const [dayLoading, setDayLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [confirm, setConfirm] = useState(null);

  // Filters for the day that is open in the modal.
  const [daySearch, setDaySearch] = useState('');
  const [dayAction, setDayAction] = useState('');
  const [dayStatus, setDayStatus] = useState('');
  const [dayRole, setDayRole] = useState('');

  // Every day is listed at once, so the whole log set is loaded in one request
  // instead of being split across pages.
  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await getAccessLogs({ page: 1, limit: ALL_LIMIT });

      setLogs(data.logs || []);
      setTotal(Number(data.pagination?.total) || 0);
      setTruncated(
        (Number(data.pagination?.total) || 0) > (data.logs?.length || 0),
      );
    } catch (err) {
      setError(err.message || 'Unable to load access logs.');
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Group the current result set by calendar day.
  const groups = useMemo(() => {
    const map = new Map();

    for (const log of logs) {
      const key = dayKey(log.created_at);

      if (!map.has(key)) {
        map.set(key, { key, logs: [], users: new Set() });
      }

      const group = map.get(key);
      group.logs.push(log);
      group.users.add(log.user_id ?? 'system');
    }

    return Array.from(map.values()).map((group) => ({
      key: group.key,
      logs: group.logs,
      count: group.logs.length,
      userCount: group.users.size,
      latest: group.logs[0]?.created_at,
      earliest: group.logs[group.logs.length - 1]?.created_at,
      failedCount: group.logs.filter(
        (log) => String(log.status || '').toLowerCase() === 'failed',
      ).length,
    }));
  }, [logs]);

  // Filters live in the day modal and apply to the loaded day client-side.
  const dayView = useMemo(() => {
    const term = daySearch.trim().toLowerCase();

    return dayLogs.filter((log) => {
      if (dayStatus && String(log.status || '').toLowerCase() !== dayStatus) {
        return false;
      }

      if (dayRole && String(log.role || '').toLowerCase() !== dayRole) {
        return false;
      }

      if (
        dayAction &&
        !String(log.action || '').toLowerCase().includes(dayAction)
      ) {
        return false;
      }

      if (!term) return true;

      return [
        log.action,
        log.details,
        log.module,
        log.email,
        log.ip_address,
        log.device,
        log.first_name,
        log.last_name,
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term));
    });
  }, [dayLogs, dayAction, dayStatus, dayRole, daySearch]);

  const dayFilterCount =
    [dayAction, dayStatus, dayRole].filter(Boolean).length +
    (daySearch.trim() ? 1 : 0);

  const handleClearDayFilters = () => {
    setDaySearch('');
    setDayAction('');
    setDayStatus('');
    setDayRole('');
  };

  const openDay = async (key) => {
    if (key === 'unknown') return;

    setActiveDay(key);
    setDayLogs([]);
    setDayLoading(true);
    setConfirm(null);
    handleClearDayFilters();

    try {
      const data = await getAccessLogs({
        dateFrom: key,
        dateTo: key,
        limit: DAY_LIMIT,
      });

      setDayLogs(data.logs || []);
    } catch (err) {
      showToast(err.message || 'Unable to load logs for that day.', 'error');
    } finally {
      setDayLoading(false);
    }
  };

  const closeDay = () => {
    setActiveDay(null);
    setDayLogs([]);
    setConfirm(null);
    handleClearDayFilters();
  };

  const handleDeleteLog = async (log) => {
    setDeletingId(log.id);

    try {
      await deleteAccessLog(log.id);

      setDayLogs((prev) => prev.filter((item) => item.id !== log.id));
      setLogs((prev) => prev.filter((item) => item.id !== log.id));
      setTotal((prev) => Math.max(0, prev - 1));

      showToast('Access log deleted.', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to delete the log.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteDay = async () => {
    if (!activeDay) return;

    setDayLoading(true);

    try {
      const data = await deleteAccessLogs({
        dateFrom: activeDay,
        dateTo: activeDay,
      });

      setDayLogs([]);
      setConfirm(null);
      showToast(data.message || 'Logs for that day were deleted.', 'success');
      await loadLogs();
    } catch (err) {
      showToast(err.message || 'Failed to delete the logs.', 'error');
    } finally {
      setDayLoading(false);
    }
  };

  const handleDeleteAll = async () => {
    setDayLoading(true);

    try {
      const data = await deleteAllAccessLogs();

      setDayLogs([]);
      setConfirm(null);
      showToast(data.message || 'All access logs were deleted.', 'success');
      await loadLogs();
    } catch (err) {
      showToast(err.message || 'Failed to clear the logs.', 'error');
    } finally {
      setDayLoading(false);
    }
  };

  const handleExport = () => {
    if (activeDay && dayView.length > 0) {
      window.open(
        getAccessLogsExportUrl(exportFormat, {
          dateFrom: activeDay,
          dateTo: activeDay,
        }),
        '_blank',
      );
      return;
    }

    if (total === 0) {
      showToast('There are no records to export.', 'error');
      return;
    }

    window.open(getAccessLogsExportUrl(exportFormat, {}), '_blank');
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>Security &amp; Audit</span>

          <h1>Access Logs</h1>

          <p>
            Activity is grouped by day. Open a date to review every event
            recorded for it and remove entries you no longer need.
          </p>
        </div>

        <div className={styles.headerIcon}>
          <ScrollText size={24} />
        </div>
      </div>

      {error && (
        <div className={styles.errorAlert}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className={styles.card}>
        <div className={styles.metaBar}>
          <span className={styles.summaryText}>
            <Layers size={15} />
            {groups.length} day{groups.length === 1 ? '' : 's'} •{' '}
            {total.toLocaleString()} record{total === 1 ? '' : 's'}
            {truncated ? ' (latest 5,000 loaded)' : ''}
          </span>

          <div className={styles.exportGroup}>
            <select
              className={styles.exportSelect}
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value)}
              aria-label="Export format"
            >
              {EXPORT_FORMATS.map((format) => (
                <option key={format.value} value={format.value}>
                  {format.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              className={styles.exportBtn}
              onClick={handleExport}
              disabled={loading || total === 0}
            >
              <Download size={16} />
              Export
            </button>
          </div>
        </div>

        {loading ? (
          <div className={styles.loading}>
            <div className={styles.spinner} />
            <span>Loading access logs...</span>
          </div>
        ) : groups.length === 0 ? (
          <div className={styles.empty}>
            <ScrollText size={40} />
            <h3>No access logs found</h3>
            <p>Activity logs will appear here once users start using the system.</p>
          </div>
        ) : (
          <div className={styles.groupList}>
            {groups.map((group) => (
              <button
                type="button"
                key={group.key}
                className={styles.groupRow}
                onClick={() => openDay(group.key)}
              >
                <div className={styles.groupIcon}>
                  <CalendarDays size={20} />
                </div>

                <div className={styles.groupMain}>
                  <strong>{dayLabel(group.key)}</strong>

                  <span className={styles.groupMeta}>
                    <span className={styles.groupMetaItem}>
                      <Layers size={13} />
                      {group.count} event{group.count === 1 ? '' : 's'}
                    </span>

                    <span className={styles.groupMetaItem}>
                      <UsersRound size={13} />
                      {group.userCount} actor{group.userCount === 1 ? '' : 's'}
                    </span>

                    <span className={styles.groupMetaItem}>
                      <Clock3 size={13} />
                      {formatTime(group.earliest)} - {formatTime(group.latest)}
                    </span>

                    {group.failedCount > 0 && (
                      <span className={styles.groupAlert}>
                        {group.failedCount} failed
                      </span>
                    )}
                  </span>
                </div>

                <div className={styles.groupPreview}>
                  {group.logs.slice(0, 3).map((log) => (
                    <span key={log.id} className={styles.previewBadge}>
                      {titleCase(log.action)}
                    </span>
                  ))}

                  {group.logs.length > 3 && (
                    <span className={styles.previewMore}>
                      +{group.logs.length - 3} more
                    </span>
                  )}
                </div>

                <span className={styles.viewButton}>
                  View logs
                  <ChevronRight size={15} />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {activeDay && (
        <div className={styles.overlay} onClick={closeDay}>
          <div
            className={styles.detailPanel}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.panelHeader}>
              <div className={styles.panelIdentity}>
                <div className={styles.largeAvatar}>
                  <CalendarDays size={20} />
                </div>

                <div>
                  <h2>{dayLabel(activeDay)}</h2>
                  <p>
                    {dayView.length} of {dayLogs.length} event
                    {dayLogs.length === 1 ? '' : 's'} shown
                  </p>
                </div>
              </div>

              <button
                type="button"
                className={styles.closeButton}
                onClick={closeDay}
                aria-label="Close day details"
              >
                <X size={20} />
              </button>
            </div>

            <div className={styles.panelToolbar}>
              <div className={styles.searchBox}>
                <Search size={18} />

                <input
                  placeholder="Search name, email, action or details..."
                  value={daySearch}
                  onChange={(e) => setDaySearch(e.target.value)}
                />

                {daySearch && (
                  <button
                    type="button"
                    className={styles.searchClear}
                    onClick={() => setDaySearch('')}
                    aria-label="Clear search"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              <select
                className={styles.filter}
                value={dayAction}
                onChange={(e) => setDayAction(e.target.value)}
                aria-label="Filter by action"
              >
                <option value="">All Actions</option>
                {ACTION_OPTIONS.map((action) => (
                  <option key={action} value={action}>
                    {titleCase(action)}
                  </option>
                ))}
              </select>

              <select
                className={styles.filter}
                value={dayStatus}
                onChange={(e) => setDayStatus(e.target.value)}
                aria-label="Filter by status"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <select
                className={styles.filter}
                value={dayRole}
                onChange={(e) => setDayRole(e.target.value)}
                aria-label="Filter by role"
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className={`${styles.filterToggle} ${dayFilterCount ? styles.filterToggleActive : ''}`}
                onClick={handleClearDayFilters}
                disabled={dayFilterCount === 0}
              >
                <Filter size={16} />
                Clear
                {dayFilterCount > 0 && (
                  <span className={styles.filterCount}>{dayFilterCount}</span>
                )}
              </button>
            </div>

            <div className={styles.panelActions}>
              <button
                type="button"
                className={styles.dangerGhostBtn}
                onClick={() => setConfirm('day')}
                disabled={dayLogs.length === 0}
              >
                <Trash2 size={16} />
                Delete this day
              </button>

              <button
                type="button"
                className={styles.dangerBtn}
                onClick={() => setConfirm('all')}
              >
                <Trash2 size={16} />
                Delete all logs
              </button>
            </div>

            {dayLoading ? (
              <div className={styles.loadingPanel}>
                <div className={styles.spinner} />
                <span>Loading logs for this day...</span>
              </div>
            ) : dayView.length === 0 ? (
              <div className={styles.empty}>
                <ScrollText size={34} />
                <h3>No matching events</h3>
                <p>
                  {dayLogs.length === 0
                    ? 'Everything recorded for this date has been removed.'
                    : 'No events on this day match your search or filters.'}
                </p>
              </div>
            ) : (
              <div className={styles.panelBody}>
                {dayView.map((log) => (
                  <div className={styles.logItem} key={log.id}>
                    <div className={styles.logTime}>
                      {formatTime(log.created_at)}
                    </div>

                    <div className={styles.logUser}>
                      <div className={styles.logAvatar}>
                        {getInitials(log)}
                      </div>

                      <div className={styles.logUserText}>
                        <strong>{getUserName(log)}</strong>
                        <span>
                          {log.role ? titleCase(log.role) : 'System'}
                          {log.email ? ` • ${log.email}` : ''}
                        </span>
                      </div>
                    </div>

                    <div className={styles.logMain}>
                      <span className={styles.actionBadge}>
                        {titleCase(log.action)}
                      </span>

                      <span className={styles.logDetails}>
                        {log.details || 'No description'}
                      </span>

                      <span className={styles.logMeta}>
                        {log.module ? `${log.module} • ` : ''}
                        {log.ip_address || 'No IP'}
                        {log.device ? ` • ${log.device}` : ''}
                      </span>
                    </div>

                    <span
                      className={`${styles.badge} ${statusBadgeClass(log.status)}`}
                    >
                      {titleCase(log.status) || 'Success'}
                    </span>

                    <button
                      type="button"
                      className={styles.deleteIconBtn}
                      onClick={() => handleDeleteLog(log)}
                      disabled={deletingId === log.id}
                      aria-label={`Delete log ${log.id}`}
                      title="Delete this log"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {confirm && (
              <div className={styles.confirmBar}>
                <AlertCircle size={18} />

                <span>
                  {confirm === 'all'
                    ? 'Delete every access log in the system? This cannot be undone.'
                    : `Delete all ${dayLogs.length} event${dayLogs.length === 1 ? '' : 's'} recorded on this day?`}
                </span>

                <div className={styles.confirmActions}>
                  <button
                    type="button"
                    className={styles.confirmCancel}
                    onClick={() => setConfirm(null)}
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    className={styles.confirmDelete}
                    onClick={
                      confirm === 'all' ? handleDeleteAll : handleDeleteDay
                    }
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
