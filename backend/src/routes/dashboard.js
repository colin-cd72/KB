const express = require('express');
const { query } = require('../config/database');
const { authenticate, isTechnician, isAdmin } = require('../middleware/auth');

const router = express.Router();

// Get dashboard statistics
router.get('/stats', authenticate, isTechnician, async (req, res, next) => {
  try {
    // Get issue counts by status
    const issuesByStatus = await query(`
      SELECT status, COUNT(*) as count
      FROM issues
      GROUP BY status
    `);

    // Get issue counts by priority
    const issuesByPriority = await query(`
      SELECT priority, COUNT(*) as count
      FROM issues
      WHERE status IN ('open', 'in_progress')
      GROUP BY priority
    `);

    // Get total counts
    const totals = await query(`
      SELECT
        (SELECT COUNT(*) FROM issues) as total_issues,
        (SELECT COUNT(*) FROM issues WHERE status IN ('open', 'in_progress')) as open_issues,
        (SELECT COUNT(*) FROM issues WHERE resolved_at > NOW() - INTERVAL '7 days') as resolved_this_week,
        (SELECT COUNT(*) FROM manuals) as total_manuals,
        (SELECT COUNT(*) FROM equipment WHERE is_active = true) as total_equipment,
        (SELECT COUNT(*) FROM users WHERE is_active = true) as total_users
    `);

    // Get recent activity
    const recentIssues = await query(`
      SELECT i.id, i.title, i.status, i.priority, i.created_at,
             u.name as created_by_name
      FROM issues i
      LEFT JOIN users u ON i.created_by = u.id
      ORDER BY i.created_at DESC
      LIMIT 5
    `);

    // Get recently resolved issues
    const recentlyResolved = await query(`
      SELECT i.id, i.title, i.resolved_at,
             u.name as assigned_to_name
      FROM issues i
      LEFT JOIN users u ON i.assigned_to = u.id
      WHERE i.status = 'resolved'
      ORDER BY i.resolved_at DESC
      LIMIT 5
    `);

    res.json({
      stats: {
        issues_by_status: issuesByStatus.rows,
        issues_by_priority: issuesByPriority.rows,
        ...totals.rows[0]
      },
      recent_issues: recentIssues.rows,
      recently_resolved: recentlyResolved.rows
    });
  } catch (error) {
    next(error);
  }
});

// Get analytics (admin only)
router.get('/analytics', authenticate, isAdmin, async (req, res, next) => {
  try {
    const { period = '30' } = req.query;
    const days = parseInt(period);

    // Issues created over time
    const issuesTrend = await query(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM issues
      WHERE created_at > NOW() - INTERVAL '${days} days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `);

    // Resolution time (average days to resolve)
    const resolutionTime = await query(`
      SELECT
        AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/86400)::numeric(10,1) as avg_days,
        MIN(EXTRACT(EPOCH FROM (resolved_at - created_at))/86400)::numeric(10,1) as min_days,
        MAX(EXTRACT(EPOCH FROM (resolved_at - created_at))/86400)::numeric(10,1) as max_days
      FROM issues
      WHERE resolved_at IS NOT NULL AND created_at > NOW() - INTERVAL '${days} days'
    `);

    // Top categories by issue count
    const topCategories = await query(`
      SELECT c.name, c.color, COUNT(*) as count
      FROM issues i
      JOIN categories c ON i.category_id = c.id
      WHERE i.created_at > NOW() - INTERVAL '${days} days'
      GROUP BY c.id, c.name, c.color
      ORDER BY count DESC
      LIMIT 10
    `);

    // Most problematic equipment
    const problematicEquipment = await query(`
      SELECT e.name, e.model, COUNT(*) as issue_count
      FROM issues i
      JOIN equipment e ON i.equipment_id = e.id
      WHERE i.created_at > NOW() - INTERVAL '${days} days'
      GROUP BY e.id, e.name, e.model
      ORDER BY issue_count DESC
      LIMIT 10
    `);

    // Top search queries
    const topSearches = await query(`
      SELECT query, COUNT(*) as count
      FROM search_logs
      WHERE created_at > NOW() - INTERVAL '${days} days'
      GROUP BY query
      ORDER BY count DESC
      LIMIT 10
    `);

    // User activity
    const userActivity = await query(`
      SELECT u.name, u.role,
             COUNT(DISTINCT i.id) as issues_created,
             COUNT(DISTINCT s.id) as solutions_added
      FROM users u
      LEFT JOIN issues i ON u.id = i.created_by AND i.created_at > NOW() - INTERVAL '${days} days'
      LEFT JOIN solutions s ON u.id = s.created_by AND s.created_at > NOW() - INTERVAL '${days} days'
      GROUP BY u.id, u.name, u.role
      HAVING COUNT(DISTINCT i.id) > 0 OR COUNT(DISTINCT s.id) > 0
      ORDER BY issues_created + solutions_added DESC
      LIMIT 10
    `);

    res.json({
      period: days,
      issues_trend: issuesTrend.rows,
      resolution_time: resolutionTime.rows[0],
      top_categories: topCategories.rows,
      problematic_equipment: problematicEquipment.rows,
      top_searches: topSearches.rows,
      user_activity: userActivity.rows
    });
  } catch (error) {
    next(error);
  }
});

// Get my assignments
router.get('/my-assignments', authenticate, isTechnician, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT i.*, c.name as category_name, c.color as category_color,
             e.name as equipment_name
      FROM issues i
      LEFT JOIN categories c ON i.category_id = c.id
      LEFT JOIN equipment e ON i.equipment_id = e.id
      WHERE i.assigned_to = $1 AND i.status IN ('open', 'in_progress')
      ORDER BY
        CASE i.priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END,
        i.created_at DESC
    `, [req.user.id]);

    res.json({ assignments: result.rows });
  } catch (error) {
    next(error);
  }
});

// Get watched issues
router.get('/watching', authenticate, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT i.*, c.name as category_name,
             u.name as assigned_to_name
      FROM issue_watchers iw
      JOIN issues i ON iw.issue_id = i.id
      LEFT JOIN categories c ON i.category_id = c.id
      LEFT JOIN users u ON i.assigned_to = u.id
      WHERE iw.user_id = $1
      ORDER BY i.updated_at DESC
    `, [req.user.id]);

    res.json({ watching: result.rows });
  } catch (error) {
    next(error);
  }
});

// Get notifications
router.get('/notifications', authenticate, async (req, res, next) => {
  try {
    const { unread_only = false, limit = 20 } = req.query;

    let whereClause = 'WHERE user_id = $1';
    if (unread_only === 'true') {
      whereClause += ' AND is_read = false';
    }

    const result = await query(`
      SELECT * FROM notifications
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $2
    `, [req.user.id, limit]);

    const unreadCount = await query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
      [req.user.id]
    );

    res.json({
      notifications: result.rows,
      unread_count: parseInt(unreadCount.rows[0].count)
    });
  } catch (error) {
    next(error);
  }
});

// Mark notification as read
router.post('/notifications/:id/read', authenticate, async (req, res, next) => {
  try {
    await query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Mark all notifications as read
router.post('/notifications/read-all', authenticate, async (req, res, next) => {
  try {
    await query(
      'UPDATE notifications SET is_read = true WHERE user_id = $1',
      [req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
