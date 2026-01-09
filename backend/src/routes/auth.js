const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { logActivity } = require('./activityLogs');

const router = express.Router();

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Register new user (admin only can create users, or first user becomes admin)
router.post('/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('name').trim().notEmpty(),
    body('role').optional().isIn(['admin', 'technician', 'viewer'])
  ],
  validate,
  async (req, res, next) => {
    try {
      const { email, password, name, role = 'viewer' } = req.body;

      // Check if any users exist (first user becomes admin)
      const userCount = await query('SELECT COUNT(*) FROM users');
      const isFirstUser = parseInt(userCount.rows[0].count) === 0;
      const finalRole = isFirstUser ? 'admin' : role;

      // Check if email already exists
      const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Create user
      const result = await query(
        `INSERT INTO users (email, password_hash, name, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, name, role, created_at`,
        [email, passwordHash, name, finalRole]
      );

      const user = result.rows[0];

      // Generate token
      const token = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      res.status(201).json({
        message: 'User registered successfully',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        },
        token
      });
    } catch (error) {
      next(error);
    }
  }
);

// Login
router.post('/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
  ],
  validate,
  async (req, res, next) => {
    try {
      const { email, password } = req.body;

      // Get user
      const result = await query(
        `SELECT id, email, password_hash, name, role, is_active,
                failed_login_attempts, locked_until, must_change_password
         FROM users WHERE email = $1`,
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = result.rows[0];

      // Check if account is locked
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        return res.status(423).json({
          error: 'Account is temporarily locked. Try again later.'
        });
      }

      // Check if account is active
      if (!user.is_active) {
        return res.status(401).json({ error: 'Account is disabled' });
      }

      // Verify password
      const validPassword = await bcrypt.compare(password, user.password_hash);

      if (!validPassword) {
        // Increment failed attempts
        const attempts = user.failed_login_attempts + 1;
        const lockUntil = attempts >= 5
          ? new Date(Date.now() + 15 * 60 * 1000) // Lock for 15 minutes
          : null;

        await query(
          `UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3`,
          [attempts, lockUntil, user.id]
        );

        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Reset failed attempts and update last login
      await query(
        `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [user.id]
      );

      // Generate token
      const token = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      // Log login activity
      logActivity(user.id, 'login', 'user', user.id, user.name, {}, req);

      res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          must_change_password: user.must_change_password || false
        },
        token
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get current user
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, email, name, role, avatar_url, created_at, last_login, must_change_password
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Change password
router.post('/change-password',
  authenticate,
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 })
  ],
  validate,
  async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;

      // Get current password hash
      const result = await query(
        'SELECT password_hash FROM users WHERE id = $1',
        [req.user.id]
      );

      const user = result.rows[0];

      // Verify current password
      const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, 12);

      // Update password and clear must_change_password flag
      await query(
        'UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2',
        [newPasswordHash, req.user.id]
      );

      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      next(error);
    }
  }
);

// Update profile
router.put('/profile',
  authenticate,
  [
    body('name').optional().trim().notEmpty(),
    body('email').optional().isEmail().normalizeEmail()
  ],
  validate,
  async (req, res, next) => {
    try {
      const { name, email } = req.body;
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (name) {
        updates.push(`name = $${paramCount++}`);
        values.push(name);
      }

      if (email) {
        // Check if email is taken
        const existing = await query(
          'SELECT id FROM users WHERE email = $1 AND id != $2',
          [email, req.user.id]
        );
        if (existing.rows.length > 0) {
          return res.status(409).json({ error: 'Email already in use' });
        }
        updates.push(`email = $${paramCount++}`);
        values.push(email);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      values.push(req.user.id);

      const result = await query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}
         RETURNING id, email, name, role`,
        values
      );

      res.json({ user: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
