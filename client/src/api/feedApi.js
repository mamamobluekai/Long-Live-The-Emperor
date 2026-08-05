async function fetchJsonOrThrow(url, options) {
  try {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || data.message || 'Request failed.');
    }
    return data;
  } catch (err) {
    const msg = err?.message ? err.message : String(err);
    throw new Error(`Network/CORS error calling ${url}: ${msg}`, { cause: err });
  }
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

function authHeaders(extra = {}) {
  const token = localStorage.getItem('wim-token');
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

export async function getFeedPosts(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return fetchJsonOrThrow(`${API_BASE}/feed/posts${qs ? `?${qs}` : ''}`, { headers: authHeaders() });
}

export async function getFeedPost(id) {
  return fetchJsonOrThrow(`${API_BASE}/feed/posts/${id}`, { headers: authHeaders() });
}

export async function createFeedPost(postData) {
  const formData = new FormData();
  formData.append('postType', postData.postType || 'announcement');
  if (postData.title) formData.append('title', postData.title);
  formData.append('content', postData.content);
  if (postData.image) formData.append('image', postData.image);
  if (postData.linkUrl) formData.append('linkUrl', postData.linkUrl);
  if (postData.linkTitle) formData.append('linkTitle', postData.linkTitle);
  if (postData.linkDescription) formData.append('linkDescription', postData.linkDescription);
  if (postData.linkDomain) formData.append('linkDomain', postData.linkDomain);
  if (postData.linkThumbnail) formData.append('linkThumbnail', postData.linkThumbnail);
  if (postData.audience) formData.append('audience', postData.audience);
  if (postData.surveyOptions) formData.append('surveyOptions', JSON.stringify(postData.surveyOptions));

  return fetch(`${API_BASE}/feed/posts`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  }).then((res) => res.json().then((data) => {
    if (!res.ok) throw new Error(data.error || data.message || 'Failed to create post');
    return data;
  }));
}

export async function updateFeedPost(id, postData) {
  const formData = new FormData();
  if (postData.postType) formData.append('postType', postData.postType);
  if (postData.title !== undefined) formData.append('title', postData.title);
  if (postData.content !== undefined) formData.append('content', postData.content);
  if (postData.image) formData.append('image', postData.image);
  if (postData.linkUrl) formData.append('linkUrl', postData.linkUrl);
  if (postData.linkTitle) formData.append('linkTitle', postData.linkTitle);
  if (postData.linkDescription) formData.append('linkDescription', postData.linkDescription);
  if (postData.linkDomain) formData.append('linkDomain', postData.linkDomain);
  if (postData.linkThumbnail) formData.append('linkThumbnail', postData.linkThumbnail);
  if (postData.audience) formData.append('audience', postData.audience);
  if (postData.surveyOptions) formData.append('surveyOptions', JSON.stringify(postData.surveyOptions));

  return fetch(`${API_BASE}/feed/posts/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: formData,
  }).then((res) => res.json().then((data) => {
    if (!res.ok) throw new Error(data.error || data.message || 'Failed to update post');
    return data;
  }));
}

export async function deleteFeedPost(id) {
  return fetchJsonOrThrow(`${API_BASE}/feed/posts/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

export async function pinFeedPost(id) {
  return fetchJsonOrThrow(`${API_BASE}/feed/posts/${id}/pin`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export async function likeFeedPost(id) {
  return fetchJsonOrThrow(`${API_BASE}/feed/posts/${id}/like`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export async function getPostComments(id) {
  return fetchJsonOrThrow(`${API_BASE}/feed/posts/${id}/comments`, { headers: authHeaders() });
}

export async function createPostComment(id, content, parentCommentId = null) {
  return fetchJsonOrThrow(`${API_BASE}/feed/posts/${id}/comments`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ content, parentCommentId }),
  });
}

export async function deletePostComment(postId, commentId) {
  return fetchJsonOrThrow(`${API_BASE}/feed/posts/${postId}/comments/${commentId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

export async function getSurveyOptions(postId) {
  return fetchJsonOrThrow(`${API_BASE}/feed/posts/${postId}/survey/options`, { headers: authHeaders() });
}

export async function respondToSurvey(postId, optionId) {
  return fetchJsonOrThrow(`${API_BASE}/feed/posts/${postId}/survey/respond`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ optionId }),
  });
}

export async function getSurveyResults(postId) {
  return fetchJsonOrThrow(`${API_BASE}/feed/posts/${postId}/survey/results`, { headers: authHeaders() });
}
