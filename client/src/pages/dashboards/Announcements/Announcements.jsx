import { useCallback, useEffect, useState } from 'react';
import { Bell, CalendarDays, Edit3, Heart, History, Megaphone, MessageCircle, Plus, Trash2, X } from 'lucide-react';
import { createFeedPost, deleteFeedPost, getFeedPosts, getPostComments, likeFeedPost, updateFeedPost } from '../../../api/feedApi';
import CommentList from '../../../components/social/CommentList';
import styles from './Announcements.module.css';

const STAFF_ROLES = new Set(['coordinator', 'teacher', 'supervisor']);
const AUDIENCE_LABELS = {
  all: 'All users',
  student: 'Students only',
  teacher: 'Teachers only',
  supervisor: 'Supervisors only',
  coordinator: 'Coordinators only',
};

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const emptyForm = { title: '', content: '', audience: 'all' };

export default function Announcements({ user }) {
  const canManage = STAFF_ROLES.has(user?.role);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [showOwnAnnouncements, setShowOwnAnnouncements] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [likedPosts, setLikedPosts] = useState({});
  const [likesTotals, setLikesTotals] = useState({});
  const [commentsTotals, setCommentsTotals] = useState({});
  const [commentsByPost, setCommentsByPost] = useState({});
  const [openComments, setOpenComments] = useState({});

  const loadAnnouncements = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getFeedPosts({
        type: 'announcement',
        sort: 'latest',
        page: 1,
        limit: 50,
      });
      const posts = data.posts || [];
      setAnnouncements(posts);
      setLikedPosts(Object.fromEntries(posts.map((post) => [post.id, Boolean(post.viewer_liked)])));
      setLikesTotals(Object.fromEntries(posts.map((post) => [post.id, Number(post.likes_count) || 0])));
      setCommentsTotals(Object.fromEntries(posts.map((post) => [post.id, Number(post.comments_count) || 0])));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setModalOpen(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.content.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        postType: 'announcement',
        title: form.title.trim(),
        content: form.content.trim(),
        audience: form.audience,
      };
      if (editingId) {
        await updateFeedPost(editingId, payload);
      } else {
        await createFeedPost(payload);
      }
      resetForm();
      setShowOwnAnnouncements(true);
      await loadAnnouncements();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (announcement) => {
    setEditingId(announcement.id);
    setForm({
      title: announcement.title || '',
      content: announcement.content || '',
      audience: announcement.audience || 'all',
    });
    setModalOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    setError('');
    try {
      await deleteFeedPost(id);
      if (editingId === id) resetForm();
      await loadAnnouncements();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleLike = async (post) => {
    try {
      const result = await likeFeedPost(post.id);
      setLikedPosts((current) => ({ ...current, [post.id]: result.liked }));
      setLikesTotals((current) => ({
        ...current,
        [post.id]: Math.max(0, Number(current[post.id] || 0) + (result.liked ? 1 : -1)),
      }));
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleComments = async (postId) => {
    if (openComments[postId]) {
      setOpenComments((current) => ({ ...current, [postId]: false }));
      return;
    }
    try {
      const data = await getPostComments(postId);
      setCommentsByPost((current) => ({ ...current, [postId]: data.comments || [] }));
      setOpenComments((current) => ({ ...current, [postId]: true }));
    } catch (err) {
      setError(err.message);
    }
  };

  const addComment = (postId, comment) => {
    const enriched = {
      ...comment,
      user_id: comment.user_id ?? user?.id,
      user_first_name: comment.user_first_name ?? user?.first_name ?? '',
      user_last_name: comment.user_last_name ?? user?.last_name ?? '',
      user_role: comment.user_role ?? user?.role ?? 'student',
    };
    setCommentsByPost((current) => ({
      ...current,
      [postId]: [...(current[postId] || []), enriched],
    }));
    setCommentsTotals((current) => ({
      ...current,
      [postId]: Number(current[postId] || 0) + 1,
    }));
  };

  const removeComment = (postId, commentId) => {
    setCommentsByPost((current) => ({
      ...current,
      [postId]: (current[postId] || []).filter((comment) => comment.id !== commentId),
    }));
    setCommentsTotals((current) => ({
      ...current,
      [postId]: Math.max(0, Number(current[postId] || 0) - 1),
    }));
  };

  const updateCommentInPost = (postId, comment) => {
    setCommentsByPost((current) => ({
      ...current,
      [postId]: (current[postId] || []).map((item) => (
        item.id === comment.id ? { ...item, ...comment } : item
      )),
    }));
  };

  const ownAnnouncements = announcements.filter(
    (announcement) => String(announcement.author_id) === String(user?.id),
  );
  const otherAnnouncements = announcements.filter(
    (announcement) => String(announcement.author_id) !== String(user?.id),
  );
  const visibleAnnouncements = canManage && showOwnAnnouncements ? ownAnnouncements : otherAnnouncements;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Important updates</span>
          <h1>Announcements</h1>
          <p>
            {canManage
              ? 'Publish official updates and choose who receives each announcement.'
              : 'Read official updates from your teachers, supervisors, and coordinator.'}
          </p>
        </div>
        <div className={styles.headerIcon} aria-hidden="true"><Megaphone size={23} /></div>
      </header>

      {canManage && (
        <div className={styles.pageActions}>
          <button type="button" className={styles.primaryButton} onClick={() => setModalOpen(true)}>
            <Plus size={16} /> Create announcement
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => setShowOwnAnnouncements((current) => !current)}
          >
            <History size={16} /> {showOwnAnnouncements ? 'View other announcements' : 'View your created announcements'}
          </button>
        </div>
      )}

      {error && <div className={styles.errorAlert} role="alert">{error}</div>}

      <section className={styles.listSection}>
        <div className={styles.listHeader}>
          <div>
            <h2>{canManage && showOwnAnnouncements ? 'Your created announcements' : 'Announcements'}</h2>
            <p>{visibleAnnouncements.length} visible {visibleAnnouncements.length === 1 ? 'announcement' : 'announcements'}</p>
          </div>
          <div className={styles.liveBadge}><span /> Live</div>
        </div>

        {loading ? (
          <div className={styles.state}>Loading announcements...</div>
        ) : visibleAnnouncements.length === 0 ? (
          <div className={styles.state}>
            <Bell size={24} />
            <strong>{canManage && showOwnAnnouncements ? 'You have not created any announcements' : 'No role announcements yet'}</strong>
            <span>New announcements will appear here.</span>
          </div>
        ) : (
          <div className={styles.list}>
            {visibleAnnouncements.map((announcement) => {
              const isAuthor = canManage && String(announcement.author_id) === String(user?.id);

              return (
                <article key={announcement.id} className={styles.card}>
                  <div className={styles.cardIcon}><Bell size={18} /></div>
                  <div className={styles.cardBody}>
                    <div className={styles.cardMeta}>
                      <span className={styles.publisher}>
                        <strong>{`${announcement.author_first_name || ''} ${announcement.author_last_name || ''}`.trim() || 'Announcement author'}</strong>
                        <em>{announcement.author_role || 'staff'}</em>
                      </span>
                      <span><CalendarDays size={13} /> {formatDate(announcement.created_at)}</span>
                    </div>
                    {announcement.title && <h3>{announcement.title}</h3>}
                    <p>{announcement.content}</p>
                    <div className={styles.engagementBar}>
                      <button
                        type="button"
                        className={`${styles.engagementButton} ${likedPosts[announcement.id] ? styles.engagementButtonLiked : ''}`}
                        onClick={() => handleLike(announcement)}
                        aria-pressed={Boolean(likedPosts[announcement.id])}
                      >
                        <Heart size={18} />
                        {likesTotals[announcement.id] || 0} {likesTotals[announcement.id] === 1 ? 'reaction' : 'reactions'}
                      </button>
                      <button
                        type="button"
                        className={styles.engagementButton}
                        onClick={() => toggleComments(announcement.id)}
                        aria-expanded={Boolean(openComments[announcement.id])}
                      >
                        <MessageCircle size={18} />
                        {commentsTotals[announcement.id] || 0} {commentsTotals[announcement.id] === 1 ? 'comment' : 'comments'}
                      </button>
                    </div>
                    {openComments[announcement.id] && (
                      <CommentList
                        postId={announcement.id}
                        comments={commentsByPost[announcement.id] || []}
                        currentUser={user}
                        onCommentAdded={(comment) => addComment(announcement.id, comment)}
                        onCommentDeleted={(commentId) => removeComment(announcement.id, commentId)}
                        onCommentUpdated={(comment) => updateCommentInPost(announcement.id, comment)}
                      />
                    )}
                  </div>
                  {isAuthor && (
                    <div className={styles.cardActions}>
                      <button type="button" onClick={() => startEdit(announcement)} aria-label="Edit announcement" title="Edit announcement">
                        <Edit3 size={15} />
                      </button>
                      <button type="button" className={styles.deleteButton} onClick={() => handleDelete(announcement.id)} disabled={deletingId === announcement.id} aria-label="Delete announcement" title="Delete announcement">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {canManage && modalOpen && (
        <div className={styles.modalOverlay} role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) resetForm();
        }}>
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="announcement-modal-title">
            <div className={styles.modalHeader}>
              <div className={styles.composerTitle}>
                <div className={styles.composerIcon}><Megaphone size={18} /></div>
                <div>
                  <h2 id="announcement-modal-title">{editingId ? 'Edit announcement' : 'Create announcement'}</h2>
                  <p>{editingId ? 'Update the message or change its audience.' : 'Publish a clear update to the selected users.'}</p>
                </div>
              </div>
              <button type="button" className={styles.modalClose} onClick={resetForm} disabled={saving} aria-label="Close announcement form">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className={styles.fields}>
                <label>
                  <span>Title <small>Optional</small></span>
                  <input
                    type="text"
                    maxLength={255}
                    value={form.title}
                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                    placeholder="Brief announcement title"
                  />
                </label>
                <label>
                  <span>Audience</span>
                  <select
                    value={form.audience}
                    onChange={(event) => setForm((current) => ({ ...current, audience: event.target.value }))}
                  >
                    {Object.entries(AUDIENCE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className={styles.messageField}>
                <span>Message</span>
                <textarea
                  rows={7}
                  value={form.content}
                  onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
                  placeholder="Write the announcement details..."
                  required
                />
              </label>
              <div className={styles.formActions}>
                <button type="button" className={styles.cancelButton} onClick={resetForm} disabled={saving}>Cancel</button>
                <button type="submit" className={styles.primaryButton} disabled={saving || !form.content.trim()}>
                  {saving ? 'Saving...' : editingId ? 'Save changes' : 'Publish announcement'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

    </div>
  );
}
