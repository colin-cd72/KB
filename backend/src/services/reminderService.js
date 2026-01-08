const cron = require('node-cron');
const { query } = require('../config/database');
const { sendTemplateEmail, shouldNotifyUser } = require('./emailService');

// Send reminders for assigned issues
async function sendIssueReminders() {
  try {
    // Get users with pending assigned issues
    const result = await query(`
      SELECT DISTINCT u.id, u.name, u.email,
        (SELECT COUNT(*) FROM issues WHERE assigned_to = u.id AND status NOT IN ('resolved', 'closed')) as pending_count
      FROM users u
      JOIN issues i ON i.assigned_to = u.id
      WHERE i.status NOT IN ('resolved', 'closed')
      AND u.email IS NOT NULL
    `);

    for (const user of result.rows) {
      // Check if user wants reminders
      const shouldNotify = await shouldNotifyUser(user.id, 'reminder');
      if (!shouldNotify) continue;

      // Get their pending issues
      const issuesResult = await query(`
        SELECT id, title, priority, status, created_at
        FROM issues
        WHERE assigned_to = $1 AND status NOT IN ('resolved', 'closed')
        ORDER BY
          CASE priority
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            ELSE 4
          END,
          created_at ASC
        LIMIT 10
      `, [user.id]);

      if (issuesResult.rows.length === 0) continue;

      const items = issuesResult.rows.map(issue => ({
        title: issue.title,
        url: `${process.env.FRONTEND_URL || 'https://kb.4tmrw.net'}/issues/${issue.id}`,
        status: `${issue.priority} priority`
      }));

      await sendTemplateEmail('reminder', user.email, {
        userName: user.name,
        items,
        type: 'Issues'
      });

      console.log(`Sent issue reminder to ${user.email}`);
    }
  } catch (error) {
    console.error('Error sending issue reminders:', error);
  }
}

// Send reminders for pending RMAs
async function sendRMAReminders() {
  try {
    // Get RMAs that have been shipped but not received for more than 7 days
    const result = await query(`
      SELECT r.*, u.name as user_name, u.email
      FROM rmas r
      JOIN users u ON r.created_by = u.id
      WHERE r.status = 'shipped'
      AND r.shipped_at < NOW() - INTERVAL '7 days'
      AND u.email IS NOT NULL
    `);

    for (const rma of result.rows) {
      // Check if user wants reminders
      const shouldNotify = await shouldNotifyUser(rma.created_by, 'reminder');
      if (!shouldNotify) continue;

      const items = [{
        title: `${rma.rma_number} - ${rma.item_name}`,
        url: `${process.env.FRONTEND_URL || 'https://kb.4tmrw.net'}/rmas/${rma.id}`,
        status: `Shipped ${Math.floor((Date.now() - new Date(rma.shipped_at)) / (1000 * 60 * 60 * 24))} days ago`
      }];

      await sendTemplateEmail('reminder', rma.email, {
        userName: rma.user_name,
        items,
        type: 'RMAs'
      });

      console.log(`Sent RMA reminder to ${rma.email}`);
    }
  } catch (error) {
    console.error('Error sending RMA reminders:', error);
  }
}

// Send weekly digest
async function sendWeeklyDigest() {
  try {
    // Get users who want digest emails
    const usersResult = await query(`
      SELECT u.id, u.name, u.email
      FROM users u
      JOIN user_email_preferences p ON p.user_id = u.id
      WHERE p.notify_digest = true
      AND u.email IS NOT NULL
    `);

    for (const user of usersResult.rows) {
      // Get summary stats for the week
      const statsResult = await query(`
        SELECT
          (SELECT COUNT(*) FROM issues WHERE created_at > NOW() - INTERVAL '7 days') as new_issues,
          (SELECT COUNT(*) FROM issues WHERE status IN ('resolved', 'closed') AND updated_at > NOW() - INTERVAL '7 days') as resolved_issues,
          (SELECT COUNT(*) FROM rmas WHERE status IN ('pending', 'approved', 'shipped')) as pending_rmas
      `);

      const summary = statsResult.rows[0];

      await sendTemplateEmail('digest', user.email, {
        userName: user.name,
        summary
      });

      console.log(`Sent weekly digest to ${user.email}`);
    }
  } catch (error) {
    console.error('Error sending weekly digest:', error);
  }
}

// Initialize cron jobs
function initializeReminders() {
  // Check email settings first
  query('SELECT enabled FROM email_settings LIMIT 1').then(result => {
    if (!result.rows[0]?.enabled) {
      console.log('Email reminders disabled - email not configured');
      return;
    }

    // Daily reminders at 9 AM
    cron.schedule('0 9 * * *', () => {
      console.log('Running daily reminders...');
      sendIssueReminders();
      sendRMAReminders();
    });

    // Weekly digest on Monday at 8 AM
    cron.schedule('0 8 * * 1', () => {
      console.log('Running weekly digest...');
      sendWeeklyDigest();
    });

    console.log('Email reminder cron jobs initialized');
  }).catch(error => {
    console.error('Failed to initialize reminders:', error);
  });
}

module.exports = {
  initializeReminders,
  sendIssueReminders,
  sendRMAReminders,
  sendWeeklyDigest
};
