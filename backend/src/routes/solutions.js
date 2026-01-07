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

// Get solutions for an issue
router.get('/issue/:issueId', authenticate, isViewer, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT s.*, u.name as created_by_name, u.email as created_by_email,
              CASE WHEN s.rating_count > 0 THEN ROUND(s.rating_sum::numeric / s.rating_count, 1) ELSE 0 END as average_rating
       FROM solutions s
       LEFT JOIN users u ON s.created_by = u.id
       WHERE s.issue_id = $1
       ORDER BY s.is_accepted DESC, s.rating_sum DESC, s.created_at ASC`,
      [req.params.issueId]
    );

    // Get user's ratings
    const userRatings = await query(
      `SELECT solution_id, rating FROM solution_ratings
       WHERE user_id = $1 AND solution_id IN (SELECT id FROM solutions WHERE issue_id = $2)`,
      [req.user.id, req.params.issueId]
    );

    const ratingsMap = {};
    userRatings.rows.forEach(r => { ratingsMap[r.solution_id] = r.rating; });

    const solutions = result.rows.map(s => ({
      ...s,
      user_rating: ratingsMap[s.id] || null
    }));

    res.json({ solutions });
  } catch (error) {
    next(error);
  }
});

// Get single solution
router.get('/:id', authenticate, isViewer, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT s.*, u.name as created_by_name,
              CASE WHEN s.rating_count > 0 THEN ROUND(s.rating_sum::numeric / s.rating_count, 1) ELSE 0 END as average_rating
       FROM solutions s
       LEFT JOIN users u ON s.created_by = u.id
       WHERE s.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Solution not found' });
    }

    res.json({ solution: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Create solution
router.post('/',
  authenticate,
  isTechnician,
  [
    body('issue_id').isUUID(),
    body('content').trim().notEmpty()
  ],
  validate,
  async (req, res, next) => {
    try {
      const { issue_id, content } = req.body;

      // Verify issue exists
      const issue = await query('SELECT id FROM issues WHERE id = $1', [issue_id]);
      if (issue.rows.length === 0) {
        return res.status(404).json({ error: 'Issue not found' });
      }

      const result = await query(
        `INSERT INTO solutions (issue_id, content, created_by)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [issue_id, content, req.user.id]
      );

      // Record in issue history
      await query(
        `INSERT INTO issue_history (issue_id, user_id, action, field_name, new_value)
         VALUES ($1, $2, 'solution_added', 'solution', $3)`,
        [issue_id, req.user.id, result.rows[0].id]
      );

      res.status(201).json({ solution: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }
);

// Update solution
router.put('/:id',
  authenticate,
  isTechnician,
  [body('content').trim().notEmpty()],
  validate,
  async (req, res, next) => {
    try {
      const { content } = req.body;

      // Check ownership or admin
      const existing = await query('SELECT * FROM solutions WHERE id = $1', [req.params.id]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Solution not found' });
      }

      if (existing.rows[0].created_by !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Can only edit your own solutions' });
      }

      const result = await query(
        `UPDATE solutions SET content = $1 WHERE id = $2 RETURNING *`,
        [content, req.params.id]
      );

      res.json({ solution: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }
);

// Delete solution
router.delete('/:id', authenticate, isTechnician, async (req, res, next) => {
  try {
    const existing = await query('SELECT * FROM solutions WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Solution not found' });
    }

    if (existing.rows[0].created_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Can only delete your own solutions' });
    }

    await query('DELETE FROM solutions WHERE id = $1', [req.params.id]);

    res.json({ message: 'Solution deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Accept solution (mark as accepted)
router.post('/:id/accept', authenticate, isTechnician, async (req, res, next) => {
  try {
    const solution = await query('SELECT * FROM solutions WHERE id = $1', [req.params.id]);
    if (solution.rows.length === 0) {
      return res.status(404).json({ error: 'Solution not found' });
    }

    await transaction(async (client) => {
      // Unaccept all other solutions for this issue
      await client.query(
        'UPDATE solutions SET is_accepted = false WHERE issue_id = $1',
        [solution.rows[0].issue_id]
      );

      // Accept this solution
      await client.query(
        'UPDATE solutions SET is_accepted = true WHERE id = $1',
        [req.params.id]
      );

      // Update issue status to resolved
      await client.query(
        `UPDATE issues SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [solution.rows[0].issue_id]
      );

      // Record in history
      await client.query(
        `INSERT INTO issue_history (issue_id, user_id, action, field_name, new_value)
         VALUES ($1, $2, 'solution_accepted', 'solution', $3)`,
        [solution.rows[0].issue_id, req.user.id, req.params.id]
      );
    });

    res.json({ message: 'Solution accepted' });
  } catch (error) {
    next(error);
  }
});

// Rate solution
router.post('/:id/rate',
  authenticate,
  isViewer,
  [body('rating').isInt({ min: 1, max: 5 })],
  validate,
  async (req, res, next) => {
    try {
      const { rating } = req.body;

      const solution = await query('SELECT * FROM solutions WHERE id = $1', [req.params.id]);
      if (solution.rows.length === 0) {
        return res.status(404).json({ error: 'Solution not found' });
      }

      await transaction(async (client) => {
        // Check for existing rating
        const existing = await client.query(
          'SELECT rating FROM solution_ratings WHERE solution_id = $1 AND user_id = $2',
          [req.params.id, req.user.id]
        );

        if (existing.rows.length > 0) {
          const oldRating = existing.rows[0].rating;
          // Update existing rating
          await client.query(
            'UPDATE solution_ratings SET rating = $1 WHERE solution_id = $2 AND user_id = $3',
            [rating, req.params.id, req.user.id]
          );
          // Update solution rating sum
          await client.query(
            'UPDATE solutions SET rating_sum = rating_sum - $1 + $2 WHERE id = $3',
            [oldRating, rating, req.params.id]
          );
        } else {
          // Insert new rating
          await client.query(
            'INSERT INTO solution_ratings (solution_id, user_id, rating) VALUES ($1, $2, $3)',
            [req.params.id, req.user.id, rating]
          );
          // Update solution rating
          await client.query(
            'UPDATE solutions SET rating_sum = rating_sum + $1, rating_count = rating_count + 1 WHERE id = $2',
            [rating, req.params.id]
          );
        }
      });

      res.json({ message: 'Rating saved' });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
