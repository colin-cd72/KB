const { query } = require('../config/database');
const { sendEmail, templates } = require('./emailService');

// In-memory queue for batching todo assignments
// Structure: { assigneeId: { todos: [], assignedById: string, timestamp: Date } }
const assignmentQueue = new Map();

// Delay before sending notifications (5 minutes)
const BATCH_DELAY_MS = 5 * 60 * 1000;

// Timer references for each assignee
const pendingTimers = new Map();

/**
 * Queue a todo assignment for notification
 * @param {Object} todo - The todo object
 * @param {string} assigneeId - ID of the user being assigned
 * @param {string} assignedById - ID of the user who assigned the todo
 */
async function queueTodoAssignment(todo, assigneeId, assignedById) {
  // Don't notify if assigning to self
  if (assigneeId === assignedById) {
    return;
  }

  const key = assigneeId;

  if (!assignmentQueue.has(key)) {
    assignmentQueue.set(key, {
      todos: [],
      assignedById,
      timestamp: new Date()
    });
  }

  const queueEntry = assignmentQueue.get(key);
  queueEntry.todos.push(todo);

  // Clear existing timer for this assignee
  if (pendingTimers.has(key)) {
    clearTimeout(pendingTimers.get(key));
  }

  // Set new timer
  const timer = setTimeout(() => {
    processAssignmentQueue(key);
  }, BATCH_DELAY_MS);

  pendingTimers.set(key, timer);

  console.log(`Todo "${todo.title}" queued for ${assigneeId}. Will send in 5 minutes. Queue size: ${queueEntry.todos.length}`);
}

/**
 * Process and send the queued assignments for a specific assignee
 */
async function processAssignmentQueue(assigneeId) {
  const queueEntry = assignmentQueue.get(assigneeId);

  if (!queueEntry || queueEntry.todos.length === 0) {
    assignmentQueue.delete(assigneeId);
    pendingTimers.delete(assigneeId);
    return;
  }

  try {
    // Get assignee details
    const assigneeResult = await query(
      'SELECT id, name, email FROM users WHERE id = $1',
      [assigneeId]
    );

    if (assigneeResult.rows.length === 0) {
      console.log(`Assignee ${assigneeId} not found, skipping notification`);
      assignmentQueue.delete(assigneeId);
      pendingTimers.delete(assigneeId);
      return;
    }

    const assignee = assigneeResult.rows[0];

    // Get assigner details
    const assignerResult = await query(
      'SELECT name FROM users WHERE id = $1',
      [queueEntry.assignedById]
    );

    const assignerName = assignerResult.rows[0]?.name || 'Someone';

    // Generate email
    const template = templates.todoAssigned(assignee.name, queueEntry.todos, assignerName);

    // Send email
    const result = await sendEmail({
      to: assignee.email,
      subject: template.subject,
      html: template.html
    });

    if (result.success) {
      console.log(`Todo assignment notification sent to ${assignee.email} for ${queueEntry.todos.length} todo(s)`);
    } else {
      console.error(`Failed to send todo assignment notification: ${result.error}`);
    }
  } catch (error) {
    console.error('Error processing assignment queue:', error);
  } finally {
    // Clear the queue
    assignmentQueue.delete(assigneeId);
    pendingTimers.delete(assigneeId);
  }
}

/**
 * Force process all pending queues (useful for shutdown)
 */
async function flushAllQueues() {
  for (const [assigneeId] of assignmentQueue) {
    clearTimeout(pendingTimers.get(assigneeId));
    await processAssignmentQueue(assigneeId);
  }
}

/**
 * Get queue status (for debugging)
 */
function getQueueStatus() {
  const status = {};
  for (const [key, entry] of assignmentQueue) {
    status[key] = {
      todoCount: entry.todos.length,
      assignedBy: entry.assignedById,
      queuedAt: entry.timestamp
    };
  }
  return status;
}

module.exports = {
  queueTodoAssignment,
  processAssignmentQueue,
  flushAllQueues,
  getQueueStatus
};
