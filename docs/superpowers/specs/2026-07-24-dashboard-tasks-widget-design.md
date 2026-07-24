# Dashboard Tasks Widget — Design

**Date:** 2026-07-24
**Status:** Approved design → ready for implementation plan
**Scope:** Frontend-only (no backend/schema changes)

## Problem

The Todos ("Tasks") feature is a major part of the KB, but it is not represented
on the Dashboard. The existing "My Assignments" widget shows assigned **issues**
(`dashboardApi.getAssignments()` → `/dashboard/my-assignments`), not tasks. Users
have no at-a-glance, actionable view of open tasks from the landing page.

## Goal

Add a prominent, actionable **Tasks** widget to the Dashboard that shows
facility-wide open-task counts and an urgency-ordered list of open tasks that
can be completed inline.

## Non-Goals

- No backend or schema changes — all endpoints already exist.
- Does not replace or alter the "My Assignments" (issues) widget; both coexist.
- No task creation/editing from the dashboard (the Tasks page owns that). Only
  inline complete-toggle.
- No per-user filtering — the widget is facility-wide (all open tasks).

## Data Sources (all existing)

- `todosApi.getStats()` → `GET /todos/stats/summary` — facility-wide, returns
  `{ pending, completed, overdue, due_today, total }`. Used for the counts row.
- `todosApi.getAll(params)` → `GET /todos` — returns open tasks (excludes
  completed by default), each with `id, title, status, priority, due_date,
  assigned_to_name, subtasks`. Used for the list.
- `todosApi.toggle(id)` → `POST /todos/:id/toggle` — marks a task
  complete/incomplete. **Requires technician/admin role** (`isTechnician`).

## Layout

A full-width `.card` placed immediately below the four stat tiles and above the
"My Assignments" widget on the Dashboard.

```
┌─ Tasks ─────────────────────────────────────────  View all → ┐
│  ⦿ 3 Overdue    ⦿ 2 Due today    ⦿ 12 Open                    │
│ ──────────────────────────────────────────────────────────── │
│ ☐ •  Recable rack 4                ⚑ overdue Jul 22   · Colin  │
│ ☐ •  Firmware update ATEM               Due today    · Sam    │
│ ☐ •  Label patch panel                  Jul 30       · —      │
│ ☐ •  Replace SDI cable bay 2            Aug 02       · Colin  │
│ ☐ •  Audit tally power                  Aug 05       · Sam    │
│                                + 7 more open tasks → Tasks     │
└───────────────────────────────────────────────────────────────┘
```

- **Header:** "Tasks" title + a "View all →" link to `/todos`.
- **Counts row:** three inline stat pills — Overdue (tally red / `danger`),
  Due Today (amber / `warning`), Open (info blue / `accent`). Each count links
  to `/todos` (optionally with a filter query the page already understands; if
  the Tasks page does not read such a query param, link plainly to `/todos`).
- **List:** the top 5 open tasks after urgency sort (below). Each row:
  - a **complete checkbox** (toggles the task; disabled/read-only for viewers),
  - a **priority dot** (`.priority-dot-critical/-high/-medium/-low`),
  - the **title** (truncates; links to `/todos`),
  - a **due-date chip** — `text-danger-500` + "overdue" when past due,
    `text-warning-500` "Due today" when due today, else muted date,
  - the **assignee name** (or "—" when unassigned).
- **Overflow line:** "+ N more open tasks →" linking to `/todos`, where
  N = `pending − shown`.
- **Empty state:** "No open tasks — you're all clear." (control-room empty
  style).

## Urgency Sort

Client-side sort of the open-task list, in this order:
1. Overdue (due_date < today) first,
2. then due today (due_date == today),
3. then by soonest `due_date` ascending (nulls last),
4. tiebreak by priority (critical > high > medium > low).

Take the first 5 for display.

## Behavior

- Data fetched via React Query: `['dashboard-task-stats']` (getStats) and
  `['dashboard-tasks']` (getAll open). On a successful `toggle`, invalidate both
  query keys so counts and list refresh (a completed task drops off; counts
  update).
- The complete checkbox is interactive only when
  `user.role === 'admin' || user.role === 'technician'`; otherwise rendered
  disabled. This mirrors the app's existing mutation-gating pattern.
- Toggling shows the standard toast on error (the axios interceptor already
  handles 403/500); no custom error UI needed.

## Structure

Implemented as a `TasksWidget` sub-component **inside `frontend/src/pages/
Dashboard.jsx`**, following that file's established convention of inline widget
sub-components (e.g. `RmaTrackingWidget`). Rendered from the Dashboard's main
layout in the chosen position. Reuses control-room design-system classes
(`.card`, `.priority-dot-*`, `.empty-state*`, semantic `danger`/`warning`/
`accent` tokens) — no new CSS.

## Verification

- `npm run build` exits 0.
- Visual check via the faked-auth Playwright harness with a `/todos` fixture
  populated (overdue / due-today / future tasks) to confirm: counts render in the
  right colors, urgency ordering is correct, the checkbox completes a task and
  the row/counts update, and the empty state renders when no open tasks. Confirm
  the viewer role sees a disabled checkbox.
