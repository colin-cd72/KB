const express = require('express');
const { body, validationResult } = require('express-validator');
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

// Get all categories
router.get('/', authenticate, isViewer, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM issues WHERE category_id = c.id) as issue_count,
              (SELECT COUNT(*) FROM manuals WHERE category_id = c.id) as manual_count
       FROM categories c
       ORDER BY c.sort_order, c.name`
    );

    // Build hierarchy
    const categories = result.rows;
    const rootCategories = categories.filter(c => !c.parent_id);

    const buildTree = (parent) => {
      const children = categories.filter(c => c.parent_id === parent.id);
      return {
        ...parent,
        children: children.map(buildTree)
      };
    };

    const tree = rootCategories.map(buildTree);

    res.json({ categories: tree, flat: categories });
  } catch (error) {
    next(error);
  }
});

// Get single category
router.get('/:id', authenticate, isViewer, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM issues WHERE category_id = c.id) as issue_count,
              (SELECT COUNT(*) FROM manuals WHERE category_id = c.id) as manual_count
       FROM categories c
       WHERE c.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({ category: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Create category
router.post('/',
  authenticate,
  isAdmin,
  [
    body('name').trim().notEmpty(),
    body('description').optional().trim(),
    body('parent_id').optional().isUUID(),
    body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/),
    body('icon').optional().trim()
  ],
  validate,
  async (req, res, next) => {
    try {
      const { name, description, parent_id, color, icon } = req.body;

      const result = await query(
        `INSERT INTO categories (name, description, parent_id, color, icon)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [name, description, parent_id, color || '#6366f1', icon]
      );

      res.status(201).json({ category: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }
);

// Update category
router.put('/:id',
  authenticate,
  isAdmin,
  [
    body('name').optional().trim().notEmpty(),
    body('description').optional().trim(),
    body('parent_id').optional().isUUID(),
    body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/),
    body('icon').optional().trim(),
    body('sort_order').optional().isInt()
  ],
  validate,
  async (req, res, next) => {
    try {
      const { name, description, parent_id, color, icon, sort_order } = req.body;
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (name) {
        updates.push(`name = $${paramCount++}`);
        values.push(name);
      }
      if (description !== undefined) {
        updates.push(`description = $${paramCount++}`);
        values.push(description);
      }
      if (parent_id !== undefined) {
        // Prevent circular reference
        if (parent_id === req.params.id) {
          return res.status(400).json({ error: 'Category cannot be its own parent' });
        }
        updates.push(`parent_id = $${paramCount++}`);
        values.push(parent_id || null);
      }
      if (color) {
        updates.push(`color = $${paramCount++}`);
        values.push(color);
      }
      if (icon !== undefined) {
        updates.push(`icon = $${paramCount++}`);
        values.push(icon);
      }
      if (sort_order !== undefined) {
        updates.push(`sort_order = $${paramCount++}`);
        values.push(sort_order);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      values.push(req.params.id);

      const result = await query(
        `UPDATE categories SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Category not found' });
      }

      res.json({ category: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }
);

// Delete category
router.delete('/:id', authenticate, isAdmin, async (req, res, next) => {
  try {
    // Check if category has issues
    const issues = await query('SELECT COUNT(*) FROM issues WHERE category_id = $1', [req.params.id]);
    if (parseInt(issues.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete category with existing issues' });
    }

    const result = await query(
      'DELETE FROM categories WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Get all tags
router.get('/tags/all', authenticate, isViewer, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT t.*, COUNT(it.issue_id) as usage_count
       FROM tags t
       LEFT JOIN issue_tags it ON t.id = it.tag_id
       GROUP BY t.id
       ORDER BY usage_count DESC, t.name`
    );

    res.json({ tags: result.rows });
  } catch (error) {
    next(error);
  }
});

// Create tag
router.post('/tags',
  authenticate,
  isTechnician,
  [
    body('name').trim().notEmpty().isLength({ max: 100 }),
    body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/)
  ],
  validate,
  async (req, res, next) => {
    try {
      const { name, color } = req.body;

      const result = await query(
        `INSERT INTO tags (name, color) VALUES ($1, $2) RETURNING *`,
        [name.toLowerCase(), color || '#6366f1']
      );

      res.status(201).json({ tag: result.rows[0] });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Tag already exists' });
      }
      next(error);
    }
  }
);

// Delete tag
router.delete('/tags/:id', authenticate, isAdmin, async (req, res, next) => {
  try {
    await query('DELETE FROM tags WHERE id = $1', [req.params.id]);
    res.json({ message: 'Tag deleted successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
