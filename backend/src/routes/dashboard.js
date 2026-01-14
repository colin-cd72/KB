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

// ============= DASHBOARD WIDGETS =============

// RMA Aging - breakdown by days outstanding
router.get('/rma-aging', authenticate, isTechnician, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE shipped_at >= NOW() - INTERVAL '7 days') as week_1,
        COUNT(*) FILTER (WHERE shipped_at >= NOW() - INTERVAL '14 days' AND shipped_at < NOW() - INTERVAL '7 days') as week_2,
        COUNT(*) FILTER (WHERE shipped_at >= NOW() - INTERVAL '30 days' AND shipped_at < NOW() - INTERVAL '14 days') as month,
        COUNT(*) FILTER (WHERE shipped_at < NOW() - INTERVAL '30 days') as overdue,
        COUNT(*) as total
      FROM rmas
      WHERE status = 'shipped'
    `);

    const aging = result.rows[0];
    res.json({
      data: [
        { name: '0-7 days', value: parseInt(aging.week_1) || 0, color: '#22c55e' },
        { name: '8-14 days', value: parseInt(aging.week_2) || 0, color: '#eab308' },
        { name: '15-30 days', value: parseInt(aging.month) || 0, color: '#f97316' },
        { name: '30+ days', value: parseInt(aging.overdue) || 0, color: '#ef4444' }
      ],
      total: parseInt(aging.total) || 0
    });
  } catch (error) {
    next(error);
  }
});

// Equipment Failures - top equipment with most issues (last 90 days)
router.get('/equipment-failures', authenticate, isTechnician, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT e.id, e.name, e.model, COUNT(i.id) as failure_count,
             MAX(i.created_at) as last_issue_date
      FROM issues i
      JOIN equipment e ON i.equipment_id = e.id
      WHERE i.created_at > NOW() - INTERVAL '90 days'
      GROUP BY e.id, e.name, e.model
      ORDER BY failure_count DESC
      LIMIT 10
    `);

    res.json({ equipment: result.rows });
  } catch (error) {
    next(error);
  }
});

// Common Issues - top issue categories this month
router.get('/common-issues', authenticate, isTechnician, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT c.id, c.name, c.color, COUNT(i.id) as count,
             COUNT(*) FILTER (WHERE i.status IN ('open', 'in_progress')) as open_count,
             COUNT(*) FILTER (WHERE i.status IN ('resolved', 'closed')) as resolved_count
      FROM issues i
      JOIN categories c ON i.category_id = c.id
      WHERE i.created_at > NOW() - INTERVAL '30 days'
      GROUP BY c.id, c.name, c.color
      ORDER BY count DESC
      LIMIT 10
    `);

    res.json({ categories: result.rows });
  } catch (error) {
    next(error);
  }
});

// Shipping Updates - recent RMA status changes
router.get('/shipping-updates', authenticate, isTechnician, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT r.id, r.rma_number, r.item_name, r.status, r.tracking_number,
             r.shipped_at, r.received_at, r.completed_at,
             u.name as created_by_name,
             CASE
               WHEN r.status = 'shipped' THEN r.shipped_at
               WHEN r.status = 'received' THEN r.received_at
               WHEN r.status = 'complete' THEN r.completed_at
               ELSE r.updated_at
             END as status_date
      FROM rmas r
      LEFT JOIN users u ON r.created_by = u.id
      WHERE r.status IN ('shipped', 'received', 'complete')
        AND (r.shipped_at > NOW() - INTERVAL '30 days'
             OR r.received_at > NOW() - INTERVAL '30 days'
             OR r.completed_at > NOW() - INTERVAL '30 days')
      ORDER BY
        CASE
          WHEN r.status = 'shipped' THEN r.shipped_at
          WHEN r.status = 'received' THEN r.received_at
          WHEN r.status = 'complete' THEN r.completed_at
          ELSE r.updated_at
        END DESC
      LIMIT 10
    `);

    res.json({ updates: result.rows });
  } catch (error) {
    next(error);
  }
});

// Weekly Trends - issues created vs resolved over the last 8 weeks
router.get('/trends', authenticate, isTechnician, async (req, res, next) => {
  try {
    const result = await query(`
      WITH weeks AS (
        SELECT generate_series(0, 7) as week_offset
      ),
      weekly_data AS (
        SELECT
          w.week_offset,
          DATE_TRUNC('week', NOW() - (w.week_offset * INTERVAL '1 week')) as week_start,
          COUNT(DISTINCT i_created.id) as created,
          COUNT(DISTINCT i_resolved.id) as resolved
        FROM weeks w
        LEFT JOIN issues i_created ON
          DATE_TRUNC('week', i_created.created_at) = DATE_TRUNC('week', NOW() - (w.week_offset * INTERVAL '1 week'))
        LEFT JOIN issues i_resolved ON
          DATE_TRUNC('week', i_resolved.resolved_at) = DATE_TRUNC('week', NOW() - (w.week_offset * INTERVAL '1 week'))
          AND i_resolved.status IN ('resolved', 'closed')
        GROUP BY w.week_offset
        ORDER BY w.week_offset DESC
      )
      SELECT
        TO_CHAR(week_start, 'Mon DD') as week,
        created,
        resolved
      FROM weekly_data
      ORDER BY week_offset DESC
    `);

    res.json({ trends: result.rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
