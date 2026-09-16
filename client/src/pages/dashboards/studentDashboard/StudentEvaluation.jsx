import { useEffect, useState } from 'react';
import { getMyEvaluation, getEvaluationCriteria } from '../../../api/evaluationApi';
import styles from '../supervisorDashboard/SupervisorEvaluation.module.css';

const RATING_SCALE = [
  { value: 5, label: 'Outstanding', desc: 'Exceeds required standard' },
  { value: 4, label: 'Very Satisfactory', desc: 'Fully meets job requirements' },
  { value: 3, label: 'Satisfactory', desc: 'Meets required standard with minimal supervision' },
  { value: 2, label: 'Fair', desc: 'Partially meets required standard' },
  { value: 1, label: 'Needs Improvement', desc: 'Does not meet required standard' },
  { value: 'N/A', label: 'Not Applicable', desc: 'Indicator does not apply to the task' },
];

function StudentEvaluation() {
  const [evaluation, setEvaluation] = useState(null);
  const [criteria, setCriteria] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [evalData, criteriaData] = await Promise.all([
          getMyEvaluation(),
          getEvaluationCriteria(),
        ]);
        if (!cancelled) {
          // Handle the evaluation response
          if (evalData.evaluation) {
            // Convert category_scores array to object keyed by category_id if needed
            const ev = evalData.evaluation;
            if (Array.isArray(ev.category_scores)) {
              const scoresByCategory = {};
              ev.category_scores.forEach(cat => {
                scoresByCategory[String(cat.category_id)] = cat;
              });
              ev.category_scores = scoresByCategory;
            }
          }
          setEvaluation(evalData.evaluation);
          setCriteria(criteriaData.criteria || []);
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

  if (loading) {
    return (
      <div>
        <div className={styles.pageHeader}>
          <h2>Grades</h2>
          <p>View your work immersion grades.</p>
        </div>
        <div className={styles.section}>
          <p className={styles.loading}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!evaluation) {
    return (
      <div>
        <div className={styles.pageHeader}>
          <h2>Grades</h2>
          <p>View your work immersion grades.</p>
        </div>
        <div className={styles.section}>
          <p className={styles.empty}>No grades have been submitted for you yet.</p>
        </div>
      </div>
    );
  }

  const categoryScores = evaluation.category_scores || {};
  const overallPercentage = evaluation.overall_percentage || (evaluation.overall_score ? Math.round((evaluation.overall_score / 5) * 10000) / 100 : 0);
  const safeOverallPercentage = Math.min(100, Math.max(0, Number(overallPercentage) || 0));

  const gradeLabel = safeOverallPercentage >= 90 ? 'Outstanding' :
                     safeOverallPercentage >= 80 ? 'Very Satisfactory' :
                     safeOverallPercentage >= 75 ? 'Satisfactory' :
                     safeOverallPercentage >= 70 ? 'Fair' :
                     safeOverallPercentage >= 0 ? 'Needs Improvement' : 'N/A';

  const getProgressColor = (value) => {
    if (value >= 90) return '#22c55e';
    if (value >= 80) return '#3b82f6';
    if (value >= 70) return '#f59e0b';
    return '#ef4444';
  };

  const categoryEntries = criteria.map((cat) => {
    const catData = categoryScores[String(cat.id)] || {};
    const categoryPercentage = Number(catData.category_percentage || 0);
    return {
      id: cat.id,
      name: cat.category_name,
      percentage: Math.min(100, Math.max(0, categoryPercentage)),
    };
  });

  const strongCategories = categoryEntries.filter((item) => item.percentage >= 80).length;

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2>Grades</h2>
        <p>View your work immersion grades and evaluation criteria.</p>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.section}>
        <div className={styles.summaryCard}>
          <div
            className={styles.overallProgressRing}
            style={{
              background: `conic-gradient(${getProgressColor(safeOverallPercentage)} ${safeOverallPercentage * 3.6}deg, #e2e8f0 0deg)`,
            }}
          >
            <div className={styles.overallProgressInner}>
              <span>{safeOverallPercentage}%</span>
            </div>
          </div>

          <div className={styles.summaryStatusWrap}>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Overall Rating</span>
              <span className={styles.summaryValue}>{safeOverallPercentage}%</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Grade</span>
              <span className={styles.summaryValue}>{gradeLabel}</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Date Evaluated</span>
              <span className={styles.summaryValue}>
                {evaluation.created_at
                  ? new Date(evaluation.created_at).toLocaleDateString()
                  : 'N/A'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Performance Overview</h3>
        <div className={styles.performanceGrid}>
          <div className={styles.performanceCard}>
            <span className={styles.performanceLabel}>Strong areas</span>
            <strong className={styles.performanceValue}>{strongCategories}</strong>
            <small className={styles.performanceNote}>categories at 80% or higher</small>
          </div>
          <div className={styles.performanceCard}>
            <span className={styles.performanceLabel}>Categories</span>
            <strong className={styles.performanceValue}>{categoryEntries.length}</strong>
            <small className={styles.performanceNote}>evaluation categories</small>
          </div>
          <div className={styles.performanceCard}>
            <span className={styles.performanceLabel}>Rating</span>
            <strong className={styles.performanceValue}>{gradeLabel}</strong>
            <small className={styles.performanceNote}>current performance level</small>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Category Progress</h3>
        <div className={styles.categoryChartList}>
          {categoryEntries.map((category) => (
            <div key={category.id} className={styles.categoryChartRow}>
              <div className={styles.categoryChartHeader}>
                <span>{category.name}</span>
                <strong>{category.percentage}%</strong>
              </div>
              <div className={styles.categoryChartTrack}>
                <div
                  className={styles.categoryChartFill}
                  style={{
                    width: `${category.percentage}%`,
                    background: getProgressColor(category.percentage),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Rating Scale</h3>
        <div className={styles.ratingScaleGrid}>
          {RATING_SCALE.map((r) => (
            <div key={String(r.value)} className={styles.ratingScaleItem}>
              <span className={styles.ratingScaleValue}>{r.value === 'N/A' ? 'N/A' : `${r.value}/5`}</span>
              <span className={styles.ratingScaleLabel}>{r.label}</span>
              <span className={styles.ratingScaleDesc}>{r.desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Evaluator</h3>
        <p className={styles.muted}>
          Evaluated by: {evaluation.evaluator_email || 'Supervisor'} · Batch: {evaluation.batch_id || 'N/A'}
        </p>
      </div>

      {criteria.map((cat) => {
        const catData = categoryScores[String(cat.id)] || {};
        const ratings = Array.isArray(catData.ratings) ? catData.ratings : [];
        const categoryPercentage = catData.category_percentage || 0;
        const indicators = cat.indicators || [];

        return (
          <div key={cat.id} className={styles.section}>
            <h3 className={styles.sectionTitle}>
              {cat.category_name} — {categoryPercentage}%
            </h3>
            {indicators.length === 0 ? (
              <p className={styles.empty}>No indicators available</p>
            ) : (
              <table className={styles.ratingTable}>
                <thead>
                  <tr>
                    <th>Indicator</th>
                    <th style={{ width: 180 }}>Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {indicators.map((ind, indIndex) => (
                    <tr key={indIndex}>
                      <td>{ind}</td>
                      <td>{ratings[indIndex] ? `${ratings[indIndex]}/5` : 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}

      {evaluation.comments && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Comments / Suggestions</h3>
          <p className={styles.muted} style={{ whiteSpace: 'pre-wrap' }}>{evaluation.comments}</p>
        </div>
      )}
    </div>
  );
}

export default StudentEvaluation;
