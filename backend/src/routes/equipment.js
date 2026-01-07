const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate, isTechnician, isViewer, isAdmin } = require('../middleware/auth');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Get all equipment
router.get('/', authenticate, isViewer, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, location } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE is_active = true';
    const params = [];
    let paramCount = 1;

    if (search) {
      whereClause += ` AND (name ILIKE $${paramCount} OR model ILIKE $${paramCount} OR serial_number ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    if (location) {
      whereClause += ` AND location ILIKE $${paramCount++}`;
      params.push(`%${location}%`);
    }

    params.push(limit, offset);

    const result = await query(
      `SELECT e.*,
              (SELECT COUNT(*) FROM issues WHERE equipment_id = e.id) as issue_count,
              (SELECT COUNT(*) FROM issues WHERE equipment_id = e.id AND status IN ('open', 'in_progress')) as open_issue_count,
              (SELECT COUNT(*) FROM manuals WHERE equipment_id = e.id) as manual_count
       FROM equipment e
       ${whereClause}
       ORDER BY e.name
       LIMIT $${paramCount++} OFFSET $${paramCount}`,
      params
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM equipment e ${whereClause}`,
      params.slice(0, -2)
    );

    res.json({
      equipment: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(countResult.rows[0].count / limit)
    });
  } catch (error) {
    next(error);
  }
});

// Get equipment by QR code
router.get('/qr/:code', authenticate, isViewer, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT e.*,
              (SELECT COUNT(*) FROM issues WHERE equipment_id = e.id) as issue_count,
              (SELECT COUNT(*) FROM issues WHERE equipment_id = e.id AND status IN ('open', 'in_progress')) as open_issue_count
       FROM equipment e
       WHERE e.qr_code = $1`,
      [req.params.code]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    res.json({ equipment: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Get single equipment
router.get('/:id', authenticate, isViewer, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT e.*, u.name as created_by_name
       FROM equipment e
       LEFT JOIN users u ON e.created_by = u.id
       WHERE e.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    // Get recent issues
    const issues = await query(
      `SELECT id, title, status, priority, created_at
       FROM issues
       WHERE equipment_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [req.params.id]
    );

    // Get related manuals
    const manuals = await query(
      `SELECT id, title, version, created_at
       FROM manuals
       WHERE equipment_id = $1
       ORDER BY created_at DESC`,
      [req.params.id]
    );

    res.json({
      equipment: result.rows[0],
      recent_issues: issues.rows,
      manuals: manuals.rows
    });
  } catch (error) {
    next(error);
  }
});

// Create equipment
router.post('/',
  authenticate,
  isTechnician,
  [
    body('name').trim().notEmpty(),
    body('model').optional().trim(),
    body('serial_number').optional().trim(),
    body('manufacturer').optional().trim(),
    body('location').optional().trim(),
    body('description').optional().trim()
  ],
  validate,
  async (req, res, next) => {
    try {
      const { name, model, serial_number, manufacturer, location, description } = req.body;

      // Generate unique QR code
      const qrCode = `KB-${uuidv4().substring(0, 8).toUpperCase()}`;

      const result = await query(
        `INSERT INTO equipment (name, model, serial_number, manufacturer, location, description, qr_code, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [name, model, serial_number, manufacturer, location, description, qrCode, req.user.id]
      );

      res.status(201).json({ equipment: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }
);

// Update equipment
router.put('/:id',
  authenticate,
  isTechnician,
  [
    body('name').optional().trim().notEmpty(),
    body('model').optional().trim(),
    body('serial_number').optional().trim(),
    body('manufacturer').optional().trim(),
    body('location').optional().trim(),
    body('description').optional().trim(),
    body('is_active').optional().isBoolean()
  ],
  validate,
  async (req, res, next) => {
    try {
      const { name, model, serial_number, manufacturer, location, description, is_active } = req.body;
      const updates = [];
      const values = [];
      let paramCount = 1;

      const fields = { name, model, serial_number, manufacturer, location, description };
      for (const [field, value] of Object.entries(fields)) {
        if (value !== undefined) {
          updates.push(`${field} = $${paramCount++}`);
          values.push(value);
        }
      }

      if (typeof is_active === 'boolean') {
        updates.push(`is_active = $${paramCount++}`);
        values.push(is_active);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      values.push(req.params.id);

      const result = await query(
        `UPDATE equipment SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Equipment not found' });
      }

      res.json({ equipment: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }
);

// Delete equipment (soft delete)
router.delete('/:id', authenticate, isAdmin, async (req, res, next) => {
  try {
    const result = await query(
      'UPDATE equipment SET is_active = false WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    res.json({ message: 'Equipment deactivated successfully' });
  } catch (error) {
    next(error);
  }
});

// Regenerate QR code
router.post('/:id/regenerate-qr', authenticate, isTechnician, async (req, res, next) => {
  try {
    const qrCode = `KB-${uuidv4().substring(0, 8).toUpperCase()}`;

    const result = await query(
      'UPDATE equipment SET qr_code = $1 WHERE id = $2 RETURNING *',
      [qrCode, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    res.json({ equipment: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Get unique locations (for filtering)
router.get('/meta/locations', authenticate, isViewer, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT DISTINCT location FROM equipment WHERE location IS NOT NULL AND location != '' ORDER BY location`
    );

    res.json({ locations: result.rows.map(r => r.location) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
