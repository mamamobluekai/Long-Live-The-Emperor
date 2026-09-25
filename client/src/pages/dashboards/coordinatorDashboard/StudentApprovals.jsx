import { useEffect, useState } from 'react';
import {
  getPendingStudents,
  getStudentStrands,
  approveStudent,
  deleteStudent,
  bulkApproveStudents,
  bulkDeleteStudents,
  uploadStudentsExcel,
} from '../../../api/coordinatorApi';
import {
  Check,
  CheckSquare,
  Search,
  Square,
  Trash2,
  UserCheck,
  X,
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
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploadError, setUploadError] = useState('');

  // Delete confirmation state
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Bulk selection & actions
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');

    try {
      const data = await getPendingStudents(statusFilter, strandFilter);
      setStudents(data.students || []);
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
      setUploadError('Please select an Excel file first.');
      return;
    }

    setUploading(true);
    setUploadError('');
    setUploadMessage('');
    setMessage('');
    setError('');

    try {
      const data = await uploadStudentsExcel(file);

      const r = data.results || {};
      const summary = data.message || 'Upload complete.';
      const detail = r.failed ? ` (${r.failed} failed)` : '';

      setUploadMessage(`${summary}${detail}`);
      setFile(null);

      await load();
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      await approveStudent(id);

      setMessage(
        'Student approved. An email with their password setup link was sent.'
      );

      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteConfirm = (id) => {
    setDeleteConfirmId(id);
  };

  const handleDelete = async (id) => {
    setDeleting(true);
    try {
      await deleteStudent(id);
      setMessage('Student deleted successfully.');
      setDeleteConfirmId(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
      setDeleteConfirmId(null);
    }
  };

  const handleCancelDelete = () => {
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

  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    setError('');
    setMessage('');
    try {
      const data = await bulkApproveStudents(selectedIds);
      setMessage(data.message || `${selectedIds.length} student(s) approved.`);
      setSelectedIds([]);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setDeleteConfirmId('bulk');
  };

  const handleBulkDeleteConfirm = async () => {
    setDeleting(true);
    setError('');
    setMessage('');
    try {
      const data = await bulkDeleteStudents(selectedIds);
      setMessage(data.message || `${selectedIds.length} student(s) deleted.`);
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
          <span className={styles.eyebrow}>Student Management</span>

          <h1>Student Approvals</h1>

          <p>
            Review pending accounts, approve student access, and manage uploaded
            student records.
          </p>
        </div>
        <div className={styles.headerIcon} aria-hidden="true">
          <UserCheck size={23} strokeWidth={2.2} />
        </div>
      </div>

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
                  setUploadError('');
                  setUploadMessage('');
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

        <div className={styles.uploadHint}>
          <span>ⓘ</span>
          Required columns: Student ID, First Name, Last Name, and Email.
        </div>

        {uploadMessage && (
          <div className={`${styles.smallAlert} ${styles.smallSuccess}`}>
            ✓ {uploadMessage}
          </div>
        )}

        {uploadError && (
          <div className={`${styles.smallAlert} ${styles.smallError}`}>
            ! {uploadError}
          </div>
        )}
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
                onClick={handleBulkDelete}
                disabled={bulkLoading}
              >
                <Trash2 size={14} />
                Delete Selected
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
                              <span>Delete this student?</span>
                              <div className={styles.deleteConfirmActions}>
                                <button
                                  className={styles.confirmDeleteBtn}
                                  onClick={() => handleDelete(student.id)}
                                  disabled={deleting}
                                  title="Confirm delete"
                                  aria-label="Confirm delete"
                                >
                                  {deleting ? (
                                    <span className={styles.spinnerDark}></span>
                                  ) : (
                                    <Check size={15} />
                                  )}
                                </button>
                                <button
                                  className={styles.cancelDeleteBtn}
                                  onClick={handleCancelDelete}
                                  disabled={deleting}
                                  title="Cancel"
                                  aria-label="Cancel delete"
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

                              <button
                                className={styles.deleteBtn}
                                onClick={() => handleDeleteConfirm(student.id)}
                                title="Delete"
                                aria-label="Delete student"
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
         title="Delete Selected Students"
         message={`This will permanently delete ${selectedIds.length} student account(s) and all related records. This action cannot be undone.`}
         confirmLabel={deleting ? 'Deleting...' : 'Delete All'}
         isDestructive
         onConfirm={handleBulkDeleteConfirm}
         onClose={() => {
           setDeleteConfirmId(null);
         }}
       />
     </div>
   );
}

export default StudentApprovals;