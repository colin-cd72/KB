const express = require('express');
const crypto = require('crypto');
const { query } = require('../config/database');
const { authenticate, isAdmin } = require('../middleware/auth');
const { sendEmail, sendTemplateEmail, reinitializeTransporter } = require('../services/emailService');

const router = express.Router();

// Get email settings (admin only)
router.get('/settings', authenticate, isAdmin, async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM email_settings LIMIT 1');

    if (result.rows.length === 0) {
      return res.json({
        smtp_host: '',
        smtp_port: 587,
        smtp_secure: false,
        smtp_user: '',
        smtp_pass: '',
        from_email: '',
        from_name: 'Knowledge Base',
        enabled: false
      });
    }

    // Don't send the password back
    const settings = result.rows[0];
    settings.smtp_pass = settings.smtp_pass ? '********' : '';

    res.json(settings);
  } catch (error) {
    next(error);
  }
});

// Update email settings (admin only)
router.put('/settings', authenticate, isAdmin, async (req, res, next) => {
  try {
    const {
      smtp_host,
      smtp_port,
      smtp_secure,
      smtp_user,
      smtp_pass,
      from_email,
      from_name,
      enabled
    } = req.body;

    // Only update password if a new one is provided (not the masked placeholder)
    let passwordClause = '';
    const params = [smtp_host, smtp_port || 587, smtp_secure || false, smtp_user, from_email, from_name || 'Knowledge Base', enabled || false];

    if (smtp_pass && smtp_pass !== '********') {
      passwordClause = ', smtp_pass = $8';
      params.push(smtp_pass);
    }

    await query(`
      UPDATE email_settings SET
        smtp_host = $1,
        smtp_port = $2,
        smtp_secure = $3,
        smtp_user = $4,
        from_email = $5,
        from_name = $6,
        enabled = $7,
        updated_at = NOW()
        ${passwordClause}
      WHERE id = 1
    `, params);

    // Reinitialize the email transporter with new settings
    await reinitializeTransporter();

    res.json({ success: true, message: 'Email settings updated' });
  } catch (error) {
    next(error);
  }
});

// Test email settings (admin only)
router.post('/test', authenticate, isAdmin, async (req, res, next) => {
  try {
    const { test_email } = req.body;

    if (!test_email) {
      return res.status(400).json({ error: 'Test email address required' });
    }

    const result = await sendEmail({
      to: test_email,
      subject: 'Test Email - Knowledge Base',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0284c7;">Email Test Successful!</h2>
          <p>If you're reading this, your email settings are configured correctly.</p>
          <p style="color: #64748b; font-size: 12px;">Knowledge Base System</p>
        </div>
      `
    });

    if (result.success) {
      res.json({ success: true, message: 'Test email sent successfully' });
    } else {
      res.status(400).json({ error: result.error || 'Failed to send test email' });
    }
  } catch (error) {
    next(error);
  }
});

// Get user's email preferences
router.get('/preferences', authenticate, async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM user_email_preferences WHERE user_id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      // Return defaults
      return res.json({
        notify_issue_assigned: true,
        notify_issue_updated: true,
        notify_issue_comment: true,
        notify_rma_status: true,
        notify_reminders: true,
        notify_digest: false,
        reminder_frequency: 'daily'
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Update user's email preferences
router.put('/preferences', authenticate, async (req, res, next) => {
  try {
    const {
      notify_issue_assigned,
      notify_issue_updated,
      notify_issue_comment,
      notify_rma_status,
      notify_reminders,
      notify_digest,
      reminder_frequency
    } = req.body;

    await query(`
      INSERT INTO user_email_preferences (
        user_id, notify_issue_assigned, notify_issue_updated, notify_issue_comment,
        notify_rma_status, notify_reminders, notify_digest, reminder_frequency
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (user_id) DO UPDATE SET
        notify_issue_assigned = $2,
        notify_issue_updated = $3,
        notify_issue_comment = $4,
        notify_rma_status = $5,
        notify_reminders = $6,
        notify_digest = $7,
        reminder_frequency = $8,
        updated_at = NOW()
    `, [
      req.user.id,
      notify_issue_assigned !== false,
      notify_issue_updated !== false,
      notify_issue_comment !== false,
      notify_rma_status !== false,
      notify_reminders !== false,
      notify_digest || false,
      reminder_frequency || 'daily'
    ]);

    res.json({ success: true, message: 'Email preferences updated' });
  } catch (error) {
    next(error);
  }
});

// Request email verification
router.post('/verify/request', authenticate, async (req, res, next) => {
  try {
    // Check if already verified
    const userResult = await query('SELECT email, name, email_verified FROM users WHERE id = $1', [req.user.id]);
    if (userResult.rows[0].email_verified) {
      return res.json({ message: 'Email already verified' });
    }

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Delete any existing tokens for this user
    await query('DELETE FROM email_verification_tokens WHERE user_id = $1', [req.user.id]);

    // Create new token
    await query(
      'INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [req.user.id, token, expiresAt]
    );

    // Send verification email
    const verificationLink = `${process.env.FRONTEND_URL || 'https://kb.4tmrw.net'}/verify-email?token=${token}`;
    await sendTemplateEmail('verification', userResult.rows[0].email, {
      userName: userResult.rows[0].name,
      verificationLink
    });

    res.json({ success: true, message: 'Verification email sent' });
  } catch (error) {
    next(error);
  }
});

// Verify email with token
router.post('/verify/:token', async (req, res, next) => {
  try {
    const { token } = req.params;

    // Find valid token
    const tokenResult = await query(`
      SELECT * FROM email_verification_tokens
      WHERE token = $1 AND expires_at > NOW()
    `, [token]);

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    const { user_id } = tokenResult.rows[0];

    // Mark email as verified
    await query(
      'UPDATE users SET email_verified = true, email_verified_at = NOW() WHERE id = $1',
      [user_id]
    );

    // Delete the token
    await query('DELETE FROM email_verification_tokens WHERE user_id = $1', [user_id]);

    res.json({ success: true, message: 'Email verified successfully' });
  } catch (error) {
    next(error);
  }
});

// Request password reset
router.post('/password-reset/request', async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email address required' });
    }

    // Find user
    const userResult = await query('SELECT id, name, email FROM users WHERE email = $1', [email]);

    // Always return success to prevent email enumeration
    if (userResult.rows.length === 0) {
      return res.json({ success: true, message: 'If the email exists, a reset link has been sent' });
    }

    const user = userResult.rows[0];

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Delete any existing tokens for this user
    await query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);

    // Create new token
    await query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt]
    );

    // Send reset email
    const resetLink = `${process.env.FRONTEND_URL || 'https://kb.4tmrw.net'}/reset-password?token=${token}`;
    await sendTemplateEmail('passwordReset', user.email, {
      userName: user.name,
      resetLink
    });

    res.json({ success: true, message: 'If the email exists, a reset link has been sent' });
  } catch (error) {
    next(error);
  }
});

// Reset password with token
router.post('/password-reset/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Find valid token
    const tokenResult = await query(`
      SELECT * FROM password_reset_tokens
      WHERE token = $1 AND expires_at > NOW() AND used = false
    `, [token]);

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const { user_id } = tokenResult.rows[0];

    // Hash new password
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update password
    await query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, user_id]);

    // Mark token as used
    await query('UPDATE password_reset_tokens SET used = true WHERE token = $1', [token]);

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
