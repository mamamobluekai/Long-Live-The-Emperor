import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  ClipboardCheck,
  FileCheck2,
  Layers3,
  RefreshCw,
  UserCheck,
  Users,
} from 'lucide-react';
import { getCoordinatorDashboard } from '../../../api/coordinatorApi';
import styles from './CoordinatorOverview.module.css';

const requirementSegments = [
  { key: 'pendingReview', label: 'Pending review', color: '#e09f3e' },
  { key: 'underReview', label: 'Under review', color: '#4f7cac' },
  { key: 'approved', label: 'Approved', color: '#3f8f6b' },
  { key: 'needsRevision', label: 'Needs revision', color: '#bd5b55' },
  { key: 'rejected', label: 'Rejected', color: '#7b8794' },
];

const formatDate = (value) => new Date(value).toLocaleDateString(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const requestStatusClass = (status) => styles[`status${String(status || '').toLowerCase()}`] || styles.statusDefault;

function MetricCard({ icon: Icon, label, value, detail, to, tone }) {
  return (
    <Link to={to} className={`${styles.metricCard} ${styles[tone] || ''}`}>
      <div className={styles.metricIcon}><Icon size={19} strokeWidth={2} /></div>
      <div className={styles.metricCopy}>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
      <ArrowUpRight className={styles.metricArrow} size={18} />
    </Link>
  );
}

function CoordinatorOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getCoordinatorDashboard());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return <div className={styles.state}><div className={styles.spinner} /><p>Preparing your overview...</p></div>;
  }

  if (error) {
    return (
      <div className={styles.state}>
        <p className={styles.error}>{error}</p>
        <button type="button" className={styles.retryButton} onClick={load}><RefreshCw size={16} /> Retry</button>
      </div>
    );
  }

  const requirements = data?.requirements || {};
  const batches = data?.batches || {};
  const deploymentRequests = data?.deploymentRequests || {};
  const totalRequirements = requirementSegments.reduce((sum, segment) => sum + Number(requirements[segment.key] || 0), 0);
  const assignedPercent = batches.capacity ? Math.round((batches.assignedStudents / batches.capacity) * 100) : 0;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>WORK IMMERSION OFFICE</p>
          <h1>Coordinator overview</h1>
          <p className={styles.subtitle}>A quick read on the work waiting for your attention today.</p>
        </div>
        <button type="button" className={styles.refreshButton} onClick={load} title="Refresh overview">
          <RefreshCw size={16} /> Refresh
        </button>
      </header>

      <section className={styles.metricGrid} aria-label="Coordinator metrics">
        <MetricCard icon={Users} label="Pending approvals" value={data.approvals.pending} detail="Student accounts" to="/dashboard/coordinator/students" tone="amber" />
        <MetricCard icon={ClipboardCheck} label="Needs review" value={requirements.pendingReview} detail="Requirement submissions" to="/dashboard/coordinator/requirements" tone="blue" />
        <MetricCard icon={FileCheck2} label="Ready to assign" value={requirements.completed} detail="Completed requirements" to="/dashboard/coordinator/batches" tone="green" />
        <MetricCard icon={UserCheck} label="Open requests" value={deploymentRequests.pending} detail="Awaiting supervisor action" to="/dashboard/coordinator" tone="rose" />
      </section>

      <div className={styles.contentGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div><p className={styles.panelKicker}>PIPELINE</p><h2>Requirements status</h2></div>
            <span className={styles.totalBadge}>{totalRequirements} total</span>
          </div>
          <div className={styles.chartArea}>
            <div className={styles.donut} style={{ '--approved': `${totalRequirements ? (requirements.approved / totalRequirements) * 100 : 0}%` }}>
              <div><strong>{requirements.approved || 0}</strong><span>approved</span></div>
            </div>
            <div className={styles.legend}>
              {requirementSegments.map((segment) => (
                <div className={styles.legendRow} key={segment.key}>
                  <span className={styles.legendDot} style={{ backgroundColor: segment.color }} />
                  <span>{segment.label}</span>
                  <strong>{requirements[segment.key] || 0}</strong>
                </div>
              ))}
            </div>
          </div>
          <Link to="/dashboard/coordinator/requirements" className={styles.panelLink}>Open requirements review <ArrowUpRight size={15} /></Link>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div><p className={styles.panelKicker}>PLACEMENT</p><h2>Batch capacity</h2></div>
            <Layers3 size={20} className={styles.headingIcon} />
          </div>
          <div className={styles.capacityNumber}><strong>{batches.availableSlots}</strong><span>open slots</span></div>
          <div className={styles.capacityBar} aria-label={`${assignedPercent}% of batch capacity assigned`}><span style={{ width: `${Math.min(assignedPercent, 100)}%` }} /></div>
          <div className={styles.capacityMeta}><span>{batches.assignedStudents} assigned</span><span>{batches.capacity} total capacity</span></div>
          <div className={styles.batchFacts}>
            <div><strong>{batches.total}</strong><span>Teacher batches</span></div>
            <div><strong>{batches.withoutSupervisor}</strong><span>Need supervisor</span></div>
          </div>
          <Link to="/dashboard/coordinator/batches" className={styles.panelLink}>Manage batches <ArrowUpRight size={15} /></Link>
        </section>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div><p className={styles.panelKicker}>FOLLOW-UP QUEUE</p><h2>Recent deployment requests</h2></div>
          <Link to="/dashboard/coordinator/supervisors" className={styles.textLink}>View supervisors <ArrowUpRight size={15} /></Link>
        </div>
        {data.recentRequests?.length ? (
          <div className={styles.requestList}>
            {data.recentRequests.map((request) => (
              <div className={styles.requestRow} key={request.id}>
                <div className={styles.requestMark}><Users size={17} /></div>
                <div className={styles.requestInfo}><strong>{request.batch_label}</strong><span>{request.supervisor_company || `${request.supervisor_first_name || ''} ${request.supervisor_last_name || ''}`.trim() || 'Supervisor'} · {request.num_students} students</span></div>
                <span className={`${styles.status} ${requestStatusClass(request.status)}`}>{request.status}</span>
                <time>{formatDate(request.created_at)}</time>
              </div>
            ))}
          </div>
        ) : <p className={styles.empty}>No deployment requests yet.</p>}
      </section>
    </div>
  );
}

export default CoordinatorOverview;
