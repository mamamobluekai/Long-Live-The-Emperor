import { useEffect, useState, useCallback } from 'react';
import { CheckCircle, ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
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
  const [reports, setReports] = useState([]);
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [batchFilter, setBatchFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState([]);
  const [expandedId, setExpandedId] = useState(null);

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

  const priorityOptions = ['urgent', 'high', 'normal', 'low'];
  const batchOptions = Array.from(
    new Set(reports.map(getBatchLabel))
  ).sort((a, b) => a.localeCompare(b));

  const filteredReports = sortByPriority(
    priorityFilter === 'all'
      ? reports
      : reports.filter((report) => getPriorityLevel(report.priority) === priorityFilter)
  );

  const batchFilteredReports = batchFilter === 'all'
    ? filteredReports
    : filteredReports.filter((report) => getBatchLabel(report) === batchFilter);

  const groupedReports = groupByBatch(batchFilteredReports);

  const toggleGroup = (label) => {
    setCollapsedGroups((prev) => (
      prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]
    ));
  };

  const toggleExpand = (reportId) => {
    setExpandedId((prev) => (prev === reportId ? null : reportId));
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>SUPERVISOR REPORTS</span>
          <h1>Reports and Concerns</h1>
          <p>Reports and concerns submitted by supervisors for students in your batches.</p>
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

        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Batch</span>
          <button
            type="button"
            aria-pressed={batchFilter === 'all'}
            className={batchFilter === 'all' ? `${styles.filterBtn} ${styles.filterActive}` : styles.filterBtn}
            onClick={() => setBatchFilter('all')}
          >
            All Batches
          </button>
          {batchOptions.map((batch) => (
            <button
              key={batch}
              type="button"
              aria-pressed={batchFilter === batch}
              className={batchFilter === batch ? `${styles.filterBtn} ${styles.filterActive}` : styles.filterBtn}
              onClick={() => setBatchFilter(batch)}
            >
              {batch}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className={styles.info}>Loading reports and concerns…</p>}

      {!loading && Object.keys(groupedReports).length === 0 && (
        <p className={styles.empty}>No reports or concerns match these filters.</p>
      )}

      {!loading && Object.entries(groupedReports).map(([batchLabel, batchReports]) => {
        const isCollapsed = collapsedGroups.includes(batchLabel);

        return (
          <div key={batchLabel} className={styles.batchGroup}>
            <div
              className={styles.batchHeader}
              onClick={() => toggleGroup(batchLabel)}
              role="button"
              tabIndex={0}
              aria-expanded={!isCollapsed}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleGroup(batchLabel);
                }
              }}
            >
              <span className={styles.batchLabel}>{batchLabel}</span>
              <span className={styles.batchCount}>
                {batchReports.length} concern{batchReports.length !== 1 ? 's' : ''}
              </span>
              {isCollapsed ? (
                <ChevronDown size={16} className={styles.batchToggle} />
              ) : (
                <ChevronUp size={16} className={styles.batchToggle} />
              )}
            </div>

            {!isCollapsed && (
              <div className={styles.batchContent}>
                {batchReports.map((report) => {
                  const priorityLevel = getPriorityLevel(report.priority);
                  const itemClass = priorityLevel === 'urgent'
                    ? styles.itemUrgent
                    : priorityLevel === 'high'
                      ? styles.itemHigh
                      : '';
                  const isExpanded = expandedId === report.id;

                  return (
                    <div key={report.id} className={`${styles.card} ${itemClass}`}>
                      <div
                        className={styles.cardSummary}
                        onClick={() => toggleExpand(report.id)}
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleExpand(report.id);
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
                            {isExpanded ? (
                              <ChevronUp size={14} className={styles.expandIcon} />
                            ) : (
                              <ChevronDown size={14} className={styles.expandIcon} />
                            )}
                          </div>
                        </div>

                        {!isExpanded && (
                          <div className={styles.summaryLine}>
                            <span className={styles.supervisorSummary}>
                              <span className={styles.fromLabel}>From:</span> {getSupervisorName(report)}
                              {report.supervisor_company && <span className={styles.companyTag}>{report.supervisor_company}</span>}
                            </span>
                          </div>
                        )}
                      </div>

                      {isExpanded && (
                        <div className={styles.cardDetails}>
                          <div className={styles.detailsRow}>
                            <span className={styles.detailItem}>
                              <span className={styles.detailLabel}>Batch</span>
                              {getBatchLabel(report)}
                            </span>
                            <span className={styles.detailItem}>
                              <span className={styles.detailLabel}>From</span>
                              {getSupervisorName(report)}
                              {report.supervisor_company && <span className={styles.companyTag}>{report.supervisor_company}</span>}
                            </span>
                            <span className={styles.detailItem}>
                              <span className={styles.detailLabel}>Concern</span>
                              {getConcernType(report)}
                            </span>
                            <span className={styles.detailItem}>
                              <span className={styles.detailLabel}>Student</span>
                              {[report.grade_level, report.track_strand].filter(Boolean).join(' / ') || 'No academic details'}
                            </span>
                          </div>

                          <div className={styles.messageBox}>
                            <span className={styles.detailLabel}>Concern details</span>
                            <p className={styles.message}>
                              {report.message || 'No message was included with this concern.'}
                            </p>
                          </div>

                          {report.status === 'open' && (
                            <button
                              type="button"
                              className={styles.confirmBtn}
                              onClick={() => handleConfirm(report.id)}
                              disabled={confirmingId === report.id}
                            >
                              <CheckCircle size={14} />
                              {confirmingId === report.id ? 'Confirming...' : 'Confirm'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default TeacherReportsConcerns;
