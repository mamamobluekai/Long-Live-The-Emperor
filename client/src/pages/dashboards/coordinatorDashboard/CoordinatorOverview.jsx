import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, ChevronRight, RefreshCw } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getCoordinatorDashboard } from '../../../api/coordinatorApi';
import { useAuth } from '../../../context/AuthContext';
import styles from './CoordinatorOverview.module.css';

const ROUTES = {
  students: '/dashboard/coordinator/students',
  requirements: '/dashboard/coordinator/requirements',
  batches: '/dashboard/coordinator/batches',
  supervisors: '/dashboard/coordinator/supervisors',
};

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function getAttentionItems({ approvals, requirements, batches, deploymentRequests }) {
  const items = [];

  if (Number(approvals.pending || 0) > 0) {
    items.push({
      id: 'approvals',
      type: 'Approvals',
      title: `${approvals.pending} student account${Number(approvals.pending) === 1 ? '' : 's'} awaiting approval`,
      detail: 'Review pending accounts so students can start their immersion.',
      action: 'Review',
      to: ROUTES.students,
      tone: 'urgent',
    });
  }

  if (Number(requirements.pendingReview || 0) > 0) {
    items.push({
      id: 'requirements',
      type: 'Requirements',
      title: `${requirements.pendingReview} submission${Number(requirements.pendingReview) === 1 ? '' : 's'} need review`,
      detail: 'Requirement documents are waiting for your decision.',
      action: 'Open',
      to: ROUTES.requirements,
      tone: 'urgent',
    });
  }

  if (Number(batches.withoutSupervisor || 0) > 0) {
    items.push({
      id: 'supervisors',
      type: 'Batches',
      title: `${batches.withoutSupervisor} batch${Number(batches.withoutSupervisor) === 1 ? '' : 'es'} without a supervisor`,
      detail: 'Assign a supervisor so deployed students have a point of contact.',
      action: 'Assign',
      to: ROUTES.batches,
      tone: 'info',
    });
  }

  if (Number(deploymentRequests.pending || 0) > 0) {
    items.push({
      id: 'deployment',
      type: 'Deployment',
      title: `${deploymentRequests.pending} deployment request${Number(deploymentRequests.pending) === 1 ? '' : 's'} in progress`,
      detail: 'Follow up on requests sent to supervisors.',
      action: 'View',
      to: ROUTES.supervisors,
      tone: 'info',
    });
  }

  return items.slice(0, 4);
}

function LoadingCard() {
  return (
    <div className={styles.loadingCard} role="status">
      <span className={styles.loadingPulse} />
      <span>Preparing your overview...</span>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className={styles.errorState} role="alert">
      <AlertCircle size={20} />
      <span>{message}</span>
      <button type="button" onClick={onRetry}>
        <RefreshCw size={15} /> Try again
      </button>
    </div>
  );
}

function AttentionItem({ item }) {
  return (
    <div className={styles.attentionItem}>
      <div className={`${styles.attentionIcon} ${styles[item.tone]}`}>
        {item.tone === 'urgent' ? <AlertCircle size={17} /> : <ChevronRight size={17} />}
      </div>
      <div className={styles.attentionCopy}>
        <span className={styles.attentionType}>{item.type}</span>
        <strong>{item.title}</strong>
        <p>{item.detail}</p>
      </div>
      <Link className={styles.actionLink} to={item.to}>{item.action}<ArrowRight size={14} /></Link>
    </div>
  );
}

function CoordinatorOverview() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getCoordinatorDashboard());
    } catch (err) {
      setError(err.message || 'Unable to load your dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const firstName = user?.first_name || user?.email?.split('@')[0] || 'Coordinator';

  const approvals = useMemo(() => data?.approvals || {}, [data]);
  const requirements = useMemo(() => data?.requirements || {}, [data]);
  const batches = useMemo(() => data?.batches || {}, [data]);
  const deploymentRequests = useMemo(() => data?.deploymentRequests || {}, [data]);
  const requirementsTrend = useMemo(() => data?.requirementsTrend || [], [data]);

  const attentionItems = useMemo(
    () => getAttentionItems({ approvals, requirements, batches, deploymentRequests }),
    [approvals, requirements, batches, deploymentRequests],
  );


  return (
    <div className={styles.dashboard}>
      <section className={styles.greeting}>
        <div>
          <h1>
            {getGreeting()}, {firstName}! <span aria-hidden="true">👋</span>
          </h1>
          <p>Stay on top of today’s priorities with a quick overview of approvals, student requirements, and batch activities.
          </p>
        </div>
      </section>

      {loading && <LoadingCard />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && data && (
        <>

          <div className={styles.contentGrid}>
            <div className={styles.mainColumn}>
              {attentionItems.length > 0 && (
                <section className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div><p className={styles.cardEyebrow}>TAKE ACTION</p><h2>Needs Your Attention</h2></div>
                    {attentionItems.length > 1 && <span className={styles.attentionCount}>{attentionItems.length} items</span>}
                  </div>
                  <div className={styles.attentionList}>
                    {attentionItems.map((item) => <AttentionItem key={item.id} item={item} />)}
                  </div>
                </section>
              )}

              <section className={styles.card}>
                <div className={`${styles.cardHeader} ${styles.chartHeader}`}>
                  <h2>Requirements Trend</h2>
                </div>
                <div className={styles.summaryRow} aria-label="Key coordinator metrics">
                  <div className={styles.summaryItem}><strong>{requirements.pendingReview || 0}</strong><span>Pending review</span></div>
                  <div className={styles.summaryItem}><strong>{requirements.approved || 0}</strong><span>Approved</span></div>
                </div>
                <div className={styles.lineChartWrap}>
                  {requirementsTrend.length ? (
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={requirementsTrend} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eadde0" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#596579' }} tickLine={false} axisLine={{ stroke: '#eadde0' }} minTickGap={18} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#596579' }} tickLine={false} axisLine={false} width={28} />
                        <Tooltip contentStyle={{ border: '1px solid #eadde0', borderRadius: 11, fontSize: 12, color: '#172033' }} />
                        <Line type="monotone" dataKey="submitted" name="Submitted" stroke="#be8c3f" strokeWidth={2.2} dot={{ r: 2, fill: '#be8c3f' }} activeDot={{ r: 4 }} />
                        <Line type="monotone" dataKey="approved" name="Approved" stroke="#8b1e2d" strokeWidth={2.2} dot={{ r: 2, fill: '#8b1e2d' }} activeDot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className={styles.emptyState}><p>No requirement activity yet.</p></div>
                  )}
                </div>
                <Link className={styles.reviewButton} to={ROUTES.requirements}>Open requirements review<ArrowRight size={17} /></Link>
              </section>
            </div>

            <section className={styles.roleSection} aria-label="Coordinator responsibilities">
              <div className={styles.roleCard}>
                <p className={styles.cardEyebrow}>STUDENT APPROVALS</p>
                <p>Review and approve student accounts so learners can access the work immersion system and begin submitting requirements.</p>
              </div>
              <div className={styles.roleCard}>
                <p className={styles.cardEyebrow}>REQUIREMENTS REVIEW</p>
                <p>Check submitted documents, provide feedback, and mark requirements as approved, under review, or needing revision.</p>
              </div>
              <div className={styles.roleCard}>
                <p className={styles.cardEyebrow}>PLACEMENT COORDINATION</p>
                <p>Organize teacher batches, monitor capacity, and coordinate deployment requests to support student immersion placement.</p>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

export default CoordinatorOverview;
