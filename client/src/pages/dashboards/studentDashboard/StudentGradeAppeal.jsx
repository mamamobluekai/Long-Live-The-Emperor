import { useEffect, useState } from 'react';
import { FileText, AlertCircle, Clock, CheckCircle, XCircle, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { getMyEvaluation, getEvaluationCriteria } from '../../../api/evaluationApi';
import { submitAppeal, getMyAppeals } from '../../../api/appealApi';
import styles from './StudentGradeAppeal.module.css';

const STATUS_COLORS = {
  pending: '#f59e0b',
  approved: '#22c55e',
  rejected: '#ef4444',
};

const STATUS_LABELS = {
  pending: 'Pending Review',
  approved: 'Approved',
  rejected: 'Rejected',
};

function StudentGradeAppeal() {
  const [evaluation, setEvaluation] = useState(null);
  const [criteria, setCriteria] = useState([]);
  const [appeals, setAppeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showAppealForm, setShowAppealForm] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [appealReason, setAppealReason] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitMessage, setSubmitMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [evalData, criteriaData, appealsData] = await Promise.all([
          getMyEvaluation(),
          getEvaluationCriteria(),
          getMyAppeals(),
        ]);
        if (!cancelled) {
          if (evalData.evaluation) {
            const ev = evalData.evaluation;
            if (Array.isArray(ev.category_scores)) {
              const scoresByCategory = {};
              ev.category_scores.forEach(cat => {
                scoresByCategory[String(cat.category_id)] = cat;
              });
              ev.category_scores = scoresByCategory;
            }
            setEvaluation(ev);
          }
          setCriteria(criteriaData.criteria || []);
          setAppeals(appealsData.appeals || []);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load evaluation data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const categoryScores = evaluation?.category_scores || {};
  const overallPercentage = evaluation?.overall_percentage || (evaluation?.overall_score ? Math.round((evaluation.overall_score / 5) * 10000) / 100 : 0);
  const safeOverallPercentage = Math.min(100, Math.max(0, Number(overallPercentage) || 0));

  const gradeLabel = safeOverallPercentage >= 90 ? 'Outstanding' :
                     safeOverallPercentage >= 80 ? 'Very Satisfactory' :
                     safeOverallPercentage >= 75 ? 'Satisfactory' :
                     safeOverallPercentage >= 70 ? 'Fair' :
                     safeOverallPercentage >= 0 ? 'Needs Improvement' : 'N/A';

  const hasAppealForCategory = (categoryId) => {
    return appeals.some(a => a.category_id === categoryId && a.status !== 'rejected');
  };

  const hasGeneralAppeal = () => {
    return appeals.some(a => a.category_id === null && a.status !== 'rejected');
  };

  async function handleSubmitAppeal(e) {
    e.preventDefault();
    if (!appealReason.trim()) {
      setSubmitError('Please provide a reason for your appeal.');
      return;
    }
    if (!evaluation) {
      setSubmitError('No evaluation found to appeal.');
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    setSubmitMessage('');
    try {
      await submitAppeal({
        evaluationId: evaluation.id,
        categoryId: selectedCategory?.id || null,
        reason: appealReason.trim(),
      });
      setSubmitMessage('Appeal submitted successfully!');
      setAppealReason('');
      setShowAppealForm(false);
      setSelectedCategory(null);
      // Refresh appeals
      const appealsData = await getMyAppeals();
      setAppeals(appealsData.appeals || []);
    } catch (e) {
      setSubmitError(e.message || 'Failed to submit appeal.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  if (!evaluation) {
    return (
      <div className={styles.container}>
        <div className={styles.pageHeader}>
          <h2>Grade Appeal</h2>
          <p>Submit an appeal for your work immersion grades.</p>
        </div>
        <div className={styles.empty}>
          <FileText size={48} />
          <p>No grades have been submitted for you yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h2>Grade Appeal</h2>
        <p>Review your grades and submit an appeal if you believe there's been an error.</p>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {/* Overall Grade Summary */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Current Grade</h3>
        <div className={styles.summaryCard}>
          <div className={styles.overallGrade}>
            <div className={styles.gradeCircle} style={{ background: `conic-gradient(${getProgressColor(safeOverallPercentage)} ${safeOverallPercentage * 3.6}deg, #e2e8f0 0deg)` }}>
              <span>{safeOverallPercentage}%</span>
            </div>
            <div className={styles.gradeInfo}>
              <div className={styles.gradeLabel}>{gradeLabel}</div>
              <div className={styles.gradeMeta}>
                <span>Evaluated: {evaluation.created_at ? new Date(evaluation.created_at).toLocaleDateString() : 'N/A'}</span>
                <span>By: {evaluation.evaluator_email || 'Supervisor'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Category Breakdown with Appeal Buttons */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Category Breakdown</h3>
        <div className={styles.categoryGrid}>
          {criteria.map((cat) => {
            const catData = categoryScores[String(cat.id)] || {};
            const categoryPercentage = Number(catData.category_percentage || 0);
            const hasPendingAppeal = hasAppealForCategory(cat.id);
            const existingAppeal = appeals.find(a => a.category_id === cat.id);

            return (
              <div key={cat.id} className={styles.categoryCard}>
                <div className={styles.categoryHeader}>
                  <h4>{cat.category_name}</h4>
                  <span className={styles.categoryScore}>{categoryPercentage}%</span>
                </div>
                <div className={styles.progressTrack}>
                  <div
                    className={styles.progressFill}
                    style={{
                      width: `${categoryPercentage}%`,
                      background: getProgressColor(categoryPercentage),
                    }}
                  />
                </div>
                <div className={styles.categoryActions}>
                  {hasPendingAppeal ? (
                    <span className={styles.appealBadge} style={{ background: STATUS_COLORS[existingAppeal?.status] }}>
                      {STATUS_LABELS[existingAppeal?.status]}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={styles.appealButton}
                      onClick={() => {
                        setSelectedCategory(cat);
                        setShowAppealForm(true);
                        setAppealReason('');
                        setSubmitError('');
                        setSubmitMessage('');
                      }}
                    >
                      <AlertCircle size={14} /> Appeal
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Appeal Form Modal/Section */}
      {(showAppealForm && selectedCategory) || (showAppealForm && !selectedCategory && !hasGeneralAppeal()) ? (
        <div className={styles.appealFormOverlay} onClick={() => { setShowAppealForm(false); setSelectedCategory(null); }}>
          <div className={styles.appealForm} onClick={(e) => e.stopPropagation()}>
            <div className={styles.appealFormHeader}>
              <h3>Submit Grade Appeal</h3>
              <button
                type="button"
                className={styles.closeButton}
                onClick={() => { setShowAppealForm(false); setSelectedCategory(null); }}
              >
                ×
              </button>
            </div>
            <p className={styles.appealFormSubtitle}>
              {selectedCategory
                ? `Appealing: ${selectedCategory.category_name} (${categoryScores[String(selectedCategory.id)]?.category_percentage || 0}%)`
                : 'Appealing: Overall Grade'
              }
            </p>
            <form onSubmit={handleSubmitAppeal}>
              <textarea
                className={styles.appealTextarea}
                value={appealReason}
                onChange={(e) => setAppealReason(e.target.value)}
                placeholder="Explain why you believe this grade should be reviewed. Provide specific details..."
                rows={5}
                required
              />
              {submitError && <div className={styles.formError}>{submitError}</div>}
              {submitMessage && <div className={styles.formSuccess}>{submitMessage}</div>}
              <div className={styles.formActions}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => { setShowAppealForm(false); setSelectedCategory(null); }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.btnPrimary}
                  disabled={submitting}
                >
                  {submitting ? 'Submitting...' : 'Submit Appeal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Appeal History */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Your Appeal History</h3>
        {appeals.length === 0 ? (
          <div className={styles.empty}>
            <MessageSquare size={48} />
            <p>No appeals submitted yet.</p>
          </div>
        ) : (
          <div className={styles.appealsList}>
            {appeals.map((appeal) => (
              <div key={appeal.id} className={styles.appealItem}>
                <div className={styles.appealItemHeader}>
                  <div className={styles.appealCategory}>
                    <FileText size={16} />
                    <span>{appeal.category_name || 'Overall Grade'}</span>
                  </div>
                  <span
                    className={styles.appealStatus}
                    style={{ background: STATUS_COLORS[appeal.status] }}
                  >
                    {STATUS_LABELS[appeal.status]}
                  </span>
                </div>
                <div className={styles.appealMeta}>
                  <span>Submitted: {new Date(appeal.created_at).toLocaleDateString()}</span>
                  {appeal.reviewed_at && (
                    <span>Reviewed: {new Date(appeal.reviewed_at).toLocaleDateString()}</span>
                  )}
                </div>
                <div className={styles.appealReason}>
                  <strong>Your Reason:</strong>
                  <p>{appeal.reason}</p>
                </div>
                {appeal.supervisor_response && (
                  <div className={styles.appealResponse}>
                    <div className={styles.responseHeader}>
                      <MessageSquare size={16} />
                      <strong>Supervisor Response:</strong>
                    </div>
                    <p>{appeal.supervisor_response}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function getProgressColor(value) {
  if (value >= 90) return '#22c55e';
  if (value >= 80) return '#3b82f6';
  if (value >= 70) return '#f59e0b';
  return '#ef4444';
}

export default StudentGradeAppeal;