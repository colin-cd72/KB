const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { query, transaction } = require('../config/database');
const { authenticate, isTechnician, isViewer } = require('../middleware/auth');
const pdfService = require('../services/pdfService');

const router = express.Router();

// Configure multer for PDF uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads/manuals'));
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Get all manuals
router.get('/', authenticate, isViewer, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, category_id, equipment_id, search } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (category_id) {
      whereClause += ` AND m.category_id = $${paramCount++}`;
      params.push(category_id);
    }

    if (equipment_id) {
      whereClause += ` AND m.equipment_id = $${paramCount++}`;
      params.push(equipment_id);
    }

    if (search) {
      whereClause += ` AND (m.title ILIKE $${paramCount} OR m.description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    params.push(limit, offset);

    const result = await query(
      `SELECT m.*, c.name as category_name, e.name as equipment_name, u.name as uploaded_by_name
       FROM manuals m
       LEFT JOIN categories c ON m.category_id = c.id
       LEFT JOIN equipment e ON m.equipment_id = e.id
       LEFT JOIN users u ON m.uploaded_by = u.id
       ${whereClause}
       ORDER BY m.created_at DESC
       LIMIT $${paramCount++} OFFSET $${paramCount}`,
      params
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM manuals m ${whereClause}`,
      params.slice(0, -2)
    );

    res.json({
      manuals: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(countResult.rows[0].count / limit)
    });
  } catch (error) {
    next(error);
  }
});

// Get single manual
router.get('/:id', authenticate, isViewer, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT m.*, c.name as category_name, e.name as equipment_name, u.name as uploaded_by_name
       FROM manuals m
       LEFT JOIN categories c ON m.category_id = c.id
       LEFT JOIN equipment e ON m.equipment_id = e.id
       LEFT JOIN users u ON m.uploaded_by = u.id
       WHERE m.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Manual not found' });
    }

    res.json({ manual: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Upload manual
router.post('/',
  authenticate,
  isTechnician,
  upload.single('file'),
  [
    body('title').trim().notEmpty(),
    body('description').optional().trim(),
    body('category_id').optional().isUUID(),
    body('equipment_id').optional().isUUID(),
    body('version').optional().trim()
  ],
  validate,
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'PDF file is required' });
      }

      const { title, description, category_id, equipment_id, version } = req.body;

      // Create manual record
      const result = await query(
        `INSERT INTO manuals (title, description, file_path, file_name, file_size, category_id, equipment_id, version, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          title,
          description,
          `/uploads/manuals/${req.file.filename}`,
          req.file.originalname,
          req.file.size,
          category_id,
          equipment_id,
          version,
          req.user.id
        ]
      );

      const manual = result.rows[0];

      // Queue PDF processing (extract text for search)
      // This runs async - we don't wait for it
      pdfService.processManual(manual.id, req.file.path).catch(console.error);

      res.status(201).json({ manual });
    } catch (error) {
      next(error);
    }
  }
);

// Update manual metadata
router.put('/:id',
  authenticate,
  isTechnician,
  [
    body('title').optional().trim().notEmpty(),
    body('description').optional().trim(),
    body('category_id').optional().isUUID(),
    body('equipment_id').optional().isUUID(),
    body('version').optional().trim()
  ],
  validate,
  async (req, res, next) => {
    try {
      const { title, description, category_id, equipment_id, version } = req.body;
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (title) {
        updates.push(`title = $${paramCount++}`);
        values.push(title);
      }
      if (description !== undefined) {
        updates.push(`description = $${paramCount++}`);
        values.push(description);
      }
      if (category_id) {
        updates.push(`category_id = $${paramCount++}`);
        values.push(category_id);
      }
      if (equipment_id) {
        updates.push(`equipment_id = $${paramCount++}`);
        values.push(equipment_id);
      }
      if (version) {
        updates.push(`version = $${paramCount++}`);
        values.push(version);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      values.push(req.params.id);

      const result = await query(
        `UPDATE manuals SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Manual not found' });
      }

      res.json({ manual: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }
);

// Delete manual
router.delete('/:id', authenticate, isTechnician, async (req, res, next) => {
  try {
    const result = await query(
      'DELETE FROM manuals WHERE id = $1 RETURNING file_path',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Manual not found' });
    }

    // TODO: Delete physical file

    res.json({ message: 'Manual deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Search within manual pages
router.get('/:id/search', authenticate, isViewer, async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const result = await query(
      `SELECT page_number,
              ts_headline('english', content, plainto_tsquery('english', $1), 'MaxFragments=3, MaxWords=50') as snippet,
              ts_rank(search_vector, plainto_tsquery('english', $1)) as rank
       FROM manual_pages
       WHERE manual_id = $2 AND search_vector @@ plainto_tsquery('english', $1)
       ORDER BY rank DESC
       LIMIT 20`,
      [q, req.params.id]
    );

    res.json({ results: result.rows });
  } catch (error) {
    next(error);
  }
});

// Reprocess manual (re-extract text)
router.post('/:id/reprocess', authenticate, isTechnician, async (req, res, next) => {
  try {
    const manual = await query('SELECT * FROM manuals WHERE id = $1', [req.params.id]);
    if (manual.rows.length === 0) {
      return res.status(404).json({ error: 'Manual not found' });
    }

    const filePath = path.join(__dirname, '../..', manual.rows[0].file_path);
    pdfService.processManual(req.params.id, filePath).catch(console.error);

    res.json({ message: 'Manual processing started' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
