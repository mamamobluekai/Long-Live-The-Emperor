import { useEffect, useState } from 'react';
import {
  getCoordinatorProfile,
  getPendingStudents,
  getStudentStrands,
  getArchivedStudents,
  approveStudent,
  resendStudentApprovalEmail,
  deleteStudent,
  restoreStudent,
  permanentDeleteStudent,
  bulkApproveStudents,
  bulkArchiveStudents,
  bulkRestoreStudents,
  bulkPermanentDeleteStudents,
  uploadStudentsExcel,
} from '../../../api/coordinatorApi';
import {
  Check,
  CheckSquare,
  Mail,
  Search,
  Square,
  Trash2,
  UserCheck,
  X,
  Archive,
} from 'lucide-react';
import ConfirmModal from '../../../components/admin/ConfirmModal';
import styles from './StudentApprovals.module.css';

const statusBadge = (status) => {
  const map = {
    pending: styles.badgePending,
    approved: styles.badgeApproved,
    rejected: styles.badgeRejected,
    disapproved: styles.badgeRejected,
    'needs revision': styles.badgeNeeds,
  };

  return map[String(status).toLowerCase()] || styles.badgePending;
};

function StudentApprovals() {
const [students, setStudents] = useState([]);
const [archivedStudents, setArchivedStudents] = useState([]);
const [coordinator, setCoordinator] = useState(null);
const [strands, setStrands] = useState([]);
const [loading, setLoading] = useState(true);
const [loadingStrands, setLoadingStrands] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [strandFilter, setStrandFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);

  // Delete confirmation state
const [deleteConfirmId, setDeleteConfirmId] = useState(null);
const [deleting, setDeleting] = useState(false);
const [archivedModalOpen, setArchivedModalOpen] = useState(false);

  // Bulk selection & actions
  const [selectedIds, setSelectedIds] = useState([]);
  const [archivedSelectedIds, setArchivedSelectedIds] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Tracks which student's Resend button is in flight, so only that row spins.
  const [resendingId, setResendingId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');

    try {
      const [studentsData, profileData, archivedData] = await Promise.all([
        getPendingStudents(statusFilter, strandFilter),
        getCoordinatorProfile(),
        getArchivedStudents(),
      ]);
      setStudents(studentsData.students || []);
      setCoordinator(profileData.coordinator || null);
      setArchivedStudents(archivedData.students || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadStrands = async () => {
    setLoadingStrands(true);
    try {
      const data = await getStudentStrands();
      setStrands(data.strands || []);
    } catch (err) {
      console.error('Failed to load strands:', err);
    } finally {
      setLoadingStrands(false);
    }
  };

  useEffect(() => {
    loadStrands();
  }, []);

  useEffect(() => {
    setSelectedIds([]);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, strandFilter]);

  // Auto-dismiss the floating toast so it pops up and clears itself.
  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setMessage(''), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!error) return undefined;
    const timer = setTimeout(() => setError(''), 6000);
    return () => clearTimeout(timer);
  }, [error]);

  const filteredStudents = students.filter((student) => {
    if (!searchTerm) return true;
    const fullName = `${student.first_name || ''} ${student.last_name || ''}`.toLowerCase();
    const email = (student.email || '').toLowerCase();
    const studentNumber = (student.student_number || '').toLowerCase();
    const search = searchTerm.toLowerCase();
    return fullName.includes(search) || email.includes(search) || studentNumber.includes(search);
  });

  const handleUpload = async () => {
    if (!file) {
      setUploadResult({ kind: 'error', message: 'Please select an Excel file first.' });
      return;
    }

    setUploading(true);
    setUploadResult(null);
    setMessage('');
    setError('');

    try {
      const data = await uploadStudentsExcel(file);
      const r = data.results || {};

      setUploadResult({
        kind: r.failed ? 'warning' : 'success',
        message: data.message || 'Upload complete.',
      });
      setFile(null);

      await load();
    } catch (err) {
      setUploadResult({ kind: 'error', message: err.message });
    } finally {
      setUploading(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      const data = await approveStudent(id);

      // A student who self-registered already has a password, so their approval mail
      // is a notice with no link. One added by Excel upload has none, so they get
      // a set-password link - which is why `linkSent` drives the wording.
      const emailFailed = data?.emailSent === false;
      setMessage(
        emailFailed
          ? 'Student approved, but the email failed to send. Use Resend email on their row.'
          : data?.message
            || (data?.linkSent
              ? 'Student approved. An email with their password setup link was sent.'
              : 'Student approved. They can now sign in with the password they registered with.'),
      );
      if (emailFailed) {
        setError(data.emailError || 'Approval email failed to send.');
      }

      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  // Re-mails a fresh one-time set-password link to an approved student. This is
  // the recovery path when the original approval mail bounced or expired.
  const handleResendEmail = async (id) => {
    setResendingId(id);
    setError('');
    setMessage('');
    try {
      const data = await resendStudentApprovalEmail(id);
      if (data?.emailSent === false) {
        setError(data.emailError || 'The set-password email failed to send. Please try again.');
      } else {
        setMessage(data?.message || 'Set-your-password link emailed.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setResendingId(null);
    }
  };

  const handleArchiveConfirm = (id) => {
    setDeleteConfirmId(id);
  };

  const handleArchive = async (id) => {
    setDeleting(true);
    try {
      await deleteStudent(id);
      setMessage('Student removed to archive.');
      setDeleteConfirmId(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
      setDeleteConfirmId(null);
    }
  };

  const handleRestore = async (id) => {
    setDeleting(true);
    setError('');
    setMessage('');
    try {
      await restoreStudent(id);
      setMessage('Student restored from archive.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handlePermanentDelete = async (id) => {
    setDeleting(true);
    setError('');
    setMessage('');
    try {
      await permanentDeleteStudent(id);
      setMessage('Student permanently deleted.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleCancelArchive = () => {
    setDeleteConfirmId(null);
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredStudents.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredStudents.map((s) => s.id));
    }
  };

  const handleSelectOne = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((s) => s !== id)
        : [...prev, id],
    );
  };

  const handleSelectAllArchived = () => {
    if (archivedSelectedIds.length === archivedStudents.length) {
      setArchivedSelectedIds([]);
    } else {
      setArchivedSelectedIds(archivedStudents.map((s) => s.id));
    }
  };

  const handleSelectOneArchived = (id) => {
    setArchivedSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((s) => s !== id)
        : [...prev, id],
    );
  };

  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    setError('');
    setMessage('');
    try {
      const data = await bulkApproveStudents(selectedIds);
      setMessage(data.message || `${selectedIds.length} student(s) approved.`);
      if (data.emailFailures > 0) {
        setError(`${data.emailFailures} approval email(s) failed to send. Use Resend email on those rows.`);
      }
      setSelectedIds([]);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkArchive = async () => {
    if (selectedIds.length === 0) return;
    setDeleteConfirmId('bulk');
  };

  const handleBulkArchiveConfirm = async () => {
    setDeleting(true);
    setError('');
    setMessage('');
    try {
      const data = await bulkArchiveStudents(selectedIds);
      setMessage(data.message || `${selectedIds.length} student(s) removed to archive.`);
      setSelectedIds([]);
      setDeleteConfirmId(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
      setDeleteConfirmId(null);
    }
  };

  const handleBulkRestore = async () => {
    setBulkLoading(true);
    setError('');
    setMessage('');
    try {
      const data = await bulkRestoreStudents(selectedIds);
      setMessage(data.message || `${selectedIds.length} student(s) restored from archive.`);
      setSelectedIds([]);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkPermanentDelete = async () => {
    setBulkLoading(true);
    setError('');
    setMessage('');
    try {
      const data = await bulkPermanentDeleteStudents(selectedIds);
      setMessage(data.message || `${selectedIds.length} student(s) permanently deleted.`);
      setSelectedIds([]);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkLoading(false);
    }
  };

  const getStatusLabel = (status) => {
    const labels = {
      pending: 'Pending',
      approved: 'Approved',
      disapproved: 'Disapproved',
      rejected: 'Rejected',
    };
    return labels[status] || status;
  };

  return (
    <div className={styles.page}>
      {/* HEADER */}
      <div className={styles.pageHeader}>
        <div>
          <h1>Student Approvals</h1>

          <p>
            Review pending accounts, approve student access, and manage uploaded
            student records.
          </p>
        </div>
      </div>

      {/* COORDINATOR LIMIT BANNER */}
      {coordinator && (
        <div className={styles.limitBanner}>
          <div className={styles.limitBannerContent}>
            <span className={styles.limitBannerLabel}>Your assigned limits</span>
            <span className={styles.limitBannerStrand}>
              <strong>Strand:</strong> {coordinator.strand ? coordinator.strand : 'All Strands'}
            </span>
            <span className={styles.limitBannerCount}>
              <strong>Students:</strong> {coordinator.student_count} / {coordinator.student_limit}
            </span>
            {coordinator.strand && (
              <span className={styles.limitBannerNote}>
                You can only approve students from the {coordinator.strand} strand.
              </span>
            )}
            {coordinator.student_count >= coordinator.student_limit && (
              <span className={styles.limitBannerLimit}>
                ⚠ Student limit reached — you cannot approve more students until
                an admin raises your limit.
              </span>
            )}
          </div>
        </div>
      )}

      {/* TOASTS (floating – does not shift the layout) */}
      <div className={styles.toastStack} aria-live="polite">
        {message && (
          <div className={`${styles.alert} ${styles.alertSuccess}`} role="status">
            <span className={styles.alertIcon}>✓</span>
            <span>{message}</span>
            <button
              type="button"
              onClick={() => setMessage('')}
              aria-label="Dismiss notification"
            >
              <X size={15} />
            </button>
          </div>
        )}

        {error && (
          <div className={`${styles.alert} ${styles.alertError}`} role="alert">
            <span className={styles.alertIcon}>!</span>
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError('')}
              aria-label="Dismiss notification"
            >
              <X size={15} />
            </button>
          </div>
        )}
      </div>

      {/* BULK UPLOAD */}
      <section className={styles.uploadCard}>
        <div className={styles.cardHeader}>
          <div>
            <h3>Upload Students</h3>
            <p>
              Import multiple student accounts using an Excel spreadsheet.
            </p>
          </div>
        </div>

        <div className={styles.uploadContent}>
          <div className={styles.uploadBox}>
            <div className={styles.uploadSymbol}>↑</div>

            <div className={styles.uploadText}>
              <strong>
                {file ? file.name : 'Choose an Excel file'}
              </strong>

              <span>
                {file
                  ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
                  : 'Supported formats: .xlsx and .xls'}
              </span>
            </div>

            <label className={styles.chooseBtn}>
              Browse
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setUploadResult(null);
                }}
              />
            </label>
          </div>

          <button
            className={styles.uploadBtn}
            onClick={handleUpload}
            disabled={uploading || !file}
          >
            {uploading ? (
              <>
                <span className={styles.spinner}></span>
                Uploading...
              </>
            ) : (
              <>
                Upload Students
              </>
            )}
          </button>
        </div>

        <div className={styles.uploadExample}>
          <div className={styles.uploadExampleHeader}>
            <strong>Excel format example</strong>
            <span>* Required column</span>
          </div>
          <div className={styles.uploadExampleTableWrap}>
            <table className={styles.uploadExampleTable} aria-label="Example student upload spreadsheet">
              <thead>
                <tr>
                  <th data-required="true">Student ID</th>
                  <th data-required="true">First Name</th>
                  <th>Middle Name</th>
                  <th data-required="true">Last Name</th>
                  <th data-required="true">Email</th>
                  <th>Section</th>
                  <th>Strand</th>
                  <th>School</th>
                  <th>Contact Number</th>
                  <th>Gender</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>2026-001</td>
                  <td>Alex</td>
                  <td>Jordan</td>
                  <td>Reyes</td>
                  <td>alex.reyes@example.com</td>
                  <td>12-A</td>
                  <td>STEM</td>
                  <td>Sample High School</td>
                  <td>09123456789</td>
                  <td>Female</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </section>

      {/* STUDENTS */}
      <section className={styles.studentsCard}>
        <div className={styles.studentsHeader}>

          <div className={styles.studentCount}>
            <strong>{filteredStudents.length}</strong>
            <span>Students</span>
          </div>

          <div className={`${styles.filterGroup} ${styles.filterStatus}`}>
            <label className={styles.filterLabel}>Status</label>
            <select
              className={styles.filterSelect}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
            </select>
          </div>

          <div className={`${styles.filterGroup} ${styles.filterStrand}`}>
            <label className={styles.filterLabel}>Strand</label>
            <select
              className={styles.filterSelect}
              value={strandFilter}
              onChange={(e) => setStrandFilter(e.target.value)}
              disabled={loadingStrands}
            >
              <option value="all">All Strands</option>
              {strands.map((strand) => (
                <option key={strand} value={strand}>
                  {strand}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.searchBox}>
            <Search size={16} className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search by name, email, or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search students"
            />
            {searchTerm && (
              <button
                type="button"
                className={styles.searchClear}
                onClick={() => setSearchTerm('')}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* BULK ACTIONS */}
        {selectedIds.length > 0 && (
          <div className={styles.bulkBar}>
            <div className={styles.bulkActions}>
              <button
                className={styles.bulkApproveBtn}
                onClick={handleBulkApprove}
                disabled={bulkLoading}
              >
                <UserCheck size={14} />
                Approve Selected
              </button>

              <button
                className={styles.bulkDeleteBtn}
                onClick={handleBulkArchive}
                disabled={bulkLoading}
              >
                <Trash2 size={14} />
                Remove Selected
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className={styles.loading}>
            <span className={styles.spinnerDark}></span>
            <p>Loading students...</p>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>✓</div>

            <h4>No students found</h4>

            <p>
              {statusFilter === 'pending'
                ? 'All student registrations have been processed.'
                : 'No students match the current filter.'}
            </p>
          </div>
        ) : (
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.checkboxHeader}>
                    <button
                      className={styles.checkbox}
                      type="button"
                      onClick={handleSelectAll}
                      aria-label="Select all"
                    >
                      {selectedIds.length === filteredStudents.length &&
                      filteredStudents.length > 0 ? (
                        <CheckSquare size={16} />
                      ) : (
                        <Square size={16} />
                      )}
                    </button>
                  </th>
                  <th>STUDENT</th>
                  <th>EMAIL</th>
                  <th>STUDENT ID</th>
                  <th>STRAND</th>
                  <th>STATUS</th>
                  <th>REGISTERED</th>
                  <th className={styles.actionHeader}>ACTIONS</th>
                </tr>
              </thead>

              <tbody>
                {filteredStudents.map((student) => {
                  const fullName =
                    `${student.first_name || ''} ${student.last_name || ''}`.trim();

                   return (
                     <tr key={student.id}>
                       <td className={styles.checkboxCell}>
                         <button
                           className={styles.checkbox}
                           type="button"
                           onClick={() => handleSelectOne(student.id)}
                           aria-label={`Select ${student.first_name}`}
                         >
                           {selectedIds.includes(student.id) ? (
                             <CheckSquare size={16} />
                           ) : (
                             <Square size={16} />
                           )}
                         </button>
                       </td>

                       <td>
                         <div className={styles.studentCell}>
                           <div>
                             <strong>
                               {fullName || 'Unnamed Student'}
                             </strong>
                           </div>
                         </div>
                       </td>

                       <td>
                         <span className={styles.email}>
                           {student.email || '-'}
                         </span>
                       </td>

                       <td>
                         <span className={styles.studentId}>
                           {student.student_number || '-'}
                         </span>
                       </td>

                       <td>
                         <span className={styles.trackStrand}>
                           {student.track_strand || '-'}
                         </span>
                       </td>

                       <td>
                         <span
                           className={`${styles.badge} ${statusBadge(student.status)}`}
                         >
                           <span className={styles.statusDot}></span>
                           {getStatusLabel(student.status)}
                         </span>
                       </td>

                       <td>
                        <span className={styles.registeredDate}>
                    {student.created_at
                      ? new Date(student.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })
                      : '—'}
                    </span>
                       </td>

                      <td>
                        <div className={styles.actions}>
                          {deleteConfirmId === student.id ? (
                            <div className={styles.deleteConfirm}>
                              <span>Remove this student?</span>
                              <div className={styles.deleteConfirmActions}>
                                <button
                                  className={styles.confirmDeleteBtn}
                                  onClick={() => handleArchive(student.id)}
                                  disabled={deleting}
                                  title="Confirm remove"
                                  aria-label="Confirm remove"
                                >
                                  {deleting ? (
                                    <span className={styles.spinnerDark}></span>
                                  ) : (
                                    <Check size={15} />
                                  )}
                                </button>
                                <button
                                  className={styles.cancelDeleteBtn}
                                  onClick={handleCancelArchive}
                                  disabled={deleting}
                                  title="Cancel remove"
                                  aria-label="Cancel remove"
                                >
                                  <X size={15} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {student.status === 'pending' && (
                                <button
                                  className={styles.approveBtn}
                                  onClick={() => handleApprove(student.id)}
                                  title="Approve"
                                  aria-label="Approve student"
                                >
                                  <Check size={15} />
                                </button>
                              )}

                              {/* Approved but no password link received: mail a new
                                  one. Mints a fresh one-time token each time. */}
                              {student.status === 'approved' && (
                                <button
                                  className={styles.resendBtn}
                                  onClick={() => handleResendEmail(student.id)}
                                  disabled={resendingId === student.id}
                                  title="Resend the set-password email"
                                  aria-label="Resend set-password email to student"
                                >
                                  <Mail size={15} />
                                </button>
                              )}

                              <button
                                className={styles.deleteBtn}
                                onClick={() => handleArchiveConfirm(student.id)}
                                title="Remove"
                                aria-label="Remove student"
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
       </section>

        <ConfirmModal
          isOpen={deleteConfirmId === 'bulk'}
          title="Remove Selected Students"
          message={`This will permanently remove ${selectedIds.length} student account(s) to the archive. This action cannot be undone from this page. Restore them from the Archived section below.`}
          confirmLabel={deleting ? 'Removing...' : 'Remove All'}
          isDestructive
          onConfirm={handleBulkArchiveConfirm}
          onClose={() => {
            setDeleteConfirmId(null);
          }}
        />
        {uploadResult && (
          <div
            className={styles.uploadResultOverlay}
            onClick={() => setUploadResult(null)}
          >
            <div
              className={styles.uploadResultModal}
              role="dialog"
              aria-modal="true"
              aria-labelledby="student-upload-result-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className={`${styles.uploadResultIcon} ${
                uploadResult.kind === 'error'
                  ? styles.uploadResultError
                  : uploadResult.kind === 'warning'
                    ? styles.uploadResultWarning
                    : styles.uploadResultSuccess
              }`}>
                {uploadResult.kind === 'error' ? <X size={22} /> : <Check size={22} />}
              </div>
              <h2 id="student-upload-result-title">
                {uploadResult.kind === 'error'
                  ? 'Upload failed'
                  : uploadResult.kind === 'warning'
                    ? 'Upload completed with issues'
                    : 'Upload complete'}
              </h2>
              <p>{uploadResult.message}</p>
              <button
                type="button"
                className={styles.uploadResultButton}
                onClick={() => setUploadResult(null)}
                autoFocus
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* ARCHIVED ICON BUTTON (bottom) */}
        <button
          type="button"
          className={styles.archiveToggleBtn}
          onClick={() => setArchivedModalOpen(true)}
          title="View archived students"
          aria-label="View archived students"
        >
          <Archive size={18} />
        </button>

        {/* ARCHIVED STUDENTS MODAL */}
        <div
          className={`${styles.modalOverlay} ${archivedModalOpen ? styles.modalOpen : ''}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="archived-title"
          onClick={() => setArchivedModalOpen(false)}
        >
          <div
            className={styles.archivedModal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h2 id="archived-title">Archived Students</h2>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setArchivedModalOpen(false)}
                aria-label="Close archived students"
              >
                <X size={18} />
              </button>
            </div>

            {archivedStudents.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}>✓</div>
                <h4>No archived students</h4>
                <p>Removed students will appear here.</p>
              </div>
            ) : (
              <>
                {/* ARCHIVED BULK ACTIONS */}
                {archivedSelectedIds.length > 0 && (
                  <div className={styles.bulkBar}>
                    <div className={styles.bulkActions}>
                      <button
                        className={styles.bulkApproveBtn}
                        onClick={handleBulkRestore}
                        disabled={bulkLoading}
                      >
                        <UserCheck size={14} />
                        Restore Selected
                      </button>

                      <button
                        className={styles.bulkDeleteBtn}
                        onClick={handleBulkPermanentDelete}
                        disabled={bulkLoading}
                      >
                        <Trash2 size={14} />
                        Permanently Delete Selected
                      </button>
                    </div>
                  </div>
                )}

                <div className={styles.tableContainer}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th className={styles.checkboxHeader}>
                          <button
                            className={styles.checkbox}
                            type="button"
                            onClick={handleSelectAllArchived}
                            aria-label="Select all archived"
                          >
                            {archivedSelectedIds.length === archivedStudents.length &&
                            archivedStudents.length > 0 ? (
                              <CheckSquare size={16} />
                            ) : (
                              <Square size={16} />
                            )}
                          </button>
                        </th>
                        <th>STUDENT</th>
                        <th>EMAIL</th>
                        <th>STRAND</th>
                        <th>ARCHIVED</th>
                        <th className={styles.actionHeader}>ACTIONS</th>
                      </tr>
                    </thead>

                    <tbody>
                      {archivedStudents.map((student) => {
                        const fullName =
                          `${student.first_name || ''} ${student.last_name || ''}`.trim();
                        const isSelected = archivedSelectedIds.includes(student.id);
                        return (
                          <tr key={student.id}>
                            <td className={styles.checkboxCell}>
                              <button
                                className={styles.checkbox}
                                type="button"
                                onClick={() => handleSelectOneArchived(student.id)}
                                aria-label={`Select ${student.first_name}`}
                              >
                                {isSelected ? (
                                  <CheckSquare size={16} />
                                ) : (
                                  <Square size={16} />
                                )}
                              </button>
                            </td>

                            <td>
                              <div className={styles.studentCell}>
                                <div>
                                  <strong>{fullName || 'Unnamed Student'}</strong>
                                </div>
                              </div>
                            </td>

                            <td>
                              <span className={styles.email}>{student.email || '-'}</span>
                            </td>

                            <td>
                              <span className={styles.trackStrand}>
                                {student.track_strand || '-'}
                              </span>
                            </td>

                            <td>
                              <span className={styles.registeredDate}>
                                {student.archived_at
                                  ? new Date(student.archived_at).toLocaleDateString('en-US', {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                    })
                                  : '—'}
                              </span>
                            </td>

                            <td>
                              <div className={styles.actions}>
                                <button
                                  className={styles.approveBtn}
                                  onClick={() => handleRestore(student.id)}
                                  disabled={deleting}
                                  title="Restore from archive"
                                  aria-label="Restore student from archive"
                                >
                                  <UserCheck size={15} />
                                </button>

                                <button
                                  className={styles.deleteBtn}
                                  onClick={() => handlePermanentDelete(student.id)}
                                  disabled={deleting}
                                  title="Permanently delete"
                                  aria-label="Permanently delete student"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>

        <ConfirmModal
          isOpen={deleteConfirmId === 'bulk'}
          title="Remove Selected Students"
          message={`This will permanently remove ${selectedIds.length} student account(s) to the archive. This action cannot be undone from this page. Restore them from the Archived section below.`}
          confirmLabel={deleting ? 'Removing...' : 'Remove All'}
          isDestructive
          onConfirm={handleBulkArchiveConfirm}
          onClose={() => {
            setDeleteConfirmId(null);
          }}
        />
        {uploadResult && (
          <div
            className={styles.uploadResultOverlay}
            onClick={() => setUploadResult(null)}
          >
            <div
              className={styles.uploadResultModal}
              role="dialog"
              aria-modal="true"
              aria-labelledby="student-upload-result-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className={`${styles.uploadResultIcon} ${
                uploadResult.kind === 'error'
                  ? styles.uploadResultError
                  : uploadResult.kind === 'warning'
                    ? styles.uploadResultWarning
                    : styles.uploadResultSuccess
              }`}>
                {uploadResult.kind === 'error' ? <X size={22} /> : <Check size={22} />}
              </div>
              <h2 id="student-upload-result-title">
                {uploadResult.kind === 'error'
                  ? 'Upload failed'
                  : uploadResult.kind === 'warning'
                    ? 'Upload completed with issues'
                    : 'Upload complete'}
              </h2>
              <p>{uploadResult.message}</p>
              <button
                type="button"
                className={styles.uploadResultButton}
                onClick={() => setUploadResult(null)}
                autoFocus
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

export default StudentApprovals;