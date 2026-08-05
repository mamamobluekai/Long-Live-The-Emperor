import { useEffect, useState } from 'react';
import {
  getPendingCoordinators,
  approveCoordinator,
  rejectCoordinator,
} from '../../../api/adminApi';
import DataTable from '../../../components/admin/DataTable';
import ConfirmModal from '../../../components/admin/ConfirmModal';
import LoadingSkeleton from '../../../components/admin/LoadingSkeleton';
import styles from './Coordinators.module.css';
import { useToast } from '../../../components/admin/ToastContainer';

export default function CoordinatorsPage() {
  const { showToast } = useToast();
  const [coordinators, setCoordinators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionModal, setActionModal] = useState({ open: false, id: null, type: null });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getPendingCoordinators();
      setCoordinators(data.coordinators || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleAction = async () => {
    const { id, type } = actionModal;
    try {
      if (type === 'approve') {
        const data = await approveCoordinator(id);
        showToast(`Coordinator approved. Temp password: ${data.tempPassword || ''}`, 'success', 8000);
      } else {
        await rejectCoordinator(id);
        showToast('Coordinator rejected.', 'success');
      }
      setActionModal({ open: false, id: null, type: null });
      load();
    } catch (err) {
      showToast(err.message, 'error');
      setActionModal({ open: false, id: null, type: null });
    }
  };

  const columns = [
    { key: 'id', header: 'ID' },
    {
      header: 'Name',
      key: 'first_name',
      render: (_, row) => `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.email,
    },
    { key: 'email', header: 'Email' },
    { key: 'employee_id', header: 'Employee ID' },
    { key: 'department', header: 'Department' },
    {
      key: 'created_at',
      header: 'Registered',
      render: (v) => new Date(v).toLocaleDateString(),
    },
  ];

  const actions = (row) => (
    <div className={styles.rowActions}>
      <button
        type="button"
        className={styles.approveBtn}
        onClick={() => setActionModal({ open: true, id: row.id, type: 'approve' })}
        title="Approve"
      >
        Approve
      </button>
      <button
        type="button"
        className={styles.rejectBtn}
        onClick={() => setActionModal({ open: true, id: row.id, type: 'reject' })}
        title="Reject"
      >
        Reject
      </button>
    </div>
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Pending Coordinator Approvals</h2>
        <p>{coordinators.length} pending registration(s)</p>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : (
        <DataTable
          columns={columns}
          data={coordinators}
          actions={actions}
          emptyMessage="No pending coordinator registrations."
        />
      )}

      <ConfirmModal
        isOpen={actionModal.open}
        title={actionModal.type === 'approve' ? 'Approve Coordinator' : 'Reject Coordinator'}
        message={actionModal.type === 'approve'
          ? 'Approve this coordinator? They will receive a temporary password via email.'
          : 'Reject this coordinator registration?'}
        confirmLabel={actionModal.type === 'approve' ? 'Approve' : 'Reject'}
        isDestructive={actionModal.type === 'reject'}
        onConfirm={handleAction}
        onClose={() => setActionModal({ open: false, id: null, type: null })}
      />
    </div>
  );
}
