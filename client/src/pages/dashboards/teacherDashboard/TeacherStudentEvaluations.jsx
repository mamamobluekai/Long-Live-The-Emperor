import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Trophy, X } from 'lucide-react';
import { getTeacherBatchEvaluations } from '../../../api/teacherApi';
import { useTeacherBatch } from '../../../hooks/useTeacherBatch';
import styles from './TeacherStudentEvaluations.module.css';

function percentageOf(ev) {
  if (!ev) return 0;
  if (ev.overall_percentage) return Number(ev.overall_percentage);
  if (ev.overall_score) return Math.round((Number(ev.overall_score) / 5) * 10000) / 100;
  return 0;
}

function gradeFor(percentage) {
  if (percentage >= 90) return 'Outstanding';
  if (percentage >= 80) return 'Very Satisfactory';
  if (percentage >= 75) return 'Satisfactory';
  if (percentage >= 70) return 'Fair';
  if (percentage > 0) return 'Needs Improvement';
  return 'N/A';
}

// Student grades for the batch selected in the sidebar, with a ranking of the
// batch by evaluation score.
function TeacherStudentEvaluations() {
  const { batchId} = useTeacherBatch();
  const [groups, setGroups] = useState([]);
  const [criteria, setCriteria] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showOverall, setShowOverall] = useState(false);
  const [showBatchRank, setShowBatchRank] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const data = await getTeacherBatchEvaluations();
        if (!cancelled) {
          setGroups(data.groups || []);
          setCriteria(data.criteria || []);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Only the selected batch is shown; the sidebar switcher controls it.
  const group = useMemo(
    () => groups.find((g) => Number(g.batch_id) === Number(batchId)) || null,
    [groups, batchId]
  );

  const ranked = useMemo(() => {
    const rows = (group?.students || []).map((s) => {
      const percentage = percentageOf(s.evaluation);
      return {
        student_id: s.student_id,
        student_number: s.student_number,
        name: `${s.first_name} ${s.last_name}`.trim(),
        email: s.email,
        percentage,
        grade: gradeFor(percentage),
        created_at: s.evaluation?.created_at || null,
        evaluated: Boolean(s.evaluation),
        evaluation: s.evaluation || null,
      };
    });

    return rows
      .slice()
      .sort((a, b) => {
        if (a.evaluated !== b.evaluated) return a.evaluated ? -1 : 1;
        return b.percentage - a.percentage || a.name.localeCompare(b.name);
      })
      .map((row, index) => ({ ...row, rank: row.evaluated ? index + 1 : null }));
  }, [group]);

  // Overall ranking across EVERY batch the teacher handles.
  const overallRanked = useMemo(() => {
    const rows = groups.flatMap((g) =>
      (g.students || []).map((s) => {
        const percentage = percentageOf(s.evaluation);
        return {
          student_id: s.student_id,
          name: `${s.first_name} ${s.last_name}`.trim(),
          batch_label: g.batch_label,
          percentage,
          grade: gradeFor(percentage),
          evaluated: Boolean(s.evaluation),
        };
      })
    );

    return rows
      .filter((r) => r.evaluated)
      .sort((a, b) => b.percentage - a.percentage || a.name.localeCompare(b.name))
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }, [groups]);

  // Per-criterion breakdown for the clicked student, so a teacher can see
  // which criterion is their strongest and which is weakest.
  const breakdown = useMemo(() => {
    if (!selected?.evaluation?.category_scores) return [];
    const scores = selected.evaluation.category_scores || {};

    return criteria
      .map((cat) => {
        const entry = scores[String(cat.id)] || {};
        const indicators = cat.indicators || [];
        const ratings = Array.isArray(entry.indicators) ? entry.indicators : [];
        const percentage = Number(entry.category_percentage) || 0;
        return {
          id: cat.id,
          name: cat.category_name,
          percentage,
          items: indicators.map((label, i) => ({ label, rating: ratings[i] })).filter((x) => x.label),
        };
      })
      .filter((c) => c.items.length > 0)
      .sort((a, b) => b.percentage - a.percentage);
  }, [selected, criteria]);

  const strongest = breakdown[0] || null;
  const weakest = breakdown.length > 1 ? breakdown[breakdown.length - 1] : null;

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>Work Immersion Evaluation</span>
          <h2>Student Grades</h2>
          <p>
            Evaluation grades of your students in the batch selected in the sidebar
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.rankBtn}
            onClick={() => setShowBatchRank(true)}
            title="View the ranking of the selected batch"
          >
            <BarChart3 size={16} strokeWidth={2} aria-hidden="true" />
            Batch Ranking
            {ranked.some((s) => s.evaluated) && (
              <span className={styles.rankBtnCount}>{ranked.filter((s) => s.evaluated).length}</span>
            )}
          </button>

          <button
            type="button"
            className={styles.rankBtn}
            onClick={() => setShowOverall(true)}
            title="View the top ranking across all batches"
          >
            <Trophy size={16} strokeWidth={2} aria-hidden="true" />
            Top Ranking
            {overallRanked.length > 0 && (
              <span className={styles.rankBtnCount}>{overallRanked.length}</span>
            )}
          </button>
        </div>
      </div>

      {/* Per-criterion grades for the clicked student */}
      {selected && (
        <div
          className={styles.drawerOverlay}
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <aside
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-criteria-title"
          >
            <div className={styles.rankModalHeader}>
              <div>
                <span className={styles.rankModalEyebrow}>Criteria Grades</span>
                <h3 id="student-criteria-title">{selected.name}</h3>
                <p>
                  {selected.student_number}
                  {selected.evaluated ? ` · Overall ${selected.percentage}% (${selected.grade})` : ' · Not yet evaluated'}
                </p>
              </div>
              <button
                type="button"
                className={styles.rankModalClose}
                onClick={() => setSelected(null)}
                aria-label="Close criteria grades"
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.drawerBody}>
              {!selected.evaluated ? (
                <p className={styles.empty}>This student has not been evaluated yet.</p>
              ) : breakdown.length === 0 ? (
                <p className={styles.empty}>No per-criterion ratings were recorded.</p>
              ) : (
                <>
                  <div className={styles.skillSummary}>
                    {strongest && (
                      <div className={styles.skillCard}>
                        <span className={styles.skillLabel}>Strongest</span>
                        <strong className={styles.skillName}>{strongest.name}</strong>
                        <span className={styles.skillScore}>{strongest.percentage}%</span>
                      </div>
                    )}
                    {weakest && weakest.name !== strongest?.name && (
                      <div className={`${styles.skillCard} ${styles.skillCardWeak}`}>
                        <span className={styles.skillLabel}>Weakest</span>
                        <strong className={styles.skillName}>{weakest.name}</strong>
                        <span className={styles.skillScore}>{weakest.percentage}%</span>
                      </div>
                    )}
                  </div>

                  {breakdown.map((cat) => (
                    <div key={cat.id} className={styles.criteriaBlock}>
                      <div className={styles.criteriaBlockHead}>
                        <span className={styles.criteriaBlockName}>{cat.name}</span>
                        <span className={styles.criteriaBlockPct}>{cat.percentage}%</span>
                      </div>
                      <span className={styles.criteriaBlockBar}>
                        <span
                          className={styles.criteriaBlockFill}
                          style={{ width: `${Math.min(100, cat.percentage)}%` }}
                        />
                      </span>
                      <ul className={styles.criteriaBlockList}>
                        {cat.items.map((item, i) => (
                          <li key={`${cat.id}-${i}`} className={styles.criteriaItem}>
                            <span className={styles.criteriaItemLabel}>{item.label}</span>
                            <span className={styles.criteriaItemRating}>
                              {item.rating === 'N/A' || item.rating == null
                                ? 'N/A'
                                : `${item.rating} / 5`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Overall ranking across all batches */}
      {showOverall && (
        <div
          className={styles.drawerOverlay}
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowOverall(false);
          }}
        >
          <aside
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-labelledby="overall-rank-title"
          >
            <div className={styles.rankModalHeader}>
              <div>
                <span className={styles.rankModalEyebrow}>All Batches</span>
                <h3 id="overall-rank-title">Top Ranking</h3>
                <p>Your students ranked from the highest score to the lowest.</p>
              </div>
              <button
                type="button"
                className={styles.rankModalClose}
                onClick={() => setShowOverall(false)}
                aria-label="Close ranking"
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.drawerBody}>
              {overallRanked.length === 0 ? (
                <p className={styles.empty}>No evaluated students yet.</p>
              ) : (
                <ol className={styles.rankModalList}>
                  {overallRanked.map((s) => (
                    <li key={`${s.batch_label}-${s.student_id}`} className={styles.rankModalRow}>
                      <span
                        className={`${styles.rankModalRank} ${
                          s.rank === 1
                            ? styles.rankFirst
                            : s.rank === 2
                              ? styles.rankSecond
                              : s.rank === 3
                                ? styles.rankThird
                                : ''
                        }`}
                      >
                        #{s.rank}
                      </span>
                      <span className={styles.rankModalName}>{s.name}</span>
                      <span className={styles.rankModalBatch}>{s.batch_label}</span>
                      <span className={styles.rankModalBar}>
                        <span
                          className={styles.rankModalFill}
                          style={{ width: `${Math.min(100, s.percentage)}%` }}
                        />
                      </span>
                      <span className={styles.rankModalScore}>{s.percentage}%</span>
                      <span className={styles.rankModalGrade}>{s.grade}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </aside>
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}

      {loading ? (
        <p className={styles.loading}>Loading...</p>
      ) : !batchId ? (
        <p className={styles.empty}>Select a batch in the sidebar to view grades.</p>
      ) : !group ? (
        <p className={styles.empty}>No data for the selected batch.</p>
      ) : (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>{group.batch_label}</h3>
          <p className={styles.muted} style={{ marginBottom: 0 }}>
            Supervisor: {group.supervisor_name}
          </p>

          {group.students.length === 0 ? (
            <p className={styles.empty}>No students in this batch.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Student ID</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Overall Score</th>
                    <th>Grade</th>
                    <th>Date Evaluated</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((s) => (
                    <tr
                      key={s.student_id}
                      className={styles.clickableRow}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelected(s)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelected(s);
                        }
                      }}
                      aria-label={`View criteria grades for ${s.name}`}
                    >
                      <td>{s.rank ? `#${s.rank}` : '—'}</td>
                      <td>{s.student_number}</td>
                      <td>{s.name}</td>
                      <td>{s.email}</td>
                      <td>{s.evaluated ? `${s.percentage}%` : '-'}</td>
                      <td>{s.evaluated ? s.grade : '-'}</td>
                      <td>
                        {s.created_at ? new Date(s.created_at).toLocaleDateString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Batch ranking drawer */}
      {showBatchRank && (
        <div
          className={styles.drawerOverlay}
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowBatchRank(false);
          }}
        >
          <aside
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-labelledby="batch-rank-title"
          >
            <div className={styles.drawerHeader}>
              <div>
                <span className={styles.rankModalEyebrow}>
                  {group?.batch_label || 'Selected Batch'}
                </span>
                <h3 id="batch-rank-title">Batch Ranking</h3>
                <p>Students in this batch ranked from highest to lowest.</p>
              </div>
              <button
                type="button"
                className={styles.rankModalClose}
                onClick={() => setShowBatchRank(false)}
                aria-label="Close batch ranking"
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.drawerBody}>
              {ranked.filter((s) => s.evaluated).length === 0 ? (
                <p className={styles.empty}>No evaluated students in this batch yet.</p>
              ) : (
                <ol className={styles.rankModalList}>
                  {ranked
                    .filter((s) => s.evaluated)
                    .map((s) => (
                      <li
                        key={s.student_id}
                        className={`${styles.drawerRow} ${
                          s.rank === 1 ? styles.drawerRowTop : ''
                        }`}
                      >
                        <span
                          className={`${styles.rankModalRank} ${
                            s.rank === 1
                              ? styles.rankFirst
                              : s.rank === 2
                                ? styles.rankSecond
                                : s.rank === 3
                                  ? styles.rankThird
                                  : ''
                          }`}
                        >
                          #{s.rank}
                        </span>
                        <span className={styles.drawerName}>{s.name}</span>
                        <span className={styles.drawerScore}>{s.percentage}%</span>
                        <span className={styles.drawerBar}>
                          <span
                            className={styles.rankModalFill}
                            style={{ width: `${Math.min(100, s.percentage)}%` }}
                          />
                        </span>
                        <span className={styles.drawerGrade}>{s.grade}</span>
                      </li>
                    ))}
                </ol>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

export default TeacherStudentEvaluations;
