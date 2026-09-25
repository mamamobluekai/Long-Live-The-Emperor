import { useEffect, useState } from 'react';
import { getSupervisors } from '../../../api/coordinatorApi';
import { User, Mail, Briefcase, BriefcaseBusiness, Phone, Calendar } from 'lucide-react';
import styles from './Supervisors.module.css';

const statusBadge = (status) => {
  const map = {
    pending: styles.badgePending,
    accepted: styles.badgeAccepted,
    rejected: styles.badgeRejected,
    disapproved: styles.badgeRejected,
  };
  return map[String(status || '').toLowerCase()] || styles.badgePending;
};

function Supervisors() {
  const [supervisors, setSupervisors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSupervisor, setSelectedSupervisor] = useState(null);

  useEffect(() => {
    let mounted = true;
    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await getSupervisors();
        if (mounted) setSupervisors(data.supervisors || []);
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

  const openModal = (supervisor) => {
    setSelectedSupervisor(supervisor);
  };

  const closeModal = () => {
    setSelectedSupervisor(null);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2>Work Immersion Supervisors</h2>
        <p>
          A verified registry of accepted industry supervisors responsible for the
          oversight, mentorship, and performance evaluation of students undergoing
          Work Immersion, organized according to their assigned teacher batch.
        </p>
      </div>
      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.section}>
        {loading ? (
          <p className={styles.loading}>Loading supervisors...</p>
        ) : supervisors.length === 0 ? (
          <p className={styles.empty}>No supervisors found.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Company</th>
                  <th>Designation</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {supervisors.map((s) => (
                  <tr key={s.id} onClick={() => openModal(s)} className={styles.clickableRow}>
                    <td>
                      {s.first_name} {s.last_name}
                    </td>
                    <td>{s.email}</td>
                    <td>{s.company_name || '-'}</td>
                    <td>{s.designation || '-'}</td>
                    <td>
                      <span className={`${styles.badge} ${statusBadge(s.status)}`}>
                        {s.status === 'approved' ? 'Accepted' : s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Supervisor Detail Modal */}
      {selectedSupervisor && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalAvatar}>
                <User size={28} />
              </div>
              <div>
                <h3>{selectedSupervisor.first_name} {selectedSupervisor.last_name}</h3>
                <span className={`${styles.badge} ${statusBadge(selectedSupervisor.status)}`}>
                  {selectedSupervisor.status === 'approved' ? 'Accepted' : selectedSupervisor.status}
                </span>
              </div>
              <button className={styles.modalClose} onClick={closeModal} aria-label="Close">
                <span>×</span>
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.detailGrid}>
                <div className={styles.detailItem}>
                  <label>Email</label>
                  <div className={styles.detailValue}>
                    <Mail size={16} />
                    <span>{selectedSupervisor.email}</span>
                  </div>
                </div>
                <div className={styles.detailItem}>
                  <label>Phone</label>
                  <div className={styles.detailValue}>
                    <Phone size={16} />
                    <span>{selectedSupervisor.phone || 'Not provided'}</span>
                  </div>
                </div>
                <div className={styles.detailItem}>
                  <label>Company</label>
                  <div className={styles.detailValue}>
                    <Briefcase size={16} />
                    <span>{selectedSupervisor.company_name || 'Not provided'}</span>
                  </div>
                </div>
                <div className={styles.detailItem}>
                  <label>Designation</label>
                  <div className={styles.detailValue}>
                    <BriefcaseBusiness size={16} />
                    <span>{selectedSupervisor.designation || 'Not provided'}</span>
                  </div>
                </div>
                <div className={styles.detailItem}>
                  <label>Status</label>
                  <div className={styles.detailValue}>
                    <span className={`${styles.badge} ${statusBadge(selectedSupervisor.status)}`}>
                      {selectedSupervisor.status === 'approved' ? 'Accepted' : selectedSupervisor.status}
                    </span>
                  </div>
                </div>
                <div className={styles.detailItem}>
                  <label>Registered</label>
                  <div className={styles.detailValue}>
                    <Calendar size={16} />
                    <span>{formatDate(selectedSupervisor.created_at)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Supervisors;
