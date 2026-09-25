import { useEffect, useState } from 'react';
import { FileText, AlertCircle, MessageSquare, ChevronDown } from 'lucide-react';
import { getSupervisorAppeals, respondToAppeal } from '../../../api/appealApi';
import styles from './SupervisorGradeAppeals.module.css';

const STATUS_COLORS = {
  pending: '#f59e0b',
  approved: '#22c55e',
  rejected: '#ef4444',
};

const STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

function SupervisorGradeAppeals() {
  const [appeals, setAppeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [expandedAppeal, setExpandedAppeal] = useState(null);
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
    <div className={styles.container}>
      <div className={styles.pageHeader}>
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
                expanded={expandedAppeal === appeal.id}
                onToggle={() => setExpandedAppeal(expandedAppeal === appeal.id ? null : appeal.id)}
                onRespond={() => openRespond(appeal)}
              />
            ))}
          </div>
        )}
      </div>

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
  const colors = {
    blue: '#3b82f6',
    orange: '#f59e0b',
    green: '#22c55e',
    red: '#ef4444',
  };
  const color = colors[type] || colors.blue;

  return (
    <div className={styles.statCard}>
      <div className={styles.statIcon} style={{ background: `${color}15` }}>
        <span style={{ color, fontSize: '20px', fontWeight: 700 }}>{value}</span>
      </div>
      <div className={styles.statContent}>
        <span className={styles.statLabel}>{label}</span>
      </div>
    </div>
  );
}

function AppealCard({ appeal, expanded, onToggle, onRespond }) {
  return (
    <div className={`${styles.appealCard} ${expanded ? styles.expanded : ''}`}>
      <div className={styles.appealCardHeader} onClick={onToggle}>
        <div className={styles.appealMain}>
          <div className={styles.appealStudent}>
            <span className={styles.studentName}>{appeal.first_name} {appeal.last_name}</span>
            <span className={styles.studentMeta}>{appeal.student_number} · {appeal.grade_level || ''} · {appeal.track_strand || ''}</span>
          </div>
          <div className={styles.appealCategory}>
            <AlertCircle size={14} />
            <span>{appeal.category_name || 'Overall Grade'}</span>
          </div>
        </div>
        <div className={styles.appealRight}>
          <span
            className={`${styles.statusBadge} ${styles[appeal.status]}`}
            style={{ background: STATUS_COLORS[appeal.status] }}
          >
            {STATUS_LABELS[appeal.status]}
          </span>
          <ChevronDown
            size={16}
            className={`${styles.chevron} ${expanded ? styles.chevronOpen : ''}`}
          />
        </div>
      </div>

      {expanded && (
        <div className={styles.appealDetails}>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Submitted:</span>
            <span>{new Date(appeal.created_at).toLocaleString()}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Batch:</span>
            <span>{appeal.batch_label || 'N/A'}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Original Grade:</span>
            <span>{appeal.overall_percentage ? `${appeal.overall_percentage}%` : appeal.overall_score || 'N/A'}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Student Email:</span>
            <span>{appeal.student_email}</span>
          </div>
          <div className={styles.appealReason}>
            <strong>Student's Reason:</strong>
            <p>{appeal.reason}</p>
          </div>
          {appeal.evaluation_comments && (
            <div className={styles.evaluationComments}>
              <strong>Evaluator Comments:</strong>
              <p>{appeal.evaluation_comments}</p>
            </div>
          )}
          {appeal.supervisor_response && (
            <div className={styles.supervisorResponse}>
              <div className={styles.responseHeader}>
                <MessageSquare size={14} />
                <strong>Your Previous Response ({STATUS_LABELS[appeal.status]}):</strong>
              </div>
              <p>{appeal.supervisor_response}</p>
              <span className={styles.responseDate}>Responded: {new Date(appeal.reviewed_at).toLocaleString()}</span>
            </div>
          )}
          {appeal.status === 'pending' && (
            <button
              type="button"
              className={styles.respondButton}
              onClick={onRespond}
            >
              <MessageSquare size={14} /> Respond
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default SupervisorGradeAppeals;