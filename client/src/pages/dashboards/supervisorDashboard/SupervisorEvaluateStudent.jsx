import { useEffect, useState, useMemo } from 'react';
import {
  getEvaluationCriteria,
  submitStudentEvaluation,
  getStudentEvaluation,
  getSupervisorEvaluationStudents,
} from '../../../api/evaluationApi';
import styles from './SupervisorEvaluation.module.css';

const RATING_OPTIONS = [
  { value: 5, label: '5 - Outstanding' },
  { value: 4, label: '4 - Very Satisfactory' },
  { value: 3, label: '3 - Satisfactory' },
  { value: 2, label: '2 - Fair' },
  { value: 1, label: '1 - Needs Improvement' },
  { value: 'N/A', label: 'N/A' },
];

function SupervisorEvaluateStudent() {
  const [criteria, setCriteria] = useState([]);
  const [students, setStudents] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const [activeStudentId, setActiveStudentId] = useState(null);
  const [ratings, setRatings] = useState({});
  const [comments, setComments] = useState('');
  const [existingEvaluation, setExistingEvaluation] = useState(null);

  const activeStudent = useMemo(
    () => students.find((s) => s.student_id === activeStudentId) || null,
    [students, activeStudentId]
  );

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setError('');
      setMessage('');
      try {
        const [criteriaData, studentsData] = await Promise.all([
          getEvaluationCriteria(),
          getSupervisorEvaluationStudents(),
        ]);
        if (!cancelled) {
          setCriteria(criteriaData.criteria || []);
          setStudents(studentsData.students || []);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!activeStudentId) {
      setExistingEvaluation(null);
      setRatings({});
      setComments('');
      return;
    }
    let cancelled = false;
    async function loadEvaluation() {
      try {
        const data = await getStudentEvaluation(activeStudentId);
        if (!cancelled && data.evaluation) {
          setExistingEvaluation(data.evaluation);
          setComments(data.evaluation.comments || '');
          const loaded = {};
          if (data.evaluation.category_scores) {
            for (const [catId, catData] of Object.entries(data.evaluation.category_scores)) {
              if (catData && Array.isArray(catData.indicators)) {
                loaded[catId] = catData.indicators;
              }
            }
          }
          setRatings(loaded);
        } else if (!cancelled) {
          setExistingEvaluation(null);
          setRatings({});
          setComments('');
        }
      } catch {
        if (!cancelled) {
          setExistingEvaluation(null);
          setRatings({});
          setComments('');
        }
      }
    }
    loadEvaluation();
    return () => { cancelled = true; };
  }, [activeStudentId]);

  function handleRatingChange(categoryId, indicatorIndex, value) {
    setRatings((prev) => {
      const catRatings = [...(prev[categoryId] || [])];
      catRatings[indicatorIndex] = value;
      return { ...prev, [categoryId]: catRatings };
    });
  }

  const computedScores = useMemo(() => {
    const ratingValues = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 'N/A': 0 };

    let totalWeighted = 0;
    let totalCounted = 0;

    const categoryScores = [];
    for (const cat of criteria) {
      const catRatings = ratings[String(cat.id)] || [];
      const indicators = cat.indicators || [];
      let sum = 0;
      let naCount = 0;

      for (let i = 0; i < indicators.length; i++) {
        const r = catRatings[i];
        if (r === 'N/A') naCount++;
        else sum += Number(ratingValues[r] || 0);
      }

      const counted = indicators.length - naCount;
      const categoryScore = counted > 0 ? sum / counted : 0;
      const categoryPercentage = counted > 0 ? Math.round((categoryScore / 5) * 10000) / 100 : 0;

      if (counted > 0) {
        totalWeighted = totalWeighted + sum;
        totalCounted = totalCounted + counted;
      }

      categoryScores.push({
        category_id: cat.id,
        category_name: cat.category_name,
        indicators,
        ratings: catRatings,
        category_score: counted > 0 ? Math.round(categoryScore * 100) / 100 : 0,
        category_percentage: categoryPercentage,
        counted,
      });
    }

    const overallScore = totalCounted > 0 ? Math.round((totalWeighted / totalCounted) * 100) / 100 : 0;
    const overallPercentage = totalCounted > 0 ? Math.round((overallScore / 5) * 10000) / 100 : 0;

    return { category_scores: categoryScores, overall_score: overallScore, overall_percentage: overallPercentage };
  }, [criteria, ratings]);

  const isComplete = useMemo(() => {
    if (!activeStudentId) return false;
    for (const cat of criteria) {
      const catRatings = ratings[String(cat.id)] || [];
      const indicators = cat.indicators || [];
      for (let i = 0; i < indicators.length; i++) {
        if (!catRatings[i]) return false;
      }
    }
    return true;
  }, [criteria, ratings, activeStudentId]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!activeStudentId) {
      setError('Please select a student to evaluate.');
      return;
    }
    if (!isComplete) {
      setError('Please rate all indicators before submitting.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const formattedScores = {};
      for (const [catId, catRatings] of Object.entries(ratings)) {
        formattedScores[catId] = { indicators: catRatings };
      }

      const payload = {
        studentId: Number(activeStudentId),
        batchId: activeStudent ? Number(activeStudent.batch_id) : null,
        categoryScores: formattedScores,
        comments: comments || null,
      };
      const data = await submitStudentEvaluation(payload);
      setMessage(existingEvaluation ? 'Evaluation updated successfully.' : 'Evaluation submitted successfully.');
      setExistingEvaluation(data.evaluation);
      const updatedStudents = students.map((s) =>
        s.student_id === Number(activeStudentId)
          ? { ...s, evaluation: { ...data.evaluation, overall_score: data.evaluation.overall_score } }
          : s
      );
      setStudents(updatedStudents);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function openEvaluation(studentId) {
    setActiveStudentId(studentId);
    setError('');
    setMessage('');
  }

  function closeEvaluation() {
    setActiveStudentId(null);
    setRatings({});
    setComments('');
    setExistingEvaluation(null);
  }

  const evaluatedCount = students.filter((s) => s.evaluation).length;
  const pendingCount = students.length - evaluatedCount;

  return (
    <div>
      <div className={styles.pageHeader}>
        <h2>Evaluate Student</h2>
        <p>Select a student and rate their performance after their 10-day work immersion.</p>
      </div>

      {message && <div className={styles.message}>{message}</div>}
      {error && <div className={styles.error}>{error}</div>}

      {!activeStudentId ? (
        <div className={styles.section}>
          <div className={styles.studentGrid}>
            {students.map((s) => (
              <div key={s.student_id} className={styles.studentCard}>
                <div className={styles.studentCardHeader}>
                  <div>
                    <div className={styles.studentCardName}>
                      {s.first_name} {s.last_name}
                    </div>
                    <div className={styles.studentCardMeta}>
                      {s.student_number} · {s.batch_label} · Grade {s.grade_level || '-'}
                    </div>
                    <div className={styles.studentCardMeta}>
                      {s.track_strand || '-'} · {s.email}
                    </div>
                  </div>
                  {s.evaluation && (
                    <span className={`${styles.badge} ${styles.badgeApproved}`}>
                      Score: {s.evaluation.overall_percentage ? `${s.evaluation.overall_percentage}%` : `${s.evaluation.overall_score}`}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className={styles.btn}
                  onClick={() => openEvaluation(s.student_id)}
                  style={{ marginTop: 12, width: '100%' }}
                >
                  {s.evaluation ? 'Re-evaluate' : 'Evaluate'}
                </button>
              </div>
            ))}
            {students.length === 0 && (
              <p className={styles.empty}>No students assigned to you yet.</p>
            )}
          </div>
        </div>
      ) : (
        <div className={styles.section}>
          <div className={styles.evaluationHeader}>
            <div>
              <h3 className={styles.sectionTitle} style={{ margin: 0 }}>
                Evaluating: {activeStudent.first_name} {activeStudent.last_name}
              </h3>
              <p className={styles.muted} style={{ margin: '4px 0 0' }}>
                {activeStudent.student_number} · {activeStudent.batch_label} · Grade {activeStudent.grade_level || '-'} ·{' '}
                {activeStudent.track_strand || '-'} · {activeStudent.email}
              </p>
            </div>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={closeEvaluation}
            >
              ← Back to Students
            </button>
          </div>

          {existingEvaluation && (
            <div className={styles.existingBadge}>
              Previously evaluated on{' '}
              {new Date(existingEvaluation.created_at).toLocaleDateString()} · Overall Score:{' '}
              <strong>{existingEvaluation.overall_score}</strong>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {criteria.map((cat) => {
              const catRatings = ratings[String(cat.id)] || [];
              return (
                <div key={cat.id} className={styles.categoryCard}>
                  <h4 className={styles.categoryTitle}>{cat.category_name}</h4>
                  <table className={styles.ratingTable}>
                    <thead>
                      <tr>
                        <th>Indicator</th>
                        <th style={{ width: 220 }}>Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(cat.indicators || []).map((ind, indIndex) => (
                        <tr key={indIndex}>
                          <td>{ind}</td>
                          <td>
                            <select
                              className={styles.select}
                              value={catRatings[indIndex] || ''}
                              onChange={(e) =>
                                handleRatingChange(String(cat.id), indIndex, e.target.value)
                              }
                            >
                              <option value="">--</option>
                              {RATING_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className={styles.categoryScore}>
                    Category Score:{' '}
                    <strong>
                      {catRatings.length === (cat.indicators || []).length
                        ? `${computedScores.category_scores.find((cs) => cs.category_id === cat.id)?.category_percentage || 0}%`
                        : '-'}
                    </strong>
                  </div>
                </div>
              );
            })}

            <div className={styles.summaryCard}>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Overall Score</span>
                <span className={styles.summaryValue}>
                  {computedScores.overall_percentage ? `${computedScores.overall_percentage}%` : '-'}
                </span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Completion</span>
                <span className={styles.summaryValue}>{isComplete ? 'Complete' : 'Incomplete'}</span>
              </div>
            </div>

            <label className={styles.filterField} style={{ marginTop: 18 }}>
              Comments / Suggestions
              <textarea
                className={styles.textarea}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Enter comments or suggestions for the student..."
                rows={4}
              />
            </label>

            <div className={styles.actions} style={{ marginTop: 18 }}>
              <button
                type="submit"
                className={styles.btn}
                disabled={saving || !isComplete}
              >
                {saving ? 'Saving...' : existingEvaluation ? 'Update Evaluation' : 'Submit Evaluation'}
              </button>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={closeEvaluation}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Evaluation Records */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Evaluation Records</h3>
        <div className={styles.row} style={{ marginBottom: 14 }}>
          <span className={styles.muted} style={{ alignSelf: 'center' }}>
            {students.length} total · {evaluatedCount} evaluated · {pendingCount} pending
          </span>
        </div>
        {students.length === 0 ? (
          <p className={styles.empty}>No students assigned to you yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Student ID</th>
                  <th>Name</th>
                  <th>Batch</th>
                  <th>Overall Rating</th>
                  <th>Date Evaluated</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const evaluation = s.evaluation;
                  const isEvaluated = Boolean(evaluation);
                  const percentage = evaluation?.overall_percentage || (evaluation?.overall_score ? Math.round((evaluation.overall_score / 5) * 10000) / 100 : null);
                  return (
                    <tr key={s.student_id}>
                      <td>{s.student_number}</td>
                      <td>{s.first_name} {s.last_name}</td>
                      <td>{s.batch_label}</td>
                      <td>{percentage ? `${percentage}%` : '-'}</td>
                      <td>
                        {evaluation?.created_at
                          ? new Date(evaluation.created_at).toLocaleDateString()
                          : '-'}
                      </td>
                      <td>
                        <span className={`${styles.badge} ${isEvaluated ? styles.badgeApproved : styles.badgePending}`}>
                          {isEvaluated ? 'Evaluated' : 'Pending'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default SupervisorEvaluateStudent;
