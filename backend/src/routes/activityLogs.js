const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, isAdmin } = require('../middleware/auth');

// All activity log routes require admin access
router.use(authenticate, isAdmin);

// Get activity logs with filters
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      user_id,
      action,
      entity_type,
      start_date,
      end_date,
      search
    } = req.query;

    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];
    let paramCount = 0;

    if (user_id) {
      paramCount++;
      conditions.push(`al.user_id = $${paramCount}`);
      params.push(user_id);
    }

    if (action) {
      paramCount++;
      conditions.push(`al.action = $${paramCount}`);
      params.push(action);
    }

    if (entity_type) {
      paramCount++;
      conditions.push(`al.entity_type = $${paramCount}`);
      params.push(entity_type);
    }

    if (start_date) {
      paramCount++;
      conditions.push(`al.created_at >= $${paramCount}`);
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      conditions.push(`al.created_at <= $${paramCount}`);
      params.push(end_date);
    }

    if (search) {
      paramCount++;
      conditions.push(`(al.entity_name ILIKE $${paramCount} OR u.name ILIKE $${paramCount})`);
      params.push(`%${search}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM activity_logs al
       LEFT JOIN users u ON al.user_id = u.id
       ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get paginated results
    paramCount++;
    params.push(limit);
    paramCount++;
    params.push(offset);

    const result = await query(
      `SELECT
         al.id,
         al.action,
         al.entity_type,
         al.entity_id,
         al.entity_name,
         al.details,
         al.ip_address,
         al.created_at,
         u.id as user_id,
         u.name as user_name,
         u.email as user_email
       FROM activity_logs al
       LEFT JOIN users u ON al.user_id = u.id
       ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT $${paramCount - 1} OFFSET $${paramCount}`,
      params
    );

    res.json({
      logs: result.rows,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error fetching activity logs:', error);
    res.status(500).json({ error: 'Failed to fetch activity logs' });
  }
});

// Get activity summary stats
router.get('/stats', async (req, res) => {
  try {
    const { days = 7 } = req.query;

    // Activity by action type
    const actionStats = await query(
      `SELECT action, COUNT(*) as count
       FROM activity_logs
       WHERE created_at >= NOW() - INTERVAL '${parseInt(days)} days'
       GROUP BY action
       ORDER BY count DESC`
    );

    // Activity by entity type
    const entityStats = await query(
      `SELECT entity_type, COUNT(*) as count
       FROM activity_logs
       WHERE created_at >= NOW() - INTERVAL '${parseInt(days)} days'
       GROUP BY entity_type
       ORDER BY count DESC`
    );

    // Most active users
    const userStats = await query(
      `SELECT u.id, u.name, u.email, COUNT(*) as action_count
       FROM activity_logs al
       JOIN users u ON al.user_id = u.id
       WHERE al.created_at >= NOW() - INTERVAL '${parseInt(days)} days'
       GROUP BY u.id, u.name, u.email
       ORDER BY action_count DESC
       LIMIT 10`
    );

    // Activity trend (per day)
    const trendStats = await query(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM activity_logs
       WHERE created_at >= NOW() - INTERVAL '${parseInt(days)} days'
       GROUP BY DATE(created_at)
       ORDER BY date`
    );

    res.json({
      byAction: actionStats.rows,
      byEntity: entityStats.rows,
      topUsers: userStats.rows,
      trend: trendStats.rows
    });
  } catch (error) {
    console.error('Error fetching activity stats:', error);
    res.status(500).json({ error: 'Failed to fetch activity stats' });
  }
});

// Get unique filter options
router.get('/filters', async (req, res) => {
  try {
    const actions = await query(
      `SELECT DISTINCT action FROM activity_logs ORDER BY action`
    );
    const entityTypes = await query(
      `SELECT DISTINCT entity_type FROM activity_logs ORDER BY entity_type`
    );
    const users = await query(
      `SELECT DISTINCT u.id, u.name, u.email
       FROM activity_logs al
       JOIN users u ON al.user_id = u.id
       ORDER BY u.name`
    );

    res.json({
      actions: actions.rows.map(r => r.action),
      entityTypes: entityTypes.rows.map(r => r.entity_type),
      users: users.rows
    });
  } catch (error) {
    console.error('Error fetching filter options:', error);
    res.status(500).json({ error: 'Failed to fetch filter options' });
  }
});

module.exports = router;

// Helper function to log activity (exported for use in other routes)
module.exports.logActivity = async (userId, action, entityType, entityId, entityName, details = {}, req = null) => {
  try {
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, entity_name, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId,
        action,
        entityType,
        entityId,
        entityName,
        JSON.stringify(details),
        req?.ip || req?.connection?.remoteAddress || null,
        req?.headers?.['user-agent'] || null
      ]
    );
  } catch (error) {
    console.error('Error logging activity:', error);
    // Don't throw - activity logging should not break main operations
  }
};
