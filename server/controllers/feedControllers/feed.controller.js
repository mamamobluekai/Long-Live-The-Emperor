const pool = require('../../db');
const cloudinary = require('../../db/cloudinary');
const streamifier = require('streamifier');

async function ensureFeedTables() {
  const ddl = `
    CREATE TABLE IF NOT EXISTS feed_posts (
      id SERIAL PRIMARY KEY,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      post_type VARCHAR(50) NOT NULL DEFAULT 'announcement',
      title VARCHAR(255),
      content TEXT NOT NULL,
      image_url TEXT,
      link_url TEXT,
      link_title VARCHAR(255),
      link_description TEXT,
      link_domain VARCHAR(255),
      link_thumbnail TEXT,
      audience VARCHAR(50) NOT NULL DEFAULT 'all',
      is_pinned BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS feed_comments (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      parent_comment_id INTEGER REFERENCES feed_comments(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS feed_likes (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(post_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS feed_survey_options (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
      option_text TEXT NOT NULL,
      option_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS feed_survey_responses (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      option_id INTEGER NOT NULL REFERENCES feed_survey_options(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(post_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_feed_posts_author ON feed_posts(author_id);
    CREATE INDEX IF NOT EXISTS idx_feed_posts_created ON feed_posts(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_feed_posts_pinned ON feed_posts(is_pinned);
    CREATE INDEX IF NOT EXISTS idx_feed_comments_post ON feed_comments(post_id);
    CREATE INDEX IF NOT EXISTS idx_feed_likes_post ON feed_likes(post_id);
    CREATE INDEX IF NOT EXISTS idx_feed_survey_options_post ON feed_survey_options(post_id);
    CREATE INDEX IF NOT EXISTS idx_feed_survey_responses_post ON feed_survey_responses(post_id);
  `;

  await pool.query(ddl);
}

async function getPosts(req, res) {
  await ensureFeedTables();
  try {
    const { type, search, sort = 'latest' } = req.query;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;

    const filters = [];
    const values = [];
    let i = 1;

    if (type) {
      filters.push(`p.post_type = $${i}`);
      values.push(type);
      i += 1;
    }
    if (search) {
      const like = `%${search}%`;
      filters.push(
        `(p.title ILIKE $${i} OR p.content ILIKE $${i} OR COALESCE(s.first_name, '') ILIKE $${i} OR COALESCE(t.first_name, '') ILIKE $${i} OR COALESCE(a.first_name, '') ILIKE $${i} OR COALESCE(sup.first_name, '') ILIKE $${i} OR COALESCE(c.first_name, '') ILIKE $${i} OR COALESCE(s.last_name, '') ILIKE $${i} OR COALESCE(t.last_name, '') ILIKE $${i} OR COALESCE(a.last_name, '') ILIKE $${i} OR COALESCE(sup.last_name, '') ILIKE $${i} OR COALESCE(c.last_name, '') ILIKE $${i})`
      );
      values.push(like);
      i += 1;
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const pinnedFirst = sort === 'pinned' ? 'p.is_pinned DESC, ' : '';

    const dataQuery = `
    SELECT p.id, p.author_id, p.post_type, p.title, p.content, p.image_url,
           p.link_url, p.link_title, p.link_description, p.link_domain, p.link_thumbnail,
           p.audience, p.is_pinned, p.created_at, p.updated_at,
           COALESCE(s.first_name, t.first_name, a.first_name, sup.first_name, c.first_name, '') AS author_first_name,
           COALESCE(s.last_name, t.last_name, a.last_name, sup.last_name, c.last_name, '') AS author_last_name,
           u_a.role AS author_role,
           COUNT(DISTINCT l.id) AS likes_count,
           COUNT(DISTINCT c_fc.id) AS comments_count
    FROM feed_posts p
    JOIN users u_a ON p.author_id = u_a.id
    LEFT JOIN students s ON u_a.id = s.user_id AND u_a.role = 'student'
    LEFT JOIN teachers t ON u_a.id = t.user_id AND u_a.role = 'teacher'
    LEFT JOIN admins a ON u_a.id = a.user_id AND u_a.role = 'admin'
    LEFT JOIN supervisors sup ON u_a.id = sup.user_id AND u_a.role = 'supervisor'
    LEFT JOIN coordinators c ON u_a.id = c.user_id AND u_a.role = 'coordinator'
    LEFT JOIN feed_likes l ON l.post_id = p.id
    LEFT JOIN feed_comments c_fc ON c_fc.post_id = p.id
    ${whereClause}
    GROUP BY p.id, u_a.role, s.first_name, s.last_name, t.first_name, t.last_name, a.first_name, a.last_name, sup.first_name, sup.last_name, c.first_name, c.last_name
    ORDER BY ${pinnedFirst}p.created_at DESC
    LIMIT $${i} OFFSET $${i + 1}
  `;

    const countQuery = `SELECT COUNT(*)::int AS total FROM feed_posts p JOIN users u ON p.author_id = u.id ${whereClause}`;

    const [dataResult, countResult] = await Promise.all([
      pool.query(dataQuery, [...values, limit, offset]),
      pool.query(countQuery, values),
    ]);

    res.json({
      posts: dataResult.rows,
      pagination: {
        page,
        limit,
        total: Number(countResult.rows[0]?.total) || 0,
      },
    });
  } catch (err) {
    console.error('Get posts error:', err);
    res.status(500).json({ error: 'Server error fetching posts.' });
  }
}

async function getPostById(req, res) {
  await ensureFeedTables();
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT p.id, p.author_id, p.post_type, p.title, p.content, p.image_url,
               p.link_url, p.link_title, p.link_description, p.link_domain, p.link_thumbnail,
               p.audience, p.is_pinned, p.created_at, p.updated_at,
               COALESCE(s.first_name, t.first_name, a.first_name, sup.first_name, c.first_name, '') AS author_first_name,
               COALESCE(s.last_name, t.last_name, a.last_name, sup.last_name, c.last_name, '') AS author_last_name,
               u_a.role AS author_role
        FROM feed_posts p
        JOIN users u_a ON p.author_id = u_a.id
        LEFT JOIN students s ON u_a.id = s.user_id AND u_a.role = 'student'
        LEFT JOIN teachers t ON u_a.id = t.user_id AND u_a.role = 'teacher'
        LEFT JOIN admins a ON u_a.id = a.user_id AND u_a.role = 'admin'
        LEFT JOIN supervisors sup ON u_a.id = sup.user_id AND u_a.role = 'supervisor'
        LEFT JOIN coordinators c ON u_a.id = c.user_id AND u_a.role = 'coordinator'
        WHERE p.id = $1`,
      [id]
    );
    const post = result.rows[0] || null;
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    res.json({ post });
  } catch (err) {
    console.error('Get post error:', err);
    res.status(500).json({ error: 'Server error fetching post.' });
  }
}

async function createPost(authorId, postData) {
  await ensureFeedTables();
  const { postType, title, content, imageUrl, linkUrl, linkTitle, linkDescription, linkDomain, linkThumbnail, audience } = postData;
  const result = await pool.query(
    `INSERT INTO feed_posts (author_id, post_type, title, content, image_url, link_url, link_title, link_description, link_domain, link_thumbnail, audience)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [authorId, postType || 'announcement', title || null, content, imageUrl || null, linkUrl || null, linkTitle || null, linkDescription || null, linkDomain || null, linkThumbnail || null, audience || 'all']
  );
  return result.rows[0];
}

async function updatePost(id, authorId, postData) {
  await ensureFeedTables();
  const { postType, title, content, imageUrl, linkUrl, linkTitle, linkDescription, linkDomain, linkThumbnail, audience, isPinned } = postData;
  const result = await pool.query(
    `UPDATE feed_posts
     SET post_type = COALESCE($1, post_type),
         title = COALESCE($2, title),
         content = COALESCE($3, content),
         image_url = COALESCE($4, image_url),
         link_url = COALESCE($5, link_url),
         link_title = COALESCE($6, link_title),
         link_description = COALESCE($7, link_description),
         link_domain = COALESCE($8, link_domain),
         link_thumbnail = COALESCE($9, link_thumbnail),
         audience = COALESCE($10, audience),
         is_pinned = COALESCE($11, is_pinned),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $12 AND author_id = $13
     RETURNING *`,
    [postType, title, content, imageUrl, linkUrl, linkTitle, linkDescription, linkDomain, linkThumbnail, audience, isPinned, id, authorId]
  );
  return result.rows[0] || null;
}

async function deletePost(id, authorId) {
  await ensureFeedTables();
  const result = await pool.query(
    `DELETE FROM feed_posts WHERE id = $1 AND author_id = $2 RETURNING id`,
    [id, authorId]
  );
  return result.rows[0] || null;
}

async function togglePinPost(id, authorId) {
  await ensureFeedTables();
  const result = await pool.query(
    `UPDATE feed_posts SET is_pinned = NOT is_pinned, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND author_id = $2 RETURNING *`,
    [id, authorId]
  );
  return result.rows[0] || null;
}

async function toggleLike(postId, userId) {
  await ensureFeedTables();
  const existing = await pool.query(
    `SELECT id FROM feed_likes WHERE post_id = $1 AND user_id = $2`,
    [postId, userId]
  );
  if (existing.rows.length > 0) {
    await pool.query(`DELETE FROM feed_likes WHERE post_id = $1 AND user_id = $2`, [postId, userId]);
    return { liked: false };
  }
  await pool.query(`INSERT INTO feed_likes (post_id, user_id) VALUES ($1, $2)`, [postId, userId]);
  return { liked: true };
}

async function getComments(postId) {
  await ensureFeedTables();
  const result = await pool.query(
    `SELECT c.id, c.post_id, c.user_id, c.parent_comment_id, c.content, c.created_at, c.updated_at,
            COALESCE(s.first_name, t.first_name, a.first_name, sup.first_name, c_tbl.first_name, '') AS user_first_name,
            COALESCE(s.last_name, t.last_name, a.last_name, sup.last_name, c_tbl.last_name, '') AS user_last_name,
            u.role AS user_role,
            COUNT(l.id) AS likes_count
     FROM feed_comments c
     JOIN users u ON c.user_id = u.id
     LEFT JOIN students s ON u.id = s.user_id AND u.role = 'student'
     LEFT JOIN teachers t ON u.id = t.user_id AND u.role = 'teacher'
     LEFT JOIN admins a ON u.id = a.user_id AND u.role = 'admin'
     LEFT JOIN supervisors sup ON u.id = sup.user_id AND u.role = 'supervisor'
     LEFT JOIN coordinators c_tbl ON u.id = c_tbl.user_id AND u.role = 'coordinator'
     LEFT JOIN feed_likes l ON l.post_id = c.post_id
     WHERE c.post_id = $1
     GROUP BY c.id, u.role, s.first_name, s.last_name, t.first_name, t.last_name, a.first_name, a.last_name, sup.first_name, sup.last_name, c_tbl.first_name, c_tbl.last_name
     ORDER BY c.created_at ASC`,
    [postId]
  );
  return result.rows;
}

async function createComment(postId, userId, content, parentCommentId = null) {
  await ensureFeedTables();
  const result = await pool.query(
    `INSERT INTO feed_comments (post_id, user_id, content, parent_comment_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [postId, userId, content, parentCommentId]
  );
  return result.rows[0];
}

async function deleteComment(id, userId) {
  await ensureFeedTables();
  const result = await pool.query(
    `DELETE FROM feed_comments WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  );
  return result.rows[0] || null;
}

async function createSurveyOption(postId, optionText, optionOrder) {
  await ensureFeedTables();
  const result = await pool.query(
    `INSERT INTO feed_survey_options (post_id, option_text, option_order) VALUES ($1, $2, $3) RETURNING *`,
    [postId, optionText, optionOrder]
  );
  return result.rows[0];
}

async function getSurveyOptions(postId) {
  await ensureFeedTables();
  const result = await pool.query(
    `SELECT id, post_id, option_text, option_order, created_at FROM feed_survey_options WHERE post_id = $1 ORDER BY option_order ASC`,
    [postId]
  );
  return result.rows;
}

async function respondToSurvey(postId, userId, optionId) {
  await ensureFeedTables();
  const existing = await pool.query(
    `SELECT id FROM feed_survey_responses WHERE post_id = $1 AND user_id = $2`,
    [postId, userId]
  );
  if (existing.rows.length > 0) {
    await pool.query(`UPDATE feed_survey_responses SET option_id = $1 WHERE post_id = $2 AND user_id = $3`, [optionId, postId, userId]);
    return { responded: true };
  }
  await pool.query(`INSERT INTO feed_survey_responses (post_id, user_id, option_id) VALUES ($1, $2, $3)`, [postId, userId, optionId]);
  return { responded: true };
}

async function getSurveyResults(postId) {
  await ensureFeedTables();
  const options = await pool.query(
    `SELECT id, option_text, option_order FROM feed_survey_options WHERE post_id = $1 ORDER BY option_order ASC`,
    [postId]
  );
  const responses = await pool.query(
    `SELECT option_id, COUNT(*) AS count FROM feed_survey_responses WHERE post_id = $1 GROUP BY option_id`,
    [postId]
  );
  const total = responses.rows.reduce((sum, r) => sum + Number(r.count), 0);
  return {
    options: options.rows,
    responses: responses.rows,
    total,
  };
}

function uploadImageToCloudinary(buffer, originalName) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: 'image', folder: 'feed_posts', use_filename: true, unique_filename: true },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

function extractLinkPreview(url) {
  try {
    const u = new URL(url);
    return {
      linkUrl: url,
      linkDomain: u.hostname,
      linkTitle: u.hostname,
      linkDescription: '',
      linkThumbnail: null,
    };
  } catch {
    return { linkUrl: url, linkDomain: '', linkTitle: '', linkDescription: '', linkThumbnail: null };
  }
}

module.exports = {
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
};
