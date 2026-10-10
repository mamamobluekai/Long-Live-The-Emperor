import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getCompletedStudents,
  getTeacherBatch,
  assignStudentsToBatch,
} from '../../../api/coordinatorApi';
import { ArrowLeft, Send, X, Search } from 'lucide-react';
import styles from './DeployStudents.module.css';

const STRANDS = ['STEM', 'ABM', 'HUMSS', 'GAS', 'TVL', 'Arts and Design', 'Sports'];

function DeployStudents() {
  const { batchId } = useParams();
  const navigate = useNavigate();

  const [batch, setBatch] = useState(null);
  const [completed, setCompleted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [savingAssign, setSavingAssign] = useState(false);
  const [assignError, setAssignError] = useState('');

  const [selectedStudents, setSelectedStudents] = useState([]);
  const [strandFilter, setStrandFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');

  useEffect(() => {
    if (!batchId) return undefined;
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [batchRes, completedRes] = await Promise.all([
          getTeacherBatch(batchId),
          getCompletedStudents(),
        ]);
        if (!mounted) return;
        const loadedBatch = batchRes.batch || null;
        setBatch(loadedBatch);
        setCompleted(completedRes.students || []);
        setSelectedStudents((loadedBatch?.students || []).map((s) => s.student_id || s.id));
      } catch (err) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [batchId]);

  // Reload only the batch (kept after deploying so the counts stay in sync).
  const reloadBatch = async () => {
    try {
      const res = await getTeacherBatch(batchId);
      const loadedBatch = res.batch || null;
      setBatch(loadedBatch);
      setSelectedStudents((loadedBatch?.students || []).map((s) => s.student_id || s.id));
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleStudent = (id) => {
    setSelectedStudents((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleAssign = async () => {
    if (!batch) return;
    setAssignError('');
    if (selectedStudents.length > batch.max_students) {
      setAssignError(`Selected ${selectedStudents.length} exceeds max ${batch.max_students}.`);
      return;
    }
    setSavingAssign(true);
    setError('');
    try {
      await assignStudentsToBatch(
        batch.id,
        selectedStudents.map((id) => Number(id))
      );
      setMessage('Students deployed successfully.');
      await reloadBatch();
    } catch (err) {
      setAssignError(err.message);
    } finally {
      setSavingAssign(false);
    }
  };

  const handleBack = () => {
    navigate('/dashboard/coordinator/batches');
  };

  // Only students who are still deployable are listed: those with no batch at
  // all, plus the ones already placed in THIS batch (so the coordinator can
  // keep or drop them). Anyone deployed to a different batch is excluded — the
  // server rejects re-assigning them anyway, and leaving them visible only
  // made the list confusing to read while batching.
  const filteredStudents = useMemo(() => {
    const myBatchId = batch ? Number(batch.id) : null;

    return completed
      .filter((s) => !s.assigned_batch_id || Number(s.assigned_batch_id) === myBatchId)
      .filter((s) => {
        if (strandFilter && s.strand !== strandFilter) return false;
        if (searchFilter) {
          const q = searchFilter.toLowerCase();
          const matchesName = `${s.first_name} ${s.last_name}`.toLowerCase().includes(q);
          const matchesId = (s.student_id || '').toLowerCase().includes(q);
          const matchesEmail = (s.email || '').toLowerCase().includes(q);
          if (!matchesName && !matchesId && !matchesEmail) return false;
        }
        return true;
      });
  }, [completed, strandFilter, searchFilter, batch]);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  if (!batch) {
    return (
      <div className={styles.page}>
        <div className={styles.error}>Batch not found.</div>
        <button className={styles.btnBack} onClick={handleBack}>
          <ArrowLeft size={18} /> Back to batches
        </button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Deploy students</h1>
          <p className={styles.subtitle}>
            {batch.batch_label} — {batch.teacher?.first_name} {batch.teacher?.last_name}
          </p>
          <p className={styles.meta}>
            {batch.students?.length || 0}/{batch.max_students} students assigned
            {batch.supervisor ? ` · Supervisor: ${batch.supervisor.first_name} ${batch.supervisor.last_name}` : ''}
          </p>
        </div>
        <button className={styles.btnBack} onClick={handleBack}>
          <ArrowLeft size={18} /> Back
        </button>
      </div>

      {message && <div className={styles.message}>{message}</div>}
      {error && <div className={styles.error}>{error}</div>}
      {assignError && <div className={styles.error}>{assignError}</div>}

      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <label htmlFor="strand-filter" className={styles.filterLabel}>Strand</label>
          <select
            id="strand-filter"
            className={styles.filterSelect}
            value={strandFilter}
            onChange={(e) => setStrandFilter(e.target.value)}
          >
            <option value="">All Strands</option>
            {STRANDS.map((strand) => (
              <option key={strand} value={strand}>{strand}</option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label htmlFor="search-filter" className={styles.filterLabel}>Search</label>
          <div className={styles.searchWrapper}>
            <Search size={16} className={styles.searchIcon} />
            <input
              id="search-filter"
              type="text"
              className={styles.filterInput}
              placeholder="Search by name, ID, or email..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />
          </div>
        </div>
        <div className={styles.selectionInfo}>
          <strong>{selectedStudents.length}</strong> of max {batch.max_students} selected
          <span>
            Students already deployed to another batch are not listed. Uncheck a
            student to remove them from this batch.
          </span>
        </div>
      </div>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.checkCol}></th>
              <th>Student ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Strand</th>
              <th>Batch Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.length === 0 && (
              <tr>
                <td colSpan="6" className={styles.empty}>
                  No students with completed requirements.
                </td>
              </tr>
            )}
            {filteredStudents.map((s) => {
              const assignmentId = s.student_id || s.id;
              const inThisBatch = Boolean(s.assigned_batch_id);
              return (
                <tr key={assignmentId} className={inThisBatch ? styles.rowInBatch : undefined}>
                  <td className={styles.checkCol}>
                    <input
                      type="checkbox"
                      checked={selectedStudents.includes(assignmentId)}
                      onChange={() => toggleStudent(assignmentId)}
                    />
                  </td>
                  <td>{s.student_id}</td>
                  <td>
                    {s.first_name} {s.last_name}
                  </td>
                  <td>{s.email}</td>
                  <td>{s.strand || '-'}</td>
                  <td>
                    {inThisBatch ? (
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

      <div className={styles.floatingBar}>
        <button className={styles.btnCancel} type="button" onClick={handleBack}>
          <X size={18} /> Cancel
        </button>
        <button
          className={styles.btnDeploy}
          type="button"
          disabled={savingAssign || selectedStudents.length === 0}
          onClick={handleAssign}
        >
          <Send size={18} />
          {savingAssign ? 'Deploying...' : `Deploy ${selectedStudents.length} student${selectedStudents.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}

export default DeployStudents;
