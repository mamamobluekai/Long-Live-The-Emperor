import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useTeacherBatch } from '../../../hooks/useTeacherBatch';
import {
  getBatchDailyDocSummary,
  getStudentDailyDocs,
  gradeDailyDoc,
  getDocumentationCriteria,
  saveDocumentationCriteria,
} from '../../../api/teacherApi';
import { fileDownloadUrl } from '../../../api/fileApi';
import styles from './TeacherStudentDocumentation.module.css';

function getPreviewUrl(url) {
  if (!url) return '';
  return url.replace('/upload/fl_attachment/', '/upload/');
}

function TeacherStudentDocumentation() {
  const { token } = useAuth();
  const { batchId, batchLabel } = useTeacherBatch();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);

  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDocs, setStudentDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);

  const [reviewModal, setReviewModal] = useState(null);
  const [grading, setGrading] = useState(false);
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [selectedCriteria, setSelectedCriteria] = useState([]);

  const [criteria, setCriteria] = useState([]);
  const [criteriaLoading, setCriteriaLoading] = useState(false);
  const [editingCriteria, setEditingCriteria] = useState(false);
  const [criteriaDraft, setCriteriaDraft] = useState([]);

  const flash = useCallback((type, text) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 4000);
  }, []);

  const loadSummary = useCallback(async () => {
    if (!batchId) return;
    setLoading(true);
    setError('');
    try {
      const result = await getBatchDailyDocSummary(batchId, token);
      setStudents(result.students || []);
    } catch (err) {
      setError(err.message || 'Failed to load documentation summary.');
    } finally {
      setLoading(false);
    }
  }, [batchId, token]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const loadCriteria = useCallback(async () => {
    setCriteriaLoading(true);
    try {
      const result = await getDocumentationCriteria(token);
      setCriteria(result.criteria || []);
      setCriteriaDraft(result.criteria || []);
    } catch (err) {
      flash('error', err.message || 'Failed to load criteria.');
    } finally {
      setCriteriaLoading(false);
    }
  }, [token, flash]);

  useEffect(() => { loadCriteria(); }, [loadCriteria]);

  const openStudentDocs = async (student) => {
    if (!batchId) {
      flash('error', 'Batch not loaded yet.');
      return;
    }
    setSelectedStudent(student);
    setDocsLoading(true);
    setStudentDocs([]);
    try {
      const result = await getStudentDailyDocs({ studentId: student.student_id, batchId }, token);
      setStudentDocs(result.docs || []);
    } catch (err) {
      flash('error', err.message || 'Failed to load student documentation.');
    } finally {
      setDocsLoading(false);
    }
  };

  const openReview = (doc) => {
    setReviewModal(doc);
    setScore(doc.teacher_score != null ? String(doc.teacher_score) : '');
    setFeedback(doc.teacher_feedback || '');
    setSelectedCriteria(criteria.map(c => ({ ...c, checked: false })));
  };

  const closeReview = () => {
    setReviewModal(null);
    setScore('');
    setFeedback('');
    setSelectedCriteria([]);
  };

  const toggleCriteriaCheck = (id) => {
    setSelectedCriteria(prev => prev.map(c => c.id === id ? { ...c, checked: !c.checked } : c));
  };

  const submitGrade = async (e) => {
    e.preventDefault();
    if (!reviewModal) return;
    const numScore = parseInt(score, 10);
    if (isNaN(numScore) || numScore < 0 || numScore > 100) {
      flash('error', 'Score must be between 0 and 100.');
      return;
    }
    setGrading(true);
    try {
      await gradeDailyDoc(reviewModal.id, { teacherScore: numScore, teacherFeedback: feedback }, token);
      flash('success', 'Documentation graded successfully.');
      closeReview();
      loadSummary();
      if (selectedStudent) {
        const result = await getStudentDailyDocs({ studentId: selectedStudent.student_id, batchId }, token);
        setStudentDocs(result.docs || []);
      }
    } catch (err) {
      flash('error', err.message || 'Failed to grade documentation.');
    } finally {
      setGrading(false);
    }
  };

  const addCriterion = () => {
    const newId = Math.max(0, ...criteriaDraft.map(c => c.id)) + 1;
    setCriteriaDraft(prev => [...prev, { id: newId, criterion_name: '', points: 0, description: '', sort_order: prev.length + 1 }]);
  };

  const updateCriterion = (id, field, value) => {
    setCriteriaDraft(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const removeCriterion = (id) => {
    setCriteriaDraft(prev => prev.filter(c => c.id !== id));
  };

  const saveCriteria = async () => {
    setCriteriaLoading(true);
    try {
      await saveDocumentationCriteria(criteriaDraft, token);
      setCriteria(criteriaDraft);
      setEditingCriteria(false);
      flash('success', 'Criteria updated successfully.');
    } catch (err) {
      flash('error', err.message || 'Failed to save criteria.');
    } finally {
      setCriteriaLoading(false);
    }
  };

  const totalPoints = criteria.reduce((sum, c) => sum + (parseInt(c.points, 10) || 0), 0);

  const getDocStatusBadge = (status) => {
    const map = {
      pending: 'badge_pending',
      submitted: 'badge_submitted',
      reviewed: 'badge_reviewed',
      graded: 'badge_graded',
    };
    return map[status] || 'badge_pending';
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Student Documentation</h2>
          {batchLabel && <p className={styles.batchTag}>Batch: {batchLabel}</p>}
        </div>
        <button className={styles.criteriaToggleBtn} onClick={() => setEditingCriteria(!editingCriteria)}>
          {editingCriteria ? 'Hide Criteria Editor' : 'Edit Criteria'}
        </button>
      </div>

      {notice && <div className={`${styles.notice} ${styles['notice_' + notice.type]}`}>{notice.text}</div>}
      {error && <div className={styles.error}>{error}</div>}

      {/* Criteria Editor */}
      {editingCriteria && (
        <div className={styles.criteriaEditor}>
          <div className={styles.criteriaHeader}>
            <h3 className={styles.criteriaTitle}>Grading Criteria (Total: {totalPoints} pts)</h3>
            <div className={styles.criteriaActions}>
              <button className={styles.addCriterionBtn} onClick={addCriterion} type="button">+ Add Criterion</button>
              <button className={styles.saveCriteriaBtn} onClick={saveCriteria} disabled={criteriaLoading} type="button">
                {criteriaLoading ? 'Saving...' : 'Save Criteria'}
              </button>
            </div>
          </div>
          <div className={styles.criteriaList}>
            {criteriaDraft.map((c, idx) => (
              <div key={c.id} className={styles.criterionRow}>
                <span className={styles.criterionIndex}>{idx + 1}</span>
                <input
                  type="text"
                  className={styles.criterionName}
                  value={c.criterion_name}
                  onChange={(e) => updateCriterion(c.id, 'criterion_name', e.target.value)}
                  placeholder="Criterion name"
                />
                <input
                  type="number"
                  className={styles.criterionPoints}
                  value={c.points}
                  onChange={(e) => updateCriterion(c.id, 'points', e.target.value)}
                  min="0"
                  max="100"
                />
                <span className={styles.criterionPointsLabel}>pts</span>
                <input
                  type="text"
                  className={styles.criterionDesc}
                  value={c.description}
                  onChange={(e) => updateCriterion(c.id, 'description', e.target.value)}
                  placeholder="Description"
                />
                <button className={styles.removeCriterionBtn} onClick={() => removeCriterion(c.id)} type="button">×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Criteria Display */}
      {!editingCriteria && (
        <div className={styles.criteriaDisplay}>
          <h3 className={styles.criteriaTitle}>Grading Criteria</h3>
          <div className={styles.criteriaList}>
            {criteria.map((c, idx) => (
              <div key={c.id} className={styles.criterionDisplayRow}>
                <span className={styles.criterionIndex}>{idx + 1}</span>
                <div className={styles.criterionInfo}>
                  <span className={styles.criterionNameDisplay}>{c.criterion_name}</span>
                  <span className={styles.criterionDescDisplay}>{c.description}</span>
                </div>
                <span className={styles.criterionPointsBadge}>{c.points} pts</span>
              </div>
            ))}
          </div>
          <div className={styles.criteriaTotal}>Total: {totalPoints} points</div>
        </div>
      )}

      {/* Students List */}
      {loading && <p className={styles.info}>Loading students...</p>}
      {!loading && students.length === 0 && (
        <p className={styles.empty}>No students in this batch yet.</p>
      )}
      {!loading && students.length > 0 && (
        <div className={styles.studentGrid}>
          {students.map((s) => (
            <div key={s.student_id} className={styles.studentCard}>
              <div className={styles.studentHeader}>
                <div>
                  <div className={styles.studentName}>{s.first_name} {s.last_name}</div>
                  <div className={styles.studentMeta}>
                    {s.student_number} · {[s.grade_level, s.track_strand].filter(Boolean).join(' / ') || '—'}
                  </div>
                  <div className={styles.studentMeta}>{s.email}</div>
                  {batchLabel && <div className={styles.studentBatchTag}>Batch: {batchLabel}</div>}
                </div>
                <div className={styles.studentStats}>
                  <div className={styles.statItem}>
                    <span className={styles.statValue}>{s.total_docs || 0}</span>
                    <span className={styles.statLabel}>Docs</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statValue}>{s.graded_count || 0}</span>
                    <span className={styles.statLabel}>Graded</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statValue}>{s.pending_count || 0}</span>
                    <span className={styles.statLabel}>Pending</span>
                  </div>
                </div>
              </div>
              <button className={styles.reviewBtn} onClick={() => openStudentDocs(s)}>
                Review Documentation
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Student Docs Modal */}
      {selectedStudent && (
        <div className={styles.modal} onClick={() => { setSelectedStudent(null); setStudentDocs([]); }}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>{selectedStudent.first_name} {selectedStudent.last_name} — Daily Documentation</h3>
              <button className={styles.closeBtn} onClick={() => { setSelectedStudent(null); setStudentDocs([]); }}>×</button>
            </div>
            <div className={styles.modalBody}>
              {docsLoading ? (
                <p className={styles.loading}>Loading documentation...</p>
              ) : studentDocs.length === 0 ? (
                <p className={styles.empty}>No documentation submitted yet.</p>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Date</th>
                      <th>File</th>
                      <th>Reasoning</th>
                      <th>Score</th>
                      <th>Feedback</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentDocs.map((doc) => (
                      <tr key={doc.id}>
                        <td>Day {doc.day_number}</td>
                        <td>{doc.date}</td>
                        <td>
                          {doc.cloudinary_url ? (
                            <>
                              <a href={fileDownloadUrl(doc.cloudinary_url)} target="_blank" rel="noreferrer" className={styles.fileLink}>
                                {doc.original_name || 'View file'}
                              </a>
                              <br />
                              <a href={fileDownloadUrl(doc.cloudinary_url)} target="_blank" rel="noreferrer" className={styles.downloadLinkSmall} download>
                                Download
                              </a>
                            </>
                          ) : (
                            <span className={styles.noFile}>No file</span>
                          )}
                        </td>
                        <td className={styles.reasoningCell}>{doc.reasoning || '—'}</td>
                        <td>{doc.teacher_score != null ? `${doc.teacher_score}/100` : '—'}</td>
                        <td className={styles.feedbackCell}>{doc.teacher_feedback || '—'}</td>
                        <td>
                          <span className={`${styles.badge} ${styles[getDocStatusBadge(doc.status)]}`}>{doc.status}</span>
                        </td>
                        <td>
                          <button className={styles.reviewBtnSmall} onClick={() => openReview(doc)}>
                            {doc.status === 'graded' ? 'Update Grade' : 'Review & Grade'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Review/Grade Modal */}
      {reviewModal && (
        <div className={styles.modal} onClick={closeReview}>
          <div className={styles.reviewModalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Review & Grade — Day {reviewModal.day_number} ({reviewModal.date})</h3>
              <button className={styles.closeBtn} onClick={closeReview}>×</button>
            </div>
            <div className={styles.modalBody}>
              {reviewModal.cloudinary_url && (
                <div className={styles.filePreview}>
                  <p><strong>Student:</strong> {reviewModal.first_name} {reviewModal.last_name}</p>
                  <p><strong>File:</strong> {reviewModal.original_name || 'Documentation'}</p>
                  {reviewModal.mime_type && reviewModal.mime_type.startsWith('image/') && (
                    <img src={getPreviewUrl(reviewModal.cloudinary_url)} alt="Documentation" className={styles.previewImage} />
                  )}
                  {reviewModal.mime_type === 'application/pdf' && (
                    <iframe src={getPreviewUrl(reviewModal.cloudinary_url)} className={styles.previewIframe} title="PDF preview" />
                  )}
                  {(!reviewModal.mime_type || !reviewModal.mime_type.startsWith('image/')) && reviewModal.mime_type !== 'application/pdf' && (
                    <a href={getPreviewUrl(reviewModal.cloudinary_url)} target="_blank" rel="noreferrer" className={styles.downloadLink}>
                      Download File
                    </a>
                  )}
                  <a href={getPreviewUrl(reviewModal.cloudinary_url)} target="_blank" rel="noreferrer" className={styles.downloadLink} download style={{ marginTop: 8 }}>
                    Download
                  </a>
                </div>
              )}
              <div className={styles.reasoningSection}>
                <h4>Student Reasoning</h4>
                <p>{reviewModal.reasoning || 'No reasoning provided.'}</p>
              </div>

              <form onSubmit={submitGrade} className={styles.gradeForm}>
                <div className={styles.criteriaChecklist}>
                  <h4>Criteria Checklist</h4>
                  {selectedCriteria.map((c) => (
                    <label key={c.id} className={styles.criteriaCheckItem}>
                      <input
                        type="checkbox"
                        checked={c.checked}
                        onChange={() => toggleCriteriaCheck(c.id)}
                      />
                      <span className={styles.criteriaCheckText}>
                        <strong>{c.criterion_name}</strong> ({c.points} pts) — {c.description}
                      </span>
                    </label>
                  ))}
                </div>

                <label className={styles.field}>
                  Score (0-100)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    required
                  />
                </label>

                <label className={styles.field}>
                  Feedback
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    rows={4}
                    placeholder="Provide feedback to the student..."
                  />
                </label>

                <div className={styles.gradeActions}>
                  <button type="submit" className={styles.primaryBtn} disabled={grading}>
                    {grading ? 'Saving...' : 'Submit Grade'}
                  </button>
                  <button type="button" className={styles.cancelBtn} onClick={closeReview}>Cancel</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TeacherStudentDocumentation;
