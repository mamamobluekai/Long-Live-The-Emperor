// Supervisor overview → "Student Progress".
//
// A student list for every batch the supervisor owns. Clicking a student opens
// a centered modal showing:
//   1. Requirements — each document labelled Completed / Missing / Rejected
//   2. Attendance   — a horizontal bar graph, one bar per immersion day
//   3. Documentation — a horizontal bar graph, one bar per immersion day
//
// Design system: Lexend + the maroon palette from RequirementsReview.
import { useEffect, useMemo, useState } from 'react';
import { getSupervisorBatches, getSupervisorStudentProgress } from '../../../api/supervisorApi';
import { Users, X, FileText, CalendarCheck, NotebookPen, CheckCircle2, AlertCircle, Clock3, Loader2 } from 'lucide-react';
import styles from './SupervisorStudentProgress.module.css';

const getInitials = (first, last) =>
  `${first?.charAt(0) || ''}${last?.charAt(0) || ''}`.toUpperCase().slice(0, 2) || 'ST';

const fullName = (s) =>
  [s?.first_name, s?.middle_name, s?.last_name].filter(Boolean).join(' ').trim() || 'Unnamed student';

const SECTION_LABELS = {
  guardian: 'Guardian & Consent',
  medical: 'Medical',
  academic: 'Academic',
  personal: 'Personal',
};

// Green >= 90, amber >= 75, red below — same tiers as the teacher insights view.
const rateTone = (rate) => {
  if (rate >= 90) return styles.toneGood;
  if (rate >= 75) return styles.toneWarn;
  return styles.toneBad;
};

const fmtTime = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

const fmtShort = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

function SupervisorStudentProgress() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [active, setActive] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setListError('');
      try {
        const data = await getSupervisorBatches();
        if (!cancelled) setBatches(data.batches || []);
      } catch (err) {
        if (!cancelled) setListError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Flatten every batch into one list, remembering which batch each came from.
  const students = useMemo(() => {
    const rows = [];
    for (const batch of batches) {
      for (const student of batch.students || []) {
        rows.push({ student, batch });
      }
    }
    return rows;
  }, [batches]);

  const openStudent = async (student, batch) => {
    setActive({ student, batch });
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      const data = await getSupervisorStudentProgress(student.student_id);
      setDetail(data);
    } catch (err) {
      setDetailError(err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeStudent = () => {
    setActive(null);
    setDetail(null);
    setDetailError('');
  };

  return (
    <div className={styles.wrapper}>
      {/* SECTION HEADER */}
      <div className={styles.sectionHeader}>
        <div className={styles.sectionIcon}><Users size={19} /></div>
        <div>
          <h2>Student Progress</h2>
          <p>Click a student to review requirements, attendance and daily documentation.</p>
        </div>
      </div>

      {listError && (
        <div className={styles.errorAlert} role="alert">
          <AlertCircle size={15} />
          <span>{listError}</span>
        </div>
      )}

      {loading ? (
        <div className={styles.loading}>
          <Loader2 size={17} className={styles.spin} />
          Loading students…
        </div>
      ) : students.length === 0 ? (
        <div className={styles.empty}>
          <Users size={30} />
          <h3>No students assigned yet</h3>
          <p>Students appear here once the coordinator assigns them to your batch.</p>
        </div>
      ) : (
        <div className={styles.studentGrid}>
          {students.map(({ student, batch }) => {
            // One overall score: the mean of requirements, attendance and documentation.
            const overallRate = Math.round(
              ((student.requirements_rate || 0) +
                (student.attendance_rate || 0) +
                (student.documentation_rate || 0)) / 3
            );
            return (
            <button
              key={`${batch.request_id}-${student.student_id}`}
              type="button"
              className={styles.studentCard}
              onClick={() => openStudent(student, batch)}
            >
              <span className={styles.cardNameCol}>
                <strong className={styles.studentName}>{fullName(student)}</strong>
                <span className={styles.graphRow}>
                  <span className={styles.graphRowLabel}>Progress</span>
                  <span className={styles.graphRowTrack}>
                    <span
                      className={`${styles.graphRowFill} ${
                        overallRate >= 90
                          ? styles.toneGood
                          : overallRate >= 75
                            ? styles.toneWarn
                            : styles.toneBad
                      }`}
                      style={{ width: `${overallRate}%` }}
                    />
                  </span>
                  <span className={styles.graphRowValue}>{overallRate}%</span>
                </span>
              </span>
            </button>
            );
          })}
        </div>
      )}

      {/* ===== STUDENT PROGRESS MODAL ===== */}
      {active && (
        <div className={styles.overlay} onClick={closeStudent}>
          <div
            className={styles.panel}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className={styles.panelHeader}>
              <div className={styles.panelStudent}>
                <span className={styles.largeAvatar}>
                  {getInitials(active.student.first_name, active.student.last_name)}
                </span>
                <div>
                  <h2>{fullName(active.student)}</h2>
                  <p>
                    {active.student.student_number || '—'}
                    {active.student.grade_level ? ` · Grade ${active.student.grade_level}` : ''}
                    {active.student.track_strand ? ` · ${active.student.track_strand}` : ''}
                    {detail?.batch?.batch_label ? ` · ${detail.batch.batch_label}` : ''}
                  </p>
                </div>
              </div>
              <button type="button" className={styles.closeButton} onClick={closeStudent} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className={styles.panelBody}>
              {detailLoading && (
                <div className={styles.loading}>
                  <Loader2 size={17} className={styles.spin} />
                  Loading progress…
                </div>
              )}

              {detailError && (
                <div className={styles.errorAlert} role="alert">
                  <AlertCircle size={15} />
                  <span>{detailError}</span>
                </div>
              )}

              {!detailLoading && !detailError && detail && (
                <>
                  {/* ---------- 1. REQUIREMENTS ---------- */}
                  <div className={styles.section}>
                    <div className={styles.sectionHeading}>
                      <div className={styles.headingLeft}>
                        <span className={styles.headingIcon}><FileText size={15} /></span>
                        <div>
                          <h3>Requirements</h3>
                          <p>Documents labelled by the coordinator</p>
                        </div>
                      </div>
                      <span
                        className={`${styles.pill} ${
                          detail.requirements.completed === detail.requirements.total
                            ? styles.badgeGood
                            : styles.badgePending
                        }`}
                      >
                        {detail.requirements.completed}/{detail.requirements.total} completed
                      </span>
                    </div>

                    <div className={styles.progressTrack}>
                      <div
                        className={`${styles.progressFill} ${styles.toneReq}`}
                        style={{
                          width: detail.requirements.total
                            ? `${(detail.requirements.completed / detail.requirements.total) * 100}%`
                            : '0%',
                        }}
                      />
                    </div>

                    <div className={styles.reqGroups}>
                      {Object.entries(
                        detail.requirements.items.reduce((groups, item) => {
                          const key = item.section || 'other';
                          (groups[key] = groups[key] || []).push(item);
                          return groups;
                        }, {})
                      ).map(([section, items]) => (
                        <div key={section} className={styles.reqGroup}>
                          <div className={styles.reqGroupTitle}>
                            {SECTION_LABELS[section] || section}
                            <span>{items.filter((i) => i.completed).length}/{items.length}</span>
                          </div>
                          <div className={styles.reqList}>
                            {items.map((item) => (
                              <div key={item.id} className={styles.reqRow}>
                                {item.completed ? (
                                  <CheckCircle2 size={15} className={styles.iconGood} />
                                ) : item.rejected ? (
                                  <AlertCircle size={15} className={styles.iconBad} />
                                ) : item.uploaded ? (
                                  <Clock3 size={15} className={styles.iconWarn} />
                                ) : (
                                  <Clock3 size={15} className={styles.iconMuted} />
                                )}
                                <span className={styles.reqName}>{item.name}</span>
                                <span
                                  className={`${styles.miniBadge} ${
                                    item.completed
                                      ? styles.badgeGood
                                      : item.rejected
                                        ? styles.badgeBad
                                        : item.uploaded
                                          ? styles.badgePending
                                          : styles.badgeMuted
                                  }`}
                                >
                                  {item.completed ? 'Completed' : item.status}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/*__SEC1__*/}
                  {/* ---------- 2. ATTENDANCE (horizontal graph) ---------- */}
                  <div className={styles.section}>
                    <div className={styles.sectionHeading}>
                      <div className={styles.headingLeft}>
                        <span className={styles.headingIcon}><CalendarCheck size={15} /></span>
                        <div>
                          <h3>Attendance</h3>
                          <p>One bar per immersion day</p>
                        </div>
                      </div>
                      <span className={`${styles.pill} ${rateTone(detail.attendance.rate)}`}>
                        {detail.attendance.present}/{detail.attendance.total} days · {detail.attendance.rate}%
                      </span>
                    </div>

                    <div className={styles.progressTrack}>
                      <div
                        className={`${styles.progressFill} ${rateTone(detail.attendance.rate)}`}
                        style={{ width: `${detail.attendance.rate}%` }}
                      />
                    </div>

                    {detail.attendance.days.length === 0 ? (
                      <p className={styles.noteText}>No immersion days scheduled yet.</p>
                    ) : (
                      <div className={styles.graph}>
                        {detail.attendance.days.map((day) => (
                          <div key={day.date} className={styles.graphCol}>
                            <div
                              className={`${styles.graphBar} ${
                                day.present ? styles.barPresent : styles.barAbsent
                              }`}
                              title={`Day ${day.day_number} · ${day.status} · ${day.date}${
                                day.check_in_time
                                  ? ` · in ${fmtTime(day.check_in_time)} / out ${fmtTime(day.check_out_time)}`
                                  : ''
                              }`}
                            >
                              <span className={styles.graphBarDay}>{day.day_number}</span>
                            </div>
                            <span className={styles.graphLabel}>{fmtShort(day.date)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ---------- 3. DAILY DOCUMENTATION (horizontal graph) ---------- */}
                  <div className={styles.section}>
                    <div className={styles.sectionHeading}>
                      <div className={styles.headingLeft}>
                        <span className={styles.headingIcon}><NotebookPen size={15} /></span>
                        <div>
                          <h3>Daily Documentation</h3>
                          <p>Submitted and reviewed per immersion day</p>
                        </div>
                      </div>
                      <span className={`${styles.pill} ${rateTone(detail.documentation.rate)}`}>
                        {detail.documentation.completed}/{detail.documentation.total} days ·{' '}
                        {detail.documentation.rate}%
                      </span>
                    </div>

                    <div className={styles.progressTrack}>
                      <div
                        className={`${styles.progressFill} ${rateTone(detail.documentation.rate)}`}
                        style={{ width: `${detail.documentation.rate}%` }}
                      />
                    </div>

                    {detail.documentation.days.length === 0 ? (
                      <p className={styles.noteText}>No immersion days scheduled yet.</p>
                    ) : (
                      <div className={styles.graph}>
                        {detail.documentation.days.map((day) => (
                          <div key={day.date} className={styles.graphCol}>
                            <div
                              className={`${styles.graphBar} ${
                                day.completed
                                  ? styles.barPresent
                                  : day.submitted
                                    ? styles.barPending
                                    : styles.barAbsent
                              }`}
                              title={`Day ${day.day_number} · ${day.status} · ${day.date}`}
                            >
                              <span className={styles.graphBarDay}>{day.day_number}</span>
                            </div>
                            <span className={styles.graphLabel}>
                              {day.score !== null && day.score !== undefined ? day.score : fmtShort(day.date)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {/*__SEC2__*/}
                </>
              )}
            </div>

            <div className={styles.panelFooter}>
              <span className={styles.footerNote}>
                {detail ? `Requirements: ${detail.requirements.status}` : ''}
              </span>
              <button type="button" className={styles.secondaryButton} onClick={closeStudent}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SupervisorStudentProgress;
