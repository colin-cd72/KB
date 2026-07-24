# Dashboard Tasks Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a facility-wide, actionable Tasks widget to the Dashboard — overdue/due-today/open counts plus an urgency-sorted list of open tasks with inline complete-toggle.

**Architecture:** A single `TasksWidget` sub-component added inside `frontend/src/pages/Dashboard.jsx` (matching that file's inline-widget convention, e.g. `RmaTrackingWidget`), rendered full-width between the stat grid and the `lg:grid-cols-3` row. Frontend-only; reuses existing `todosApi` endpoints and control-room design tokens.

**Tech Stack:** React, TanStack Query (`@tanstack/react-query`), react-router `Link`, lucide-react icons, clsx, Tailwind (control-room theme).

## Global Constraints

- Frontend-only. No backend/schema changes.
- Control-room tokens only — no new CSS, no raw Tailwind hues. Semantic: `danger`=tally red, `warning`=amber, `success`=signal green, `accent`=info blue, `dark`=inverted neutral.
- **Priority→color must match the Tasks page** (`Todos.jsx` getPriorityBarColor): `high` → `bg-danger-500`, `medium` → `bg-warning-500`, `low` → `bg-success-500`. Do NOT use the `.priority-dot-*` classes (their high/critical mapping differs from the Tasks page).
- Exact data shapes: `todosApi.getStats()` → `response.data.stats` = `{ pending, completed, overdue, due_today, total }`. `todosApi.getAll({ show_completed: 'false' })` → `response.data.todos` = array of `{ id, title, status, priority, due_date, assigned_to_name, subtasks }`. `todosApi.toggle(id)` completes/uncompletes (requires technician/admin).
- Complete-checkbox interactive only when `user.role === 'admin' || user.role === 'technician'`; disabled otherwise.
- Do not modify or remove the existing "My Assignments" widget.

---

### Task 1: Add the Tasks widget to the Dashboard

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`

**Interfaces produced:** a `TasksWidget` component rendered in the Dashboard layout; no exports (internal to the file).

- [ ] **Step 1: Add imports.**

At the top of `Dashboard.jsx`:
- Change the react-query import to include the mutation hooks:
  `import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';`
- Add `todosApi` to the api import: `import { dashboardApi, todosApi } from '../services/api';`
- Add icons to the existing lucide-react import list: `ListChecks, Square` (keep the existing icons; `ArrowRight` is already imported).

- [ ] **Step 2: Add the `TasksWidget` component.**

Add this sub-component in `Dashboard.jsx` (near the other sub-components like `RmaTrackingWidget`), above the `Dashboard` function:

```jsx
// Priority dot color — matches the Tasks page (Todos.jsx getPriorityBarColor)
function taskPriorityColor(priority) {
  switch (priority) {
    case 'high': return 'bg-danger-500';
    case 'medium': return 'bg-warning-500';
    case 'low': return 'bg-success-500';
    default: return 'bg-dark-400';
  }
}

function isTaskOverdue(dueDate) {
  if (!dueDate) return false;
  const d = new Date(dueDate); d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return d < today;
}

function isTaskDueToday(dueDate) {
  if (!dueDate) return false;
  const d = new Date(dueDate); d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return d.getTime() === today.getTime();
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

function sortTasksByUrgency(tasks) {
  return [...tasks].sort((a, b) => {
    const aOver = isTaskOverdue(a.due_date), bOver = isTaskOverdue(b.due_date);
    if (aOver !== bOver) return aOver ? -1 : 1;
    const aToday = isTaskDueToday(a.due_date), bToday = isTaskDueToday(b.due_date);
    if (aToday !== bToday) return aToday ? -1 : 1;
    // soonest due date first; nulls last
    if (a.due_date && b.due_date && a.due_date !== b.due_date) {
      return new Date(a.due_date) - new Date(b.due_date);
    }
    if (!!a.due_date !== !!b.due_date) return a.due_date ? -1 : 1;
    return (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3);
  });
}

function TasksWidget() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const canComplete = user?.role === 'admin' || user?.role === 'technician';

  const { data: stats } = useQuery({
    queryKey: ['dashboard-task-stats'],
    queryFn: async () => (await todosApi.getStats()).data.stats,
  });

  const { data: tasks } = useQuery({
    queryKey: ['dashboard-tasks'],
    queryFn: async () => (await todosApi.getAll({ show_completed: 'false' })).data.todos,
  });

  const toggle = useMutation({
    mutationFn: (id) => todosApi.toggle(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-task-stats'] });
    },
  });

  const open = tasks || [];
  const shown = sortTasksByUrgency(open).slice(0, 5);
  const moreCount = Math.max(0, (stats?.pending ?? open.length) - shown.length);

  return (
    <div className="card">
      <div className="px-6 py-5 border-b border-dark-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center">
            <ListChecks className="w-5 h-5 text-dark-50" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-dark-900">Tasks</h2>
            <p className="text-sm text-dark-500">{stats?.pending ?? 0} open</p>
          </div>
        </div>
        <Link to="/todos" className="text-sm text-primary-500 hover:text-primary-400 flex items-center gap-1">
          View all <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Counts */}
      <div className="px-6 py-4 flex flex-wrap gap-3 border-b border-dark-100">
        <Link to="/todos" className="badge bg-danger-100 text-danger-600 border border-danger-300/60">
          {stats?.overdue ?? 0} Overdue
        </Link>
        <Link to="/todos" className="badge bg-warning-100 text-warning-600 border border-warning-300/60">
          {stats?.due_today ?? 0} Due today
        </Link>
        <Link to="/todos" className="badge bg-accent-100 text-accent-600 border border-accent-300/60">
          {stats?.pending ?? 0} Open
        </Link>
      </div>

      {/* List */}
      {shown.length === 0 ? (
        <div className="empty-state py-10">
          <p className="empty-state-text">No open tasks — you're all clear.</p>
        </div>
      ) : (
        <ul className="divide-y divide-dark-100">
          {shown.map((t) => {
            const overdue = isTaskOverdue(t.due_date);
            const dueToday = isTaskDueToday(t.due_date);
            return (
              <li key={t.id} className="px-6 py-3 flex items-center gap-3 hover:bg-primary-500/[0.05] transition-colors">
                <button
                  type="button"
                  disabled={!canComplete || toggle.isPending}
                  onClick={() => toggle.mutate(t.id)}
                  className="text-dark-500 hover:text-success-500 disabled:opacity-40 disabled:hover:text-dark-500"
                  aria-label="Complete task"
                >
                  <Square className="w-5 h-5" />
                </button>
                <span className={clsx('w-2.5 h-2.5 rounded-full flex-shrink-0', taskPriorityColor(t.priority))} />
                <Link to="/todos" className="flex-1 min-w-0 truncate text-dark-800 hover:text-dark-900">
                  {t.title}
                </Link>
                {t.due_date && (
                  <span className={clsx(
                    'text-xs font-mono flex-shrink-0',
                    overdue ? 'text-danger-500 font-semibold' : dueToday ? 'text-warning-500' : 'text-dark-500'
                  )}>
                    {overdue ? 'Overdue' : dueToday ? 'Due today' : new Date(t.due_date).toLocaleDateString()}
                  </span>
                )}
                <span className="text-xs text-dark-500 flex-shrink-0 w-16 truncate text-right">
                  {t.assigned_to_name || '—'}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {moreCount > 0 && (
        <Link to="/todos" className="block px-6 py-3 text-sm text-dark-500 hover:text-dark-900 hover:bg-primary-500/[0.05] transition-colors">
          + {moreCount} more open task{moreCount === 1 ? '' : 's'} →
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Render `TasksWidget` in the Dashboard layout.**

In the `Dashboard` component's returned JSX, insert `<TasksWidget />` immediately AFTER the closing `</div>` of the "Stats Grid" block (the `grid ... lg:grid-cols-4` block) and BEFORE the `<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">` row that contains "My Assignments". It renders full-width in the `space-y-8` column:

```jsx
      </div>{/* end Stats Grid */}

      <TasksWidget />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* My Assignments ... (unchanged) */}
```

(Do not gate `TasksWidget` on role — viewers should see it read-only; the checkbox itself is disabled for non-technicians inside the component.)

- [ ] **Step 4: Build.**

Run: `cd frontend && npm run build`
Expected: exits 0.

- [ ] **Step 5: Visual verification (controller-driven).**

The controller screenshots `/dashboard` via the faked-auth Playwright harness with a `/todos` fixture returning `{ todos: [...] }` containing an overdue, a due-today, and future-dated tasks (mixed priorities), and a `/todos/stats/summary` fixture returning `{ stats: { pending, overdue, due_today, ... } }`. Confirm:
- The Tasks card appears full-width below the stat tiles.
- Counts render: Overdue red, Due today amber, Open accent.
- List is urgency-ordered (overdue first, then due today, then soonest date).
- Priority dots use high=red / medium=amber / low=green.
- Due chips: "Overdue" red, "Due today" amber, else muted date.
- Empty state shows when the task list is empty.
- (Role) With `role: 'viewer'`, the complete checkbox is disabled.

- [ ] **Step 6: Commit.**

```bash
git add frontend/src/pages/Dashboard.jsx
git commit -m "Add facility-wide Tasks widget to the Dashboard

Overdue/due-today/open counts + urgency-sorted open-task list with inline
complete-toggle (technician/admin). Reuses existing todos endpoints.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

## Self-Review (controller, after implementation)

- Spec coverage: counts (✓ Step 2), urgency sort (✓ sortTasksByUrgency), inline toggle w/ invalidation (✓), permission gating (✓ canComplete), empty state (✓), placement (✓ Step 3), no backend change (✓). 
- Priority color matches Tasks page, not `.priority-dot-*` (✓ Global Constraints).
- No raw Tailwind hues (uses danger/warning/success/accent/dark tokens only).
