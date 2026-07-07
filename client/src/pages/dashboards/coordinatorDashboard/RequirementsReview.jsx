import { useEffect, useState } from 'react';
import {
  listSubmissions,
  reviewSubmission,
  verifyDocument,
  getRequirements,
} from '../../../api/coordinatorApi';
import styles from './CoordinatorDashboard.module.css';

const SERVER_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/api$/, '');

const REVIEW_STATUSES = ['Under Review', 'Approved', 'Rejected', 'Needs Revision'];

const SECTION_LABELS = {
  guardian: 'Guardian & Consent',
  medical: 'Medical',
  academic: 'Academic',
};

const statusBadge = (status) => {
  const map = {
    pending: styles.badgePending,
    'under review': styles.badgeReview,
    approved: styles.badgeApproved,
    rejected: styles.badgeRejected,
    'needs revision': styles.badgeNeeds,
  };
  return map[String(status || '').toLowerCase()] || styles.badgePending;
};

const docBadge = (status) => {
  const map = {
    uploaded: styles.badgePending,
    verified: styles.badgeVerified,
    rejected: styles.badgeRejected,
  };
  return map[String(status || '').toLowerCase()] || styles.badgePending;
};

const fmtSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const extColor = (mime) => {
  if (!mime) return '#64748b';
  if (mime.includes('pdf')) return '#dc2626';
  if (mime.includes('image')) return '#2563eb';
  if (mime.includes('word') || mime.includes('document')) return '#2563eb';
  if (mime.includes('sheet') || mime.includes('excel')) return '#16a34a';
  return '#64748b';
};

function RequirementsReview() {
  const [submissions, setSubmissions] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [studentData, setStudentData] = useState(null);
  const [reviewStatus, setReviewStatus] = useState('');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [docLoading, setDocLoading] = useState(false);

  const loadSubmissions = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listSubmissions({ status: statusFilter, search });
      setSubmissions(data.submissions || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await listSubmissions({ status: statusFilter, search });
        if (mounted) setSubmissions(data.submissions || []);
      } catch (err) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchData();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const openSubmission = async (sub) => {
    setSelected(sub);
    setReviewStatus(sub.status);
    setRemarks('');
    setStudentData(null);
    setError('');
    setMessage('');
    setDocLoading(true);
    try {
      const data = await getRequirements(sub.student_id);
      setStudentData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setDocLoading(false);
    }
  };

  const handleReview = async () => {
    if (!selected) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await reviewSubmission(selected.id, { status: reviewStatus, remarks });
      setMessage('Submission review saved.');
      setSelected(null);
      setStudentData(null);
      loadSubmissions();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyDoc = async (docId, status) => {
    try {
      await verifyDocument(docId, { status });
      setMessage(`Document ${status.toLowerCase()}.`);
      const data = await getRequirements(selected.student_id);
      setStudentData(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const documents = studentData?.documents || [];
  const submission = studentData?.submission || {};

  const grouped = documents.reduce((acc, doc) => {
    const section = doc.section || 'other';
    if (!acc[section]) acc[section] = [];
    acc[section].push(doc);
    return acc;
  }, {});

  const sectionOrder = ['guardian', 'medical', 'academic', 'other'];

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2>Requirements</h2>
        <p>Review student requirement submissions, personal details, and verify uploaded documents.</p>
      </div>

      {message && <div className={styles.message}>{message}</div>}
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.section}>
        <div className={styles.controls}>
          <input
            className={styles.searchInput}
            placeholder="Search name, email, student ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadSubmissions()}
          />
          <select
            className={styles.filterSelect}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="Pending Review">Pending Review</option>
            <option value="Under Review">Under Review</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
            <option value="Needs Revision">Needs Revision</option>
          </select>
          <button className={styles.btnSecondary} onClick={loadSubmissions}>
            Search
          </button>
        </div>

        {loading ? (
          <p className={styles.loading}>Loading submissions...</p>
        ) : submissions.length === 0 ? (
          <p className={styles.empty}>No submissions found.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Student ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Strand</th>
                  <th>Docs</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((s) => (
                  <tr key={s.id}>
                    <td>{s.student_number || '-'}</td>
                    <td>{s.first_name || ''} {s.last_name || ''}</td>
                    <td>{s.email}</td>
                    <td>{s.track_strand || '-'}</td>
                    <td>{s.uploaded_documents ?? '-'}</td>
                    <td>
                      <span className={`${styles.badge} ${statusBadge(s.status)}`}>{s.status}</span>
                    </td>
                    <td>
                      <button className={styles.btnGhost} onClick={() => openSubmission(s)}>
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <div className={styles.section}>
          {!studentData || docLoading ? (
            <p className={styles.loading}>Loading student details...</p>
          ) : (
            <>
              <h3 className={styles.sectionTitle}>
                Reviewing: {selected.first_name} {selected.last_name} ({selected.student_number})
              </h3>

              <div className={styles.row}>
                <div>
                  <label className={styles.muted}>Review Status</label>
                  <select
                    className={styles.select}
                    value={reviewStatus}
                    onChange={(e) => setReviewStatus(e.target.value)}
                    style={{ width: '100%', marginTop: 6 }}
                  >
                    {REVIEW_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 2 }}>
                  <label className={styles.muted}>Coordinator Feedback</label>
                  <textarea
                    className={styles.textarea}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Optional remarks..."
                    style={{ width: '100%', marginTop: 6 }}
                  />
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <label className={styles.muted}>Submission Status</label>
                <div style={{ marginTop: 6, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className={`${styles.badge} ${statusBadge(submission.status)}`}>
                    {submission.status || 'Pending'}
                  </span>
                  {submission.submitted_at && (
                    <span className={styles.muted}>
                      Submitted {new Date(submission.submitted_at).toLocaleString()}
                    </span>
                  )}
                </div>
                {submission.coordinator_feedback && (
                  <p className={styles.muted} style={{ marginTop: 6 }}>
                    Last feedback: {submission.coordinator_feedback}
                  </p>
                )}
              </div>

              <div className={styles.actions} style={{ marginTop: 16 }}>
                <button className={styles.btn} disabled={saving} onClick={handleReview}>
                  {saving ? 'Saving...' : 'Save Review'}
                </button>
                <button className={styles.btnSecondary} onClick={() => { setSelected(null); setStudentData(null); }}>
                  Close
                </button>
              </div>

              <h4 className={styles.sectionTitle} style={{ marginTop: 22 }}>
                Student Documents ({documents.length})
              </h4>
              {documents.length === 0 ? (
                <p className={styles.empty}>No documents uploaded by this student yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {sectionOrder.filter((sec) => grouped[sec]).map((section) => (
                    <div key={section}>
                      <div
                        className={styles.muted}
                        style={{
                          marginBottom: 8,
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          color: '#94a3b8',
                        }}
                      >
                        {SECTION_LABELS[section] || 'Other'}
                      </div>
                      <div className={styles.listItem}>
                        {grouped[section].map((d, idx) => {
                          const iconColor = extColor(d.mime_type);
                          const docLabel = d.document_name || d.original_name || 'Document';
                          return (
                            <div key={d.id}>
                              {idx > 0 && (
                                <div style={{ borderTop: '1px solid #f1f5f9', margin: 0 }} />
                              )}
                              <div style={{ padding: '10px 0', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                                <div style={{ flex: 1, minWidth: 200 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <span
                                      aria-hidden
                                      style={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: '50%',
                                        background: iconColor,
                                        display: 'inline-block',
                                      }}
                                    />
                                    <strong style={{ fontSize: '0.875rem', color: '#0f172a' }}>{docLabel}</strong>
                                  </div>
                                  <div className={styles.muted}>
                                    {d.original_name}
                                    {fmtSize(d.file_size) && (
                                      <span> &middot; {fmtSize(d.file_size)}</span>
                                    )}
                                    {d.mime_type && (
                                      <span> &middot; {d.mime_type.split('/')[1]?.toUpperCase()}</span>
                                    )}
                                    {d.uploaded_date && (
                                      <span> &middot; {new Date(d.uploaded_date).toLocaleDateString()}</span>
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <span className={`${styles.badge} ${docBadge(d.status)}`}>
                                    {d.status}
                                  </span>
                                </div>
                              </div>
                              <div className={styles.actions}>
                                <button
                                  className={styles.btnApprove}
                                  onClick={() => handleVerifyDoc(d.id, 'Verified')}
                                >
                                  Verify
                                </button>
                                <button
                                  className={styles.btnReject}
                                  onClick={() => handleVerifyDoc(d.id, 'Rejected')}
                                >
                                  Reject
                                </button>
                                {d.file_path && (
                                  <a
                                    className={styles.btnGhost}
                                    href={`${SERVER_BASE}/${d.file_path}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    download
                                  >
                                    Download
                                  </a>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default RequirementsReview;