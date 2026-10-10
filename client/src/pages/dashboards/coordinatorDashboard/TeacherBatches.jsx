import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getTeachers,
  getBatches,
  getSupervisors,
  getCompletedStudents,
  createTeacherBatch,
  updateTeacherBatch,
  deleteTeacherBatch,
  assignStudentsToBatch,
} from '../../../api/coordinatorApi';
import { Pencil, Trash2, X } from 'lucide-react';
import styles from './TeacherBatches.module.css';

function TeacherBatches() {
  const navigate = useNavigate();
  const [teachers, setTeachers] = useState([]);
  const [batches, setBatches] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [form, setForm] = useState({ teacher_id: '', batch_label: '', max_students: '', supervisor_id: '' });
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ batch_label: '', max_students: '', supervisor_id: '', teacher_id: '' });
  const [editError, setEditError] = useState('');

  // Students are no longer rendered inline on the card — clicking the card
  // opens this modal, where they can also be added or removed.
  const [viewing, setViewing] = useState(null);

  // Add/remove state for the students modal.
  const [completedStudents, setCompletedStudents] = useState([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addSelected, setAddSelected] = useState([]);
  const [savingAdd, setSavingAdd] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [batchActionError, setBatchActionError] = useState('');

  // Batch pending deletion: null when the confirm modal is closed.
  const [deleting, setDeleting] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [t, b, s] = await Promise.all([getTeachers(), getBatches(), getSupervisors()]);
      setTeachers(t.teachers || []);
      setBatches(b.batches || []);
      setSupervisors(s.supervisors || []);
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
        const [t, b, s] = await Promise.all([getTeachers(), getBatches(), getSupervisors()]);
        if (!mounted) return;
        setTeachers(t.teachers || []);
        setBatches(b.batches || []);
        setSupervisors(s.supervisors || []);
      } catch (err) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchData();
    return () => {
      mounted = false;
    };
  }, []);

  // A supervisor can only be assigned to ONE batch. Build a lookup of
  // supervisor user IDs that already supervise a batch so the UI can block
  // selecting them again (the server enforces this too).
  const assignedSupervisorIds = new Set(
    batches
      .filter((b) => b.supervisor_id !== null && b.supervisor_id !== undefined)
      .map((b) => Number(b.supervisor_id))
  );

  // In the Create form, any supervisor already assigned to a batch is blocked.
  const isSupervisorTakenForCreate = (supervisorUserId) =>
    assignedSupervisorIds.has(Number(supervisorUserId));

  // In the Edit form, a supervisor assigned to a DIFFERENT batch is blocked.
  // The supervisor currently on the batch being edited stays selectable.
  const isSupervisorTakenForEdit = (supervisorUserId) => {
    if (!editing) return false;
    if (Number(editing.supervisor_id) === Number(supervisorUserId)) return false;
    return assignedSupervisorIds.has(Number(supervisorUserId));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      await createTeacherBatch({
        teacher_id: Number(form.teacher_id),
        batch_label: form.batch_label,
        max_students: Number(form.max_students),
        supervisor_id: form.supervisor_id ? Number(form.supervisor_id) : null,
      });
      setMessage('Batch created.');
      setForm({ teacher_id: '', batch_label: '', max_students: '', supervisor_id: '' });
      setShowCreateModal(false);
      loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  // Deploying students is a full page so long student lists can scroll freely
  // instead of being trapped inside a modal.
  const openAssign = (batch) => {
    navigate(`/dashboard/coordinator/batches/deploy/${batch.id}`);
  };

  const openViewStudents = (batch) => {
    setViewing(batch);
    setAdding(false);
    setAddSelected([]);
    setBatchActionError('');
  };

  const closeViewStudents = () => {
    setViewing(null);
    setAdding(false);
    setAddSelected([]);
    setBatchActionError('');
  };

  // Reloads the batches list and swaps the open modal onto the fresh copy so
  // the counts on the cards and in the modal stay correct after an edit.
  const refreshBatches = async () => {
    try {
      const b = await getBatches();
      const list = b.batches || [];
      setBatches(list);
      setViewing((current) => (current ? list.find((x) => x.id === current.id) || null : null));
    } catch (err) {
      setBatchActionError(err.message);
    }
  };

  // Loads the pool of students eligible to be added (completed requirements
  // and not yet placed in any batch) whenever a card is opened.
  useEffect(() => {
    if (!viewing) return undefined;
    let mounted = true;
    setLoadingAvailable(true);
    getCompletedStudents()
      .then((res) => {
        if (!mounted) return;
        setCompletedStudents(res.students || []);
      })
      .catch((err) => {
        if (mounted) setBatchActionError(err.message);
      })
      .finally(() => {
        if (mounted) setLoadingAvailable(false);
      });
    return () => {
      mounted = false;
    };
  }, [viewing]);

  // The assign endpoint replaces the whole roster, so removing a student means
  // resending every remaining id.
  const handleRemoveStudent = async (student) => {
    if (!viewing) return;
    setBatchActionError('');
    setRemovingId(student.id);
    try {
      const remaining = (viewing.students || [])
        .filter((s) => s.id !== student.id)
        .map((s) => Number(s.id));
      await assignStudentsToBatch(viewing.id, remaining);
      setMessage('Student removed from batch.');
      await refreshBatches();
    } catch (err) {
      setBatchActionError(err.message);
    } finally {
      setRemovingId(null);
    }
  };

  const handleAddSelected = async () => {
    if (!viewing) return;
    setBatchActionError('');
    const currentCount = (viewing.students || []).length;
    if (currentCount + addSelected.length > viewing.max_students) {
      setBatchActionError(
        `Adding ${addSelected.length} exceeds max ${viewing.max_students} (${currentCount} already assigned).`
      );
      return;
    }
    setSavingAdd(true);
    try {
      const ids = [
        ...(viewing.students || []).map((s) => Number(s.id)),
        ...addSelected.map((id) => Number(id)),
      ];
      await assignStudentsToBatch(viewing.id, ids);
      setMessage('Students added to batch.');
      setAddSelected([]);
      setAdding(false);
      await refreshBatches();
    } catch (err) {
      setBatchActionError(err.message);
    } finally {
      setSavingAdd(false);
    }
  };

  // Students that can still be pulled in: completed requirements and not yet
  // placed in any batch (students already elsewhere are not addable).
  const availableStudents = completedStudents.filter((s) => !s.assigned_batch_id);

  // Close the open modal on Escape and stop the page behind it scrolling.
  const modalOpen = Boolean(viewing || editing || deleting || showCreateModal);
  useEffect(() => {
    if (!modalOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      closeViewStudents();
      setEditing(null);
      setShowCreateModal(false);
      if (!deleteLoading) {
        setDeleting(null);
        setDeleteError('');
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [modalOpen, deleteLoading]);

  const closeDeleteModal = () => {
    // Don't let the modal be dismissed while the request is in flight.
    if (deleteLoading) return;
    setDeleting(null);
    setDeleteError('');
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteError('');
    setDeleteLoading(true);
    try {
      await deleteTeacherBatch(deleting.id);
      setDeleting(null);
      await loadAll();
    } catch (err) {
      // Kept inside the modal so the coordinator can retry.
      setDeleteError(err.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const openEdit = (batch) => {
    setEditing(batch);
    setEditError('');
    // The teacher <select> is keyed by teachers' USER ids, but the batch
    // payload carries the internal teachers.id. Resolve it back to the user id
    // so the current teacher is preselected — otherwise changing it silently
    // sent the wrong teacher. Fall back to matching the stored teacher object.
    const teacherUser =
      batch.teacher_user_id ||
      (batch.teacher && batch.teacher.user_id) ||
      teachers.find(
        (t) =>
          batch.teacher &&
          t.first_name === batch.teacher.first_name &&
          t.last_name === batch.teacher.last_name
      )?.id ||
      '';
    setEditForm({
      batch_label: batch.batch_label,
      max_students: batch.max_students,
      supervisor_id: batch.supervisor_id || '',
      teacher_id: String(teacherUser),
    });
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setEditError('');
    try {
      await updateTeacherBatch(editing.id, {
        batch_label: editForm.batch_label,
        max_students: Number(editForm.max_students),
        supervisor_id: editForm.supervisor_id ? Number(editForm.supervisor_id) : null,
        teacher_id: editForm.teacher_id ? Number(editForm.teacher_id) : null,
      });
      setMessage('Batch updated.');
      setEditing(null);
      loadAll();
    } catch (err) {
      setEditError(err.message);
    }
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2>Deployment</h2>
        <p>Create batches, assign students with completed requirements, and manage teachers.</p>
      </div>

      {message && <div className={styles.message}>{message}</div>}
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Deployment Batches</h3>
          <button className={styles.btn} onClick={() => setShowCreateModal(true)}>
            Create batch
          </button>
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Deployment Batches ({batches.length})</h3>
        {loading ? (
          <p className={styles.loading}>Loading...</p>
        ) : batches.length === 0 ? (
          <p className={styles.empty}>No batches yet.</p>
        ) : (
          batches.map((b) => (
            <div
              key={b.id}
              className={styles.listItem}
              role="button"
              tabIndex={0}
              title="View students"
              aria-label={`View students in ${b.batch_label}`}
              onClick={() => openViewStudents(b)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openViewStudents(b);
                }
              }}
            >
              <div className={styles.row}>
              <div>
                <h4>
                  {b.batch_label} — {b.teacher?.first_name} {b.teacher?.last_name}
                </h4>
                <p className={styles.muted}>
                  {(b.students || []).length}/{b.max_students} students assigned
                  {b.supervisor ? ` · Supervisor: ${b.supervisor.first_name} ${b.supervisor.last_name}` : ''}
                </p>
              </div>
                <div
                  className={styles.actions}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <button className={styles.btnGhost} onClick={() => openAssign(b)}>
                    Deploy students
                  </button>
                  <button className={styles.btnIcon} onClick={() => openEdit(b)} title="Edit batch">
                    <Pencil size={16} />
                  </button>
                  <button className={styles.btnIconDelete} onClick={() => { setDeleting(b); setDeleteError(''); }} title="Delete batch">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              {(b.students || []).length === 0 && (
                <p className={styles.viewHint}>No students yet — click to view</p>
              )}
            </div>
          ))
        )}
      </div>

      {/* Batch Students Modal — opened by clicking the batch card */}
      {viewing && (
        <div
          className={styles.modalOverlay}
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeViewStudents();
          }}
        >
          <div
            className={`${styles.modal} ${styles.modalWide}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="view-students-title"
          >
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle} id="view-students-title">
                  {viewing.batch_label}
                </h3>
                <p className={styles.modalSubtitle}>
                  {viewing.teacher?.first_name} {viewing.teacher?.last_name}
                  {viewing.supervisor
                    ? ` · Supervisor: ${viewing.supervisor.first_name} ${viewing.supervisor.last_name}`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                className={styles.modalClose}
                onClick={closeViewStudents}
                aria-label="Close"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalMeta}>
              <span className={styles.modalCount}>
                <strong>{(viewing.students || []).length}</strong> of {viewing.max_students} students
                {' · '}
                <span className={styles.muted}>
                  {Math.max(0, viewing.max_students - (viewing.students || []).length)} slots free
                </span>
              </span>
              {!adding ? (
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={() => {
                    setAdding(true);
                    setAddSelected([]);
                    setBatchActionError('');
                  }}
                  disabled={(viewing.students || []).length >= viewing.max_students}
                  title={
                    (viewing.students || []).length >= viewing.max_students
                      ? 'Batch is at full capacity'
                      : 'Add students to this batch'
                  }
                >
                  + Add student
                </button>
              ) : (
                <button type="button" className={styles.btnSecondary} onClick={() => setAdding(false)}>
                  Done
                </button>
              )}
            </div>

            {batchActionError && <div className={styles.modalError}>{batchActionError}</div>}

            <div className={styles.modalBody}>
              {adding ? (
                <>
                  <p className={styles.addIntro}>
                    Select students to add. Only students with completed requirements who are not yet
                    assigned to any batch are listed.
                  </p>
                  {loadingAvailable ? (
                    <p className={styles.empty}>Loading available students...</p>
                  ) : availableStudents.length === 0 ? (
                    <p className={styles.empty}>No students available to add.</p>
                  ) : (
                    <ul className={styles.studentsList}>
                      {availableStudents.map((s) => {
                        const id = s.student_id || s.id;
                        const checked = addSelected.includes(id);
                        return (
                          <li key={id} className={styles.studentRow}>
                            <label className={styles.studentCheck}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setAddSelected((prev) =>
                                    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                                  )
                                }
                              />
                              <span className={styles.studentName}>
                                {s.first_name} {s.last_name}
                              </span>
                            </label>
                            <span className={styles.strandTag}>{s.strand || '—'}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              ) : (viewing.students || []).length === 0 ? (
                <p className={styles.empty}>No students deployed in this batch yet.</p>
              ) : (
                <ul className={styles.studentsList}>
                  {(viewing.students || []).map((s) => (
                    <li key={s.id} className={styles.studentRow}>
                      <span className={styles.studentName}>
                        {s.first_name} {s.last_name}
                      </span>
                      <button
                        type="button"
                        className={styles.studentRemove}
                        onClick={() => handleRemoveStudent(s)}
                        disabled={removingId === s.id}
                        title={`Remove ${s.first_name} ${s.last_name} from this batch`}
                        aria-label={`Remove ${s.first_name} ${s.last_name}`}
                      >
                        {removingId === s.id ? '···' : <X size={16} />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className={styles.modalFooter}>
              {adding ? (
                <>
                  <button type="button" className={styles.btnSecondary} onClick={() => setAdding(false)}>
                    Cancel
                  </button>
                  <button
                    className={styles.btn}
                    type="button"
                    disabled={savingAdd || addSelected.length === 0}
                    onClick={handleAddSelected}
                  >
                    {savingAdd
                      ? 'Adding...'
                      : `Add ${addSelected.length} student${addSelected.length === 1 ? '' : 's'}`}
                  </button>
                </>
              ) : (
                <>
                  <button className={styles.btnSecondary} type="button" onClick={closeViewStudents}>
                    Close
                  </button>
                  <button
                    className={styles.btn}
                    type="button"
                    onClick={() => {
                      const target = viewing;
                      closeViewStudents();
                      openAssign(target);
                    }}
                  >
                    Deploy students
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Batch Modal */}
      {showCreateModal && (
        <div
          className={styles.modalOverlay}
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowCreateModal(false);
          }}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-batch-title"
          >
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle} id="create-batch-title">
                  Create Deployment Batch
                </h3>
                <p className={styles.modalSubtitle}>
                  Fill in the details to create a new deployment batch
                </p>
              </div>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setShowCreateModal(false)}
                aria-label="Close"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} className={styles.modalForm}>
              {error && <div className={styles.modalError}>{error}</div>}

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Teacher</span>
                <select
                  className={styles.select}
                  value={form.teacher_id}
                  onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}
                  required
                >
                  <option value="">Select Teacher</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.first_name} {t.last_name} ({t.employee_id})
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Supervisor</span>
                <select
                  className={styles.select}
                  value={form.supervisor_id}
                  onChange={(e) => setForm({ ...form, supervisor_id: e.target.value })}
                >
                  <option value="">No Supervisor</option>
                  {supervisors.map((s) => {
                    const taken = isSupervisorTakenForCreate(s.id);
                    return (
                      <option key={s.id} value={s.id} disabled={taken}>
                        {s.first_name} {s.last_name} ({s.company_name}){taken ? ' — already assigned to a batch' : ''}
                      </option>
                    );
                  })}
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Batch label</span>
                <input
                  className={styles.input}
                  placeholder="Batch label"
                  value={form.batch_label}
                  onChange={(e) => setForm({ ...form, batch_label: e.target.value })}
                  required
                />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Max students</span>
                <input
                  className={styles.input}
                  type="number"
                  min="1"
                  placeholder="Max students"
                  value={form.max_students}
                  onChange={(e) => setForm({ ...form, max_students: e.target.value })}
                  required
                />
              </label>

              <div className={styles.modalFooter}>
                <button className={styles.btnSecondary} type="button" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button className={styles.btn} disabled={creating} type="submit">
                  {creating ? 'Creating...' : 'Create batch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* Delete confirmation modal */}
      {deleting && (
        <div
          className={styles.modalOverlay}
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeDeleteModal();
          }}
        >
          <div
            className={`${styles.modal} ${styles.modalNarrow} ${styles.deleteModal}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-batch-title"
          >
            <div className={styles.modalHeader}>
              <div className={styles.deleteIconWrap}>
                <span className={styles.deleteIcon}>
                  <Trash2 size={20} />
                </span>
                <div>
                  <h3 className={styles.modalTitle} id="delete-batch-title">
                    Delete this batch?
                  </h3>
                  <p className={styles.modalSubtitle}>{deleting.batch_label}</p>
                </div>
              </div>
              <button
                type="button"
                className={styles.modalClose}
                onClick={closeDeleteModal}
                aria-label="Close"
                title="Close"
                disabled={deleteLoading}
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.deleteBody}>
              <p className={styles.deleteWarning}>
                Deleting this batch will unassign all{' '}
                <strong>{(deleting.students || []).length}</strong> student
                {(deleting.students || []).length === 1 ? '' : 's'} placed in it. The students keep
                their records and become available for deployment again.
              </p>
              <p className={styles.deleteNote}>This action cannot be undone.</p>

              {deleteError && <div className={styles.modalError}>{deleteError}</div>}
            </div>

            <div className={styles.modalFooter}>
              <button
                className={styles.btnSecondary}
                type="button"
                onClick={closeDeleteModal}
                disabled={deleteLoading}
              >
                Cancel
              </button>
              <button
                className={styles.btnDanger}
                type="button"
                onClick={handleDelete}
                disabled={deleteLoading}
              >
                {deleteLoading ? (
                  <>
                    <span className={styles.spinner} aria-hidden="true" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} /> Delete batch
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div
          className={styles.modalOverlay}
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditing(null);
          }}
        >
          <div
            className={`${styles.modal} ${styles.modalNarrow}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-batch-title"
          >
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle} id="edit-batch-title">
                  Edit Batch
                </h3>
                <p className={styles.modalSubtitle}>
                  {editing.batch_label} · {editing.teacher?.first_name} {editing.teacher?.last_name}
                </p>
              </div>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setEditing(null)}
                aria-label="Close"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEdit} className={styles.modalForm}>
              {editError && <div className={styles.modalError}>{editError}</div>}

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Batch label</span>
                <input
                  className={styles.input}
                  value={editForm.batch_label}
                  onChange={(e) => setEditForm({ ...editForm, batch_label: e.target.value })}
                  required
                />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Teacher</span>
                <select
                  className={styles.select}
                  value={editForm.teacher_id}
                  onChange={(e) => setEditForm({ ...editForm, teacher_id: e.target.value })}
                  required
                >
                  <option value="">Select Teacher</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.first_name} {t.last_name} ({t.employee_id})
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Max students</span>
                <input
                  className={styles.input}
                  type="number"
                  min="1"
                  value={editForm.max_students}
                  onChange={(e) => setEditForm({ ...editForm, max_students: e.target.value })}
                  required
                />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Supervisor</span>
                <select
                  className={styles.select}
                  value={editForm.supervisor_id}
                  onChange={(e) => setEditForm({ ...editForm, supervisor_id: e.target.value })}
                >
                  <option value="">No Supervisor</option>
                  {supervisors.map((s) => {
                    const taken = isSupervisorTakenForEdit(s.id);
                    return (
                      <option key={s.id} value={s.id} disabled={taken}>
                        {s.first_name} {s.last_name} ({s.company_name}){taken ? ' — already assigned to a batch' : ''}
                      </option>
                    );
                  })}
                </select>
              </label>

              <div className={styles.modalFooter}>
                <button className={styles.btnSecondary} type="button" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button className={styles.btn} type="submit">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default TeacherBatches;
