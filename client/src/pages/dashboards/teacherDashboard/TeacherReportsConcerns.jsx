import { useEffect, useState, useCallback, useMemo } from 'react';
import { CheckCircle, ChevronDown, ChevronUp, Filter, X } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useTeacherBatch } from '../../../hooks/useTeacherBatch';
import { getTeacherReportsConcerns, confirmReportConcern } from '../../../api/teacherApi';
import styles from './TeacherReportsConcerns.module.css';

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 };
const PRIORITY_LABELS = {
  urgent: 'Urgent',
  high: 'High',
  normal: 'Normal',
  low: 'Low',
};

function getPriorityKey(priority) {
  return (priority || '').toLowerCase();
}

function getPriorityLevel(priority) {
  return getPriorityKey(priority);
}

function getPriorityLabel(report) {
  return PRIORITY_LABELS[getPriorityKey(report.priority)] || 'Normal';
}

function getPriorityBadgeClass(priority) {
  const key = getPriorityKey(priority);
  return `priority_${key}`;
}

function getBadgeClass(status) {
  return `badge_${(status || '').toLowerCase()}`;
}

function getSupervisorName(report) {
  return [report.supervisor_first_name, report.supervisor_last_name]
    .filter(Boolean)
    .join(' ') || '—';
}

function getBatchLabel(report) {
  return report.batch_label || 'Deployment Batch';
}

function getConcernType(report) {
  return report.category || 'Uncategorized';
}

function groupByBatch(reports) {
  const groups = {};
  reports.forEach((report) => {
    const batchLabel = getBatchLabel(report);
    if (!groups[batchLabel]) groups[batchLabel] = [];
    groups[batchLabel].push(report);
  });
  return groups;
}

function sortByPriority(reports) {
  return [...reports].sort((a, b) => {
    const pa = PRIORITY_ORDER[getPriorityKey(a.priority)] ?? 99;
    const pb = PRIORITY_ORDER[getPriorityKey(b.priority)] ?? 99;
    if (pa !== pb) return pa - pb;
    const da = new Date(a.created_at || 0).getTime();
    const db = new Date(b.created_at || 0).getTime();
    return db - da;
  });
}

function TeacherReportsConcerns() {
  const { token } = useAuth();
  const { batchId, batchLabel } = useTeacherBatch();
  const [reports, setReports] = useState([]);
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState([]);
  const [detailReport, setDetailReport] = useState(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    try {
      const data = await getTeacherReportsConcerns(token);
      setReports(data.reports || []);
    } catch (err) {
      setNotice({ type: 'error', text: err.message || 'Failed to load reports and concerns.' });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleConfirm = async (reportId) => {
    setConfirmingId(reportId);
    try {
      await confirmReportConcern(reportId, token);
      setReports((current) => current.map((report) =>
        report.id === reportId ? { ...report, status: 'resolved', updated_at: new Date().toISOString() } : report
      ));
    } catch (err) {
      setNotice({ type: 'error', text: err.response?.data?.error || err.message || 'Failed to confirm report.' });
    } finally {
      setConfirmingId(null);
    }
  };

  // The batch is chosen in the sidebar; switching it refilters this page.
  useEffect(() => {
    setCollapsedGroups([]);
    setDetailReport(null);
  }, [batchId]);

  const priorityOptions = ['urgent', 'high', 'normal', 'low'];

  const batchReports = useMemo(
    () =>
      reports.filter(
        (report) => !batchId || Number(report.teacher_batch_id) === Number(batchId)
      ),
    [reports, batchId]
  );

  const filteredReports = sortByPriority(
    priorityFilter === 'all'
      ? batchReports
      : batchReports.filter((report) => getPriorityLevel(report.priority) === priorityFilter)
  );

  const groupedReports = groupByBatch(filteredReports);

  const toggleGroup = (label) => {
    setCollapsedGroups((prev) => (
      prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]
    ));
  };

  // Escape closes the concern drawer.
  useEffect(() => {
    if (!detailReport) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setDetailReport(null);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [detailReport]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>SUPERVISOR REPORTS</span>
          <h1>Reports and Concerns</h1>
          <p>Reports and concerns submitted by supervisors for students in your batches{batchLabel ? ` (${batchLabel})` : ''}.</p>
        </div>
      </header>

      {notice && <div className={`${styles.notice} ${styles['notice_' + notice.type]}`}>{notice.text}</div>}

      <div className={styles.filterRow}>
        <div className={styles.filterGroup}>
          <Filter size={16} className={styles.filterIcon} />
          <span className={styles.filterLabel}>Concern level</span>
          {['all', ...priorityOptions].map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={priorityFilter === item}
              className={priorityFilter === item ? `${styles.filterBtn} ${styles.filterActive}` : styles.filterBtn}
              onClick={() => setPriorityFilter(item)}
            >
              {item === 'all' ? 'All levels' : PRIORITY_LABELS[item]}
            </button>
          ))}
        </div>
      </div>

      {!batchId && !loading && (
        <p className={styles.empty}>Select a batch in the sidebar to view its concerns.</p>
      )}

      {loading && <p className={styles.info}>Loading reports and concerns…</p>}

      {!loading && batchId && Object.keys(groupedReports).length === 0 && (
        <p className={styles.empty}>No reports or concerns match these filters.</p>
      )}

      {!loading && batchId && Object.entries(groupedReports).map(([batchLabelKey, batchGroupReports]) => {
        const isCollapsed = collapsedGroups.includes(batchLabelKey);

        return (
          <div key={batchLabelKey} className={styles.batchGroup}>
            <div
              className={styles.batchHeader}
              onClick={() => toggleGroup(batchLabelKey)}
              role="button"
              tabIndex={0}
              aria-expanded={!isCollapsed}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleGroup(batchLabelKey);
                }
              }}
            >
              <span className={styles.batchLabel}>{batchLabelKey}</span>
              <span className={styles.batchCount}>
                {batchGroupReports.length} concern{batchGroupReports.length !== 1 ? 's' : ''}
              </span>
              {isCollapsed ? (
                <ChevronDown size={16} className={styles.batchToggle} />
              ) : (
                <ChevronUp size={16} className={styles.batchToggle} />
              )}
            </div>

            {!isCollapsed && (
              <div className={styles.batchContent}>
                {batchGroupReports.map((report) => {
                  const priorityLevel = getPriorityLevel(report.priority);
                  const itemClass = priorityLevel === 'urgent'
                    ? styles.itemUrgent
                    : priorityLevel === 'high'
                      ? styles.itemHigh
                      : '';

                  return (
                    <div key={report.id} className={`${styles.card} ${itemClass}`}>
                      <div
                        className={styles.cardSummary}
                        onClick={() => setDetailReport(report)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setDetailReport(report);
                          }
                        }}
                      >
                        <div className={styles.cardTop}>
                          <div className={styles.studentInfo}>
                            <strong className={styles.studentName}>{report.first_name} {report.last_name}</strong>
                            <span className={styles.meta}>
                              {' '}· {report.student_number || 'No ID'} · {getConcernType(report)} · {formatDate(report.created_at)}
                            </span>
                          </div>
                          <div className={styles.cardTags}>
                            <span className={`${styles.priority} ${styles[getPriorityBadgeClass(report.priority)]}`}>
                              {getPriorityLabel(report)}
                            </span>
                            <span className={`${styles.badge} ${styles[getBadgeClass(report.status)]}`}>
                              {report.status}
                            </span>
                            <ChevronDown size={14} className={styles.expandIcon} />
                          </div>
                        </div>

                        <div className={styles.summaryLine}>
                          <span className={styles.supervisorSummary}>
                            <span className={styles.fromLabel}>From:</span> {getSupervisorName(report)}
                            {report.supervisor_company && <span className={styles.companyTag}>{report.supervisor_company}</span>}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Concern detail drawer */}
      {detailReport && (
        <div
          className={styles.drawerOverlay}
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDetailReport(null);
          }}
        >
          <aside
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-labelledby="concern-drawer-title"
          >
            <div className={styles.drawerHeader}>
              <div>
                <span className={styles.drawerEyebrow}>{getConcernType(detailReport)}</span>
                <h3 id="concern-drawer-title">
                  {detailReport.first_name} {detailReport.last_name}
                </h3>
                <p>
                  {detailReport.student_number || 'No ID'} · {formatDate(detailReport.created_at)}
                </p>
              </div>
              <button
                type="button"
                className={styles.drawerClose}
                onClick={() => setDetailReport(null)}
                aria-label="Close concern details"
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.drawerBody}>
              <div className={styles.drawerTags}>
                <span className={`${styles.priority} ${styles[getPriorityBadgeClass(detailReport.priority)]}`}>
                  {getPriorityLabel(detailReport)}
                </span>
                <span className={`${styles.badge} ${styles[getBadgeClass(detailReport.status)]}`}>
                  {detailReport.status}
                </span>
              </div>

              <div className={styles.drawerGrid}>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Batch</span>
                  {getBatchLabel(detailReport)}
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Concern type</span>
                  {getConcernType(detailReport)}
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Reported by</span>
                  {getSupervisorName(detailReport)}
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Company</span>
                  {detailReport.supervisor_company || '—'}
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Student ID</span>
                  {detailReport.student_number || 'No ID'}
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Grade / Strand</span>
                  {[detailReport.grade_level, detailReport.track_strand].filter(Boolean).join(' / ') || 'No academic details'}
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Date reported</span>
                  {formatDate(detailReport.created_at)}
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Status</span>
                  {detailReport.status}
                </div>
              </div>

              <div className={styles.messageBox}>
                <span className={styles.detailLabel}>Concern details</span>
                <p className={styles.message}>
                  {detailReport.message || 'No message was included with this concern.'}
                </p>
              </div>

              {detailReport.status === 'open' && (
                <button
                  type="button"
                  className={styles.confirmBtn}
                  onClick={() => handleConfirm(detailReport.id)}
                  disabled={confirmingId === detailReport.id}
                >
                  <CheckCircle size={14} />
                  {confirmingId === detailReport.id ? 'Confirming...' : 'Confirm'}
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

export default TeacherReportsConcerns;
