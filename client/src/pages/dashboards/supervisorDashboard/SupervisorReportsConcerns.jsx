// Supervisor → "My Reports & Concerns".
//
// The supervisor is the REPORTER: they file concerns from this page, and the
// assigned teacher resolves them. The create form opens in a side modal; the
// history of what they filed stays on the page.
//
// Design system: Lexend + the maroon palette from TeacherReportsConcerns.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Plus, Trash2, X } from 'lucide-react';
import {
  createSupervisorReportConcern,
  deleteSupervisorReportConcern,
  getSupervisorBatches,
  getSupervisorReportsConcerns,
} from '../../../api/supervisorApi';
import styles from './SupervisorReportsConcerns.module.css';

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
const PRIORITY_LABELS = { urgent: 'Urgent', high: 'High', normal: 'Normal', low: 'Low' };

const getPriorityKey = (priority) => (priority || '').toLowerCase();
const getPriorityBadgeClass = (priority) => `priority_${getPriorityKey(priority)}`;
const getBadgeClass = (status) => `badge_${(status || '').toLowerCase()}`;
const getPriorityLabel = (report) => PRIORITY_LABELS[getPriorityKey(report.priority)] || 'Normal';
const getConcernType = (report) => report.category || 'Uncategorized';

function sortByPriority(reports) {
  return [...reports].sort((a, b) => {
    const pa = PRIORITY_ORDER[getPriorityKey(a.priority)] ?? 99;
    const pb = PRIORITY_ORDER[getPriorityKey(b.priority)] ?? 99;
    if (pa !== pb) return pa - pb;
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });
}

function SupervisorReportsConcerns() {
  const [reports, setReports] = useState([]);
  const [notice, setNotice] = useState(null);
  const [historyError, setHistoryError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  // Create form state. The form itself lives in the side modal.
  const [formOpen, setFormOpen] = useState(false);
  const [students, setStudents] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({
    studentId: '',
    category: 'Concern',
    priority: 'normal',
    message: '',
  });

  const loadReports = useCallback(async () => {
    setNotice(null);
    try {
      const data = await getSupervisorReportsConcerns();
      setReports(data.reports || []);
    } catch (err) {
      setNotice({ type: 'error', text: err.message || 'Failed to load reports and concerns.' });
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // The form only needs the supervisor's students. Each entry carries the batch
  // it came from, so the batch is derived from the student instead of being
  // picked separately. A student can appear in both a deployment request and a
  // teacher batch, so the teacher batch wins (it has the assigned teacher).
  useEffect(() => {
    let cancelled = false;
    async function loadStudents() {
      try {
        const data = await getSupervisorBatches();
        if (cancelled) return;

        const byStudent = new Map();
        for (const batch of data.batches || []) {
          for (const student of batch.students || []) {
            const entry = {
              studentId: student.student_id,
              name: `${student.first_name || ''} ${student.last_name || ''}`.trim(),
              studentNumber: student.student_number || '',
              batchId: batch.request_id,
              batchSource: batch.source,
            };
            const existing = byStudent.get(entry.studentId);
            if (!existing || (existing.batchSource !== 'teacher' && entry.batchSource === 'teacher')) {
              byStudent.set(entry.studentId, entry);
            }
          }
        }

        setStudents(
          [...byStudent.values()].sort((a, b) =>
            `${a.name} ${a.studentNumber}`.localeCompare(`${b.name} ${b.studentNumber}`)
          )
        );
      } catch (err) {
        if (!cancelled) setFormError(err.message || 'Failed to load your students.');
      }
    }
    loadStudents();
    return () => { cancelled = true; };
  }, []);

  // Escape closes the create modal.
  useEffect(() => {
    if (!formOpen) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setFormOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [formOpen]);

  // The batch is not chosen by hand: it follows the selected student.
  const selectedStudent = useMemo(
    () => students.find((student) => String(student.studentId) === form.studentId) || null,
    [students, form.studentId]
  );

  const sortedReports = useMemo(() => sortByPriority(reports), [reports]);

  const toggleExpanded = (reportId) => {
    setExpandedId((current) => (current === reportId ? null : reportId));
  };

  const submitReport = async (event) => {
    event.preventDefault();
    if (!selectedStudent || !form.message.trim() || submitting) return;

    setSubmitting(true);
    setFormError('');
    try {
      await createSupervisorReportConcern({
        student_id: Number(selectedStudent.studentId),
        batch_id: selectedStudent.batchId,
        batch_source: selectedStudent.batchSource,
        category: form.category,
        priority: form.priority,
        message: form.message.trim(),
      });
      setForm((current) => ({ ...current, studentId: '', message: '' }));
      setFormOpen(false);
      setNotice({ type: 'success', text: 'Report submitted. The assigned teacher has been notified.' });
      await loadReports();
    } catch (err) {
      setFormError(err.message || 'Failed to submit report.');
    } finally {
      setSubmitting(false);
    }
  };

  // The supervisor owns what they filed, so they can withdraw a report.
  const handleDelete = async (reportId) => {
    if (deletingId) return;
    setDeletingId(reportId);
    setHistoryError('');
    try {
      await deleteSupervisorReportConcern(reportId);
      setReports((current) => current.filter((report) => report.id !== reportId));
    } catch (err) {
      setHistoryError(err.message || 'Failed to delete report.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>SUBMITTED BY YOU</span>
          <h1>My Reports &amp; Concerns</h1>
          <p>Concerns you reported about your assigned students, and whether the teacher has resolved them.</p>
        </div>
      </header>

      {notice && <div className={`${styles.notice} ${styles['notice_' + notice.type]}`}>{notice.text}</div>}

      {historyError && <p className={styles.formError}>{historyError}</p>}

      <section className={styles.historySection}>
        <h3 className={styles.formTitle}>Reports &amp; Concerns You Created</h3>

        {reports.length === 0 ? (
          <p className={styles.empty}>You have not filed any reports or concerns yet.</p>
        ) : (
          <div className={styles.concernList}>
            {sortedReports.map((report) => {
              const priorityLevel = getPriorityKey(report.priority);
              const itemClass = priorityLevel === 'urgent'
                ? styles.itemUrgent
                : priorityLevel === 'high'
                  ? styles.itemHigh
                  : '';
              const isExpanded = expandedId === report.id;

              return (
                <div
                  key={report.id}
                  className={`${styles.card} ${itemClass} ${isExpanded ? styles.cardExpanded : ''}`}
                >
                  <div
                    className={styles.cardTop}
                    onClick={() => toggleExpanded(report.id)}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        toggleExpanded(report.id);
                      }
                    }}
                  >
                    <div className={styles.studentInfo}>
                      <strong className={styles.studentName}>
                        {report.first_name} {report.last_name}
                      </strong>
                      <span className={styles.meta}>
                        <span>{getConcernType(report)}</span>
                        <span className={styles.metaDot} aria-hidden="true">·</span>
                        <span>{formatDate(report.created_at)}</span>
                      </span>
                    </div>

                    <div className={styles.cardTags}>
                      <span className={`${styles.priority} ${styles[getPriorityBadgeClass(report.priority)]}`}>
                        {getPriorityLabel(report)}
                      </span>
                      <span className={`${styles.badge} ${styles[getBadgeClass(report.status)]}`}>
                        {report.status}
                      </span>
                      <ChevronDown
                        size={16}
                        className={`${styles.expandIcon} ${isExpanded ? styles.expandIconOpen : ''}`}
                      />
                    </div>
                  </div>

                  {isExpanded && (
                    <div className={styles.cardDetails}>
                      <div className={styles.detailGrid}>
                        <div className={styles.detailItem}>
                          <span className={styles.detailLabel}>Student ID</span>
                          {report.student_number || 'No ID'}
                        </div>
                        <div className={styles.detailItem}>
                          <span className={styles.detailLabel}>Concern type</span>
                          {getConcernType(report)}
                        </div>
                        <div className={styles.detailItem}>
                          <span className={styles.detailLabel}>Priority</span>
                          {getPriorityLabel(report)}
                        </div>
                        <div className={styles.detailItem}>
                          <span className={styles.detailLabel}>Status</span>
                          {report.status}
                        </div>
                        <div className={styles.detailItem}>
                          <span className={styles.detailLabel}>Reported on</span>
                          {formatDate(report.created_at)}
                        </div>
                      </div>

                      {report.message && (
                        <div className={styles.messageBox}>
                          <span className={styles.detailLabel}>Details</span>
                          <p className={styles.cardMessage}>{report.message}</p>
                        </div>
                      )}

                      <div className={styles.historyActions}>
                        <button
                          type="button"
                          className={styles.deleteBtn}
                          onClick={() => handleDelete(report.id)}
                          disabled={deletingId === report.id}
                        >
                          <Trash2 size={14} />
                          {deletingId === report.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className={styles.newReportBar}>
          <button type="button" className={styles.confirmBtn} onClick={() => setFormOpen(true)}>
            <Plus size={14} />
            Create Report or Concern
          </button>
        </div>
      </section>

      {/* Create report modal */}
      {formOpen && (
        <div
          className={styles.drawerOverlay}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setFormOpen(false);
          }}
        >
          <aside
            className={styles.halfDrawer}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-report-title"
          >
            <div className={styles.drawerHeader}>
              <div>
                <span className={styles.drawerEyebrow}>NEW REPORT</span>
                <h3 id="new-report-title">Create Report or Concern</h3>
                <p>The assigned teacher is notified immediately.</p>
              </div>
              <button
                type="button"
                className={styles.drawerClose}
                onClick={() => setFormOpen(false)}
                aria-label="Close report form"
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.drawerBody}>
              <form className={styles.reportForm} onSubmit={submitReport}>
                {formError && <p className={styles.formError}>{formError}</p>}

                <div className={styles.reportFields}>
                  <label>
                    Student
                    <select
                      value={form.studentId}
                      onChange={(event) => setForm((current) => ({ ...current, studentId: event.target.value }))}
                      required
                    >
                      <option value="">Select a student</option>
                      {students.map((student) => (
                        <option key={student.studentId} value={student.studentId}>
                          {student.name || `Student ${student.studentId}`}
                          {student.studentNumber ? ` (${student.studentNumber})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Category
                    <select
                      value={form.category}
                      onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                    >
                      <option value="Concern">Concern</option>
                      <option value="Attendance">Attendance</option>
                      <option value="Performance">Performance</option>
                      <option value="Behavior">Behavior</option>
                      <option value="Safety">Safety</option>
                      <option value="Other">Other</option>
                    </select>
                  </label>

                  <label>
                    Priority
                    <select
                      value={form.priority}
                      onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </label>
                </div>

                <label className={styles.reportMessage}>
                  Details
                  <textarea
                    rows={4}
                    value={form.message}
                    onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
                    placeholder="Describe the problem or concern."
                    required
                  />
                </label>

                <div className={styles.reportActions}>
                  <button type="button" className={styles.secondaryBtn} onClick={() => setFormOpen(false)}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={styles.confirmBtn}
                    disabled={submitting || !form.studentId || !form.message.trim()}
                  >
                    {submitting ? 'Submitting...' : 'Submit Report'}
                  </button>
                </div>
              </form>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

export default SupervisorReportsConcerns;
