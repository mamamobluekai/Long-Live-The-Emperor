import { useEffect, useState } from 'react';
import {
  getCoordinators,
  createSupervisorRequest,
  getSupervisorDeploymentRequests,
  getDeploymentRequestStudents,
} from '../../../api/coordinatorApi';
import styles from './SupervisorDashboard.module.css';
import '../../../styles/feedback.css';

function CreateDeploymentRequest() {
  const [coordinators, setCoordinators] = useState([]);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    coordinator_id: '',
    batch_label: '',
    strand: '',
    num_students: '',
    notes: '',
  });
  const [creating, setCreating] = useState(false);

  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [viewing, setViewing] = useState(null);
  const [viewStudents, setViewStudents] = useState([]);

  const loadCoordinators = async () => {
    try {
      setError('');
      const data = await getCoordinators();
      setCoordinators(data.coordinators || []);
    } catch (e) {
      setError(e.message);
    }
  };

  const loadRequests = async () => {
    setLoadingRequests(true);
    setError('');
    try {
      const data = await getSupervisorDeploymentRequests();
      setRequests(data.deployment_requests || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingRequests(false);
    }
  };

  useEffect(() => {
    loadCoordinators();
    loadRequests();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      const num = Number(form.num_students);
      if (!Number.isInteger(num) || num <= 0) {
        setError('Number of students must be a positive integer.');
        setCreating(false);
        return;
      }
      await createSupervisorRequest({
        coordinator_id: Number(form.coordinator_id),
        batch_label: form.batch_label,
        strand: form.strand || null,
        num_students: num,
        notes: form.notes || null,
      });
      setForm({ coordinator_id: '', batch_label: '', strand: '', num_students: '', notes: '' });
      loadRequests();
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleView = async (id) => {
    try {
      const data = await getDeploymentRequestStudents(id);
      setViewStudents(data.students || []);
      setViewing(id);
    } catch (e) {
      setError(e.message);
    }
  };

  const statusBadge = (status) => {
    const map = {
      pending: styles.badgePending,
      approved: styles.badgeApproved,
      rejected: styles.badgeRejected,
      fulfilled: styles.badgeFulfilled,
    };
    return map[String(status || '').toLowerCase()] || styles.badgePending;
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2>Deployment Requests</h2>
        <p>Request students from a coordinator and track the status of your requests.</p>
      </div>

      {error && (
        <div className="wim-toast-container">
          <div className="wim-feedback wim-feedback--error" role="alert">
            <span className="wim-feedback__icon">!</span>
            <div className="wim-feedback__body">{error}</div>
          </div>
        </div>
      )}

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>New Request</h3>
        <form onSubmit={handleSubmit}>
          <div className={styles.row}>
            <select
              className={styles.select}
              value={form.coordinator_id}
              onChange={(e) => setForm({ ...form, coordinator_id: e.target.value })}
              required
            >
              <option value="">Select Coordinator</option>
              {coordinators.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.first_name} {c.last_name}
                  {c.department ? ` (${c.department})` : ''}
                </option>
              ))}
            </select>
            <input
              className={styles.input}
              placeholder="Batch label"
              value={form.batch_label}
              onChange={(e) => setForm({ ...form, batch_label: e.target.value })}
              required
            />
          </div>

          <div className={styles.row} style={{ marginTop: 12 }}>
            <input
              className={styles.input}
              type="number"
              min="1"
              placeholder="Number of students needed"
              value={form.num_students}
              onChange={(e) => setForm({ ...form, num_students: e.target.value })}
              required
            />
            <input
              className={styles.input}
              placeholder="Strand (optional)"
              value={form.strand}
              onChange={(e) => setForm({ ...form, strand: e.target.value })}
            />
          </div>

          <textarea
            className={styles.textarea}
            style={{ width: '100%', marginTop: 12 }}
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />

          <div className={styles.actions}>
            <button className={styles.btn} disabled={creating} type="submit">
              {creating ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>My Requests ({requests.length})</h3>
        {loadingRequests ? (
          <p className={styles.loading}>Loading...</p>
        ) : requests.length === 0 ? (
          <p className={styles.empty}>No deployment requests yet.</p>
        ) : (
          <div className={styles.list}>
            {requests.map((r) => (
              <div key={r.id} className={styles.listItem}>
                <div className={styles.row}>
                  <div>
                    <h4>
                      {r.batch_label} — {r.coordinator_first_name} {r.coordinator_last_name}
                    </h4>
                    <p className={styles.muted}>
                      {r.direction === 'supervisor_to_coordinator' ? 'To Coordinator' : 'From Coordinator'} ·{' '}
                      {r.num_students} students needed
                      {r.strand ? ` · ${r.strand}` : ''}
                    </p>
                  </div>
                  <div className={styles.row} style={{ flex: 'none' }}>
                    <span className={`${styles.badge} ${statusBadge(r.status)}`}>{r.status}</span>
                    {r.students && r.students.length > 0 && (
                      <button className={styles.btnSecondary} type="button" onClick={() => handleView(r.id)}>
                        View Students
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {viewing && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Assigned Students</h3>
          {viewStudents.length === 0 ? (
            <p className={styles.empty}>No students assigned yet.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Student ID</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Strand</th>
                  </tr>
                </thead>
                <tbody>
                  {viewStudents.map((s) => (
                    <tr key={s.id}>
                      <td>{s.student_id}</td>
                      <td>
                        {s.first_name} {s.last_name}
                      </td>
                      <td>{s.email}</td>
                      <td>{s.strand || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className={styles.actions}>
            <button className={styles.btnSecondary} type="button" onClick={() => setViewing(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CreateDeploymentRequest;
