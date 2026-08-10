import { useCallback, useEffect, useRef, useState } from 'react';
import PostComposer from '../../../components/social/PostComposer';
import PostCard from '../../../components/social/PostCard';
import LoadingSkeleton from '../../../components/admin/LoadingSkeleton';
import { getFeedPosts } from '../../../api/feedApi';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../components/admin/ToastContainer';
import styles from './SocialFeed.module.css';

const SORT_OPTIONS = [
  { value: 'latest', label: 'Latest' },
  { value: 'popular', label: 'Most Liked' },
  { value: 'pinned', label: 'Pinned' },
];

const TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'announcement', label: 'Announcements' },
  { value: 'advertisement', label: 'Advertisements' },
  { value: 'endorsement', label: 'Endorsements' },
  { value: 'survey', label: 'Surveys' },
];

const LIMIT = 10;

const canCreatePost = (role) => ['teacher', 'supervisor', 'coordinator'].includes(role);

export default function SocialFeed({ embedded = false }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [posts, setPosts] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sort, setSort] = useState('latest');
  const [typeFilter, setTypeFilter] = useState('');
  const [hasMore, setHasMore] = useState(true);

  const fetchingRef = useRef(false);
  const mountedRef = useRef(true);
  const showToastRef = useRef(showToast);
  const loadTimerRef = useRef(null);
  const sortRef = useRef(sort);
  const typeFilterRef = useRef(typeFilter);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  useEffect(() => { showToastRef.current = showToast; }, [showToast]);
  useEffect(() => { sortRef.current = sort; }, [sort]);
  useEffect(() => { typeFilterRef.current = typeFilter; }, [typeFilter]);

  const loadPage = useCallback(async (page, reset) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    loadTimerRef.current = setTimeout(() => {
      if (mountedRef.current && fetchingRef.current) {
        setInitialLoading(false);
        setLoadingMore(false);
        fetchingRef.current = false;
        showToastRef.current('Loading posts timed out. Please try again.', 'error');
      }
    }, 12000);

    if (page === 1) {
      setInitialLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const data = await getFeedPosts({
        page,
        limit: LIMIT,
        sort: sortRef.current,
        ...(typeFilterRef.current ? { type: typeFilterRef.current } : {}),
      });
      if (!mountedRef.current) return;

      const newPosts = data.posts || [];
      setPosts((prev) => reset ? newPosts : [...prev, ...newPosts]);
      setHasMore(newPosts.length >= LIMIT);
    } catch (err) {
      if (mountedRef.current) {
        console.error('SocialFeed loadPage error:', err);
        showToastRef.current(err.message, 'error');
      }
      } finally {
      if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
      if (mountedRef.current) {
        if (page === 1) {
          setInitialLoading(false);
        } else {
          setLoadingMore(false);
        }
      }
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    loadPage(1, true);
  }, [loadPage, sort, typeFilter]);

  const handlePostCreated = useCallback((newPost) => {
    setPosts((prev) => [newPost, ...prev]);
  }, []);

  const handlePostUpdated = useCallback((updatedPost) => {
    setPosts((prev) => prev.map((p) => (p.id === updatedPost.id ? updatedPost : p)));
  }, []);

  const handlePostDeleted = useCallback((postId) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  }, []);

  const handleSortChange = useCallback((e) => {
    setSort(e.target.value);
  }, []);

  const handleTypeChange = useCallback((e) => {
    setTypeFilter(e.target.value);
  }, []);

  const loadMore = useCallback(() => {
    if (fetchingRef.current || loadingMore || !hasMore) return;
    const nextPage = posts.length > 0 ? Math.ceil(posts.length / LIMIT) + 1 : 2;
    loadPage(nextPage, false);
  }, [loadingMore, hasMore, posts.length, loadPage]);

  return (
    <div className={styles.container}>
      {!embedded && (
        <div className={styles.pageHeader}>
          <div className={styles.headerText}>
            <h1 className={styles.title}>Social Feed</h1>
            <p className={styles.subtitle}>
              Stay updated with announcements, opportunities, and community posts from your school.
            </p>
          </div>
        </div>
      )}

      {canCreatePost(user?.role) && (
        <PostComposer user={user} onPostCreated={handlePostCreated} />
      )}

      {!embedded && (
        <div className={styles.filterBar}>
          <div className={styles.sortGroup}>
            <label className={styles.filterLabel}>Sort by</label>
            <select value={sort} onChange={handleSortChange} className={styles.filterSelect}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Filter by type</label>
            <select value={typeFilter} onChange={handleTypeChange} className={styles.filterSelect}>
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {initialLoading && posts.length === 0 ? (
        <LoadingSkeleton rows={4} />
      ) : posts.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📭</div>
          <h3 className={styles.emptyTitle}>No posts yet</h3>
          <p className={styles.emptyText}>You haven't created any posts yet. Share something with your community!</p>
        </div>
      ) : (
        <>
          <div className={styles.feed}>
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                currentUser={user}
                onPostUpdated={handlePostUpdated}
                onPostDeleted={handlePostDeleted}
              />
            ))}
          </div>
          {hasMore && !initialLoading && (
            <div className={styles.loadMore}>
              <button type="button" className={styles.loadMoreBtn} onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load More'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
