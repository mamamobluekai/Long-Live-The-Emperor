import { useState } from 'react';
import { createPostComment, deletePostComment } from '../../api/feedApi';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/admin/ToastContainer';
import styles from './CommentList.module.css';

function timeAgo(date) {
  if (!date) return '';
  const now = new Date();
  const then = new Date(date);
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return then.toLocaleDateString();
}

export default function CommentList({ postId, comments, currentUser, onCommentAdded, onCommentDeleted }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [replyContent, setReplyContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      const data = await createPostComment(postId, newComment.trim());
      onCommentAdded?.(data.comment);
      setNewComment('');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async (e) => {
    e.preventDefault();
    if (!replyContent.trim()) return;
    setSubmitting(true);
    try {
      const data = await createPostComment(postId, replyContent.trim(), replyTo);
      onCommentAdded?.(data.comment);
      setReplyTo(null);
      setReplyContent('');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId) => {
    try {
      await deletePostComment(postId, commentId);
      onCommentDeleted?.(commentId);
      showToast('Comment deleted.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const parentComments = comments.filter((c) => !c.parent_comment_id);
  const repliesMap = comments.reduce((acc, c) => {
    if (c.parent_comment_id) {
      if (!acc[c.parent_comment_id]) acc[c.parent_comment_id] = [];
      acc[c.parent_comment_id].push(c);
    }
    return acc;
  }, {});

  const renderComment = (comment, isReply = false) => {
    const name = `${comment.user_first_name || ''} ${comment.user_last_name || ''}`.trim() || comment.user_role || 'User';
    const canDelete = currentUser?.id === comment.user_id;

    return (
      <div key={comment.id} className={`${styles.comment} ${isReply ? styles.reply : ''}`}>
        <div className={styles.commentAvatar}>
          {(name || 'U').charAt(0).toUpperCase()}
        </div>
        <div className={styles.commentBody}>
          <div className={styles.commentHeader}>
            <strong className={styles.commentAuthor}>{name}</strong>
            <span className={styles.commentRole}>{comment.user_role ? comment.user_role.charAt(0).toUpperCase() + comment.user_role.slice(1) : 'Student'}</span>
            <span className={styles.commentTime}>{timeAgo(comment.created_at)}</span>
          </div>
          <p className={styles.commentText}>{comment.content}</p>
          <div className={styles.commentActions}>
            <button type="button" className={styles.commentAction} onClick={() => setReplyTo(comment.id)}>
              Reply
            </button>
            {canDelete && (
              <button type="button" className={`${styles.commentAction} ${styles.commentActionDanger}`} onClick={() => handleDelete(comment.id)}>
                Delete
              </button>
            )}
          </div>
          {replyTo === comment.id && (
            <form className={styles.replyForm} onSubmit={handleReply}>
              <input
                type="text"
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Write a reply..."
                className={styles.replyInput}
                autoFocus
              />
              <div className={styles.replyActions}>
                <button type="button" className={styles.cancelReplyBtn} onClick={() => { setReplyTo(null); setReplyContent(''); }}>
                  Cancel
                </button>
                <button type="submit" className={styles.submitReplyBtn} disabled={!replyContent.trim() || submitting}>
                  {submitting ? 'Posting…' : 'Reply'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={styles.commentSection}>
      <div className={styles.commentList}>
        {parentComments.length === 0 && (
          <p className={styles.empty}>No comments yet. Be the first to comment!</p>
        )}
        {parentComments.map((c) => (
          <div key={c.id}>
            {renderComment(c)}
            {repliesMap[c.id]?.length > 0 && (
              <div className={styles.repliesList}>
                {repliesMap[c.id].map((r) => renderComment(r, true))}
              </div>
            )}
          </div>
        ))}
      </div>

      <form className={styles.commentForm} onSubmit={handleSubmit}>
        <div className={styles.commentAvatar}>
          {(user?.first_name || user?.last_name || user?.email || 'U').charAt(0).toUpperCase()}
        </div>
        <input
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Write a comment..."
          className={styles.commentInput}
        />
        <button type="submit" className={styles.submitBtn} disabled={!newComment.trim() || submitting}>
          {submitting ? '...' : 'Post'}
        </button>
      </form>
    </div>
  );
}
