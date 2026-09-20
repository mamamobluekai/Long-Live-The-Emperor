import { useEffect, useState } from 'react';
import {
  getPendingStudents,
  approveStudent,
  disapproveStudent,
  deleteStudent,
  uploadStudentsExcel,
} from '../../../api/coordinatorApi';
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
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
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

  const load = async () => {
    setLoading(true);
    setError('');

    try {
      const data = await getPendingStudents(statusFilter);
      setStudents(data.students || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [statusFilter]);

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

  const handleDisapprove = async (id) => {
    try {
      await disapproveStudent(id);

      setMessage('Student disapproved.');

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
          <span className={styles.eyebrow}>STUDENT MANAGEMENT</span>

          <h2>Students</h2>

          <p>
            Manage student accounts, upload students in bulk, and review
            pending registrations.
          </p>
        </div>
      </div>

      {/* ALERTS */}
      {message && (
        <div className={`${styles.alert} ${styles.alertSuccess}`}>
          <span className={styles.alertIcon}>✓</span>
          <span>{message}</span>
          <button onClick={() => setMessage('')}>×</button>
        </div>
      )}

      {error && (
        <div className={`${styles.alert} ${styles.alertError}`}>
          <span className={styles.alertIcon}>!</span>
          <span>{error}</span>
          <button onClick={() => setError('')}>×</button>
        </div>
      )}

      {/* BULK UPLOAD */}
      <section className={styles.uploadCard}>
        <div className={styles.cardHeader}>
          <div>
            <h3>Bulk Upload Students</h3>
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
          <div>
            <span className={styles.sectionLabel}>REGISTRATION</span>

            <h3>Student Approvals</h3>

            <p>
              Review and approve student accounts waiting for registration.
            </p>
          </div>

          <div className={styles.studentCount}>
            <strong>{filteredStudents.length}</strong>
            <span>Students</span>
          </div>
        </div>

        {/* FILTERS */}
        <div className={styles.filters}>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Status</label>
            <select
              className={styles.filterSelect}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="disapproved">Disapproved</option>
            </select>
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Search</label>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search by name, email, or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

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
                  <th>STUDENT</th>
                  <th>EMAIL</th>
                  <th>STUDENT ID</th>
                  <th>GRADE / SECTION</th>
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
                      <td>
                        <div className={styles.studentCell}>
                          <div className={styles.studentAvatar}>
                            {(student.first_name || 'S')
                              .charAt(0)
                              .toUpperCase()}
                          </div>

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
                        <span className={styles.gradeSection}>
                          {student.grade_level ? `${student.grade_level}` : ''}
                          {student.section ? ` - ${student.section}` : ''}
                          {student.track_strand ? ` (${student.track_strand})` : ''}
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
                            ? new Date(student.created_at).toLocaleDateString()
                            : '-'}
                        </span>
                      </td>

                      <td>
                        <div className={styles.actions}>
                          {deleteConfirmId === student.id ? (
                            <div className={styles.deleteConfirm}>
                              <span>Delete this student?</span>
                              <button
                                className={styles.confirmDeleteBtn}
                                onClick={() => handleDelete(student.id)}
                                disabled={deleting}
                              >
                                {deleting ? 'Deleting...' : 'Yes, Delete'}
                              </button>
                              <button
                                className={styles.cancelDeleteBtn}
                                onClick={handleCancelDelete}
                                disabled={deleting}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              {student.status === 'pending' && (
                                <>
                                  <button
                                    className={styles.approveBtn}
                                    onClick={() => handleApprove(student.id)}
                                  >
                                    ✓ Approve
                                  </button>

                                  <button
                                    className={styles.rejectBtn}
                                    onClick={() => handleDisapprove(student.id)}
                                  >
                                    Disapprove
                                  </button>
                                </>
                              )}

                              <button
                                className={styles.deleteBtn}
                                onClick={() => handleDeleteConfirm(student.id)}
                              >
                                Delete
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
    </div>
  );
}

export default StudentApprovals;