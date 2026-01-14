#!/usr/bin/env node
/**
 * One-time script to send catch-up emails for all assigned todos
 * Run with: node scripts/send-todo-catchup-emails.js
 */

require('dotenv').config();
const { query, pool } = require('../src/config/database');
const { sendEmail, templates } = require('../src/services/emailService');

async function sendCatchupEmails() {
  console.log('Starting todo catch-up email process...\n');

  try {
    // Get all incomplete todos that are assigned to someone
    const result = await query(`
      SELECT
        t.id, t.title, t.priority, t.due_date, t.assigned_to,
        u.name as assignee_name, u.email as assignee_email,
        creator.name as created_by_name
      FROM todos t
      JOIN users u ON t.assigned_to = u.id
      LEFT JOIN users creator ON t.created_by = creator.id
      WHERE t.assigned_to IS NOT NULL
        AND t.status != 'completed'
      ORDER BY t.assigned_to, t.priority, t.due_date
    `);

    if (result.rows.length === 0) {
      console.log('No assigned todos found.');
      return;
    }

    console.log(`Found ${result.rows.length} assigned todo(s)\n`);

    // Group todos by assignee
    const todosByAssignee = {};
    for (const todo of result.rows) {
      if (!todosByAssignee[todo.assigned_to]) {
        todosByAssignee[todo.assigned_to] = {
          name: todo.assignee_name,
          email: todo.assignee_email,
          todos: []
        };
      }
      todosByAssignee[todo.assigned_to].todos.push({
        title: todo.title,
        priority: todo.priority,
        due_date: todo.due_date
      });
    }

    // Send email to each assignee
    for (const [assigneeId, data] of Object.entries(todosByAssignee)) {
      console.log(`Sending to ${data.name} (${data.email}): ${data.todos.length} todo(s)`);

      const template = templates.todoAssigned(data.name, data.todos, 'System (Catch-up)');

      const emailResult = await sendEmail({
        to: data.email,
        subject: `[Catch-up] You have ${data.todos.length} assigned todo(s)`,
        html: template.html
      });

      if (emailResult.success) {
        console.log(`  ✓ Email sent successfully\n`);
      } else {
        console.log(`  ✗ Failed: ${emailResult.error}\n`);
      }
    }

    console.log('Done!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

sendCatchupEmails();
