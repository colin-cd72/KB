const express = require('express');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { query, transaction } = require('../config/database');
const { authenticate, isTechnician, isViewer } = require('../middleware/auth');

const router = express.Router();

// Configure multer for todo image uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/todos');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
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

// Get all todos
router.get('/', authenticate, isViewer, async (req, res, next) => {
  try {
    const {
      status,
      assigned_to,
      created_by,
      priority,
      show_completed = 'false',
      my_todos = 'false',
      tag_id
    } = req.query;

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (status) {
      whereClause += ` AND t.status = $${paramCount++}`;
      params.push(status);
    } else if (show_completed !== 'true') {
      whereClause += ` AND t.status != 'completed'`;
    }

    if (priority) {
      whereClause += ` AND t.priority = $${paramCount++}`;
      params.push(priority);
    }

    if (assigned_to) {
      whereClause += ` AND t.assigned_to = $${paramCount++}`;
      params.push(assigned_to);
    }

    if (created_by) {
      whereClause += ` AND t.created_by = $${paramCount++}`;
      params.push(created_by);
    }

    if (my_todos === 'true') {
      whereClause += ` AND (t.assigned_to = $${paramCount} OR t.created_by = $${paramCount})`;
      params.push(req.user.id);
      paramCount++;
    }

    if (tag_id) {
      whereClause += ` AND EXISTS (SELECT 1 FROM todo_tag_assignments tta WHERE tta.todo_id = t.id AND tta.tag_id = $${paramCount++})`;
      params.push(tag_id);
    }

    const result = await query(
      `SELECT t.*,
              u1.name as created_by_name,
              u2.name as assigned_to_name,
              u3.name as completed_by_name,
              c.name as category_name,
              e.name as equipment_name,
              i.title as converted_issue_title,
              COALESCE(
                (SELECT json_agg(json_build_object('id', ti.id, 'file_path', ti.file_path, 'original_name', ti.original_name))
                 FROM todo_images ti WHERE ti.todo_id = t.id),
                '[]'
              ) as images,
              COALESCE(
                (SELECT json_agg(json_build_object('id', ts.id, 'title', ts.title, 'is_completed', ts.is_completed, 'sort_order', ts.sort_order) ORDER BY ts.sort_order)
                 FROM todo_subtasks ts WHERE ts.todo_id = t.id),
                '[]'
              ) as subtasks,
              COALESCE(
                (SELECT json_agg(json_build_object('id', tt.id, 'name', tt.name, 'color', tt.color))
                 FROM todo_tag_assignments tta
                 JOIN todo_tags tt ON tta.tag_id = tt.id
                 WHERE tta.todo_id = t.id),
                '[]'
              ) as tags
       FROM todos t
       LEFT JOIN users u1 ON t.created_by = u1.id
       LEFT JOIN users u2 ON t.assigned_to = u2.id
       LEFT JOIN users u3 ON t.completed_by = u3.id
       LEFT JOIN categories c ON t.category_id = c.id
       LEFT JOIN equipment e ON t.equipment_id = e.id
       LEFT JOIN issues i ON t.converted_to_issue_id = i.id
       ${whereClause}
       ORDER BY
         CASE t.status
           WHEN 'in_progress' THEN 1
           WHEN 'pending' THEN 2
           WHEN 'completed' THEN 3
         END,
         CASE t.priority
           WHEN 'high' THEN 1
           WHEN 'medium' THEN 2
           WHEN 'low' THEN 3
         END,
         t.due_date ASC NULLS LAST,
         t.sort_order,
         t.created_at DESC`,
      params
    );

    res.json({ todos: result.rows });
  } catch (error) {
    next(error);
  }
});

// Get single todo
router.get('/:id', authenticate, isViewer, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT t.*,
              u1.name as created_by_name,
              u2.name as assigned_to_name,
              c.name as category_name,
              e.name as equipment_name
       FROM todos t
       LEFT JOIN users u1 ON t.created_by = u1.id
       LEFT JOIN users u2 ON t.assigned_to = u2.id
       LEFT JOIN categories c ON t.category_id = c.id
       LEFT JOIN equipment e ON t.equipment_id = e.id
       WHERE t.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Todo not found' });
    }

    res.json({ todo: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Create todo
router.post('/',
  authenticate,
  isTechnician,
  [
    body('title').trim().notEmpty().isLength({ max: 500 }),
    body('description').optional().trim(),
    body('priority').optional().isIn(['high', 'medium', 'low']),
    body('due_date').optional().isISO8601(),
    body('assigned_to').optional().isUUID(),
    body('category_id').optional().isUUID(),
    body('equipment_id').optional().isUUID()
  ],
  validate,
  async (req, res, next) => {
    try {
      const { title, description, priority, due_date, assigned_to, category_id, equipment_id } = req.body;

      const result = await query(
        `INSERT INTO todos (title, description, priority, due_date, created_by, assigned_to, category_id, equipment_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [title, description, priority || 'medium', due_date, req.user.id, assigned_to, category_id, equipment_id]
      );

      res.status(201).json({ todo: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }
);

// Update todo
router.put('/:id',
  authenticate,
  isTechnician,
  [
    body('title').optional().trim().notEmpty().isLength({ max: 500 }),
    body('description').optional().trim(),
    body('priority').optional().isIn(['high', 'medium', 'low']),
    body('status').optional().isIn(['pending', 'in_progress', 'completed']),
    body('due_date').optional().isISO8601(),
    body('assigned_to').optional().isUUID(),
    body('category_id').optional().isUUID(),
    body('equipment_id').optional().isUUID()
  ],
  validate,
  async (req, res, next) => {
    try {
      const { title, description, priority, status, due_date, assigned_to, category_id, equipment_id } = req.body;
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (title !== undefined) {
        updates.push(`title = $${paramCount++}`);
        values.push(title);
      }
      if (description !== undefined) {
        updates.push(`description = $${paramCount++}`);
        values.push(description);
      }
      if (priority !== undefined) {
        updates.push(`priority = $${paramCount++}`);
        values.push(priority);
      }
      if (status !== undefined) {
        updates.push(`status = $${paramCount++}`);
        values.push(status);

        if (status === 'completed') {
          updates.push(`completed_at = CURRENT_TIMESTAMP`);
          updates.push(`completed_by = $${paramCount++}`);
          values.push(req.user.id);
        } else {
          updates.push(`completed_at = NULL`);
          updates.push(`completed_by = NULL`);
        }
      }
      if (due_date !== undefined) {
        updates.push(`due_date = $${paramCount++}`);
        values.push(due_date || null);
      }
      if (assigned_to !== undefined) {
        updates.push(`assigned_to = $${paramCount++}`);
        values.push(assigned_to || null);
      }
      if (category_id !== undefined) {
        updates.push(`category_id = $${paramCount++}`);
        values.push(category_id || null);
      }
      if (equipment_id !== undefined) {
        updates.push(`equipment_id = $${paramCount++}`);
        values.push(equipment_id || null);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      values.push(req.params.id);

      const result = await query(
        `UPDATE todos SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Todo not found' });
      }

      res.json({ todo: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }
);

// Toggle todo completion
router.post('/:id/toggle', authenticate, isTechnician, async (req, res, next) => {
  try {
    const current = await query('SELECT status FROM todos WHERE id = $1', [req.params.id]);

    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Todo not found' });
    }

    const isCompleting = current.rows[0].status !== 'completed';
    const newStatus = isCompleting ? 'completed' : 'pending';

    let result;
    if (isCompleting) {
      result = await query(
        `UPDATE todos
         SET status = $1, completed_at = CURRENT_TIMESTAMP, completed_by = $2
         WHERE id = $3
         RETURNING *`,
        [newStatus, req.user.id, req.params.id]
      );
    } else {
      result = await query(
        `UPDATE todos
         SET status = $1, completed_at = NULL, completed_by = NULL
         WHERE id = $2
         RETURNING *`,
        [newStatus, req.params.id]
      );
    }

    res.json({ todo: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Convert todo to issue
router.post('/:id/convert-to-issue',
  authenticate,
  isTechnician,
  async (req, res, next) => {
    try {
      const todoResult = await query('SELECT * FROM todos WHERE id = $1', [req.params.id]);

      if (todoResult.rows.length === 0) {
        return res.status(404).json({ error: 'Todo not found' });
      }

      const todo = todoResult.rows[0];

      if (todo.converted_to_issue_id) {
        return res.status(400).json({ error: 'Todo already converted to issue' });
      }

      const result = await transaction(async (client) => {
        // Create the issue
        const issueResult = await client.query(
          `INSERT INTO issues (title, description, priority, category_id, equipment_id, created_by, assigned_to)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            todo.title,
            todo.description || `Converted from todo.\n\nOriginal due date: ${todo.due_date || 'None'}`,
            todo.priority === 'high' ? 'high' : todo.priority === 'low' ? 'low' : 'medium',
            todo.category_id,
            todo.equipment_id,
            req.user.id,
            todo.assigned_to
          ]
        );

        const issue = issueResult.rows[0];

        // Update todo with reference to issue
        await client.query(
          `UPDATE todos SET converted_to_issue_id = $1, status = 'completed', completed_at = CURRENT_TIMESTAMP, completed_by = $2 WHERE id = $3`,
          [issue.id, req.user.id, req.params.id]
        );

        // Record in issue history
        await client.query(
          `INSERT INTO issue_history (issue_id, user_id, action, field_name, old_value)
           VALUES ($1, $2, 'created', 'source', 'Converted from todo')`,
          [issue.id, req.user.id]
        );

        return issue;
      });

      res.json({
        message: 'Todo converted to issue',
        issue: result,
        issue_id: result.id
      });
    } catch (error) {
      next(error);
    }
  }
);

// Delete todo
router.delete('/:id', authenticate, isTechnician, async (req, res, next) => {
  try {
    const result = await query(
      'DELETE FROM todos WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Todo not found' });
    }

    res.json({ message: 'Todo deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Reorder todos
router.post('/reorder',
  authenticate,
  isTechnician,
  [body('order').isArray()],
  validate,
  async (req, res, next) => {
    try {
      const { order } = req.body; // Array of { id, sort_order }

      await transaction(async (client) => {
        for (const item of order) {
          await client.query(
            'UPDATE todos SET sort_order = $1 WHERE id = $2',
            [item.sort_order, item.id]
          );
        }
      });

      res.json({ message: 'Todos reordered' });
    } catch (error) {
      next(error);
    }
  }
);

// Upload images to a todo
router.post('/:id/images',
  authenticate,
  isTechnician,
  upload.array('images', 5),
  async (req, res, next) => {
    try {
      const todoId = req.params.id;

      // Verify todo exists
      const todoCheck = await query('SELECT id FROM todos WHERE id = $1', [todoId]);
      if (todoCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Todo not found' });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No images provided' });
      }

      const images = [];
      for (const file of req.files) {
        const result = await query(
          `INSERT INTO todo_images (todo_id, file_path, original_name, uploaded_by)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [todoId, `/uploads/todos/${file.filename}`, file.originalname, req.user.id]
        );
        images.push(result.rows[0]);
      }

      res.status(201).json({ images });
    } catch (error) {
      next(error);
    }
  }
);

// Get images for a todo
router.get('/:id/images', authenticate, isViewer, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT * FROM todo_images WHERE todo_id = $1 ORDER BY created_at`,
      [req.params.id]
    );
    res.json({ images: result.rows });
  } catch (error) {
    next(error);
  }
});

// Delete an image
router.delete('/images/:imageId', authenticate, isTechnician, async (req, res, next) => {
  try {
    // Get image info
    const imageResult = await query(
      'SELECT * FROM todo_images WHERE id = $1',
      [req.params.imageId]
    );

    if (imageResult.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const image = imageResult.rows[0];

    // Delete file from disk
    const filePath = path.join(__dirname, '../../', image.file_path);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      console.error('Failed to delete file:', err);
    }

    // Delete from database
    await query('DELETE FROM todo_images WHERE id = $1', [req.params.imageId]);

    res.json({ message: 'Image deleted' });
  } catch (error) {
    next(error);
  }
});

// Quick add todo (minimal data)
router.post('/quick',
  authenticate,
  isTechnician,
  [body('title').trim().notEmpty().isLength({ max: 500 })],
  validate,
  async (req, res, next) => {
    try {
      const { title } = req.body;

      const result = await query(
        `INSERT INTO todos (title, priority, created_by)
         VALUES ($1, 'medium', $2)
         RETURNING *`,
        [title, req.user.id]
      );

      res.status(201).json({ todo: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }
);

// ==================== SUBTASKS ====================

// Add subtask to a todo
router.post('/:id/subtasks',
  authenticate,
  isTechnician,
  [body('title').trim().notEmpty().isLength({ max: 500 })],
  validate,
  async (req, res, next) => {
    try {
      const { title } = req.body;
      const todoId = req.params.id;

      // Verify todo exists
      const todoCheck = await query('SELECT id FROM todos WHERE id = $1', [todoId]);
      if (todoCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Todo not found' });
      }

      // Get max sort order
      const maxOrder = await query(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM todo_subtasks WHERE todo_id = $1',
        [todoId]
      );

      const result = await query(
        `INSERT INTO todo_subtasks (todo_id, title, sort_order)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [todoId, title, maxOrder.rows[0].next_order]
      );

      res.status(201).json({ subtask: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }
);

// Toggle subtask completion
router.post('/:todoId/subtasks/:subtaskId/toggle',
  authenticate,
  isTechnician,
  async (req, res, next) => {
    try {
      const { subtaskId } = req.params;

      const result = await query(
        `UPDATE todo_subtasks
         SET is_completed = NOT is_completed,
             completed_at = CASE WHEN is_completed THEN NULL ELSE CURRENT_TIMESTAMP END
         WHERE id = $1
         RETURNING *`,
        [subtaskId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Subtask not found' });
      }

      res.json({ subtask: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }
);

// Update subtask
router.put('/:todoId/subtasks/:subtaskId',
  authenticate,
  isTechnician,
  [body('title').optional().trim().notEmpty().isLength({ max: 500 })],
  validate,
  async (req, res, next) => {
    try {
      const { subtaskId } = req.params;
      const { title } = req.body;

      const result = await query(
        `UPDATE todo_subtasks SET title = $1 WHERE id = $2 RETURNING *`,
        [title, subtaskId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Subtask not found' });
      }

      res.json({ subtask: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }
);

// Delete subtask
router.delete('/:todoId/subtasks/:subtaskId',
  authenticate,
  isTechnician,
  async (req, res, next) => {
    try {
      const { subtaskId } = req.params;

      const result = await query(
        'DELETE FROM todo_subtasks WHERE id = $1 RETURNING id',
        [subtaskId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Subtask not found' });
      }

      res.json({ message: 'Subtask deleted' });
    } catch (error) {
      next(error);
    }
  }
);

// Reorder subtasks
router.post('/:id/subtasks/reorder',
  authenticate,
  isTechnician,
  [body('order').isArray()],
  validate,
  async (req, res, next) => {
    try {
      const { order } = req.body; // Array of { id, sort_order }

      await transaction(async (client) => {
        for (const item of order) {
          await client.query(
            'UPDATE todo_subtasks SET sort_order = $1 WHERE id = $2',
            [item.sort_order, item.id]
          );
        }
      });

      res.json({ message: 'Subtasks reordered' });
    } catch (error) {
      next(error);
    }
  }
);

// ==================== TAGS ====================

// Get all tags
router.get('/tags/all', authenticate, isViewer, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT t.*, COUNT(tta.todo_id) as usage_count
       FROM todo_tags t
       LEFT JOIN todo_tag_assignments tta ON t.id = tta.tag_id
       GROUP BY t.id
       ORDER BY t.name`
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
        `INSERT INTO todo_tags (name, color, created_by)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [name, color || '#6b7280', req.user.id]
      );

      res.status(201).json({ tag: result.rows[0] });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Tag name already exists' });
      }
      next(error);
    }
  }
);

// Update tag
router.put('/tags/:tagId',
  authenticate,
  isTechnician,
  [
    body('name').optional().trim().notEmpty().isLength({ max: 100 }),
    body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/)
  ],
  validate,
  async (req, res, next) => {
    try {
      const { tagId } = req.params;
      const { name, color } = req.body;

      const updates = [];
      const values = [];
      let paramCount = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramCount++}`);
        values.push(name);
      }
      if (color !== undefined) {
        updates.push(`color = $${paramCount++}`);
        values.push(color);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      values.push(tagId);

      const result = await query(
        `UPDATE todo_tags SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Tag not found' });
      }

      res.json({ tag: result.rows[0] });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Tag name already exists' });
      }
      next(error);
    }
  }
);

// Delete tag
router.delete('/tags/:tagId',
  authenticate,
  isTechnician,
  async (req, res, next) => {
    try {
      const { tagId } = req.params;

      const result = await query(
        'DELETE FROM todo_tags WHERE id = $1 RETURNING id',
        [tagId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Tag not found' });
      }

      res.json({ message: 'Tag deleted' });
    } catch (error) {
      next(error);
    }
  }
);

// Assign tag to todo
router.post('/:id/tags',
  authenticate,
  isTechnician,
  [body('tag_id').isUUID()],
  validate,
  async (req, res, next) => {
    try {
      const todoId = req.params.id;
      const { tag_id } = req.body;

      // Verify todo exists
      const todoCheck = await query('SELECT id FROM todos WHERE id = $1', [todoId]);
      if (todoCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Todo not found' });
      }

      await query(
        `INSERT INTO todo_tag_assignments (todo_id, tag_id)
         VALUES ($1, $2)
         ON CONFLICT (todo_id, tag_id) DO NOTHING`,
        [todoId, tag_id]
      );

      res.status(201).json({ message: 'Tag assigned' });
    } catch (error) {
      next(error);
    }
  }
);

// Remove tag from todo
router.delete('/:id/tags/:tagId',
  authenticate,
  isTechnician,
  async (req, res, next) => {
    try {
      const { id: todoId, tagId } = req.params;

      await query(
        'DELETE FROM todo_tag_assignments WHERE todo_id = $1 AND tag_id = $2',
        [todoId, tagId]
      );

      res.json({ message: 'Tag removed' });
    } catch (error) {
      next(error);
    }
  }
);

// Set reminder for todo
router.post('/:id/reminder',
  authenticate,
  isTechnician,
  [body('reminder_at').optional({ nullable: true }).isISO8601()],
  validate,
  async (req, res, next) => {
    try {
      const { reminder_at } = req.body;

      const result = await query(
        `UPDATE todos SET reminder_at = $1, reminder_sent = false WHERE id = $2 RETURNING *`,
        [reminder_at || null, req.params.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Todo not found' });
      }

      res.json({ todo: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }
);

// Get stats for progress bar
router.get('/stats/summary', authenticate, isViewer, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status != 'completed') as pending,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status != 'completed') as overdue,
        COUNT(*) FILTER (WHERE due_date = CURRENT_DATE AND status != 'completed') as due_today,
        COUNT(*) as total
      FROM todos
    `);

    res.json({ stats: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
