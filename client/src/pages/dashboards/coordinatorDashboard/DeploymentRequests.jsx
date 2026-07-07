import { useEffect, useState } from 'react';
import {
  getMyDeploymentRequests,
  getSupervisors,
  getCompletedStudents,
  createDeploymentRequest,
  deleteDeploymentRequest,
  getDeploymentRequestStudents,
  fulfillSupervisorRequest,
} from '../../../api/coordinatorApi';
import styles from './CoordinatorDashboard.module.css';

const statusBadge = (status) => {
  const map = {
    pending: styles.badgePending,
    approved: styles.badgeApproved,
    rejected: styles.badgeRejected,
    fulfilled: styles.badgeVerified,
  };
  return map[String(status || '').toLowerCase()] || styles.badgePending;
};

function DeploymentRequests() {
  const [requests, setRequests] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [completed, setCompleted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [form, setForm] = useState({ supervisor_id: '', batch_label: '', strand: '', notes: '', student_ids: [] });
  const [creating, setCreating] = useState(false);

  const [viewing, setViewing] = useState(null);
  const [viewStudents, setViewStudents] = useState([]);

  const [fulfilling, setFulfilling] = useState(null);
  const [fulfillStudents, setFulfillStudents] = useState([]);
  const [savingFulfill, setSavingFulfill] = useState(false);

  const loadRequests = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getMyDeploymentRequests();
      setRequests(data.deployment_requests || []);
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
        const data = await getMyDeploymentRequests();
        if (mounted) setRequests(data.deployment_requests || []);
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

  useEffect(() => {
    getSupervisors('approved')
      .then((d) => setSupervisors(d.supervisors || []))
      .catch(() => {});
    getCompletedStudents()
      .then((d) => setCompleted(d.students || []))
      .catch(() => {});
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      await createDeploymentRequest({
        supervisor_id: Number(form.supervisor_id),
        batch_label: form.batch_label,
        strand: form.strand || null,
        notes: form.notes || null,
        student_ids: form.student_ids.map((id) => Number(id)),
      });
      setMessage('Deployment request created.');
      setForm({ supervisor_id: '', batch_label: '', strand: '', notes: '', student_ids: [] });
      loadRequests();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const toggleStudent = (id) => {
    setForm((prev) => ({
      ...prev,
      student_ids: prev.student_ids.includes(id)
        ? prev.student_ids.filter((x) => x !== id)
        : [...prev.student_ids, id],
    }));
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this deployment request?')) return;
    try {
      await deleteDeploymentRequest(id);
      setMessage('Deployment request deleted.');
      loadRequests();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleView = async (id) => {
    try {
      const data = await getDeploymentRequestStudents(id);
      setViewStudents(data.students || []);
      setViewing(id);
    } catch (err) {
      setError(err.message);
    }
  };

  const openFulfill = (req) => {
    setFulfilling(req);
    setFulfillStudents([]);
  };

  const toggleFulfillStudent = (id) => {
    setFulfillStudents((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleFulfill = async () => {
    if (!fulfilling) return;
    if (fulfilling.num_students && fulfillStudents.length !== Number(fulfilling.num_students)) {
      setError(`Select exactly ${fulfilling.num_students} students.`);
      return;
    }
    setSavingFulfill(true);
    setError('');
    try {
      await fulfillSupervisorRequest(fulfilling.id, fulfillStudents.map((id) => Number(id)));
      setMessage('Supervisor request fulfilled.');
      setFulfilling(null);
      loadRequests();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingFulfill(false);
    }
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2>Deployment Requests</h2>
        <p>Request student deployments to supervisors and fulfill incoming supervisor requests.</p>
      </div>

      {message && <div className={styles.message}>{message}</div>}
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>New Deployment Request</h3>
        <form onSubmit={handleCreate}>
          <div className={styles.row}>
            <select
              className={styles.select}
              value={form.supervisor_id}
              onChange={(e) => setForm({ ...form, supervisor_id: e.target.value })}
              required
            >
              <option value="">Select Supervisor</option>
              {supervisors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.first_name} {s.last_name} ({s.company_name})
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
          <p className={styles.muted} style={{ marginTop: 12 }}>
            Select students with completed requirements ({form.student_ids.length} selected):
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
                </tr>
              </thead>
              <tbody>
                {completed.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={form.student_ids.includes(s.id)}
                        onChange={() => toggleStudent(s.id)}
                      />
                    </td>
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
          <div className={styles.actions}>
            <button className={styles.btn} disabled={creating} type="submit">
              {creating ? 'Creating...' : 'Create Request'}
            </button>
          </div>
        </form>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>My Requests ({requests.length})</h3>
        {loading ? (
          <p className={styles.loading}>Loading...</p>
        ) : requests.length === 0 ? (
          <p className={styles.empty}>No deployment requests yet.</p>
        ) : (
          requests.map((r) => (
            <div key={r.id} className={styles.listItem}>
              <div className={styles.row}>
                <div>
                  <h4>
                    {r.batch_label} — {r.supervisor_first_name} {r.supervisor_last_name}
                  </h4>
                  <p className={styles.muted}>
                    {r.direction === 'supervisor_to_coordinator' ? 'Incoming (supervisor)' : 'Outgoing (to supervisor)'} ·{' '}
                    {r.student_count} students
                    {r.strand ? ` · ${r.strand}` : ''}
                  </p>
                </div>
                <div className={styles.actions}>
                  <span className={`${styles.badge} ${statusBadge(r.status)}`}>{r.status}</span>
                  <button className={styles.btnGhost} onClick={() => handleView(r.id)}>
                    View Students
                  </button>
                  {r.direction === 'supervisor_to_coordinator' && r.status !== 'fulfilled' && (
                    <button className={styles.btn} onClick={() => openFulfill(r)}>
                      Fulfill
                    </button>
                  )}
                  {/* Delete removed: coordinator should not delete supervisor deployment requests */}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {viewing && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Request Students</h3>
          {viewStudents.length === 0 ? (
            <p className={styles.empty}>No students in this request.</p>
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
            <button className={styles.btnSecondary} onClick={() => setViewing(null)}>
              Close
            </button>
          </div>
        </div>
      )}

      {fulfilling && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>
            Fulfill Request — {fulfilling.batch_label} (need {fulfilling.num_students})
          </h3>
          <p className={styles.muted}>{fulfillStudents.length} selected.</p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th></th>
                  <th>Student ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Strand</th>
                </tr>
              </thead>
              <tbody>
                {completed.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={fulfillStudents.includes(s.id)}
                        onChange={() => toggleFulfillStudent(s.id)}
                      />
                    </td>
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
          <div className={styles.actions}>
            <button className={styles.btn} disabled={savingFulfill} onClick={handleFulfill}>
              {savingFulfill ? 'Saving...' : 'Submit Fulfillment'}
            </button>
            <button className={styles.btnSecondary} onClick={() => setFulfilling(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DeploymentRequests;
