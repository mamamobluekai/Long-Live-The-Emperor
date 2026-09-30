import { useEffect, useMemo, useState } from 'react';
import { getSupervisorBatches } from '../../../api/supervisorApi';
import Feedback from '../../../components/Feedback';
import StudentDetailModal from '../../../components/shared/StudentDetailModal';
import PersonDrawer from '../../../components/shared/PersonDrawer';
import { getStudentName } from '../../../components/shared/studentFields';
import { Layers, UserCog, Briefcase } from 'lucide-react';
import styles from './SupervisorStudent.module.css';

const joinName = (first, last) => `${first || ''} ${last || ''}`.trim() || 'Not provided';

function SupervisorStudents() {
  const [batches, setBatches] = useState([]);
  const [activePerson, setActivePerson] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [term, setTerm] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      setError('');
      try {
        const data = await getSupervisorBatches();
        if (!cancelled) setBatches(data.batches || []);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  const openStudent = (student, batch) => {
    setSelectedStudent({ student, batch });
  };

  const closeStudent = () => {
    setSelectedStudent(null);
  };

  // Teacher / coordinator profile opens in the shared side drawer.
  const openPerson = (role, batch) => {
    if (role === 'teacher') {
      setActivePerson({
        role: 'Teacher',
        firstName: batch.teacher_first_name,
        lastName: batch.teacher_last_name,
        batchLabel: batch.batch_label,
        fields: [
          { label: 'Full Name', value: joinName(batch.teacher_first_name, batch.teacher_last_name) },
          { label: 'Employee ID', value: batch.teacher_employee_id },
          { label: 'Department', value: batch.teacher_department },
          { label: 'Designation', value: batch.teacher_designation },
          { label: 'School', value: batch.teacher_school },
          { label: 'Email', value: batch.teacher_email },
          { label: 'Phone', value: batch.teacher_phone },
          { label: 'Batch', value: batch.batch_label },
        ],
      });
      return;
    }

    setActivePerson({
      role: 'Coordinator',
      firstName: batch.coordinator_first_name,
      lastName: batch.coordinator_last_name,
      batchLabel: batch.batch_label,
      fields: [
        { label: 'Full Name', value: joinName(batch.coordinator_first_name, batch.coordinator_last_name) },
        { label: 'Employee ID', value: batch.coordinator_employee_id },
        { label: 'Department', value: batch.coordinator_department },
        { label: 'Designation', value: batch.coordinator_designation },
        { label: 'School', value: batch.coordinator_school },
        { label: 'Email', value: batch.coordinator_email },
        { label: 'Phone', value: batch.coordinator_phone },
        { label: 'Batch', value: batch.batch_label },
      ],
    });
  };

  const closePerson = () => setActivePerson(null);

  // Search only runs on submit, so `term` is the committed query.
  const handleSearch = (event) => {
    event.preventDefault();
    setTerm(query.trim());
  };

  const clearSearch = () => {
    setQuery('');
    setTerm('');
  };

  // Students per batch, filtered by the committed search term.
  const visibleBatches = useMemo(() => {
    const needle = term.toLowerCase();
    return batches
      .map((batch) => {
        const rows = batch.students || [];
        const batchMeta = [
          batch.batch_label,
          batch.strand,
          batch.teacher_first_name,
          batch.teacher_last_name,
          batch.coordinator_first_name,
          batch.coordinator_last_name,
        ]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(needle));
        if (!needle) return { ...batch, visibleStudents: rows };
        return {
          ...batch,
          visibleStudents: batchMeta
            ? rows
            : rows.filter((student) =>
                [
                  getStudentName(student),
                  student.student_number,
                  student.student_id,
                  student.email,
                  student.contact_number,
                  student.phone,
                  student.track_strand,
                ]
                  .filter(Boolean)
                  .some((field) => String(field).toLowerCase().includes(needle))
              ),
        };
      })
      .filter((batch) => !needle || batch.visibleStudents.length > 0);
  }, [batches, term]);

  const totalMatches = visibleBatches.reduce(
    (sum, batch) => sum + batch.visibleStudents.length,
    0
  );

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div className={styles.headerMain}>
          <span className={styles.headerIcon}><Layers size={22} /></span>
          <div>
            <span className={styles.eyebrow}>Supervisor</span>
            <h2>My Batches</h2>
            <p>Teacher and coordinator information for every batch assigned to you.</p>
          </div>
        </div>
      </div>

      {error && <Feedback type="error" message={error} />}

      {loading ? (
        <p className={styles.loading}>Loading batches...</p>
      ) : batches.length === 0 ? (
        <p className={styles.empty}>No batches assigned to you yet.</p>
      ) : (
        <>
          <form className={styles.searchBar} onSubmit={handleSearch}>
            <input
              className={styles.searchInput}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search batches, teachers, coordinators or students..."
              aria-label="Search batches"
            />
            <button type="submit" className={styles.searchButton}>Search</button>
            {query && (
              <button type="button" className={styles.clearButton} onClick={clearSearch}>
                Clear
              </button>
            )}
          </form>

          {visibleBatches.length === 0 ? (
            <p className={styles.empty}>No batches or students match your search.</p>
          ) : (
            <div className={styles.batchList}>
              {visibleBatches.map((batch) => (
                <section
                  key={`${batch.source}-${batch.request_id}`}
                  className={styles.batchCard}
                >
                  <header className={styles.batchHeader}>
                    <div>
                      <h3>{batch.batch_label}</h3>
                      {batch.strand ? (
                        <span className={styles.badge}>{batch.strand}</span>
                      ) : null}
                    </div>
                    <span className={styles.batchCount}>
                      {batch.visibleStudents.length} student{batch.visibleStudents.length === 1 ? '' : 's'}
                    </span>
                  </header>

                  <div className={styles.batchPeople}>
                    <button
                      type="button"
                      className={styles.personCard}
                      onClick={() => openPerson('teacher', batch)}
                    >
                      <span className={styles.personIcon}><UserCog size={16} /></span>
                      <span className={styles.personText}>
                        <span className={styles.personLabel}>Teacher</span>
                        <strong>
                          {batch.teacher_first_name
                            ? `${batch.teacher_first_name} ${batch.teacher_last_name || ''}`.trim()
                            : 'Not assigned'}
                        </strong>
                      </span>
                    </button>

                    <button
                      type="button"
                      className={styles.personCard}
                      onClick={() => openPerson('coordinator', batch)}
                    >
                      <span className={styles.personIcon}><Briefcase size={16} /></span>
                      <span className={styles.personText}>
                        <span className={styles.personLabel}>Coordinator</span>
                        <strong>
                          {batch.coordinator_first_name
                            ? `${batch.coordinator_first_name} ${batch.coordinator_last_name || ''}`.trim()
                            : 'Not assigned'}
                        </strong>
                      </span>
                    </button>
                  </div>

                  {batch.visibleStudents.length === 0 ? (
                    <p className={styles.empty}>No students in this batch.</p>
                  ) : (
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Student ID</th>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Strand</th>
                            <th>Contact No.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {batch.visibleStudents.map((student) => (
                            <tr
                              key={`${batch.source}-${batch.request_id}-${student.student_id}`}
                              className={styles.studentRow}
                              onClick={() => openStudent(student, batch)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  openStudent(student, batch);
                                }
                              }}
                              role="button"
                              tabIndex={0}
                              aria-label={`View information for ${getStudentName(student)}`}
                            >
                              <td>{student.student_number || student.student_id}</td>
                              <td>{getStudentName(student)}</td>
                              <td>{student.email}</td>
                              <td>{student.track_strand || student.strand || '-'}</td>
                              <td>{student.contact_number || student.phone || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}

          {term && totalMatches > 0 && (
            <p className={styles.resultNote}>
              {totalMatches} student{totalMatches === 1 ? '' : 's'} found.
            </p>
          )}
        </>
      )}

      {activePerson && <PersonDrawer person={activePerson} onClose={closePerson} />}

      {selectedStudent && (() => {
        const { student, batch } = selectedStudent;

        return (
          <StudentDetailModal student={student} batch={batch} onClose={closeStudent} variant="drawer">
            <div className={styles.modalActions}>
              <button type="button" className={styles.closeAction} onClick={closeStudent}>
                Close
              </button>
            </div>
          </StudentDetailModal>
        );
      })()}
    </div>
  );
}

export default SupervisorStudents;
