const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticate, isAdmin } = require('../middleware/auth');
const { sendEmail, templates } = require('../services/emailService');
const { logActivity } = require('./activityLogs');

const router = express.Router();

// Generate a random temporary password
function generateTempPassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  let password = '';
  const randomBytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    password += chars[randomBytes[i] % chars.length];
  }
  return password;
}

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Get all users (admin only)
router.get('/', authenticate, isAdmin, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, role, search } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (role) {
      whereClause += ` AND role = $${paramCount++}`;
      params.push(role);
    }

    if (search) {
      whereClause += ` AND (name ILIKE $${paramCount} OR email ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    params.push(limit, offset);

    const result = await query(
      `SELECT id, email, name, role, is_active, created_at, last_login
       FROM users ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramCount++} OFFSET $${paramCount}`,
      params
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM users ${whereClause}`,
      params.slice(0, -2)
    );

    res.json({
      users: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(countResult.rows[0].count / limit)
    });
  } catch (error) {
    next(error);
  }
});

// Get single user
router.get('/:id', authenticate, isAdmin, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, email, name, role, is_active, created_at, last_login
       FROM users WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Create user (admin only)
router.post('/',
  authenticate,
  isAdmin,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').optional().isLength({ min: 8 }),
    body('name').trim().notEmpty(),
    body('role').isIn(['admin', 'technician', 'viewer']),
    body('send_welcome_email').optional().isBoolean()
  ],
  validate,
  async (req, res, next) => {
    try {
      const { email, name, role, send_welcome_email = true } = req.body;
      let { password } = req.body;

      const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      // Generate temporary password if not provided
      const isTemporaryPassword = !password;
      if (!password) {
        password = generateTempPassword();
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const result = await query(
        `INSERT INTO users (email, password_hash, name, role, must_change_password)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, name, role, created_at, must_change_password`,
        [email, passwordHash, name, role, isTemporaryPassword]
      );

      const user = result.rows[0];

      // Log activity
      logActivity(req.user.id, 'create', 'user', user.id, user.name, { role, email }, req);

      // Send welcome email if requested
      let emailSent = false;
      if (send_welcome_email) {
        const loginUrl = process.env.FRONTEND_URL || 'https://kb.4tmrw.net';
        const template = templates.welcomeNewUser(name, email, password, loginUrl);
        const emailResult = await sendEmail({
          to: email,
          subject: template.subject,
          html: template.html
        });
        emailSent = emailResult.success;
      }

      res.status(201).json({
        user,
        welcome_email_sent: emailSent,
        temporaryPassword: isTemporaryPassword ? password : undefined
      });
    } catch (error) {
      next(error);
    }
  }
);

// Update user (admin only)
router.put('/:id',
  authenticate,
  isAdmin,
  [
    body('email').optional().isEmail().normalizeEmail(),
    body('name').optional().trim().notEmpty(),
    body('role').optional().isIn(['admin', 'technician', 'viewer']),
    body('is_active').optional().isBoolean()
  ],
  validate,
  async (req, res, next) => {
    try {
      const { email, name, role, is_active } = req.body;
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (email) {
        const existing = await query(
          'SELECT id FROM users WHERE email = $1 AND id != $2',
          [email, req.params.id]
        );
        if (existing.rows.length > 0) {
          return res.status(409).json({ error: 'Email already in use' });
        }
        updates.push(`email = $${paramCount++}`);
        values.push(email);
      }

      if (name) {
        updates.push(`name = $${paramCount++}`);
        values.push(name);
      }

      if (role) {
        updates.push(`role = $${paramCount++}`);
        values.push(role);
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
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}
         RETURNING id, email, name, role, is_active`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const updatedUser = result.rows[0];
      // Log activity
      logActivity(req.user.id, 'update', 'user', updatedUser.id, updatedUser.name, { email, name, role, is_active }, req);

      res.json({ user: updatedUser });
    } catch (error) {
      next(error);
    }
  }
);

// Reset user password (admin only)
router.post('/:id/reset-password',
  authenticate,
  isAdmin,
  [
    body('password').optional().isLength({ min: 8 }),
    body('send_email').optional().isBoolean()
  ],
  validate,
  async (req, res, next) => {
    try {
      const { send_email = true } = req.body;
      let { password } = req.body;

      // Generate temporary password if not provided
      if (!password) {
        password = generateTempPassword();
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const result = await query(
        `UPDATE users SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL, must_change_password = TRUE
         WHERE id = $2 RETURNING id, email, name`,
        [passwordHash, req.params.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = result.rows[0];

      // Send email notification if requested
      let emailSent = false;
      if (send_email) {
        const loginUrl = process.env.FRONTEND_URL || 'https://kb.4tmrw.net';
        const template = templates.welcomeNewUser(user.name, user.email, password, loginUrl);
        const emailResult = await sendEmail({
          to: user.email,
          subject: 'Password Reset - Knowledge Base',
          html: template.html.replace('Welcome to Knowledge Base!', 'Your Password Has Been Reset')
            .replace('An account has been created for you.', 'Your password has been reset by an administrator.')
        });
        emailSent = emailResult.success;
      }

      res.json({
        message: 'Password reset successfully',
        email_sent: emailSent,
        temporary_password: password
      });
    } catch (error) {
      next(error);
    }
  }
);

// Delete user (admin only)
router.delete('/:id', authenticate, isAdmin, async (req, res, next) => {
  try {
    // Prevent self-deletion
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Get user info before deletion for logging
    const userInfo = await query('SELECT name, email FROM users WHERE id = $1', [req.params.id]);

    const result = await query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Log activity
    const deletedUser = userInfo.rows[0];
    logActivity(req.user.id, 'delete', 'user', req.params.id, deletedUser?.name, { email: deletedUser?.email }, req);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
