// Coordinator → "Deployment Requests".
//
// Supervisors request a number of students. Here the COORDINATOR names the batch,
// picks the eligible students and assigns a teacher. Fulfilling the request
// creates a real teacher batch with the requesting supervisor attached — the
// supervisor is assigned exactly the way a teacher is.
//
// Design system: Lexend + the maroon palette from RequirementsReview.
import { useEffect, useMemo, useState } from 'react';
import {
  getMyDeploymentRequests,
  getDeploymentRequestStudents,
  fulfillSupervisorRequest,
  deleteDeploymentRequest,
  getCompletedStudents,
  getTeachers,
} from '../../../api/coordinatorApi';
import {
  Search,
  X,
  CheckCircle2,
  Inbox,
  Users,
  BriefcaseBusiness,
  Send,
  Trash2,
  UserCheck,
  Tag,
  ShieldCheck,
} from 'lucide-react';
import styles from '../supervisorDashboard/Deployment.module.css';

const AWAITING_LABEL = 'Awaiting coordinator';

const statusBadge = (status) => {
  const map = {
    pending: styles.badgePending,
    approved: styles.badgeApproved,
    rejected: styles.badgeRejected,
    fulfilled: styles.badgeFulfilled,
  };
  return map[String(status || '').toLowerCase()] || styles.badgePending;
};

const fmtDate = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

function DeploymentRequests() {
  const [requests, setRequests] = useState([]);
  const [eligible, setEligible] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [toasts, setToasts] = useState([]);

  // The coordinator's labelling + assignment panel.
  const [active, setActive] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [panelError, setPanelError] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [form, setForm] = useState({ batch_label: '', teacher_id: '', max_students: '', student_ids: [] });
  const [deleting, setDeleting] = useState(null);

  const showToast = (type, message) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  };
  const showSuccess = (m) => showToast('success', m);
  const showError = (m) => showToast('error', m);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [r, s, t] = await Promise.all([
        getMyDeploymentRequests(),
        getCompletedStudents(),
        getTeachers(),
      ]);
      setRequests(r.deployment_requests || []);
      setEligible(s.students || []);
      setTeachers(t.teachers || []);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const stats = useMemo(() => {
    const incoming = requests.filter((r) => r.direction === 'supervisor_to_coordinator');
    return {
      awaiting: incoming.filter((r) => r.status === 'pending').length,
      labelled: incoming.filter((r) => r.status === 'fulfilled').length,
      supervisors: new Set(
        incoming.map((r) => `${r.supervisor_first_name}${r.supervisor_last_name}${r.supervisor_company}`)
      ).size,
      students: incoming.reduce((sum, r) => sum + Number(r.num_students || 0), 0),
    };
  }, [requests]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter !== 'all' && String(r.status).toLowerCase() !== statusFilter) return false;
      if (!q) return true;
      const label =
        r.batch_label === AWAITING_LABEL ? 'awaiting coordinator' : String(r.batch_label || '').toLowerCase();
      const name = `${r.supervisor_first_name || ''} ${r.supervisor_last_name || ''}`.toLowerCase();
      const company = String(r.supervisor_company || '').toLowerCase();
      return label.includes(q) || name.includes(q) || company.includes(q);
    });
  }, [requests, search, statusFilter]);

  const eligibleFiltered = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return eligible;
    return eligible.filter((s) =>
      `${s.first_name || ''} ${s.last_name || ''} ${s.student_number || ''} ${s.track_strand || ''}`
        .toLowerCase()
        .includes(q)
    );
  }, [eligible, studentSearch]);

  const openAssign = async (request) => {
    setActive(request);
    setPanelError('');
    setStudentSearch('');
    setForm({
      batch_label: request.batch_label === AWAITING_LABEL ? '' : request.batch_label || '',
      teacher_id: '',
      max_students: String(request.num_students || ''),
      student_ids: [],
    });
    try {
      const data = await getDeploymentRequestStudents(request.id);
      setForm((prev) => ({ ...prev, student_ids: (data.students || []).map((s) => Number(s.id)) }));
    } catch {
      /* leave selection empty */
    }
  };

  const closeAssign = () => {
    setActive(null);
    setPanelError('');
  };

  const toggleStudent = (userId) => {
    setForm((prev) => ({
      ...prev,
      student_ids: prev.student_ids.includes(userId)
        ? prev.student_ids.filter((id) => id !== userId)
        : [...prev.student_ids, userId],
    }));
  };

  const handleFulfill = async () => {
    setPanelError('');
    if (!form.batch_label.trim()) {
      setPanelError('You must label this batch.');
      return;
    }
    if (!form.teacher_id) {
      setPanelError('Assign a teacher to this batch.');
      return;
    }
    if (form.student_ids.length !== Number(active.num_students)) {
      setPanelError(`Select exactly ${active.num_students} students (${form.student_ids.length} selected).`);
      return;
    }

    setAssigning(true);
    try {
      await fulfillSupervisorRequest(active.id, {
        batch_label: form.batch_label.trim(),
        student_ids: form.student_ids,
        teacher_id: Number(form.teacher_id),
        max_students: Number(form.max_students) || form.student_ids.length,
      });
      showSuccess(`Batch "${form.batch_label.trim()}" created and assigned.`);
      closeAssign();
      await loadAll();
    } catch (err) {
      setPanelError(err.message);
    } finally {
      setAssigning(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteDeploymentRequest(deleting.id);
      showSuccess('Request removed.');
      setDeleting(null);
      await loadAll();
    } catch (err) {
      showError(err.message);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.toastContainer}>
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`${styles.toast} ${t.type === 'success' ? styles.toastSuccess : styles.toastError}`}
            role="status"
          >
            <span className={styles.toastIcon}>
              {t.type === 'success' ? <CheckCircle2 size={17} /> : <X size={17} />}
            </span>
            <span className={styles.toastMessage}>{t.message}</span>
            <button
              type="button"
              className={styles.toastClose}
              onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))}
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <div>
            <div className={styles.eyebrow}>Work Immersion Office</div>
            <h1>Deployment Requests</h1>
            <p>
              Supervisors request students; you name the batch, pick who goes in, and assign the
              teacher. The supervisor is then attached to that batch.
            </p>
          </div>
          {/* Sits at the trailing edge of the header. The inline margin is used
              instead of a shared .headerLeft change so the supervisor's
              CreateDeploymentRequest header keeps its original layout. */}
          <div className={styles.headerIcon} style={{ marginLeft: 'auto' }} aria-hidden="true">
            <Send size={23} />
          </div>
        </div>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statRed}`}>
            <Inbox size={20} />
          </div>
          <div>
            <span className={styles.statLabel}>Awaiting label</span>
            <strong>{stats.awaiting}</strong>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statGreen}`}>
            <Tag size={20} />
          </div>
          <div>
            <span className={styles.statLabel}>Batches labelled</span>
            <strong>{stats.labelled}</strong>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statBlue}`}>
            <BriefcaseBusiness size={20} />
          </div>
          <div>
            <span className={styles.statLabel}>Partner supervisors</span>
            <strong>{stats.supervisors}</strong>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statIcon} ${styles.statOrange}`}>
            <Users size={20} />
          </div>
          <div>
            <span className={styles.statLabel}>Students requested</span>
            <strong>{stats.students}</strong>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2>Incoming Requests</h2>
            <p>Every supervisor request, with the batch label you assigned.</p>
          </div>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={15} />
            <input
              type="text"
              placeholder="Search by batch, supervisor or company…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className={styles.searchClear}
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <select
            className={styles.filter}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="fulfilled">Fulfilled</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {loading ? (
          <div className={styles.loading}>
            <span className={styles.spinner} />
            Loading requests…
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <Inbox size={34} />
            <h3>{requests.length === 0 ? 'No requests yet' : 'No matching requests'}</h3>
            <p>
              {requests.length === 0
                ? 'Supervisor requests will appear here for you to label and assign.'
                : 'Try a different search or status filter.'}
            </p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Supervisor / Institution</th>
                  <th>Students</th>
                  <th>Requested</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const isAwaiting = r.batch_label === AWAITING_LABEL;
                  const isFulfilled = r.status === 'fulfilled';
                  return (
                    <tr key={r.id}>
                      <td>
                        {isAwaiting ? (
                          <span className={styles.awaitingLabel}>
                            <Tag size={12} />
                            Not yet labelled
                          </span>
                        ) : (
                          <strong className={styles.labelStrong}>{r.batch_label}</strong>
                        )}
                        {r.strand && <span className={styles.cellMeta}>{r.strand}</span>}
                      </td>
                      <td>
                        <div className={styles.documentCount}>
                          <ShieldCheck size={13} />
                          {r.supervisor_first_name} {r.supervisor_last_name}
                        </div>
                        {r.supervisor_company && (
                          <span className={styles.cellMeta}>{r.supervisor_company}</span>
                        )}
                      </td>
                      <td>
                        <span className={styles.documentCount}>
                          <Users size={13} />
                          {r.num_students}
                        </span>
                        {Number(r.student_count) > 0 && (
                          <span className={styles.cellMeta}>{r.student_count} assigned</span>
                        )}
                      </td>
                      <td>{fmtDate(r.created_at)}</td>
                      <td>
                        <span className={`${styles.badge} ${statusBadge(r.status)}`}>{r.status}</span>
                      </td>
                      <td>
                        <div className={styles.rowActions}>
                          <button
                            type="button"
                            className={styles.reviewButton}
                            onClick={() => openAssign(r)}
                            disabled={isFulfilled}
                            title={isFulfilled ? 'Already fulfilled' : 'Label batch and assign students'}
                          >
                            <UserCheck size={14} />
                            {isFulfilled ? 'Assigned' : 'Label & Assign'}
                          </button>
                          {!isFulfilled && (
                            <button
                              type="button"
                              className={`${styles.reviewButton} ${styles.dangerButton}`}
                              onClick={() => setDeleting(r)}
                              aria-label="Delete request"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {active && (
        <div className={styles.overlay} onClick={closeAssign}>
          <div
            className={styles.reviewPanel}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className={styles.panelHeader}>
              <div className={styles.panelStudent}>
                <div className={styles.largeAvatar}>
                  <UserCheck size={19} />
                </div>
                <div>
                  <h2>Label & Assign</h2>
                  <p>
                    {active.supervisor_first_name} {active.supervisor_last_name}
                    {active.supervisor_company ? ` · ${active.supervisor_company}` : ''} ·{' '}
                    {active.num_students} student{Number(active.num_students) === 1 ? '' : 's'} requested
                  </p>
                </div>
              </div>
              <button type="button" className={styles.closeButton} onClick={closeAssign} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className={styles.panelBody}>
              <div className={styles.reviewSection}>
                {panelError && (
                  <div className={styles.errorAlert} role="alert">
                    <X size={15} />
                    <span>{panelError}</span>
                  </div>
                )}

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label htmlFor="assign-label">Batch label *</label>
                    <input
                      id="assign-label"
                      type="text"
                      className={styles.formInput}
                      placeholder="e.g. ICT-A 2026"
                      value={form.batch_label}
                      onChange={(e) => setForm({ ...form, batch_label: e.target.value })}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="assign-teacher">Teacher *</label>
                    <select
                      id="assign-teacher"
                      className={styles.formInput}
                      value={form.teacher_id}
                      onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}
                    >
                      <option value="">Select a teacher</option>
                      {teachers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.first_name} {t.last_name}
                          {t.department ? ` — ${t.department}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="assign-max">Max students</label>
                    <input
                      id="assign-max"
                      type="number"
                      min="1"
                      className={styles.formInput}
                      value={form.max_students}
                      onChange={(e) => setForm({ ...form, max_students: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className={styles.documentsSection}>
                <div className={styles.sectionHeading}>
                  <div>
                    <h3>Select students</h3>
                    <p>Only students who completed all requirements are listed.</p>
                  </div>
                  <span
                    className={`${styles.documentTotal} ${
                      form.student_ids.length === Number(active.num_students)
                        ? styles.totalComplete
                        : styles.totalIncomplete
                    }`}
                  >
                    {form.student_ids.length}/{active.num_students}
                  </span>
                </div>

                <div className={styles.pickerSearch}>
                  <div className={styles.searchBox}>
                    <Search size={15} />
                    <input
                      type="text"
                      placeholder="Search students…"
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                    />
                  </div>
                </div>

                {eligibleFiltered.length === 0 ? (
                  <div className={styles.empty}>
                    <Users size={28} />
                    <h3>No eligible students</h3>
                    <p>Students appear here once their requirements reach 100%.</p>
                  </div>
                ) : (
                  <div className={styles.studentPicker}>
                    {eligibleFiltered.map((s) => {
                      const checked = form.student_ids.includes(Number(s.id));
                      return (
                        <label key={s.id} className={`${styles.pickRow} ${checked ? styles.pickRowOn : ''}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleStudent(Number(s.id))}
                          />
                          <span className={styles.pickName}>
                            {s.first_name} {s.last_name}
                            <span className={styles.pickMeta}>
                              {s.student_number || '—'}
                              {s.track_strand ? ` · ${s.track_strand}` : ''}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className={styles.panelFooter}>
              <button type="button" className={styles.secondaryButton} onClick={closeAssign}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleFulfill}
                disabled={assigning}
              >
                <UserCheck size={15} />
                {assigning ? 'Assigning…' : 'Assign & Notify'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div className={styles.overlay} onClick={() => setDeleting(null)}>
          <div
            className={styles.confirmModal}
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
          >
            <div className={styles.confirmIcon}>
              <Trash2 size={28} />
            </div>
            <h3>Delete this request?</h3>
            <p>
              {deleting.batch_label === AWAITING_LABEL ? 'This request' : `"${deleting.batch_label}"`} from{' '}
              {deleting.supervisor_first_name} {deleting.supervisor_last_name} will be removed.
            </p>
            <p className={styles.confirmNote}>This cannot be undone.</p>
            <div className={styles.confirmActions}>
              <button type="button" className={styles.confirmCancel} onClick={() => setDeleting(null)}>
                Cancel
              </button>
              <button type="button" className={styles.confirmDelete} onClick={handleDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DeploymentRequests;




