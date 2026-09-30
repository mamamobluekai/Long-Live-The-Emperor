import { useEffect, useState } from 'react';
import { FileText, AlertCircle, MessageSquare, ChevronDown, Scale, X } from 'lucide-react';
import { getSupervisorAppeals, respondToAppeal } from '../../../api/appealApi';
import styles from './SupervisorGradeAppeals.module.css';

const STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

// Dates read as words, e.g. "September 29, 2026, 3:04 PM".
function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function SupervisorGradeAppeals() {
  const [appeals, setAppeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [openAppealId, setOpenAppealId] = useState(null);
  const [respondingAppeal, setRespondingAppeal] = useState(null);
  const [responseText, setResponseText] = useState('');
  const [responseStatus, setResponseStatus] = useState('approved');
  const [responding, setResponding] = useState(false);
  const [responseError, setResponseError] = useState('');
  const [responseMessage, setResponseMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const data = await getSupervisorAppeals();
        if (!cancelled) {
          setAppeals(data.appeals || []);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load appeals');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const filteredAppeals = appeals.filter((appeal) => {
    if (filterStatus === 'all') return true;
    return appeal.status === filterStatus;
  });

  const pendingCount = appeals.filter(a => a.status === 'pending').length;
  const approvedCount = appeals.filter(a => a.status === 'approved').length;
  const rejectedCount = appeals.filter(a => a.status === 'rejected').length;

  // The drawer takes Escape and locks page scroll; the respond modal stacks
  // above it and closes first, so Escape falls through to the drawer.
  useEffect(() => {
    if (!openAppealId) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (respondingAppeal) setRespondingAppeal(null);
      else setOpenAppealId(null);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [openAppealId, respondingAppeal]);

  const openAppeal = appeals.find((a) => a.id === openAppealId) || null;

  async function handleRespond(e) {
    e.preventDefault();
    if (!responseText.trim()) {
      setResponseError('Please provide a response.');
      return;
    }
    if (!respondingAppeal) return;

    setResponding(true);
    setResponseError('');
    setResponseMessage('');
    try {
      await respondToAppeal(respondingAppeal.id, {
        status: responseStatus,
        response: responseText.trim(),
      });
      setResponseMessage('Response submitted successfully!');
      // Update local state
      setAppeals((prev) =>
        prev.map((a) =>
          a.id === respondingAppeal.id
            ? { ...a, status: responseStatus, supervisor_response: responseText.trim(), reviewed_at: new Date().toISOString() }
            : a
        )
      );
      setRespondingAppeal(null);
      setResponseText('');
      setResponseStatus('approved');
    } catch (e) {
      setResponseError(e.message || 'Failed to submit response.');
    } finally {
      setResponding(false);
    }
  }

  function openRespond(appeal) {
    setRespondingAppeal(appeal);
    setResponseText(appeal.supervisor_response || '');
    setResponseStatus(appeal.status === 'pending' ? 'approved' : appeal.status);
    setResponseError('');
    setResponseMessage('');
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading appeals...</div>
      </div>
    );
  }

    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <div className={styles.headerIcon}>
            <Scale size={24} />
          </div>
          <div>
            <h2>Grade Appeals</h2>
            <p>Review and respond to student grade appeals.</p>
          </div>
        </div>

        {error && <div className={styles.error}>{error}</div>}

      {/* Stats */}
      <div className={styles.statsGrid}>
        <StatCard
          label="Total Appeals"
          value={appeals.length}
          type="blue"
        />
        <StatCard
          label="Pending Review"
          value={pendingCount}
          type="orange"
        />
        <StatCard
          label="Approved"
          value={approvedCount}
          type="green"
        />
        <StatCard
          label="Rejected"
          value={rejectedCount}
          type="red"
        />
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.filterTabs}>
          <button
            className={`${styles.filterTab} ${filterStatus === 'all' ? styles.active : ''}`}
            onClick={() => setFilterStatus('all')}
          >
            All <span className={styles.count}>{appeals.length}</span>
          </button>
          <button
            className={`${styles.filterTab} ${filterStatus === 'pending' ? styles.active : ''}`}
            onClick={() => setFilterStatus('pending')}
          >
            Pending <span className={styles.count}>{pendingCount}</span>
          </button>
          <button
            className={`${styles.filterTab} ${filterStatus === 'approved' ? styles.active : ''}`}
            onClick={() => setFilterStatus('approved')}
          >
            Approved <span className={styles.count}>{approvedCount}</span>
          </button>
          <button
            className={`${styles.filterTab} ${filterStatus === 'rejected' ? styles.active : ''}`}
            onClick={() => setFilterStatus('rejected')}
          >
            Rejected <span className={styles.count}>{rejectedCount}</span>
          </button>
        </div>
      </div>

      {/* Appeals List */}
      <div className={styles.section}>
        {filteredAppeals.length === 0 ? (
          <div className={styles.empty}>
            <FileText size={48} />
            <p>{filterStatus === 'all' ? 'No grade appeals submitted yet.' : `No ${filterStatus} appeals.`}</p>
          </div>
        ) : (
          <div className={styles.appealsList}>
            {filteredAppeals.map((appeal) => (
              <AppealCard
                key={appeal.id}
                appeal={appeal}
                onOpen={() => setOpenAppealId(appeal.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail drawer - the full appeal, so the list stays compact and the
          page never reflows when a card is opened. */}
      {openAppeal && (
        <div
          className={styles.drawerOverlay}
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpenAppealId(null);
          }}
        >
          <aside
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-labelledby="grade-appeal-title"
          >
            <div className={styles.drawerHeader}>
              <div className={styles.drawerHeaderText}>
                <span className={styles.drawerEyebrow}>
                  {openAppeal.category_name || 'Overall Grade'} Appeal
                </span>
                <h2 id="grade-appeal-title">
                  {openAppeal.first_name} {openAppeal.last_name}
                </h2>
                <p>
                  {openAppeal.student_number}
                  {[openAppeal.grade_level, openAppeal.track_strand].filter(Boolean).join(' · ')}
                </p>
              </div>
              <button
                type="button"
                className={styles.closeButton}
                onClick={() => setOpenAppealId(null)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className={styles.drawerBody}>
              <div className={styles.drawerStatusRow}>
                <span className={`${styles.statusBadge} ${styles[openAppeal.status] || ''}`}>
                  {STATUS_LABELS[openAppeal.status] || openAppeal.status}
                </span>
                <span className={styles.drawerSubmittedAt}>
                  Submitted {formatDateTime(openAppeal.created_at)}
                </span>
              </div>

              <dl className={styles.drawerMeta}>
                <div className={styles.drawerMetaRow}>
                  <dt>Original Grade</dt>
                  <dd>
                    {openAppeal.overall_percentage
                      ? `${openAppeal.overall_percentage}%`
                      : openAppeal.overall_score || 'N/A'}
                  </dd>
                </div>
                <div className={styles.drawerMetaRow}>
                  <dt>Student Email</dt>
                  <dd>{openAppeal.student_email}</dd>
                </div>
              </dl>

              <section className={styles.drawerSection}>
                <h3>Student's Reason</h3>
                <p className={styles.drawerProse}>{openAppeal.reason || 'No reason provided.'}</p>
              </section>

              {openAppeal.supervisor_response && (
                <section className={`${styles.drawerSection} ${styles.drawerSectionResponse}`}>
                  <h3>
                    <MessageSquare size={14} />
                    Your Response ({STATUS_LABELS[openAppeal.status] || openAppeal.status})
                  </h3>
                  <p className={styles.drawerProse}>{openAppeal.supervisor_response}</p>
                  {openAppeal.reviewed_at && (
                    <span className={styles.drawerRespondedAt}>
                      Responded {formatDateTime(openAppeal.reviewed_at)}
                    </span>
                  )}
                </section>
              )}
            </div>

            {openAppeal.status === 'pending' && (
              <div className={styles.drawerFooter}>
                <button
                  type="button"
                  className={styles.respondButton}
                  onClick={() => openRespond(openAppeal)}
                >
                  <MessageSquare size={15} />
                  Respond
                </button>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Response Modal */}
      {respondingAppeal && (
        <div className={styles.modalOverlay} onClick={() => setRespondingAppeal(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Respond to Appeal</h3>
              <button type="button" className={styles.closeButton} onClick={() => setRespondingAppeal(null)}>×</button>
            </div>
            <div className={styles.modalSubtitle}>
              <strong>{respondingAppeal.first_name} {respondingAppeal.last_name}</strong> ({respondingAppeal.student_number})
              · {respondingAppeal.category_name || 'Overall Grade'}
              · Submitted {new Date(respondingAppeal.created_at).toLocaleDateString()}
            </div>
            <div className={styles.modalReason}>
              <strong>Student's Reason:</strong>
              <p>{respondingAppeal.reason}</p>
            </div>
            <div className={styles.modalEvaluation}>
              <strong>Original Grade:</strong>
              <span>{respondingAppeal.overall_percentage ? `${respondingAppeal.overall_percentage}%` : respondingAppeal.overall_score || 'N/A'}</span>
            </div>
            <form onSubmit={handleRespond}>
              <div className={styles.modalStatusSelect}>
                <label>
                  Decision
                  <select
                    className={styles.select}
                    value={responseStatus}
                    onChange={(e) => setResponseStatus(e.target.value)}
                  >
                    <option value="approved">Approve Appeal</option>
                    <option value="rejected">Reject Appeal</option>
                    <option value="pending">Request More Info</option>
                  </select>
                </label>
              </div>
              <label className={styles.modalTextareaLabel}>
                Response to Student (Required)
                <textarea
                  className={styles.modalTextarea}
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  placeholder="Explain your decision to the student..."
                  rows={4}
                  required
                />
              </label>
              {responseError && <div className={styles.formError}>{responseError}</div>}
              {responseMessage && <div className={styles.formSuccess}>{responseMessage}</div>}
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setRespondingAppeal(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.btnPrimary}
                  disabled={responding}
                >
                  {responding ? 'Submitting...' : 'Submit Response'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, type }) {
  const valueClass = {
    blue: styles.statBlue,
    orange: styles.statOrange,
    green: styles.statGreen,
    red: styles.statRed,
  }[type] || styles.statBlue;

  return (
    <div className={styles.statCard}>
      <span className={`${styles.statIcon} ${valueClass}`}>{value}</span>
      <div className={styles.statContent}>
        <span className={styles.statLabel}>{label}</span>
      </div>
    </div>
  );
}

function AppealCard({ appeal, onOpen }) {
  return (
    <div
      className={styles.appealCard}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className={styles.appealCardHeader}>
        <div className={styles.appealMain}>
          <div className={styles.appealStudent}>
            <span className={styles.studentName}>
              {appeal.first_name} {appeal.last_name}
            </span>
            <span className={styles.studentMeta}>
              {appeal.student_number} · {appeal.grade_level || ''} ·{' '}
              {appeal.track_strand || ''}
            </span>
          </div>
          <div className={styles.appealCategory}>
            <AlertCircle size={14} />
            <span>{appeal.category_name || 'Overall Grade'}</span>
          </div>
        </div>
        <div className={styles.appealRight}>
          <span className={`${styles.statusBadge} ${styles[appeal.status] || ''}`}>
            {STATUS_LABELS[appeal.status] || appeal.status}
          </span>
          <span className={styles.viewDetailsHint}>View details</span>
          <ChevronDown size={16} className={styles.chevron} />
        </div>
      </div>
    </div>
  );
}

export default SupervisorGradeAppeals;