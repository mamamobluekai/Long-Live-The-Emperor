import { useEffect, useState } from 'react';
import {
  listSubmissions,
  reviewSubmission,
  verifyDocument,
  getRequirements,
} from '../../../api/coordinatorApi';
import {
  Search,
  Eye,
  CheckCircle2,
  XCircle,
  Download,
  FileText,
  Clock3,
  Users,
  ClipboardCheck,
  ChevronRight,
  X,
} from 'lucide-react';
import styles from './RequirementsReview.module.css';

const REVIEW_STATUSES = [
  'Under Review',
  'Approved',
  'Rejected',
  'Needs Revision',
];

const SECTION_LABELS = {
  guardian: 'Guardian & Consent',
  medical: 'Medical',
  academic: 'Academic',
};

const statusBadge = (status) => {
  const map = {
    pending: styles.badgePending,
    'pending review': styles.badgePending,
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

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getInitials = (firstName, lastName) => {
  return `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`
    .toUpperCase()
    .slice(0, 2) || 'ST';
};

const getFileType = (mime) => {
  if (!mime) return 'FILE';
  if (mime.includes('pdf')) return 'PDF';
  if (mime.includes('image')) return 'IMG';
  if (mime.includes('word') || mime.includes('document')) return 'DOC';
  if (mime.includes('sheet') || mime.includes('excel')) return 'XLS';
  return 'FILE';
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
      const data = await listSubmissions({
        status: statusFilter,
        search,
      });

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
        const data = await listSubmissions({
          status: statusFilter,
          search: '',
        });

        if (mounted) {
          setSubmissions(data.submissions || []);
        }
      } catch (err) {
        if (mounted) {
          setError(err.message);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      mounted = false;
    };
  }, [statusFilter]);

  const openSubmission = async (student) => {
    setSelected(student);
    setReviewStatus(student.status);
    setRemarks('');
    setStudentData(null);
    setError('');
    setMessage('');
    setDocLoading(true);

    try {
      const data = await getRequirements(student.student_id);
      setStudentData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setDocLoading(false);
    }
  };

  const closeReview = () => {
    setSelected(null);
    setStudentData(null);
    setRemarks('');
  };

  const handleReview = async () => {
    if (!selected) return;

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await reviewSubmission(selected.id, {
        status: reviewStatus,
        remarks,
      });

      setMessage('Submission review saved successfully.');
      closeReview();
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

      setMessage(
        status === 'Verified'
          ? 'Document verified successfully.'
          : 'Document rejected.'
      );

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

    if (!acc[section]) {
      acc[section] = [];
    }

    acc[section].push(doc);

    return acc;
  }, {});

  const sectionOrder = [
    'guardian',
    'medical',
    'academic',
    'other',
  ];

  const pendingCount = submissions.filter(
    (s) =>
      String(s.status).toLowerCase() === 'pending review'
  ).length;

  const approvedCount = submissions.filter(
    (s) =>
      String(s.status).toLowerCase() === 'approved'
  ).length;

  const revisionCount = submissions.filter(
    (s) =>
      String(s.status).toLowerCase() === 'needs revision'
  ).length;

  return (
    <div className={styles.page}>

      {/* HEADER */}
      <div className={styles.pageHeader}>
        <div>
          

          <h1>Requirements Review</h1>

          <p>
            Review student submissions and verify their
            required documents.
          </p>
        </div>

        <div className={styles.headerIcon}>
          <ClipboardCheck size={24} />
        </div>
      </div>

      {/* ALERTS */}
      {message && (
        <div className={styles.successAlert}>
          <CheckCircle2 size={18} />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className={styles.errorAlert}>
          <XCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* STAT CARDS */}
      <div className={styles.statsGrid}>

        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statBlue}`}>
            <Users size={20} />
          </div>

          <div>
            <span className={styles.statLabel}>
              Total Submissions
            </span>

            <strong>{submissions.length}</strong>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statOrange}`}>
            <Clock3 size={20} />
          </div>

          <div>
            <span className={styles.statLabel}>
              Pending Review
            </span>

            <strong>{pendingCount}</strong>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statGreen}`}>
            <CheckCircle2 size={20} />
          </div>

          <div>
            <span className={styles.statLabel}>
              Approved
            </span>

            <strong>{approvedCount}</strong>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statRed}`}>
            <ClipboardCheck size={20} />
          </div>

          <div>
            <span className={styles.statLabel}>
              Needs Revision
            </span>

            <strong>{revisionCount}</strong>
          </div>
        </div>

      </div>

      {/* SUBMISSIONS */}
      <div className={styles.card}>

        <div className={styles.cardHeader}>
          <div>
            <h2>Student Submissions</h2>
            <p>
              Select a student to inspect and verify their
              requirements.
            </p>
          </div>
        </div>

        {/* TOOLBAR */}
        <div className={styles.toolbar}>

          <div className={styles.searchBox}>
            <Search size={18} />

            <input
              placeholder="Search student, email, ID..."
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  loadSubmissions();
                }
              }}
            />
          </div>

          <select
            className={styles.filter}
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value)
            }
          >
            <option value="all">
              All Statuses
            </option>

            <option value="Pending Review">
              Pending Review
            </option>

            <option value="Under Review">
              Under Review
            </option>

            <option value="Approved">
              Approved
            </option>

            <option value="Rejected">
              Rejected
            </option>

            <option value="Needs Revision">
              Needs Revision
            </option>
          </select>

          <button
            className={styles.searchButton}
            onClick={loadSubmissions}
          >
            Search
          </button>

        </div>

        {/* TABLE */}
        {loading ? (
          <div className={styles.loading}>
            <div className={styles.spinner} />
            <span>Loading submissions...</span>
          </div>
        ) : submissions.length === 0 ? (
          <div className={styles.empty}>
            <ClipboardCheck size={40} />
            <h3>No submissions found</h3>
            <p>
              There are no student submissions matching
              your current filters.
            </p>
          </div>
        ) : (
          <div className={styles.tableWrap}>

            <table className={styles.table}>

              <thead>
                <tr>
                  <th>Student</th>
                  <th>Email</th>
                  <th>Strand</th>
                  <th>Documents</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>

              <tbody>

                {submissions.map((student) => (

                  <tr key={student.id}>

                    <td>
                      <div className={styles.studentCell}>

                        <div className={styles.studentAvatar}>
                          {getInitials(
                            student.first_name,
                            student.last_name
                          )}
                        </div>

                        <div>
                          <strong>
                            {student.first_name}{' '}
                            {student.last_name}
                          </strong>

                          <span>
                            {student.student_number || '-'}
                          </span>
                        </div>

                      </div>
                    </td>

                    <td>
                      <span className={styles.email}>
                        {student.email}
                      </span>
                    </td>

                    <td>
                      {student.track_strand || '-'}
                    </td>

                    <td>
                      <div className={styles.documentCount}>
                        <FileText size={16} />
                        {student.uploaded_documents ?? 0}
                      </div>
                    </td>

                    <td>
                      <span
                        className={`${styles.badge} ${
                          statusBadge(student.status)
                        }`}
                      >
                        {student.status}
                      </span>
                    </td>

                    <td>
                      <button
                        className={styles.reviewButton}
                        onClick={() =>
                          openSubmission(student)
                        }
                      >
                        <Eye size={16} />
                        Review
                        <ChevronRight size={15} />
                      </button>
                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>
        )}

      </div>

      {/* REVIEW PANEL */}
      {selected && (

        <div className={styles.overlay}>

          <div className={styles.reviewPanel}>

            {/* PANEL HEADER */}
            <div className={styles.panelHeader}>

              <div className={styles.panelStudent}>

                <div className={styles.largeAvatar}>
                  {getInitials(
                    selected.first_name,
                    selected.last_name
                  )}
                </div>

                <div>
                  <h2>
                    {selected.first_name}{' '}
                    {selected.last_name}
                  </h2>

                  <p>
                    {selected.student_number}
                    {' · '}
                    {selected.email}
                  </p>
                </div>

              </div>

              <button
                className={styles.closeButton}
                onClick={closeReview}
              >
                <X size={20} />
              </button>

            </div>

            {docLoading ? (

              <div className={styles.loadingPanel}>
                <div className={styles.spinner} />
                <span>
                  Loading student details...
                </span>
              </div>

            ) : (

              <div className={styles.panelBody}>

                {/* REVIEW SECTION */}
                <div className={styles.reviewSection}>

                  <div className={styles.sectionHeading}>
                    <div>
                      <h3>Review Decision</h3>
                      <p>
                        Update the student's submission
                        status and provide feedback.
                      </p>
                    </div>
                  </div>

                  <div className={styles.reviewGrid}>

                    <div className={styles.formGroup}>
                      <label>
                        Review Status
                      </label>

                      <select
                        value={reviewStatus}
                        onChange={(e) =>
                          setReviewStatus(
                            e.target.value
                          )
                        }
                        className={styles.formInput}
                      >
                        {REVIEW_STATUSES.map(
                          (status) => (
                            <option
                              key={status}
                              value={status}
                            >
                              {status}
                            </option>
                          )
                        )}
                      </select>
                    </div>

                    <div className={styles.formGroup}>
                      <label>
                        Coordinator Feedback
                      </label>

                      <textarea
                        value={remarks}
                        onChange={(e) =>
                          setRemarks(e.target.value)
                        }
                        placeholder="Write feedback for the student..."
                        className={styles.formInput}
                        rows={3}
                      />
                    </div>

                  </div>

                  <div className={styles.currentStatus}>
                    <span>Current Status</span>

                    <div>
                      <span
                        className={`${styles.badge} ${
                          statusBadge(
                            submission.status
                          )
                        }`}
                      >
                        {submission.status ||
                          'Pending'}
                      </span>

                      {submission.submitted_at && (
                        <span>
                          Submitted{' '}
                          {new Date(
                            submission.submitted_at
                          ).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {submission.coordinator_feedback && (
                    <div className={styles.previousFeedback}>
                      <strong>
                        Previous feedback
                      </strong>

                      <p>
                        {submission.coordinator_feedback}
                      </p>
                    </div>
                  )}

                  <div className={styles.panelActions}>

                    <button
                      className={styles.primaryButton}
                      disabled={saving}
                      onClick={handleReview}
                    >
                      <CheckCircle2 size={17} />

                      {saving
                        ? 'Saving...'
                        : 'Save Review'}
                    </button>

                    <button
                      className={styles.secondaryButton}
                      onClick={closeReview}
                    >
                      Cancel
                    </button>

                  </div>

                </div>

                {/* DOCUMENTS */}
                <div className={styles.documentsSection}>

                  <div className={styles.sectionHeading}>
                    <div>
                      <h3>
                        Student Documents
                      </h3>

                      <p>
                        {documents.length}{' '}
                        document
                        {documents.length !== 1
                          ? 's'
                          : ''}{' '}
                        uploaded
                      </p>
                    </div>

                    <span className={styles.documentTotal}>
                      {documents.length}
                    </span>
                  </div>

                  {documents.length === 0 ? (

                    <div className={styles.emptyDocuments}>
                      <FileText size={34} />

                      <span>
                        No documents uploaded
                      </span>
                    </div>

                  ) : (

                    <div className={styles.documentGroups}>

                      {sectionOrder
                        .filter(
                          (section) =>
                            grouped[section]
                        )
                        .map((section) => (

                          <div
                            className={
                              styles.documentGroup
                            }
                            key={section}
                          >

                            <div
                              className={
                                styles.groupTitle
                              }
                            >
                              {SECTION_LABELS[
                                section
                              ] || 'Other'}

                              <span>
                                {
                                  grouped[
                                    section
                                  ].length
                                }
                              </span>
                            </div>

                            <div
                              className={
                                styles.documentList
                              }
                            >

                              {grouped[
                                section
                              ].map((doc) => (

                                <div
                                  className={
                                    styles.documentRow
                                  }
                                  key={doc.id}
                                >

                                  <div
                                    className={
                                      styles.fileIcon
                                    }
                                  >
                                    <FileText
                                      size={20}
                                    />
                                  </div>

                                  <div
                                    className={
                                      styles.documentInfo
                                    }
                                  >
                                    <strong>
                                      {doc.document_name ||
                                        doc.original_name ||
                                        'Document'}
                                    </strong>

                                    <span>
                                      {doc.original_name}

                                      {fmtSize(
                                        doc.file_size
                                      ) &&
                                        ` · ${fmtSize(
                                          doc.file_size
                                        )}`}

                                      {doc.mime_type &&
                                        ` · ${getFileType(
                                          doc.mime_type
                                        )}`}

                                      {doc.uploaded_date &&
                                        ` · ${new Date(
                                          doc.uploaded_date
                                        ).toLocaleDateString()}`}
                                    </span>
                                  </div>

                                  <span
                                    className={`${styles.badge} ${
                                      docBadge(
                                        doc.status
                                      )
                                    }`}
                                  >
                                    {doc.status}
                                  </span>

                                  <div
                                    className={
                                      styles.documentActions
                                    }
                                  >

                                    <button
                                      className={
                                        styles.verifyButton
                                      }
                                      onClick={() =>
                                        handleVerifyDoc(
                                          doc.id,
                                          'Verified'
                                        )
                                      }
                                    >
                                      <CheckCircle2
                                        size={15}
                                      />
                                      Verify
                                    </button>

                                    <button
                                      className={
                                        styles.rejectButton
                                      }
                                      onClick={() =>
                                        handleVerifyDoc(
                                          doc.id,
                                          'Rejected'
                                        )
                                      }
                                    >
                                      <XCircle
                                        size={15}
                                      />
                                      Reject
                                    </button>

                                    {doc.cloudinary_url && (
                                      <a
                                        className={
                                          styles.downloadButton
                                        }
                                        href={
                                          doc.cloudinary_url
                                        }
                                        target="_blank"
                                        rel="noreferrer"
                                        download
                                      >
                                        <Download
                                          size={15}
                                        />
                                        Download
                                      </a>
                                    )}

                                  </div>

                                </div>

                              ))}

                            </div>

                          </div>

                        ))}

                    </div>

                  )}

                </div>

              </div>

            )}

          </div>

        </div>

      )}

    </div>
  );
}

export default RequirementsReview;