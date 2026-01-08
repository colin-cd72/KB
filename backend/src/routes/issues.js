const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, transaction } = require('../config/database');
const { authenticate, isTechnician, isViewer } = require('../middleware/auth');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Helper to record issue history
async function recordHistory(client, issueId, userId, action, fieldName, oldValue, newValue) {
  await client.query(
    `INSERT INTO issue_history (issue_id, user_id, action, field_name, old_value, new_value)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [issueId, userId, action, fieldName, oldValue, newValue]
  );
}

// Get all issues
router.get('/', authenticate, isViewer, async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      priority,
      category_id,
      equipment_id,
      assigned_to,
      search,
      sort = 'created_at',
      order = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (status) {
      whereClause += ` AND i.status = $${paramCount++}`;
      params.push(status);
    }

    if (priority) {
      whereClause += ` AND i.priority = $${paramCount++}`;
      params.push(priority);
    }

    if (category_id) {
      whereClause += ` AND i.category_id = $${paramCount++}`;
      params.push(category_id);
    }

    if (equipment_id) {
      whereClause += ` AND i.equipment_id = $${paramCount++}`;
      params.push(equipment_id);
    }

    if (assigned_to) {
      whereClause += ` AND i.assigned_to = $${paramCount++}`;
      params.push(assigned_to);
    }

    if (search) {
      whereClause += ` AND (i.title ILIKE $${paramCount} OR i.description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    const validSortFields = ['created_at', 'updated_at', 'priority', 'status', 'title'];
    const sortField = validSortFields.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    params.push(limit, offset);

    const result = await query(
      `SELECT i.*,
              c.name as category_name, c.color as category_color,
              e.name as equipment_name,
              u1.name as created_by_name,
              u2.name as assigned_to_name,
              (SELECT COUNT(*) FROM solutions WHERE issue_id = i.id) as solution_count,
              (SELECT COUNT(*) FROM solutions WHERE issue_id = i.id AND is_accepted = true) as has_accepted_solution,
              (SELECT COUNT(*) FROM attachments WHERE issue_id = i.id) as attachment_count
       FROM issues i
       LEFT JOIN categories c ON i.category_id = c.id
       LEFT JOIN equipment e ON i.equipment_id = e.id
       LEFT JOIN users u1 ON i.created_by = u1.id
       LEFT JOIN users u2 ON i.assigned_to = u2.id
       ${whereClause}
       ORDER BY i.${sortField} ${sortOrder}
       LIMIT $${paramCount++} OFFSET $${paramCount}`,
      params
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM issues i ${whereClause}`,
      params.slice(0, -2)
    );

    res.json({
      issues: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(countResult.rows[0].count / limit)
    });
  } catch (error) {
    next(error);
  }
});

// Get single issue
router.get('/:id', authenticate, isViewer, async (req, res, next) => {
  try {
    // Increment view count
    await query('UPDATE issues SET view_count = view_count + 1 WHERE id = $1', [req.params.id]);

    const result = await query(
      `SELECT i.*,
              c.name as category_name, c.color as category_color,
              e.name as equipment_name, e.model as equipment_model,
              u1.name as created_by_name, u1.email as created_by_email,
              u2.name as assigned_to_name, u2.email as assigned_to_email
       FROM issues i
       LEFT JOIN categories c ON i.category_id = c.id
       LEFT JOIN equipment e ON i.equipment_id = e.id
       LEFT JOIN users u1 ON i.created_by = u1.id
       LEFT JOIN users u2 ON i.assigned_to = u2.id
       WHERE i.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    // Get tags
    const tags = await query(
      `SELECT t.* FROM tags t
       JOIN issue_tags it ON t.id = it.tag_id
       WHERE it.issue_id = $1`,
      [req.params.id]
    );

    // Get related issues
    const related = await query(
      `SELECT i.id, i.title, i.status, ri.relationship_type
       FROM related_issues ri
       JOIN issues i ON ri.related_issue_id = i.id
       WHERE ri.issue_id = $1`,
      [req.params.id]
    );

    res.json({
      issue: {
        ...result.rows[0],
        tags: tags.rows,
        related_issues: related.rows
      }
    });
  } catch (error) {
    next(error);
  }
});

// Create issue
router.post('/',
  authenticate,
  isTechnician,
  [
    body('title').trim().notEmpty().isLength({ max: 500 }),
    body('description').trim().notEmpty(),
    body('priority').optional().isIn(['critical', 'high', 'medium', 'low']),
    body('category_id').optional().isUUID(),
    body('equipment_id').optional().isUUID(),
    body('assigned_to').optional().isUUID(),
    body('tags').optional().isArray(),
    body('ai_conversation').optional().isArray()
  ],
  validate,
  async (req, res, next) => {
    try {
      const issue = await transaction(async (client) => {
        const { title, description, priority, category_id, equipment_id, assigned_to, tags, ai_conversation } = req.body;

        const result = await client.query(
          `INSERT INTO issues (title, description, priority, category_id, equipment_id, created_by, assigned_to, ai_conversation)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [title, description, priority || 'medium', category_id, equipment_id, req.user.id, assigned_to, ai_conversation ? JSON.stringify(ai_conversation) : null]
        );

        const issue = result.rows[0];

        // Record creation in history
        await recordHistory(client, issue.id, req.user.id, 'created', null, null, null);

        // Add tags if provided
        if (tags && tags.length > 0) {
          for (const tagId of tags) {
            await client.query(
              'INSERT INTO issue_tags (issue_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
              [issue.id, tagId]
            );
          }
        }

        return issue;
      });

      res.status(201).json({ issue });
    } catch (error) {
      next(error);
    }
  }
);

// Update issue
router.put('/:id',
  authenticate,
  isTechnician,
  [
    body('title').optional().trim().notEmpty().isLength({ max: 500 }),
    body('description').optional().trim().notEmpty(),
    body('priority').optional().isIn(['critical', 'high', 'medium', 'low']),
    body('status').optional().isIn(['open', 'in_progress', 'resolved', 'closed']),
    body('category_id').optional().isUUID(),
    body('equipment_id').optional().isUUID(),
    body('assigned_to').optional().isUUID()
  ],
  validate,
  async (req, res, next) => {
    try {
      const result = await transaction(async (client) => {
        // Get current issue
        const current = await client.query('SELECT * FROM issues WHERE id = $1', [req.params.id]);
        if (current.rows.length === 0) {
          throw { statusCode: 404, message: 'Issue not found' };
        }

        const oldIssue = current.rows[0];
        const { title, description, priority, status, category_id, equipment_id, assigned_to } = req.body;
        const updates = [];
        const values = [];
        let paramCount = 1;

        const fields = { title, description, priority, status, category_id, equipment_id, assigned_to };

        for (const [field, value] of Object.entries(fields)) {
          if (value !== undefined) {
            updates.push(`${field} = $${paramCount++}`);
            values.push(value);

            // Record change in history
            if (oldIssue[field] !== value) {
              await recordHistory(
                client,
                req.params.id,
                req.user.id,
                'updated',
                field,
                String(oldIssue[field]),
                String(value)
              );
            }
          }
        }

        // Handle status changes
        if (status === 'resolved' && oldIssue.status !== 'resolved') {
          updates.push(`resolved_at = CURRENT_TIMESTAMP`);
        }
        if (status === 'closed' && oldIssue.status !== 'closed') {
          updates.push(`closed_at = CURRENT_TIMESTAMP`);
        }

        if (updates.length === 0) {
          return oldIssue;
        }

        values.push(req.params.id);

        const updateResult = await client.query(
          `UPDATE issues SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
          values
        );

        return updateResult.rows[0];
      });

      res.json({ issue: result });
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      next(error);
    }
  }
);

// Delete issue (admin only)
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can delete issues' });
    }

    const result = await query(
      'DELETE FROM issues WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    res.json({ message: 'Issue deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Get issue history
router.get('/:id/history', authenticate, isViewer, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT ih.*, u.name as user_name
       FROM issue_history ih
       LEFT JOIN users u ON ih.user_id = u.id
       WHERE ih.issue_id = $1
       ORDER BY ih.created_at DESC`,
      [req.params.id]
    );

    res.json({ history: result.rows });
  } catch (error) {
    next(error);
  }
});

// Watch/unwatch issue
router.post('/:id/watch', authenticate, isViewer, async (req, res, next) => {
  try {
    const existing = await query(
      'SELECT * FROM issue_watchers WHERE issue_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (existing.rows.length > 0) {
      await query(
        'DELETE FROM issue_watchers WHERE issue_id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );
      res.json({ watching: false });
    } else {
      await query(
        'INSERT INTO issue_watchers (issue_id, user_id) VALUES ($1, $2)',
        [req.params.id, req.user.id]
      );
      res.json({ watching: true });
    }
  } catch (error) {
    next(error);
  }
});

// Update AI conversation for an issue
router.put('/:id/ai-conversation', authenticate, isViewer, async (req, res, next) => {
  try {
    const { ai_conversation } = req.body;

    if (!ai_conversation || !Array.isArray(ai_conversation)) {
      return res.status(400).json({ error: 'ai_conversation must be an array' });
    }

    const result = await query(
      'UPDATE issues SET ai_conversation = $1 WHERE id = $2 RETURNING ai_conversation',
      [JSON.stringify(ai_conversation), req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    res.json({ ai_conversation: result.rows[0].ai_conversation });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
