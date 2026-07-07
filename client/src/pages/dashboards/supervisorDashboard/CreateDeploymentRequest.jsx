import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCoordinators, createSupervisorRequest } from '../../../api/coordinatorApi';
import styles from './SupervisorDashboard.module.css';
import '../../../styles/feedback.css';

function CreateDeploymentRequest() {
  const navigate = useNavigate();
  const [coordinators, setCoordinators] = useState([]);
  // const [loading, setLoading] = useState(true); // (unused)
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    coordinator_id: '',
    batch_label: '',
    strand: '',
    num_students: '',
    notes: '',
  });

  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        // setLoading(true);
        setError('');
        const data = await getCoordinators();
        if (mounted) setCoordinators(data.coordinators || []);
      } catch (e) {
        if (mounted) setError(e.message);
      } finally {
        // if (mounted) setLoading(false);
      }
    };
    run();
    return () => {
      mounted = false;
    };
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
      navigate('/dashboard/supervisor/my-requests');
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2>Create Deployment Request</h2>
        <p>
          Tell the coordinator how many students you need. The coordinator will assign the students for you.
        </p>
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
        <h3 className={styles.sectionTitle}>Request Details</h3>
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
            <button
              className={styles.btnSecondary}
              type="button"
              onClick={() => navigate('/dashboard/supervisor')}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateDeploymentRequest;
