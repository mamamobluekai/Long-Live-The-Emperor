import { useEffect, useState } from 'react';
import {
  listSubmissions,
  reviewSubmission,
  verifyDocument,
  getRequirements,
  getDocumentTypes,
  createDocumentType,
  updateDocumentType,
  deleteDocumentType,
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
  Plus,
  Pencil,
  Trash2,
  Settings2,
  AlertCircle,
  CheckCircle,
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

const FALLBACK_DOC_TYPES = [
  {
    code: 'guardian_consent',
    label: 'Guardian Consent',
    section: 'guardian',
  },
  {
    code: 'medical_certificate',
    label: 'Medical Certificate',
    section: 'medical',
  },
  {
    code: 'accident_insurance',
    label: 'Accident Insurance',
    section: 'medical',
  },
  {
    code: 'vaccination_record',
    label: 'Vaccination Record',
    section: 'medical',
  },
  {
    code: 'emergency_contact_form',
    label: 'Emergency Contact',
    section: 'medical',
  },
  {
    code: 'form_138',
    label: 'Form 138',
    section: 'academic',
  },
  {
    code: 'good_moral',
    label: 'Good Moral',
    section: 'academic',
  },
  {
    code: 'psa_birth_certificate',
    label: 'PSA Birth Certificate',
    section: 'academic',
  },
  {
    code: 'id_picture',
    label: 'ID Picture',
    section: 'academic',
  },
  {
    code: 'student_profile_form',
    label: 'Student Profile',
    section: 'academic',
  },
];

function RequirementsReview() {
  const [submissions, setSubmissions] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);

  // Toast notifications
  const [toasts, setToasts] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const showToast = (type, message) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const showSuccess = (message) => showToast('success', message);
  const showError = (message) => showToast('error', message);

  const [selected, setSelected] = useState(null);
  const [studentData, setStudentData] = useState(null);

  const [reviewStatus, setReviewStatus] = useState('');
  const [remarks, setRemarks] = useState('');

  const [saving, setSaving] = useState(false);
  const [docLoading, setDocLoading] = useState(false);

  // Editable requirements configuration
  const [docTypes, setDocTypes] = useState(FALLBACK_DOC_TYPES);
  const [editingDocType, setEditingDocType] = useState(null);
  const [docTypeForm, setDocTypeForm] = useState({ name: '', section: 'academic', description: '' });
  const [isAddingDocType, setIsAddingDocType] = useState(false);
  const [typeSaving, setTypeSaving] = useState(false);
  const [typeDeleting, setTypeDeleting] = useState(null);
  const [showReqModal, setShowReqModal] = useState(false);

  const loadSubmissions = async () => {
    try {
      const data = await listSubmissions({
        status: statusFilter,
        search,
      });

      setSubmissions(data.submissions || []);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Debounce the search term so typing filters immediately without
  // firing a request on every single keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [subData, typesData] = await Promise.all([
          listSubmissions({
            status: statusFilter,
            search: debouncedSearch,
          }),
          getDocumentTypes({ all: true }).catch(() => null),
        ]);

        if (mounted) {
          setSubmissions(subData.submissions || []);
          if (typesData?.documentTypes && typesData.documentTypes.length > 0) {
            setDocTypes(typesData.documentTypes.map((dt) => ({
              id: dt.id,
              code: dt.code,
              label: dt.name,
              section: dt.section || 'academic',
              description: dt.description || '',
              isActive: dt.is_active !== false,
            })));
          }
        }
      } catch (err) {
        if (mounted) {
          showError(err.message);
        }
      } finally {
        if (mounted) {
          setLoading(false);
          setInitialLoad(false);
        }
      }
    };

    fetchData();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, debouncedSearch]);

  const openSubmission = async (sub) => {
    setSelected(sub);
    setReviewStatus(sub.status);
    setRemarks('');
    setStudentData(null);
    setDocLoading(true);

    try {
      const data = await getRequirements(sub.student_id);
      setStudentData(data);
    } catch (err) {
      showError(err.message);
    } finally {
      setDocLoading(false);
    }
  };

  const closeReview = () => {
    setSelected(null);
    setStudentData(null);
    setReviewStatus('');
    setRemarks('');
  };

  const handleReview = async () => {
    if (!selected) return;

    setSaving(true);
    try {
      await reviewSubmission(selected.id, {
        status: reviewStatus,
        remarks,
      });

      showSuccess('Submission review saved.');
      setSelected(null);
      setStudentData(null);
      loadSubmissions();
    } catch (err) {
      showError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const refreshDocTypes = async () => {
    try {
      const typesData = await getDocumentTypes({ all: true });
      if (typesData?.documentTypes) {
        setDocTypes(typesData.documentTypes.map((dt) => ({
          id: dt.id,
          code: dt.code,
          label: dt.name,
          section: dt.section || 'academic',
          description: dt.description || '',
          isActive: dt.is_active !== false,
        })));
      }
    } catch (err) {
      console.error('Failed to refresh doc types:', err);
    }
  };

  const handleStartAddDocType = () => {
    setEditingDocType(null);
    setDocTypeForm({ name: '', section: 'academic', description: '' });
    setIsAddingDocType(true);
    setShowReqModal(true);
  };

  const openReqModal = () => setShowReqModal(true);

  const handleStartEditDocType = (dt) => {
    setIsAddingDocType(false);
    setEditingDocType(dt);
    setDocTypeForm({
      name: dt.label,
      section: dt.section || 'academic',
      description: dt.description || '',
    });
  };

  const handleCancelDocTypeForm = () => {
    setIsAddingDocType(false);
    setEditingDocType(null);
    setDocTypeForm({ name: '', section: 'academic', description: '' });
    if (!isAddingDocType && !editingDocType) setShowReqModal(false);
  };

  const closeReqModal = () => {
    setIsAddingDocType(false);
    setEditingDocType(null);
    setDocTypeForm({ name: '', section: 'academic', description: '' });
    setShowReqModal(false);
  };

  const handleSaveDocType = async (e) => {
    if (e) e.preventDefault();
    if (!docTypeForm.name.trim()) {
      showError('Requirement name is required.');
      return;
    }
    setTypeSaving(true);
    try {
      if (editingDocType) {
        await updateDocumentType(editingDocType.id, {
          name: docTypeForm.name.trim(),
          section: docTypeForm.section,
          description: docTypeForm.description.trim(),
        });
        showSuccess('Requirement updated. Student progress has been refreshed.');
      } else {
        await createDocumentType({
          name: docTypeForm.name.trim(),
          section: docTypeForm.section,
          description: docTypeForm.description.trim(),
        });
        showSuccess('New requirement added. Student progress has been refreshed.');
      }
      handleCancelDocTypeForm();
      await refreshDocTypes();
      await loadSubmissions();
    } catch (err) {
      showError(err.message || 'Failed to save requirement.');
    } finally {
      setTypeSaving(false);
    }
  };

  const handleDeleteDocType = async (dt) => {
    setDeleteConfirm(dt);
  };

  const confirmDeleteDocType = async () => {
    if (!deleteConfirm) return;
    const dt = deleteConfirm;
    setDeleteConfirm(null);
    setTypeDeleting(dt.id);
    try {
      await deleteDocumentType(dt.id);
      showSuccess(`"${dt.label}" deleted. Student progress refreshed.`);
      await refreshDocTypes();
      await loadSubmissions();
    } catch (err) {
      showError(err.message || 'Failed to delete requirement.');
    } finally {
      setTypeDeleting(null);
    }
  };

  const handleVerifyDoc = async (docId, status) => {
    try {
      await verifyDocument(docId, { status });

      showSuccess(`Document ${status.toLowerCase()}.`);
      const data = await getRequirements(selected.student_id);
      setStudentData(data);
    } catch (err) {
      showError(err.message);
    }
  };

  const documents = studentData?.documents || [];
  const submission = studentData?.submission || {};

  // Map every required document type to whether the student uploaded it.
  // The API returns the document type code as `code` (from document_types).
  const uploadedCodes = new Set(
    documents.map((doc) =>
      String(doc.code || doc.document_code || doc.document_type || '').toLowerCase(),
    ),
  );

  const activeDocTypes = docTypes.filter((d) => d.isActive !== false);
  const checklist = activeDocTypes.map((type) => ({
    ...type,
    uploaded: uploadedCodes.has(type.code.toLowerCase()),
  }));

  const uploadedCount = checklist.filter((item) => item.uploaded).length;
  const missingCount = checklist.length - uploadedCount;

  const grouped = documents.reduce((acc, doc) => {
    const section = doc.section || 'other';
    if (!acc[section]) acc[section] = [];
    acc[section].push(doc);
    return acc;
  }, {});

  const sectionOrder = ['guardian', 'medical', 'academic', 'other'];

  const pendingCount = submissions.filter((s) =>
    ['pending', 'pending review'].includes(
      String(s.status || '').toLowerCase(),
    ),
  ).length;

  const reviewCount = submissions.filter(
    (s) =>
      String(s.status || '').toLowerCase() === 'under review',
  ).length;

  const approvedCount = submissions.filter(
    (s) => String(s.status || '').toLowerCase() === 'approved',
  ).length;

  const revisionCount = submissions.filter(
    (s) =>
      String(s.status || '').toLowerCase() === 'needs revision',
  ).length;

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1>Requirements Review</h1>
          <p>
            Review student requirement submissions, verify uploaded
            documents, and update submission status.
          </p>
        </div>
        <button
          type="button"
          className={styles.editReqBtn}
          onClick={openReqModal}
        >
          <Settings2 size={17} />
          Edit Requirements
        </button>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div
            className={`${styles.statIcon} ${styles.statBlue}`}
          >
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
          <div
            className={`${styles.statIcon} ${styles.statBlue}`}
          >
            <Users size={20} />
          </div>

          <div>
            <span className={styles.statLabel}>
              Under Review
            </span>

            <strong>{reviewCount}</strong>
          </div>
        </div>

        <div className={styles.statCard}>
          <div
            className={`${styles.statIcon} ${styles.statGreen}`}
          >
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
          <div
            className={`${styles.statIcon} ${styles.statRed}`}
          >
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

        {/* TOOLBAR */}
        <div className={styles.toolbar}>

          <div className={styles.searchBox}>
            <Search size={18} />

            <input
              placeholder="Search student, email, ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            {search && (
              <button
                type="button"
                className={styles.searchClear}
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                <X size={15} />
              </button>
            )}
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

        </div>

        {/* TABLE */}
        {loading && initialLoad ? (
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
                       <div
                         className={styles.docBarTrack}
                         style={{
                           height: '10px',
                           marginTop: '3px',
                         }}
                       >
                         <div
                           className={styles.docBarFill}
                           style={{
                             width: `${((student.uploaded_documents ?? 0) / (activeDocTypes.length || 1)) * 100}%`,
                           }}
                         />
                       </div>

                       <span className={styles.docBarCount}>
                         {student.uploaded_documents ?? 0}/
                         {activeDocTypes.length}
                       </span>
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

      {/* MANAGE REQUIREMENTS MODAL */}
      {showReqModal && (
        <div className={styles.overlay} onClick={closeReqModal}>
          <div
            className={styles.reviewPanel}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.panelHeader}>
              <div className={styles.panelStudent}>
                <div className={styles.largeAvatar}>
                  <Settings2 size={20} />
                </div>

                <div>
                  <h2>Edit Requirements</h2>

                  <p>
                    Add, edit, or delete document requirements for all
                    students. Changes recalculate student progress
                    automatically.
                  </p>
                </div>
              </div>

              <button
                className={styles.closeButton}
                onClick={closeReqModal}
              >
                <X size={20} />
              </button>
            </div>

            <div className={styles.panelBody}>
              <div className={styles.configSection}>
                {!isAddingDocType && !editingDocType && (
                  <div className={styles.configHeader}>
                    <button
                      type="button"
                      className={styles.addReqBtn}
                      onClick={handleStartAddDocType}
                    >
                      <Plus size={16} />
                      Add Requirement
                    </button>
                  </div>
                )}

                {(isAddingDocType || editingDocType) && (
                  <form className={styles.configForm} onSubmit={handleSaveDocType}>
                    <div className={styles.formTitle}>
                      {editingDocType
                        ? `Edit Requirement: ${editingDocType.label}`
                        : 'New Document Requirement'}
                    </div>

                    <div className={styles.formGrid}>
                      <div className={styles.formField}>
                        <label>Requirement Name *</label>
                        <input
                          type="text"
                          placeholder="e.g., Barangay Clearance"
                          value={docTypeForm.name}
                          onChange={(e) =>
                            setDocTypeForm({ ...docTypeForm, name: e.target.value })
                          }
                          required
                        />
                      </div>

                      <div className={styles.formField}>
                        <label>Section *</label>
                        <select
                          value={docTypeForm.section}
                          onChange={(e) =>
                            setDocTypeForm({ ...docTypeForm, section: e.target.value })
                          }
                        >
                          <option value="academic">Academic</option>
                          <option value="medical">Medical</option>
                          <option value="guardian">Guardian & Consent</option>
                          <option value="other">Other</option>
                        </select>
                      </div>

                      <div className={`${styles.formField} ${styles.formFieldFull}`}>
                        <label>Description / Instructions (optional)</label>
                        <input
                          type="text"
                          placeholder="e.g., Valid within 6 months, clear photo or scanned PDF"
                          value={docTypeForm.description}
                          onChange={(e) =>
                            setDocTypeForm({ ...docTypeForm, description: e.target.value })
                          }
                        />
                      </div>
                    </div>

                    <div className={styles.formActions}>
                      <button
                        type="submit"
                        className={styles.saveReqBtn}
                        disabled={typeSaving}
                      >
                        {typeSaving
                          ? 'Saving...'
                          : editingDocType
                            ? 'Update Requirement'
                            : 'Add Requirement'}
                      </button>

                      <button
                        type="button"
                        className={styles.cancelReqBtn}
                        onClick={handleCancelDocTypeForm}
                        disabled={typeSaving}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                <div className={styles.configList}>
                  {docTypes.map((dt) => (
                    <div
                      key={dt.id || dt.code}
                      className={`${styles.configItem} ${
                        dt.isActive === false ? styles.configItemInactive : ''
                      }`}
                    >
                      <div className={styles.configItemInfo}>
                        <span className={styles.configItemName}>{dt.label}</span>

                        <span className={styles.configItemMeta}>
                          <span className={styles.configSectionTag}>
                            {SECTION_LABELS[dt.section] || dt.section || 'Academic'}
                          </span>

                          {dt.description && (
                            <span className={styles.configItemDesc}>
                              &bull; {dt.description}
                            </span>
                          )}

                          {dt.code && (
                            <span className={styles.configItemCode}>code: {dt.code}</span>
                          )}
                        </span>
                      </div>

                      <div className={styles.configItemActions}>
                        <button
                          type="button"
                          className={styles.iconBtnEdit}
                          title="Edit requirement"
                          aria-label={`Edit ${dt.label}`}
                          onClick={() => handleStartEditDocType(dt)}
                        >
                          <Pencil size={15} />
                        </button>

                        <button
                          type="button"
                          className={styles.iconBtnDelete}
                          title="Delete requirement"
                          aria-label={`Delete ${dt.label}`}
                          disabled={typeDeleting === dt.id}
                          onClick={() => handleDeleteDocType(dt)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
                    {' Ã‚Â· '}
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

                {/* REQUIREMENTS CHECKLIST */}
                <div className={styles.checklistSection}>

                  <div className={styles.sectionHeading}>
                    <div>
                      <h3>Requirements Checklist</h3>

                      <p>
                        Tick marks show which required documents were
                        submitted.
                      </p>
                    </div>

                    <span
                      className={`${styles.documentTotal} ${
                        missingCount === 0
                          ? styles.totalComplete
                          : styles.totalIncomplete
                      }`}
                    >
                      {uploadedCount}/{checklist.length}
                    </span>
                  </div>

                  <ul className={styles.checklist}>
                    {checklist.map((item) => (
                      <li
                        key={item.code}
                        className={`${styles.checklistItem} ${
                          item.uploaded
                            ? styles.checklistDone
                            : styles.checklistMissing
                        }`}
                      >
                        <span className={styles.checklistBox}>
                          {item.uploaded ? (
                            <CheckCircle2 size={16} />
                          ) : (
                            <XCircle size={16} />
                          )}
                        </span>

                        <span className={styles.checklistLabel}>
                          {item.label}
                        </span>

                        <span className={styles.checklistState}>
                          {item.uploaded ? 'Submitted' : 'Missing'}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <p
                    className={`${styles.checklistSummary} ${
                      missingCount === 0
                        ? styles.summaryComplete
                        : styles.summaryIncomplete
                    }`}
                  >
                    {missingCount === 0
                      ? 'All required documents have been submitted.'
                      : `${missingCount} required document${
                          missingCount !== 1 ? 's are' : ' is'
                        } still missing.`}
                  </p>

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
                                        ` Ã‚Â· ${fmtSize(
                                          doc.file_size
                                        )}`}

                                      {doc.mime_type &&
                                        ` Ã‚Â· ${getFileType(
                                          doc.mime_type
                                        )}`}

                                      {doc.uploaded_date &&
                                        ` Ã‚Â· ${new Date(
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

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirm && (
        <div className={styles.overlay} onClick={() => setDeleteConfirm(null)}>
          <div className={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.confirmIcon}>
              <AlertCircle size={40} />
            </div>
            <h3>Delete Requirement</h3>
            <p>Are you sure you want to delete <strong>"{deleteConfirm.label}"</strong>?</p>
            <p className={styles.confirmNote}>
              This will deactivate the requirement for all students and recalculate progress.
            </p>
            <div className={styles.confirmActions}>
              <button
                className={styles.confirmCancel}
                onClick={() => setDeleteConfirm(null)}
              >
                Cancel
              </button>
              <button
                className={styles.confirmDelete}
                onClick={confirmDeleteDocType}
                disabled={typeDeleting === deleteConfirm.id}
              >
                {typeDeleting === deleteConfirm.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATIONS */}
      <div className={styles.toastContainer}>
        {toasts.map((toast) => (
          <div key={toast.id} className={`${styles.toast} ${styles[`toast${toast.type.charAt(0).toUpperCase() + toast.type.slice(1)}`]}`}>
            <div className={styles.toastIcon}>
              {toast.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
            </div>
            <span className={styles.toastMessage}>{toast.message}</span>
            <button className={styles.toastClose} onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

    </div>
  );
}

export default RequirementsReview;
