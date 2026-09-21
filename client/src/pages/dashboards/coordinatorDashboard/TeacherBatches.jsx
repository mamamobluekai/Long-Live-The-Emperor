import { useEffect, useState } from 'react';
import {
  getTeachers,
  getBatches,
  getCompletedStudents,
  getSupervisors,
  createTeacherBatch,
  updateTeacherBatch,
  deleteTeacherBatch,
  assignStudentsToBatch,
} from '../../../api/coordinatorApi';
import styles from './TeacherBatches.module.css';

function TeacherBatches() {
  const [teachers, setTeachers] = useState([]);
  const [batches, setBatches] = useState([]);
  const [completed, setCompleted] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [form, setForm] = useState({ teacher_id: '', batch_label: '', max_students: '', supervisor_id: '' });
  const [creating, setCreating] = useState(false);

  const [assigning, setAssigning] = useState(null); // batch being assigned to
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [savingAssign, setSavingAssign] = useState(false);

  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ batch_label: '', max_students: '', supervisor_id: '' });

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [t, b, c, s] = await Promise.all([getTeachers(), getBatches(), getCompletedStudents(), getSupervisors()]);
      setTeachers(t.teachers || []);
      setBatches(b.batches || []);
      setCompleted(c.students || []);
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
        const [t, b, c, s] = await Promise.all([getTeachers(), getBatches(), getCompletedStudents(), getSupervisors()]);
        if (!mounted) return;
        setTeachers(t.teachers || []);
        setBatches(b.batches || []);
        setCompleted(c.students || []);
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
      loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const openAssign = (batch) => {
    setAssigning(batch);
    setSelectedStudents((batch.students || []).map((s) => s.student_id || s.id));
  };

  const toggleStudent = (id) => {
    setSelectedStudents((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // A student already assigned to a different batch is locked — the server
  // rejects reassigning them, so prevent selecting them here too. Students who
  // are already in THIS batch stay editable/selectable.
  const isLockedStudent = (student) => {
    if (!assigning) return false;
    if (!student.assigned_batch_id) return false;
    if (Number(student.assigned_batch_id) === Number(assigning.id)) return false;
    return true;
  };

  const handleAssign = async () => {
    if (!assigning) return;
    if (selectedStudents.length > assigning.max_students) {
      setError(`Selected ${selectedStudents.length} exceeds max ${assigning.max_students}.`);
      return;
    }
    setSavingAssign(true);
    setError('');
    try {
      await assignStudentsToBatch(
        assigning.id,
        selectedStudents.map((id) => Number(id))
      );
      setMessage('Students assigned to batch.');
      setAssigning(null);
      loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingAssign(false);
    }
  };

  const handleDelete = async (batchId) => {
    if (!window.confirm('Delete this batch? Students will be unassigned.')) return;
    try {
      await deleteTeacherBatch(batchId);
      setMessage('Batch deleted.');
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const openEdit = (batch) => {
    setEditing(batch);
    setEditForm({ batch_label: batch.batch_label, max_students: batch.max_students, supervisor_id: batch.supervisor_id || '' });
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    try {
      await updateTeacherBatch(editing.id, {
        batch_label: editForm.batch_label,
        max_students: Number(editForm.max_students),
        supervisor_id: editForm.supervisor_id ? Number(editForm.supervisor_id) : null,
      });
      setMessage('Batch updated.');
      setEditing(null);
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2>Teacher Batches</h2>
        <p>Create batches, assign students with completed requirements, and manage teachers.</p>
      </div>

      {message && <div className={styles.message}>{message}</div>}
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Create Batch</h3>
        <form onSubmit={handleCreate} className={styles.row}>
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
          <input
            className={styles.input}
            placeholder="Batch label"
            value={form.batch_label}
            onChange={(e) => setForm({ ...form, batch_label: e.target.value })}
            required
          />
          <input
            className={styles.input}
            type="number"
            min="1"
            placeholder="Max students"
            value={form.max_students}
            onChange={(e) => setForm({ ...form, max_students: e.target.value })}
            required
          />
          <button className={styles.btn} disabled={creating} type="submit">
            {creating ? 'Creating...' : 'Create'}
          </button>
        </form>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Batches ({batches.length})</h3>
        {loading ? (
          <p className={styles.loading}>Loading...</p>
        ) : batches.length === 0 ? (
          <p className={styles.empty}>No batches yet.</p>
        ) : (
          batches.map((b) => (
            <div key={b.id} className={styles.listItem}>
              <div className={styles.row}>
              <div>
                <h4>
                  {b.batch_label} — {b.teacher?.first_name} {b.teacher?.last_name}
                </h4>
                <p className={styles.muted}>
                  {b.students.length}/{b.max_students} students assigned
                  {b.supervisor ? ` · Supervisor: ${b.supervisor.first_name} ${b.supervisor.last_name}` : ''}
                </p>
              </div>
                <div className={styles.actions}>
                  <button className={styles.btnGhost} onClick={() => openAssign(b)}>
                    Assign Students
                  </button>
                  <button className={styles.btnSecondary} onClick={() => openEdit(b)}>
                    Edit
                  </button>
                  <button className={styles.btnDelete} onClick={() => handleDelete(b.id)}>
                    Delete
                  </button>
                </div>
              </div>
              {b.students.length > 0 && (
                <ul className={styles.muted} style={{ marginTop: 8 }}>
                  {b.students.map((s) => (
                    <li key={s.id}>
                      {s.first_name} {s.last_name} ({s.student_id})
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))
        )}
      </div>

      {assigning && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>
            Assign Students — {assigning.batch_label} (max {assigning.max_students})
          </h3>
          <p className={styles.muted}>
            {selectedStudents.length} selected. Only students with completed requirements are listed.
            Students already assigned to another batch are locked and cannot be selected.
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th></th>
                  <th>Student ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Strand</th>
                  <th>Batch Status</th>
                </tr>
              </thead>
              <tbody>
                {completed.map((s) => {
                  const assignmentId = s.student_id || s.id;
                  const locked = isLockedStudent(s);
                  return (
                  <tr key={assignmentId} className={locked ? styles.rowLocked : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedStudents.includes(assignmentId)}
                        onChange={() => toggleStudent(assignmentId)}
                        disabled={locked}
                        title={locked ? `Already assigned to ${s.assigned_batch_label || 'another batch'}` : undefined}
                      />
                    </td>
                    <td>{s.student_id}</td>
                    <td>
                      {s.first_name} {s.last_name}
                    </td>
                    <td>{s.email}</td>
                    <td>{s.strand || '-'}</td>
                    <td>
                      {locked ? (
                        <span className={styles.lockBadge} title={`Assigned to ${s.assigned_batch_label || 'another batch'}`}>
                          Assigned · {s.assigned_batch_label || 'another batch'}
                        </span>
                      ) : s.assigned_batch_id ? (
                        <span className={styles.currentBadge}>In this batch</span>
                      ) : (
                        <span className={styles.availableBadge}>Available</span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className={styles.actions}>
            <button className={styles.btn} disabled={savingAssign} onClick={handleAssign}>
              {savingAssign ? 'Saving...' : 'Save Assignment'}
            </button>
            <button className={styles.btnSecondary} onClick={() => setAssigning(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {editing && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Edit Batch</h3>
          <form onSubmit={handleEdit} className={styles.row}>
            <input
              className={styles.input}
              value={editForm.batch_label}
              onChange={(e) => setEditForm({ ...editForm, batch_label: e.target.value })}
              required
            />
            <input
              className={styles.input}
              type="number"
              min="1"
              value={editForm.max_students}
              onChange={(e) => setEditForm({ ...editForm, max_students: e.target.value })}
              required
            />
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
            <button className={styles.btn} type="submit">
              Save
            </button>
            <button className={styles.btnSecondary} type="button" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default TeacherBatches;