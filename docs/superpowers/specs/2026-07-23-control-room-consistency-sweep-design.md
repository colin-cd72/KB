# Control-Room Consistency Sweep — Design

**Date:** 2026-07-23
**Status:** Approved design → ready for implementation plan
**Branch:** `control-room-consistency`

## Problem

The control-room dark theme (commits `5c75c0a`, `6ff15f3`) was landed as a
"first pass." It works by lightness-inverting the neutral ramp and aliasing
`gray`/`slate` to it in `tailwind.config.js`, which flips most of the app dark
without per-page rewrites. But two classes of leftover remain:

1. **Raw Tailwind hues in already-redesigned pages** — status dots, priority
   badges, and info links still use literal `bg-red-500`, `bg-blue-*`,
   `bg-green-100 text-green-700`, etc. These are *not* aliased in the config, so
   they render with Tailwind's default palette instead of the control-room
   tokens (signal green / tally red / amber / info blue). Some light-fill badge
   patterns (`bg-*-50`, `bg-*-100`) also read as pale pills that are off-brand
   against the dark ground.
2. **Pages the redesign never touched** — `ScanAsset` (uses `indigo`, which is
   absent from the palette entirely), plus `Search`, `ActivityLog`, `Issues`,
   `RMADetail`, `Register`, and `BarcodeScanner`.

Additionally, the PWA manifest in `vite.config.js` still carries the pre-redesign
`theme_color: '#0284c7'` and `background_color: '#ffffff'`.

The goal is a **consistency sweep**: make the dark control-room theme uniform
everywhere, fixing anything that renders broken or off-palette. No new visual
concepts — this reuses the design system that already exists.

## Non-Goals

- No new components, pages, or aesthetic concepts (that would be a "deepen the
  aesthetic" pass, explicitly deferred).
- No refactoring unrelated to color/theme consistency.
- **Do not touch `gray`/`slate` utilities** — they are already correctly
  inverted by the config alias. Changing them is pure churn.
- Leave intentional gradient hex values (`mesh-gradient`, Dashboard gauge
  colors) and `text-white` on colored buttons alone — those are correct.

## The Existing Design System (what we map TO)

`frontend/src/index.css` already provides a complete component vocabulary. The
sweep prefers these classes over re-deriving utilities:

- Buttons: `.btn` + `.btn-primary` / `.btn-secondary` / `.btn-danger` /
  `.btn-success` / `.btn-ghost` / `.btn-icon`
- Surfaces: `.card`, `.card-hover`, `.card-glass`, `.stat-card`
- Badges: `.badge` + `.badge-critical` / `.badge-high` / `.badge-medium` /
  `.badge-low`
- Status: `.status-open` / `.status-in_progress` / `.status-resolved` /
  `.status-closed`
- Dots: `.priority-dot` + `.priority-dot-critical` / `-high` / `-medium` / `-low`
- Inputs: `.input`, `.input-error`, `.label`, `.search-input`
- Tables: `.table-container` / `.table-header` / `.table-row`
- Modals: `.modal-overlay` / `-content` / `-header` / `-body` / `-footer`
- Misc: `.empty-state*`, `.avatar*`, `.dropdown-*`, `.spinner`, `.tooltip`

Semantic color ramps (used when no component class fits): `primary` (signal
green), `success` (signal green), `warning` (amber), `danger` (tally red),
`accent` (info blue), `dark` (inverted neutral). All are `theme.extend.colors`
aliases in `tailwind.config.js`.

## Mapping Convention (core artifact)

| Leftover pattern | Replace with |
|---|---|
| `bg-white`, surface `bg-gray-50` used as a card | `.card` / `bg-dark-100` / `bg-dark-200` |
| `text-black` | `text-dark-900` |
| `bg-red-100 text-red-700` (soft critical badge) | `.badge-critical` or `bg-danger-100 text-danger-600` |
| `bg-yellow-100 text-yellow-700` | `.badge-high` or `bg-warning-100 text-warning-600` |
| `bg-green-100 text-green-700` | `.badge-low` or `bg-success-100 text-success-500` |
| `bg-red-500` / `bg-green-500` / `bg-yellow-500` status dot | `.priority-dot-*` or `bg-danger-500` / `bg-success-500` / `bg-warning-500` |
| `bg-blue-*`, `text-blue-*` (info / links) | `bg-accent-*` / `text-accent-500` |
| `bg-indigo-600` action button (ScanAsset) | `.btn-primary` |
| `bg-red-600 text-white` / `bg-green-600 text-white` action | `.btn-danger` / `.btn-success` |
| `bg-blue-50 hover:bg-blue-100` info panel | `bg-accent-100` (dark) + `border border-accent-300/50` |

**Rule of thumb:** component class first; semantic ramp second; never a raw
Tailwind hue. Judge each `text-white` / hex value in place rather than blindly
swapping.

Also update `vite.config.js` manifest: `theme_color` → `#0A0D12` (ground),
`background_color` → `#0A0D12`.

## Sweep Order (worst / most-broken first)

One commit per page (or tight group). Order:

1. `pages/ScanAsset.jsx` — indigo, never redesigned
2. `pages/Equipment.jsx` — highest hit count
3. `pages/Todos.jsx`
4. `pages/Dashboard.jsx`
5. `pages/ActivityLog.jsx`
6. `pages/RMADetail.jsx`
7. `pages/Users.jsx`
8. `pages/IssueDetail.jsx`
9. `pages/Manuals.jsx`
10. `pages/NewIssue.jsx`
11. `pages/Issues.jsx`
12. `pages/Search.jsx`
13. `pages/Register.jsx`
14. `pages/Login.jsx`
15. `components/BarcodeScanner.jsx`
16. `components/InstallPrompt.jsx`
17. `pages/Settings.jsx`
18. `vite.config.js` (manifest colors)

(Files with only correct/intentional matches after inspection produce no commit.)

## Verification

- **Per page:** `npm run build` (in `frontend/`) must pass — catches broken
  class references and JSX errors.
- **Visual:** run the frontend dev server (`npm run dev`, port 3000) and
  actually inspect each swept page in a browser. The backend (Postgres + API on
  5105) is not required for a color audit — the chrome and theme render without
  live data; pages show loading/empty states, which is sufficient to verify
  color correctness. Confirm: no pale/white boxes on the dark ground, badges and
  dots use control-room hues, buttons match `.btn-*` styling.
- A page is "done" only after build passes AND its rendering is visually
  confirmed.

## Integration

Merge `control-room-consistency` → `main` once the full sweep is complete and
the build is green. `main` auto-deploys via the GitHub webhook running
`deploy.sh`.
