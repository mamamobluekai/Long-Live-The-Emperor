const express = require('express');
const multer = require('multer');
const {
  getPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost,
  togglePinPost,
  toggleLike,
  getComments,
  createComment,
  deleteComment,
  createSurveyOption,
  getSurveyOptions,
  respondToSurvey,
  getSurveyResults,
  uploadImageToCloudinary,
  extractLinkPreview,
} = require('../controllers/feedControllers/feed.controller');
const authenticate = require('../middleware/verifyToken');
const authorize = require('../middleware/authorizeRole');
const uploadMemory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = express.Router();

router.use(authenticate);

router.get('/posts', getPosts);
router.get('/posts/:id', getPostById);

router.post('/posts', authorize('teacher', 'supervisor', 'coordinator'), uploadMemory.single('image'), async (req, res) => {
  try {
    let imageUrl = null;
    if (req.file) {
      const upload = await uploadImageToCloudinary(req.file.buffer, req.file.originalname);
      imageUrl = upload.secure_url;
    }
    const postData = { ...req.body, imageUrl };
    if (postData.linkUrl && (!postData.linkTitle || !postData.linkDomain)) {
      const preview = extractLinkPreview(postData.linkUrl);
      postData.linkTitle = postData.linkTitle || preview.linkTitle;
      postData.linkDomain = postData.linkDomain || preview.linkDomain;
      postData.linkDescription = postData.linkDescription || preview.linkDescription;
      postData.linkThumbnail = postData.linkThumbnail || preview.linkThumbnail;
    }
    const post = await createPost(req.user.id, postData);
    if (req.body.postType === 'survey' && req.body.surveyOptions) {
      const options = JSON.parse(req.body.surveyOptions);
      for (let i = 0; i < options.length; i++) {
        await createSurveyOption(post.id, options[i], i);
      }
    }
    res.status(201).json({ post });
  } catch (err) {
    console.error('Create post error:', err);
    res.status(500).json({ error: 'Server error during post creation.' });
  }
});

router.put('/posts/:id', authorize('teacher', 'supervisor', 'coordinator'), uploadMemory.single('image'), async (req, res) => {
  try {
    let imageUrl = undefined;
    if (req.file) {
      const upload = await uploadImageToCloudinary(req.file.buffer, req.file.originalname);
      imageUrl = upload.secure_url;
    }
    const postData = { ...req.body, imageUrl };
    if (postData.linkUrl && (!postData.linkTitle || !postData.linkDomain)) {
      const preview = extractLinkPreview(postData.linkUrl);
      postData.linkTitle = postData.linkTitle || preview.linkTitle;
      postData.linkDomain = postData.linkDomain || preview.linkDomain;
      postData.linkDescription = postData.linkDescription || preview.linkDescription;
      postData.linkThumbnail = postData.linkThumbnail || preview.linkThumbnail;
    }
    const post = await updatePost(req.params.id, req.user.id, postData);
    if (!post) return res.status(404).json({ error: 'Post not found or not authorized.' });
    res.json({ post });
  } catch (err) {
    console.error('Update post error:', err);
    res.status(500).json({ error: 'Server error during post update.' });
  }
});

router.delete('/posts/:id', authorize('teacher', 'supervisor', 'coordinator'), async (req, res) => {
  try {
    const post = await deletePost(req.params.id, req.user.id);
    if (!post) return res.status(404).json({ error: 'Post not found or not authorized.' });
    res.json({ message: 'Post deleted.' });
  } catch (err) {
    console.error('Delete post error:', err);
    res.status(500).json({ error: 'Server error during post deletion.' });
  }
});

router.post('/posts/:id/pin', authorize('teacher', 'supervisor', 'coordinator'), async (req, res) => {
  try {
    const post = await togglePinPost(req.params.id, req.user.id);
    if (!post) return res.status(404).json({ error: 'Post not found or not authorized.' });
    res.json({ post });
  } catch (err) {
    console.error('Pin post error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/posts/:id/like', async (req, res) => {
  try {
    const result = await toggleLike(req.params.id, req.user.id);
    res.json(result);
  } catch (err) {
    console.error('Like post error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.get('/posts/:id/comments', async (req, res) => {
  try {
    const comments = await getComments(req.params.id);
    res.json({ comments });
  } catch (err) {
    console.error('Get comments error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/posts/:id/comments', async (req, res) => {
  try {
    const { content, parentCommentId } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Comment content is required.' });
    }
    const comment = await createComment(req.params.id, req.user.id, content.trim(), parentCommentId || null);
    res.status(201).json({ comment });
  } catch (err) {
    console.error('Create comment error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.delete('/posts/:id/comments/:commentId', async (req, res) => {
  try {
    const comment = await deleteComment(req.params.commentId, req.user.id);
    if (!comment) return res.status(404).json({ error: 'Comment not found or not authorized.' });
    res.json({ message: 'Comment deleted.' });
  } catch (err) {
    console.error('Delete comment error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/posts/:id/survey/options', authorize('teacher', 'supervisor', 'coordinator'), async (req, res) => {
  try {
    const { optionText, optionOrder } = req.body;
    const option = await createSurveyOption(req.params.id, optionText, optionOrder || 0);
    res.status(201).json({ option });
  } catch (err) {
    console.error('Create survey option error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.get('/posts/:id/survey/options', async (req, res) => {
  try {
    const options = await getSurveyOptions(req.params.id);
    res.json({ options });
  } catch (err) {
    console.error('Get survey options error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/posts/:id/survey/respond', async (req, res) => {
  try {
    const { optionId } = req.body;
    if (!optionId) {
      return res.status(400).json({ error: 'Option ID is required.' });
    }
    const result = await respondToSurvey(req.params.id, req.user.id, optionId);
    res.json(result);
  } catch (err) {
    console.error('Survey respond error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.get('/posts/:id/survey/results', authorize('teacher', 'supervisor', 'coordinator'), async (req, res) => {
  try {
    const results = await getSurveyResults(req.params.id);
    res.json({ results });
  } catch (err) {
    console.error('Get survey results error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
