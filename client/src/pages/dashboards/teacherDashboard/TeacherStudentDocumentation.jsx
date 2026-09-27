import { useState, useEffect, useCallback, useMemo } from 'react';
import { AlertTriangle, ExternalLink, FileText, Search, Star, X } from 'lucide-react';
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

const MAX_CRITERION_STARS = 5;

const RATING_BANDS = [
  { min: 90, stars: 4, label: 'Excellent' },
  { min: 80, stars: 3, label: 'Very Satisfactory' },
  { min: 70, stars: 2, label: 'Satisfactory' },
  { min: 0, stars: 1, label: 'Needs Improvement' },
];

function ratingForScore(score) {
  return RATING_BANDS.find((band) => score >= band.min) || RATING_BANDS[RATING_BANDS.length - 1];
}

function getPreviewUrl(url) {
  if (!url) return '';
  // Stored URLs force a download (fl_attachment); the preview needs the plain
  // delivery URL so the browser renders it inline.
  return url
    .replace('/upload/fl_attachment/', '/upload/')
    .replace('/fl_attachment/', '/');
}

// Browsers cannot render Word/Excel at all, so those get a download panel
// instead of an empty frame.
function isImage(mime) {
  return String(mime || '').startsWith('image/');
}

function isPdf(mime, name) {
  return mime === 'application/pdf' || /\.pdf$/i.test(String(name || ''));
}

function StarRating({ value, onChange, size = 22 }) {
  return (
    <div className={styles.starRow} role="radiogroup" aria-label="Star rating">
      {Array.from({ length: MAX_CRITERION_STARS }, (_, i) => i + 1).map((star) => {
        const active = star <= (value || 0);
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={star === value}
            aria-label={`${star} star${star === 1 ? '' : 's'}`}
            className={`${styles.starButton} ${active ? styles.starActive : ''}`}
            style={{ width: size + 6, height: size + 6 }}
            onClick={() => onChange && onChange(star)}
            disabled={!onChange}
          >
            <Star size={size} strokeWidth={1.8} fill={active ? 'currentColor' : 'none'} />
          </button>
        );
      })}
    </div>
  );
}

// Evidence preview. Images and PDFs render inline; Word/Excel cannot be
// rendered by a browser, so they get a clear download panel. If the stored file
// is not publicly readable the preview falls back to Open/Download actions
// instead of showing an empty frame.
function FilePreview({ doc }) {
  const [failed, setFailed] = useState(false);
  const src = getPreviewUrl(doc.cloudinary_url);
  const downloadUrl = fileDownloadUrl(doc.cloudinary_url);
  const image = isImage(doc.mime_type);
  const pdf = isPdf(doc.mime_type, doc.original_name);

  return (
    <div className={styles.filePreview}>
      <p>
        <strong>Student:</strong> {doc.first_name} {doc.last_name}
      </p>
      <p>
        <strong>File:</strong> {doc.original_name || 'Documentation'}
      </p>

      {!failed && image && (
        <img
          src={src}
          alt="Documentation"
          className={styles.previewImage}
          onError={() => setFailed(true)}
        />
      )}

      {!failed && pdf && (
        <object data={src} type="application/pdf" className={styles.previewFrame}>
          <iframe src={src} className={styles.previewIframe} title="PDF preview" />
        </object>
      )}

      {(!image && !pdf) || failed ? (
        <div className={styles.previewNotice}>
          <FileText size={16} strokeWidth={2} />
          {failed
            ? 'The preview could not be loaded. The file may not be publicly accessible.'
            : 'This file type cannot be previewed in the browser.'}
        </div>
      ) : null}

      <div className={styles.previewActions}>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className={styles.previewActionBtn}
        >
          <ExternalLink size={14} strokeWidth={2} />
          Open
        </a>
        <a
          href={downloadUrl}
          target="_blank"
          rel="noreferrer"
          className={styles.previewActionBtn}
          download
        >
          Download
        </a>
      </div>
    </div>
  );
}

function TeacherStudentDocumentation() {
  const { token } = useAuth();
  const { batchId } = useTeacherBatch();
  const [students, setStudents] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);

  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDocs, setStudentDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);

  const [reviewModal, setReviewModal] = useState(null);
  const [grading, setGrading] = useState(false);
  const [feedback, setFeedback] = useState('');
  // Star rating per criterion: { [criterionId]: 1-5 }
  const [criterionRatings, setCriterionRatings] = useState({});

  const [criteria, setCriteria] = useState([]);
  const [criteriaLoading, setCriteriaLoading] = useState(false);
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const [editingCriteria, setEditingCriteria] = useState(false);
  const [criteriaDraft, setCriteriaDraft] = useState([]);

  const flash = useCallback((type, text) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 4000);
  }, []);

  const loadSummary = useCallback(async () => {
    if (!batchId) {
      setStudents([]);
      setLoading(false);
      return;
    }
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

  const filteredStudents = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return students;
    return students.filter((s) =>
      [s.first_name, s.last_name, s.student_number, s.email, s.grade_level, s.track_strand]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term))
    );
  }, [students, query]);

  // Switching batches must not leave the previous batch's student, documents
  // or grading form on screen.
  useEffect(() => {
    setSelectedStudent(null);
    setStudentDocs([]);
    setDocsLoading(false);
    setReviewModal(null);
    setGrading(false);
    setFeedback('');
    setCriterionRatings({});
    setQuery('');
  }, [batchId]);

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

  const openCriteria = () => {
    setCriteriaDraft(criteria.map((c) => ({ ...c })));
    setEditingCriteria(false);
    setCriteriaOpen(true);
  };

  const closeCriteria = useCallback(() => {
    setCriteriaOpen(false);
    setEditingCriteria(false);
    // Discard unsaved edits.
    setCriteriaDraft(criteria.map((c) => ({ ...c })));
  }, [criteria]);

  // The criteria modal has its own dismiss / scroll-lock behaviour.
  useEffect(() => {
    if (!criteriaOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closeCriteria();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [criteriaOpen, closeCriteria]);

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
    setFeedback(doc.teacher_feedback || '');
    // Restore the stars this teacher gave previously, so "Update Grade" keeps
    // the existing ratings instead of starting blank.
    const saved = Array.isArray(doc.criteria_ratings) ? doc.criteria_ratings : [];
    setCriterionRatings(
      saved.reduce((acc, entry) => {
        if (entry && entry.id !== undefined) acc[entry.id] = Number(entry.stars) || 0;
        return acc;
      }, {})
    );
  };

  const closeReview = () => {
    setReviewModal(null);
    setFeedback('');
    setCriterionRatings({});
  };

  const rateCriterion = (id, stars) => {
    setCriterionRatings((prev) => ({ ...prev, [id]: stars }));
  };

  const ratedCount = criteria.filter((c) => criterionRatings[c.id] > 0).length;
  const allRated = criteria.length > 0 && ratedCount === criteria.length;

  // Grade is derived from the star ratings, weighted by each criterion's points.
  const computedGrade = useMemo(() => {
    const totalPoints = criteria.reduce((sum, c) => sum + (parseInt(c.points, 10) || 0), 0);
    if (!totalPoints) return null;
    let weighted = 0;
    criteria.forEach((c) => {
      const points = parseInt(c.points, 10) || 0;
      const stars = criterionRatings[c.id] || 0;
      weighted += (stars / MAX_CRITERION_STARS) * 100 * points;
    });
    const total = Math.round(weighted / totalPoints);
    return { total, ...ratingForScore(total) };
  }, [criteria, criterionRatings]);

  const submitGrade = async (e) => {
    e.preventDefault();
    if (!reviewModal) return;
    if (!allRated) {
      flash('error', `Rate all ${criteria.length} criteria with stars before submitting.`);
      return;
    }
    setGrading(true);
    try {
      const criteriaRatings = criteria.map((c) => ({ id: c.id, stars: criterionRatings[c.id] }));
      const result = await gradeDailyDoc(reviewModal.id, { criteriaRatings, teacherFeedback: feedback }, token);
      const grade = result?.grade;
      flash(
        'success',
        grade
          ? `Documentation graded: ${grade.total}/100 (${grade.stars} star${grade.stars === 1 ? '' : 's'} — ${grade.label}).`
          : 'Documentation graded successfully.'
      );
      closeReview();
      loadSummary();
      if (selectedStudent) {
        const result2 = await getStudentDailyDocs({ studentId: selectedStudent.student_id, batchId }, token);
        setStudentDocs(result2.docs || []);
      }
    } catch (err) {
      flash('error', err.message || 'Failed to grade documentation.');
    } finally {
      setGrading(false);
    }
  };

  const addCriterion = () => {    const newId = Math.max(0, ...criteriaDraft.map(c => c.id)) + 1;
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
          <span className={styles.eyebrow}>Work Immersion Monitoring</span>
          <h2 className={styles.title}>Student Documentation</h2>

        </div>
        <button type="button" className={styles.criteriaToggleBtn} onClick={openCriteria}>
          Grading Criteria ({criteria.length})
        </button>
      </div>

      {notice && <div className={`${styles.notice} ${styles['notice_' + notice.type]}`}>{notice.text}</div>}
      {error && <div className={styles.error}>{error}</div>}

      {/* Students List */}
      {loading && <p className={styles.info}>Loading students...</p>}
      {!loading && students.length === 0 && (
        <p className={styles.empty}>No students in this batch yet.</p>
      )}
      {!loading && students.length > 0 && (
        <>
          <div className={styles.toolbar}>
            <div className={styles.searchBox}>
              <Search size={15} strokeWidth={2} aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, student number or email"
                aria-label="Search students"
              />
              {query && (
                <button
                  type="button"
                  className={styles.searchClear}
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                >
                  <X size={12} strokeWidth={2.5} />
                </button>
              )}
            </div>
            <span className={styles.toolbarCount}>
              {filteredStudents.length} of {students.length} student
              {students.length === 1 ? '' : 's'}
            </span>
          </div>

          {filteredStudents.length === 0 ? (
            <p className={styles.empty}>No students match your search.</p>
          ) : (
            <div className={styles.roster}>
              <div className={styles.rosterHead}>
                <span>Student</span>
                <span>Docs</span>
                <span>Graded</span>
                <span>Pending</span>
                <span>Action</span>
              </div>

              {filteredStudents.map((s) => (
                <div key={s.student_id} className={styles.rosterRow} role="button" tabIndex={0}
                  onClick={() => openStudentDocs(s)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openStudentDocs(s);
                    }
                  }}
                  aria-label={`Review documentation for ${s.first_name} ${s.last_name}`}
                >
                  <span className={styles.rosterStudent}>
                    <strong>{s.first_name} {s.last_name}</strong>
                    <span title={[s.student_number, s.email].filter(Boolean).join(' · ')}>
                      {[s.student_number, [s.grade_level, s.track_strand].filter(Boolean).join(' / ') || null, s.email]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className={styles.rosterStat}>{s.total_docs || 0}</span>
                  <span className={styles.rosterStat}>{s.graded_count || 0}</span>
                  <span className={`${styles.rosterStat} ${s.pending_count ? styles.rosterStatPending : ''}`}>
                    {s.pending_count || 0}
                  </span>
                  <span className={styles.rosterAction}>
                    <span className={styles.reviewBtn}>Review Documentation</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Grading Criteria Modal */}
      {criteriaOpen && (
        <div className={styles.modal} onClick={closeCriteria}>
          <div className={styles.criteriaModalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3>Grading Criteria</h3>
                <p className={styles.modalSubtitle}>
                  {criteria.length} criterion{criteria.length === 1 ? '' : 's'} · {totalPoints} points total
                </p>
              </div>
              <button className={styles.closeBtn} onClick={closeCriteria} aria-label="Close criteria">×</button>
            </div>

            <div className={styles.modalBody}>
              {criteriaLoading && criteria.length === 0 ? (
                <p className={styles.loading}>Loading criteria...</p>
              ) : editingCriteria ? (
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
                      <button className={styles.removeCriterionBtn} onClick={() => removeCriterion(c.id)} type="button" aria-label="Remove criterion">×</button>
                    </div>
                  ))}
                </div>
              ) : (
                <>
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
                </>
              )}
            </div>

            <div className={styles.criteriaFooter}>
              {editingCriteria ? (
                <>
                  <button
                    className={styles.addCriterionBtn}
                    onClick={addCriterion}
                    type="button"
                  >
                    + Add Criterion
                  </button>
                  <span className={styles.criteriaFooterSpacer} />
                  <button
                    className={styles.cancelBtn}
                    type="button"
                    onClick={() => {
                      setCriteriaDraft(criteria.map((c) => ({ ...c })));
                      setEditingCriteria(false);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className={styles.saveCriteriaBtn}
                    onClick={saveCriteria}
                    disabled={criteriaLoading}
                    type="button"
                  >
                    {criteriaLoading ? 'Saving...' : 'Save Criteria'}
                  </button>
                </>
              ) : (
                <>
                  <button className={styles.cancelBtn} type="button" onClick={closeCriteria}>
                    Close
                  </button>
                  <button className={styles.saveCriteriaBtn} type="button" onClick={() => setEditingCriteria(true)}>
                    Edit Criteria
                  </button>
                </>
              )}
            </div>
          </div>
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
                        <th>Rating</th>
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
                        <td>
                          {doc.final_stars ? (
                            <div className={styles.tableStars}>
                              <StarRating value={doc.final_stars} size={13} />
                              <span className={styles.tableStarsLabel}>{doc.final_label}</span>
                            </div>
                          ) : doc.teacher_score != null ? (
                            `${doc.teacher_score}/100`
                          ) : (
                            '—'
                          )}
                        </td>
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
              {reviewModal.cloudinary_url ? (
                <FilePreview doc={reviewModal} />
              ) : (
                <div className={styles.previewNotice}>
                  <AlertTriangle size={16} strokeWidth={2} />
                  No file was attached to this documentation entry.
                </div>
              )}
              <form onSubmit={submitGrade} className={styles.gradeForm}>
                {/* Live grade, derived from the star ratings below */}
                <div
                  className={`${styles.gradeTotalPanel} ${allRated ? styles.gradeTotalReady : ''}`}
                >
                  <div className={styles.gradeTotalHead}>
                    <span className={styles.gradeTotalLabel}>Calculated Grade</span>
                    {computedGrade && (
                      <>
                        <StarRating value={computedGrade.stars} size={18} />
                        <span className={styles.gradeTotalLabelValue}>{computedGrade.label}</span>
                        <span className={styles.gradeTotalValue}>{computedGrade.total} / 100</span>
                      </>
                    )}
                  </div>
                  <p className={styles.gradeTotalHint}>
                    {criteria.length === 0
                      ? 'No grading criteria configured yet.'
                      : allRated
                        ? `All ${criteria.length} criteria rated. This is the grade that will be saved.`
                        : `Rate every criterion with stars — ${ratedCount} of ${criteria.length} done.`}
                  </p>
                  <span className={styles.gradeTotalTrack}>
                    <span
                      className={styles.gradeTotalFill}
                      style={{ width: `${computedGrade ? computedGrade.total : 0}%` }}
                    />
                  </span>
                </div>

                {/* One 5-star rating per criterion */}
                <div className={styles.criteriaChecklist}>
                  <h4>Rate each criterion</h4>
                  {criteria.length === 0 && (
                    <p className={styles.criteriaEmpty}>
                      No criteria yet — add them from the &ldquo;Grading Criteria&rdquo; button.
                    </p>
                  )}
                  {criteria.map((c, idx) => (
                    <div
                      key={c.id}
                      className={`${styles.criterionRateRow} ${
                        criterionRatings[c.id] ? styles.criterionRateDone : ''
                      }`}
                    >
                      <div className={styles.criterionRateInfo}>
                        <span className={styles.criterionIndex}>{idx + 1}</span>
                        <div>
                          <span className={styles.criterionRateName}>{c.criterion_name}</span>
                          <span className={styles.criterionRateDesc}>
                            {c.description} · {c.points} pts
                          </span>
                        </div>
                      </div>
                      <StarRating
                        value={criterionRatings[c.id] || 0}
                        onChange={(starsValue) => rateCriterion(c.id, starsValue)}
                        size={24}
                      />
                    </div>
                  ))}
                </div>

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
                  <button type="submit" className={styles.primaryBtn} disabled={grading || !allRated}>
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
