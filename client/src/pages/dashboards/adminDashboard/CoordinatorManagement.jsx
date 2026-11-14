import { useEffect, useState } from 'react';
import {
  getCoordinatorManagement,
  updateCoordinatorStudentLimit,
  updateCoordinatorStrand,
  getStudentStrands,
} from '../../../api/adminApi';
import { useToast } from '../../../components/admin/toastContext';
import styles from './CoordinatorManagement.module.css';

const STRAND_ALL = 'all-strands';

export default function CoordinatorManagement() {
  const { showToast } = useToast();
  const [coordinators, setCoordinators] = useState([]);
  const [availableStrands, setAvailableStrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // coordinator id being edited
  const [limitInput, setLimitInput] = useState('');
  const [strandInput, setStrandInput] = useState(STRAND_ALL);

  const load = async () => {
    setLoading(true);
    try {
      const [coordData, strandsData] = await Promise.all([
        getCoordinatorManagement(),
        getStudentStrands(),
      ]);
      setCoordinators(coordData.coordinators || []);
      setAvailableStrands(strandsData.strands || []);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSaveLimit = async (coordinator) => {
    const limit = Number(limitInput);
    if (!Number.isInteger(limit) || limit < 0) {
      showToast('Please enter a valid non-negative number.', 'error');
      return;
    }

    if (limit < coordinator.student_count) {
      showToast(
        `Cannot set student limit to ${limit}. ${coordinator.first_name} ${coordinator.last_name} already has ${coordinator.student_count} student(s) assigned. Increase the limit or remove students first.`,
        'error',
      );
      return;
    }

    try {
      await updateCoordinatorStudentLimit(coordinator.id, limit);
      const strand = strandInput === STRAND_ALL ? null : strandInput;
      await updateCoordinatorStrand(coordinator.id, strand);
      showToast(
        `Updated student limit to ${limit} and strand to ${strandInput === STRAND_ALL ? 'All Strands' : strandInput} for ${coordinator.first_name} ${coordinator.last_name}.`,
        'success',
      );
      setEditing(null);
      setLimitInput('');
      setStrandInput(STRAND_ALL);
      load();
    } catch (err) {
      showToast(err.message || 'Failed to update coordinator.', 'error');
    }
  };

  const handleCancelEdit = () => {
    setEditing(null);
    setLimitInput('');
    setStrandInput(STRAND_ALL);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2>Coordinator Management</h2>
          <p>
            Manage coordinators and their student capacity. Each coordinator
            can handle up to their configured student limit and can be
            restricted to a specific strand.
          </p>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <p>Loading coordinators...</p>
        </div>
      ) : coordinators.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>No coordinators found.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Employee ID</th>
                <th>Phone</th>
                <th>Department</th>
                <th>Designation</th>
                <th>Students</th>
                <th>Limit</th>
                <th>Strand</th>
                <th>Registered</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {coordinators.map((c) => {
                const isEditing = editing === c.id;
                const atLimit = c.student_count >= c.student_limit;
                return (
                  <tr key={c.id} className={styles.row}>
                    <td className={styles.nameCell}>
                      <span className={styles.name}>
                        {c.first_name} {c.last_name}
                      </span>
                      <span className={styles.email}>{c.email}</span>
                    </td>
                    <td>{c.employee_id || '—'}</td>
                    <td>{c.phone || '—'}</td>
                    <td>{c.department || '—'}</td>
                    <td>{c.designation || '—'}</td>
                    <td className={styles.countCell}>
                      <span className={`${styles.count} ${atLimit ? styles.atLimit : ''}`}>
                        {c.student_count}
                      </span>
                      <span className={styles.countLabel}>students</span>
                    </td>
                    <td>
                      {isEditing ? (
                        <div className={styles.limitEdit}>
                          <input
                            type="number"
                            min="0"
                            value={limitInput}
                            onChange={(e) => setLimitInput(e.target.value)}
                            placeholder={c.student_limit}
                            className={styles.limitInput}
                          />
                        </div>
                      ) : (
                        <span className={styles.limitValue}>
                          {c.student_limit}
                        </span>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <select
                          value={strandInput}
                          onChange={(e) => setStrandInput(e.target.value)}
                          className={styles.strandSelect}
                        >
                          <option value={STRAND_ALL}>All Strands</option>
                          {availableStrands.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className={styles.strandValue}>
                          {c.strand || 'All Strands'}
                        </span>
                      )}
                    </td>
                    <td>{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</td>
                    <td>
                      <span
                        className={`${styles.statusChip} ${
                          c.status === 'approved' ? styles.statusApproved : styles.statusPending
                        }`}
                      >
                        {c.status === 'approved' ? 'Active' : 'Pending'}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.editBtn}
                        onClick={() => {
                          setEditing(c.id);
                          setLimitInput(String(c.student_limit));
                          setStrandInput(c.strand || STRAND_ALL);
                        }}
                        title="Edit student limit"
                        disabled={c.status !== 'approved'}
                      >
                        {isEditing ? 'Editing' : 'Edit'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className={styles.editBar}>
          <div className={styles.editBarContent}>
            <span className={styles.editBarLabel}>
              Editing coordinator — set student limit and strand, then save:
            </span>
            <div className={styles.editBarControls}>
              <input
                type="number"
                min="0"
                value={limitInput}
                onChange={(e) => setLimitInput(e.target.value)}
                placeholder="Student limit"
                className={styles.limitInput}
              />
              <select
                value={strandInput}
                onChange={(e) => setStrandInput(e.target.value)}
                className={styles.strandSelect}
              >
                <option value={STRAND_ALL}>All Strands</option>
                {availableStrands.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <button
                type="button"
                className={styles.saveBtn}
                onClick={() => {
                  const c = coordinators.find((x) => x.id === editing);
                  if (c) handleSaveLimit(c);
                }}
                disabled={!limitInput.trim()}
              >
                Save
              </button>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={handleCancelEdit}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.note}>
        <p>
          <strong>Student Limit:</strong> The maximum number of students a
          coordinator can manage. When a coordinator reaches their limit, they
          cannot add more students until the limit is increased or students are
          removed. Default limit is 100 students per coordinator.
        </p>
        <p>
          <strong>Strand:</strong> Restricts the coordinator to a specific
          strand (e.g., GAS). When set to "All Strands", the coordinator can
          manage students from any strand.
        </p>
      </div>
    </div>
  );
}
