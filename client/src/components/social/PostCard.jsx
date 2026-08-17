import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPostComments, likeFeedPost, pinFeedPost, deleteFeedPost } from '../../api/feedApi';
import { useToast } from '../../components/admin/ToastContainer';
import CommentList from './CommentList';
import SurveyBlock from './SurveyBlock';
import styles from './PostCard.module.css';

const POST_TYPE_CONFIG = {
  announcement: { label: 'Announcement', color: '#2a5298', bg: '#eff6ff' },
  advertisement: { label: 'Advertisement', color: '#f59e0b', bg: '#fffbeb' },
  endorsement: { label: 'Endorsement',  color: '#10b981', bg: '#ecfdf5' },
  survey: { label: 'Survey', color: '#8b5cf6', bg: '#f5f3ff' },
};

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

export default function PostCard({ post, currentUser, onPostUpdated, onPostDeleted }) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(Number(post.likes_count) || 0);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentsCount, setCommentsCount] = useState(Number(post.comments_count) || 0);
  const [menuOpen, setMenuOpen] = useState(false);

  const isAuthor = currentUser?.id === post.author_id;
  const typeConfig = POST_TYPE_CONFIG[post.post_type] || POST_TYPE_CONFIG.announcement;
  const authorName = `${post.author_first_name || ''} ${post.author_last_name || ''}`.trim() || post.author_role || 'User';

  const handleLike = async () => {
    try {
      const res = await likeFeedPost(post.id);
      setLiked(res.liked);
      setLikesCount((prev) => prev + (res.liked ? 1 : -1));
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleToggleComments = async () => {
    if (!showComments) {
      try {
        const data = await getPostComments(post.id);
        setComments(data.comments || []);
      } catch (err) {
        showToast(err.message, 'error');
        return;
      }
    }
    setShowComments((prev) => !prev);
  };

  const handleCommentAdded = (comment) => {
    setComments((prev) => [...prev, comment]);
    setCommentsCount((prev) => prev + 1);
  };

  const handleCommentDeleted = (commentId) => {
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    setCommentsCount((prev) => prev - 1);
  };

  const handleDelete = async () => {
    setMenuOpen(false);
    try {
      await deleteFeedPost(post.id);
      showToast('Post deleted.', 'success');
      onPostDeleted?.(post.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handlePin = async () => {
    setMenuOpen(false);
    try {
      const data = await pinFeedPost(post.id);
      showToast(data.post?.is_pinned ? 'Post pinned to top.' : 'Post unpinned.', 'success');
      onPostUpdated?.(data.post);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleEdit = () => {
    setMenuOpen(false);
    navigate(`/dashboard/${currentUser?.role}/edit-post/${post.id}`);
  };

  return (
    <div className={`${styles.card} ${post.is_pinned ? styles.pinned : ''}`}>
      {post.is_pinned && (
        <div className={styles.pinnedLabel}>
          <span>📌</span> Pinned
        </div>
      )}

      <div className={styles.header}>
        <div className={styles.authorInfo}>
          <div className={styles.avatar}>
            {(authorName || 'U').charAt(0).toUpperCase()}
          </div>
          <div className={styles.authorMeta}>
            <div className={styles.authorNameRow}>
              <strong className={styles.authorName}>{authorName}</strong>
              <span className={styles.roleBadge} style={{ color: typeConfig.color, backgroundColor: typeConfig.bg }}>
                {post.author_role ? post.author_role.charAt(0).toUpperCase() + post.author_role.slice(1) : 'Staff'}
              </span>
            </div>
            <span className={styles.timestamp}>{timeAgo(post.created_at)}</span>
          </div>
        </div>

        <div className={styles.menuWrapper}>
          <button
            type="button"
            className={styles.menuBtn}
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            ⋮
          </button>
          {menuOpen && (
            <>
              <div className={styles.menuOverlay} onClick={() => setMenuOpen(false)} />
              <div className={styles.menuDropdown}>
                {isAuthor && (
                  <>
                    <button type="button" className={styles.menuItem} onClick={handleEdit}>Edit</button>
                    <button type="button" className={styles.menuItem} onClick={handlePin}>
                      {post.is_pinned ? 'Unpin' : 'Pin to top'}
                    </button>
                    <button type="button" className={`${styles.menuItem} ${styles.menuItemDanger}`} onClick={handleDelete}>Delete</button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className={styles.typeChip} style={{ color: typeConfig.color, backgroundColor: typeConfig.bg }}>
        <span className={styles.typeIcon}>{typeConfig.icon}</span>
        {typeConfig.label}
      </div>

      {post.title && post.post_type !== 'survey' && (
        <h3 className={styles.postTitle}>{post.title}</h3>
      )}

      <p className={styles.postContent}>{post.content}</p>

      {post.image_url && (
        <div className={styles.postImageWrapper}>
          <img src={post.image_url} alt="Post" className={styles.postImage} />
        </div>
      )}

      {post.link_url && (
        <a href={post.link_url} target="_blank" rel="noopener noreferrer" className={styles.linkCard}>
          {post.link_thumbnail && (
            <img src={post.link_thumbnail} alt="" className={styles.linkThumb} />
          )}
          <div className={styles.linkInfo}>
            <div className={styles.linkDomain}>{post.link_domain}</div>
            <div className={styles.linkTitle}>{post.link_title || post.link_url}</div>
            {post.link_description && (
              <div className={styles.linkDesc}>{post.link_description}</div>
            )}
          </div>
        </a>
      )}

      {post.post_type === 'survey' && (
        <SurveyBlock postId={post.id} currentUser={currentUser} authorId={post.author_id} />
      )}

      <div className={styles.actions}>
        <button type="button" className={`${styles.actionBtn} ${liked ? styles.actionBtnActive : ''}`} onClick={handleLike}>
          <span className={styles.actionIcon}>{liked ? '❤️' : '🤍'}</span>
          <span>{likesCount}</span>
        </button>
        <button type="button" className={styles.actionBtn} onClick={handleToggleComments}>
          <span className={styles.actionIcon}>💬</span>
          <span>{commentsCount}</span>
        </button>
        <button type="button" className={styles.actionBtn}>
          <span className={styles.actionIcon}>↗️</span>
          <span>Share</span>
        </button>
      </div>

      {showComments && (
        <CommentList
          postId={post.id}
          comments={comments}
          currentUser={currentUser}
          onCommentAdded={handleCommentAdded}
          onCommentDeleted={handleCommentDeleted}
        />
      )}
    </div>
  );
}
