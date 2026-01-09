const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query } = require('../config/database');
const { authenticate, isTechnician, isAdmin } = require('../middleware/auth');

const router = express.Router();

// Configure multer for article image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/articles');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Helper to generate slug from title
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 200);
}

// Helper to ensure unique slug
async function ensureUniqueSlug(slug, excludeId = null) {
  let uniqueSlug = slug;
  let counter = 1;

  while (true) {
    const params = excludeId ? [uniqueSlug, excludeId] : [uniqueSlug];
    const whereClause = excludeId ? 'slug = $1 AND id != $2' : 'slug = $1';
    const existing = await query(`SELECT id FROM articles WHERE ${whereClause}`, params);

    if (existing.rows.length === 0) {
      return uniqueSlug;
    }
    uniqueSlug = `${slug}-${counter}`;
    counter++;
  }
}

// Get all articles with filters
router.get('/', authenticate, async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      category_id,
      equipment_id,
      published,
      featured,
      author_id
    } = req.query;

    const offset = (page - 1) * limit;
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramCount = 1;

    // Only show published articles to viewers, unless they're the author
    if (req.user.role === 'viewer') {
      whereClause += ' AND (a.is_published = true)';
    } else if (published === 'true') {
      whereClause += ' AND a.is_published = true';
    } else if (published === 'false') {
      whereClause += ' AND a.is_published = false';
    }

    if (featured === 'true') {
      whereClause += ' AND a.is_featured = true';
    }

    if (search) {
      whereClause += ` AND (
        a.title ILIKE $${paramCount} OR
        a.summary ILIKE $${paramCount} OR
        a.search_vector @@ plainto_tsquery('english', $${paramCount + 1})
      )`;
      params.push(`%${search}%`, search);
      paramCount += 2;
    }

    if (category_id) {
      whereClause += ` AND a.category_id = $${paramCount++}`;
      params.push(category_id);
    }

    if (equipment_id) {
      whereClause += ` AND a.equipment_id = $${paramCount++}`;
      params.push(equipment_id);
    }

    if (author_id) {
      whereClause += ` AND a.author_id = $${paramCount++}`;
      params.push(author_id);
    }

    params.push(limit, offset);

    const result = await query(`
      SELECT a.*,
             u.name as author_name,
             c.name as category_name,
             e.name as equipment_name,
             (SELECT COUNT(*) FROM article_images WHERE article_id = a.id) as image_count
      FROM articles a
      LEFT JOIN users u ON a.author_id = u.id
      LEFT JOIN categories c ON a.category_id = c.id
      LEFT JOIN equipment e ON a.equipment_id = e.id
      ${whereClause}
      ORDER BY a.is_featured DESC, a.created_at DESC
      LIMIT $${paramCount++} OFFSET $${paramCount}
    `, params);

    const countResult = await query(`
      SELECT COUNT(*) FROM articles a ${whereClause}
    `, params.slice(0, -2));

    res.json({
      articles: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(countResult.rows[0].count / limit)
    });
  } catch (error) {
    next(error);
  }
});

// Get featured articles (for dashboard/homepage)
router.get('/featured', authenticate, async (req, res, next) => {
  try {
    const { limit = 5 } = req.query;

    const result = await query(`
      SELECT a.id, a.title, a.slug, a.summary, a.view_count, a.created_at,
             u.name as author_name,
             c.name as category_name
      FROM articles a
      LEFT JOIN users u ON a.author_id = u.id
      LEFT JOIN categories c ON a.category_id = c.id
      WHERE a.is_published = true AND a.is_featured = true
      ORDER BY a.created_at DESC
      LIMIT $1
    `, [limit]);

    res.json({ articles: result.rows });
  } catch (error) {
    next(error);
  }
});

// Get single article by slug
router.get('/by-slug/:slug', authenticate, async (req, res, next) => {
  try {
    const { slug } = req.params;

    const result = await query(`
      SELECT a.*,
             u.name as author_name,
             c.name as category_name,
             e.name as equipment_name
      FROM articles a
      LEFT JOIN users u ON a.author_id = u.id
      LEFT JOIN categories c ON a.category_id = c.id
      LEFT JOIN equipment e ON a.equipment_id = e.id
      WHERE a.slug = $1
    `, [slug]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }

    const article = result.rows[0];

    // Check if viewer can see unpublished article
    if (!article.is_published && req.user.role === 'viewer') {
      return res.status(404).json({ error: 'Article not found' });
    }

    // Increment view count (don't wait for it)
    query('UPDATE articles SET view_count = view_count + 1 WHERE id = $1', [article.id]);

    // Get images
    const images = await query(`
      SELECT * FROM article_images WHERE article_id = $1 ORDER BY created_at
    `, [article.id]);
    article.images = images.rows;

    // Get related articles (same category or equipment)
    const related = await query(`
      SELECT a.id, a.title, a.slug, a.summary
      FROM articles a
      WHERE a.is_published = true
        AND a.id != $1
        AND (a.category_id = $2 OR a.equipment_id = $3)
      ORDER BY a.view_count DESC
      LIMIT 5
    `, [article.id, article.category_id, article.equipment_id]);
    article.related_articles = related.rows;

    res.json(article);
  } catch (error) {
    next(error);
  }
});

// Get single article by ID (for editing)
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT a.*,
             u.name as author_name,
             c.name as category_name,
             e.name as equipment_name
      FROM articles a
      LEFT JOIN users u ON a.author_id = u.id
      LEFT JOIN categories c ON a.category_id = c.id
      LEFT JOIN equipment e ON a.equipment_id = e.id
      WHERE a.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }

    const article = result.rows[0];

    // Get images
    const images = await query(`
      SELECT * FROM article_images WHERE article_id = $1 ORDER BY created_at
    `, [id]);
    article.images = images.rows;

    res.json(article);
  } catch (error) {
    next(error);
  }
});

// Create new article
router.post('/', authenticate, isTechnician, async (req, res, next) => {
  try {
    const { title, content, summary, category_id, equipment_id, is_published, is_featured } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const baseSlug = generateSlug(title);
    const slug = await ensureUniqueSlug(baseSlug);

    const result = await query(`
      INSERT INTO articles (title, slug, content, summary, category_id, equipment_id, author_id, is_published, is_featured)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      title,
      slug,
      content,
      summary || null,
      category_id || null,
      equipment_id || null,
      req.user.id,
      is_published || false,
      is_featured || false
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Update article
router.put('/:id', authenticate, isTechnician, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, content, summary, category_id, equipment_id, is_published, is_featured } = req.body;

    // Check article exists
    const existing = await query('SELECT * FROM articles WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }

    // Generate new slug if title changed
    let slug = existing.rows[0].slug;
    if (title && title !== existing.rows[0].title) {
      const baseSlug = generateSlug(title);
      slug = await ensureUniqueSlug(baseSlug, id);
    }

    const result = await query(`
      UPDATE articles SET
        title = COALESCE($1, title),
        slug = $2,
        content = COALESCE($3, content),
        summary = $4,
        category_id = $5,
        equipment_id = $6,
        is_published = COALESCE($7, is_published),
        is_featured = COALESCE($8, is_featured),
        updated_at = NOW()
      WHERE id = $9
      RETURNING *
    `, [
      title,
      slug,
      content,
      summary || null,
      category_id || null,
      equipment_id || null,
      is_published,
      is_featured,
      id
    ]);

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Publish/unpublish article
router.post('/:id/publish', authenticate, isTechnician, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { is_published } = req.body;

    const result = await query(`
      UPDATE articles SET is_published = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [is_published, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Toggle featured status
router.post('/:id/feature', authenticate, isAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { is_featured } = req.body;

    const result = await query(`
      UPDATE articles SET is_featured = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [is_featured, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Delete article
router.delete('/:id', authenticate, isTechnician, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check ownership or admin
    const article = await query('SELECT author_id FROM articles WHERE id = $1', [id]);
    if (article.rows.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }

    if (article.rows[0].author_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only delete your own articles' });
    }

    // Get images to delete files
    const images = await query('SELECT file_path FROM article_images WHERE article_id = $1', [id]);

    // Delete from database (cascade will handle images table)
    await query('DELETE FROM articles WHERE id = $1', [id]);

    // Delete image files
    images.rows.forEach(img => {
      const filePath = path.join(__dirname, '../..', img.file_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Upload image for article
router.post('/:id/images', authenticate, isTechnician, upload.single('image'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { alt_text } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Verify article exists
    const article = await query('SELECT id FROM articles WHERE id = $1', [id]);
    if (article.rows.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }

    const filePath = `/uploads/articles/${req.file.filename}`;

    const result = await query(`
      INSERT INTO article_images (article_id, file_path, alt_text, uploaded_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [id, filePath, alt_text || null, req.user.id]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Get images for article
router.get('/:id/images', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT * FROM article_images WHERE article_id = $1 ORDER BY created_at
    `, [id]);

    res.json({ images: result.rows });
  } catch (error) {
    next(error);
  }
});

// Delete article image
router.delete('/images/:imageId', authenticate, isTechnician, async (req, res, next) => {
  try {
    const { imageId } = req.params;

    const image = await query('SELECT * FROM article_images WHERE id = $1', [imageId]);
    if (image.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Delete from database
    await query('DELETE FROM article_images WHERE id = $1', [imageId]);

    // Delete file
    const filePath = path.join(__dirname, '../..', image.rows[0].file_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Search articles (full-text)
router.get('/search/content', authenticate, async (req, res, next) => {
  try {
    const { q, limit = 20 } = req.query;

    if (!q || q.length < 2) {
      return res.json({ articles: [] });
    }

    const result = await query(`
      SELECT a.id, a.title, a.slug, a.summary,
             ts_headline('english', a.content, plainto_tsquery('english', $1),
               'MaxWords=50, MinWords=20, StartSel=<mark>, StopSel=</mark>') as snippet,
             ts_rank(a.search_vector, plainto_tsquery('english', $1)) as rank,
             u.name as author_name,
             c.name as category_name
      FROM articles a
      LEFT JOIN users u ON a.author_id = u.id
      LEFT JOIN categories c ON a.category_id = c.id
      WHERE a.is_published = true
        AND a.search_vector @@ plainto_tsquery('english', $1)
      ORDER BY rank DESC
      LIMIT $2
    `, [q, limit]);

    res.json({ articles: result.rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
