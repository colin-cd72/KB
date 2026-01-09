const nodemailer = require('nodemailer');
const { query } = require('../config/database');

let transporter = null;

// Initialize email transporter from database settings
async function initializeTransporter() {
  try {
    const result = await query('SELECT * FROM email_settings LIMIT 1');
    if (result.rows.length === 0) {
      console.log('No email settings configured');
      return null;
    }

    const settings = result.rows[0];
    if (!settings.smtp_host || !settings.smtp_user || !settings.smtp_pass) {
      console.log('Email settings incomplete');
      return null;
    }

    transporter = nodemailer.createTransport({
      host: settings.smtp_host,
      port: settings.smtp_port || 587,
      secure: settings.smtp_secure || false,
      auth: {
        user: settings.smtp_user,
        pass: settings.smtp_pass
      }
    });

    // Verify connection
    await transporter.verify();
    console.log('Email transporter initialized successfully');
    return transporter;
  } catch (error) {
    console.error('Failed to initialize email transporter:', error.message);
    return null;
  }
}

// Get or create transporter
async function getTransporter() {
  if (!transporter) {
    await initializeTransporter();
  }
  return transporter;
}

// Reinitialize transporter (call after settings change)
async function reinitializeTransporter() {
  transporter = null;
  return initializeTransporter();
}

// Send email
async function sendEmail({ to, subject, html, text }) {
  const transport = await getTransporter();
  if (!transport) {
    console.log('Email not sent - no transporter configured');
    return { success: false, error: 'Email not configured' };
  }

  try {
    const settings = await query('SELECT from_email, from_name FROM email_settings LIMIT 1');
    const fromEmail = settings.rows[0]?.from_email || 'noreply@example.com';
    const fromName = settings.rows[0]?.from_name || 'Knowledge Base';

    const result = await transport.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, '')
    });

    console.log('Email sent:', result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Failed to send email:', error.message);
    return { success: false, error: error.message };
  }
}

// Email templates
const templates = {
  verification: (userName, verificationLink) => ({
    subject: 'Verify Your Email - Knowledge Base',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0284c7;">Verify Your Email</h2>
        <p>Hello ${userName},</p>
        <p>Please click the button below to verify your email address:</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${verificationLink}" style="background: #0284c7; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">Verify Email</a>
        </p>
        <p>Or copy this link: <a href="${verificationLink}">${verificationLink}</a></p>
        <p>This link expires in 24 hours.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
        <p style="color: #64748b; font-size: 12px;">Knowledge Base System</p>
      </div>
    `
  }),

  passwordReset: (userName, resetLink) => ({
    subject: 'Password Reset - Knowledge Base',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0284c7;">Password Reset Request</h2>
        <p>Hello ${userName},</p>
        <p>You requested to reset your password. Click the button below:</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background: #0284c7; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a>
        </p>
        <p>Or copy this link: <a href="${resetLink}">${resetLink}</a></p>
        <p>This link expires in 1 hour. If you didn't request this, please ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
        <p style="color: #64748b; font-size: 12px;">Knowledge Base System</p>
      </div>
    `
  }),

  issueCreated: (issue, assigneeName) => ({
    subject: `New Issue Assigned: ${issue.title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0284c7;">New Issue Assigned to You</h2>
        <p>Hello ${assigneeName},</p>
        <p>A new issue has been assigned to you:</p>
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin: 0 0 10px 0; color: #0f172a;">${issue.title}</h3>
          <p style="margin: 0; color: #64748b;">Priority: <strong>${issue.priority}</strong></p>
          <p style="margin: 10px 0 0 0; color: #475569;">${issue.description?.substring(0, 200) || 'No description'}${issue.description?.length > 200 ? '...' : ''}</p>
        </div>
        <p><a href="${process.env.FRONTEND_URL || 'https://kb.4tmrw.net'}/issues/${issue.id}" style="color: #0284c7;">View Issue</a></p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
        <p style="color: #64748b; font-size: 12px;">Knowledge Base System</p>
      </div>
    `
  }),

  issueUpdated: (issue, userName, changes) => ({
    subject: `Issue Updated: ${issue.title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0284c7;">Issue Updated</h2>
        <p>Hello ${userName},</p>
        <p>An issue you're watching has been updated:</p>
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin: 0 0 10px 0; color: #0f172a;">${issue.title}</h3>
          <p style="margin: 0; color: #64748b;">Changes: ${changes}</p>
        </div>
        <p><a href="${process.env.FRONTEND_URL || 'https://kb.4tmrw.net'}/issues/${issue.id}" style="color: #0284c7;">View Issue</a></p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
        <p style="color: #64748b; font-size: 12px;">Knowledge Base System</p>
      </div>
    `
  }),

  rmaStatusChanged: (rma, userName, oldStatus, newStatus) => ({
    subject: `RMA ${rma.rma_number} Status Changed: ${newStatus}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0284c7;">RMA Status Update</h2>
        <p>Hello ${userName},</p>
        <p>The status of RMA <strong>${rma.rma_number}</strong> has changed:</p>
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin: 0 0 10px 0; color: #0f172a;">${rma.item_name}</h3>
          <p style="margin: 0; color: #64748b;">Status: <span style="text-decoration: line-through;">${oldStatus}</span> → <strong style="color: #059669;">${newStatus}</strong></p>
          ${rma.tracking_number ? `<p style="margin: 10px 0 0 0; color: #475569;">Tracking: ${rma.tracking_number}</p>` : ''}
        </div>
        <p><a href="${process.env.FRONTEND_URL || 'https://kb.4tmrw.net'}/rmas/${rma.id}" style="color: #0284c7;">View RMA</a></p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
        <p style="color: #64748b; font-size: 12px;">Knowledge Base System</p>
      </div>
    `
  }),

  reminder: (userName, items, type) => ({
    subject: `Reminder: ${items.length} Pending ${type}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0284c7;">Pending ${type} Reminder</h2>
        <p>Hello ${userName},</p>
        <p>You have ${items.length} pending ${type.toLowerCase()} that need attention:</p>
        <ul style="background: #f8fafc; padding: 20px 20px 20px 40px; border-radius: 8px; margin: 20px 0;">
          ${items.map(item => `<li style="margin: 10px 0;"><a href="${item.url}" style="color: #0284c7;">${item.title}</a> - ${item.status || ''}</li>`).join('')}
        </ul>
        <p><a href="${process.env.FRONTEND_URL || 'https://kb.4tmrw.net'}" style="color: #0284c7;">Go to Dashboard</a></p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
        <p style="color: #64748b; font-size: 12px;">Knowledge Base System</p>
      </div>
    `
  }),

  digest: (userName, summary) => ({
    subject: 'Weekly Summary - Knowledge Base',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0284c7;">Weekly Summary</h2>
        <p>Hello ${userName},</p>
        <p>Here's your weekly summary:</p>
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
            <div style="text-align: center; flex: 1;">
              <p style="font-size: 24px; font-weight: bold; color: #0284c7; margin: 0;">${summary.newIssues || 0}</p>
              <p style="color: #64748b; margin: 5px 0 0 0; font-size: 12px;">New Issues</p>
            </div>
            <div style="text-align: center; flex: 1;">
              <p style="font-size: 24px; font-weight: bold; color: #059669; margin: 0;">${summary.resolvedIssues || 0}</p>
              <p style="color: #64748b; margin: 5px 0 0 0; font-size: 12px;">Resolved</p>
            </div>
            <div style="text-align: center; flex: 1;">
              <p style="font-size: 24px; font-weight: bold; color: #d97706; margin: 0;">${summary.pendingRMAs || 0}</p>
              <p style="color: #64748b; margin: 5px 0 0 0; font-size: 12px;">Pending RMAs</p>
            </div>
          </div>
        </div>
        <p><a href="${process.env.FRONTEND_URL || 'https://kb.4tmrw.net'}" style="color: #0284c7;">Go to Dashboard</a></p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
        <p style="color: #64748b; font-size: 12px;">Knowledge Base System</p>
      </div>
    `
  }),

  welcomeNewUser: (userName, email, password, loginUrl) => ({
    subject: 'Welcome to Knowledge Base - Your Account Details',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0284c7;">Welcome to Knowledge Base!</h2>
        <p>Hello ${userName},</p>
        <p>An account has been created for you. Here are your login details:</p>
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Email:</strong> ${email}</p>
          <p style="margin: 0 0 10px 0;"><strong>Temporary Password:</strong> <code style="background: #e2e8f0; padding: 2px 8px; border-radius: 4px;">${password}</code></p>
        </div>
        <p style="color: #dc2626; font-weight: 500;">You will be required to change your password on first login.</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${loginUrl}" style="background: #0284c7; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">Login Now</a>
        </p>
        <p>Or go to: <a href="${loginUrl}" style="color: #0284c7;">${loginUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
        <p style="color: #64748b; font-size: 12px;">Knowledge Base System</p>
      </div>
    `
  })
};

// Send templated email
async function sendTemplateEmail(templateName, to, data) {
  const templateFn = templates[templateName];
  if (!templateFn) {
    return { success: false, error: 'Template not found' };
  }

  const { subject, html } = templateFn(...Object.values(data));
  return sendEmail({ to, subject, html });
}

// Check if user wants this type of notification
async function shouldNotifyUser(userId, notificationType) {
  try {
    const result = await query(
      'SELECT * FROM user_email_preferences WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      // Default to true if no preferences set
      return true;
    }

    const prefs = result.rows[0];
    switch (notificationType) {
      case 'issue_assigned':
        return prefs.notify_issue_assigned !== false;
      case 'issue_updated':
        return prefs.notify_issue_updated !== false;
      case 'issue_comment':
        return prefs.notify_issue_comment !== false;
      case 'rma_status':
        return prefs.notify_rma_status !== false;
      case 'reminder':
        return prefs.notify_reminders !== false;
      case 'digest':
        return prefs.notify_digest !== false;
      default:
        return true;
    }
  } catch (error) {
    console.error('Error checking notification preferences:', error);
    return true;
  }
}

module.exports = {
  initializeTransporter,
  reinitializeTransporter,
  sendEmail,
  sendTemplateEmail,
  shouldNotifyUser,
  templates
};
