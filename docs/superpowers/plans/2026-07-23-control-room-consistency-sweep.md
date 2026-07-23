# Control-Room Consistency Sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the control-room dark theme uniform across the whole app by replacing every leftover raw-Tailwind-hue utility with the existing design-system tokens/component classes, page by page.

**Architecture:** The theme already works via a lightness-inverted `dark` ramp with `gray`/`slate` aliased to it, plus semantic ramps (`primary`/`success`/`warning`/`danger`/`accent`) and a full component vocabulary in `frontend/src/index.css`. This sweep is a mechanical-but-judged substitution: literal hues (`blue`/`green`/`red`/`yellow`/`indigo`/`orange`/`purple`/…) → semantic tokens or component classes. No new CSS, no new concepts.

**Tech Stack:** React + Vite + Tailwind CSS. No test framework (verification is `npm run build` + visual inspection in the dev server).

## Global Constraints

- **Never touch `gray`/`slate` utilities** — they are already correctly inverted by the config alias. Changing them is churn and out of scope.
- **Leave intentional values alone:** gradient hex in `mesh-gradient`, and `text-white` sitting on a solid colored button (that's correct contrast). Judge each in place.
- **Prefer a component class over utilities**: use `.btn-*`, `.badge-*`, `.status-*`, `.priority-dot-*`, `.card`, `.input` before re-deriving with the semantic ramp.
- **One commit per file.** Files that turn out clean produce **no** commit.
- Commit message trailer for every commit:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- All work on branch `control-room-consistency`; merge to `main` only when the full sweep builds green and every changed page is visually confirmed.
- Build command (run from `frontend/`): `npm run build` — must exit 0.
- Dev server for visual checks (from `frontend/`): `npm run dev` (port 3000). Leave it running across all tasks; the backend is not required for a color audit (pages render chrome + loading/empty states without live data).

## Mapping Reference (applies to every task)

| Leftover | Replace with | Notes |
|---|---|---|
| `bg-white`, card-surface `bg-*-50` | `bg-dark-100` / `bg-dark-200` / `.card` | |
| `text-black` | `text-dark-900` | |
| `bg-red-100 text-red-700` (critical/error pill) | `bg-danger-100 text-danger-600` or `.badge-critical` | ramp is dark-fill + light-hue on dark |
| `bg-orange-100 text-orange-700` (high pill) | `bg-warning-100 text-warning-600` or `.badge-high` | **orange → warning** |
| `bg-yellow-100 text-yellow-700` (medium/warn pill) | `bg-warning-100 text-warning-600` | |
| `bg-green-100 text-green-700` (low/ok pill) | `bg-success-100 text-success-500` or `.badge-low` | |
| `bg-blue-100 text-blue-700` (info pill) | `bg-accent-100 text-accent-600` | **blue → accent** |
| `bg-red-500`/`bg-green-500`/`bg-yellow-500` status dot | `bg-danger-500`/`bg-success-500`/`bg-warning-500` or `.priority-dot-*` | |
| `text-red-*` error text | `text-danger-500` | |
| `text-blue-*` link/info | `text-accent-500` | |
| `text-green-*` success text | `text-success-500` | |
| `text-yellow-*` warning text | `text-warning-500` | |
| `text-orange-*` | `text-warning-500` | orange → warning |
| `text-purple-*`, `bg-purple-*` (AI / suggestion) | `text-accent-500` / `bg-accent-100` | **purple → accent** (the "AI/info" color) |
| `bg-indigo-600 … text-white` action button | `.btn-primary` | indigo not in palette |
| `border-indigo-600 text-indigo-700` outline button | `.btn-secondary` | |
| `bg-red-600 text-white` action | `.btn-danger` (or its classes) | |
| `bg-green-600 text-white` action | `.btn-success` | |
| light info panel `bg-blue-50 border-blue-200 text-blue-900` | `bg-accent-500/10 border border-accent-500/30 text-accent-500` | subtle dark wash |
| light warn panel `bg-yellow-50 border-yellow-200 …` | `bg-warning-500/10 border border-warning-500/30 …` | |
| light ok panel `bg-green-50 border-green-200 …` | `bg-success-500/10 border border-success-500/30 …` | |

**Faded/unfilled marks** (e.g. `text-gray-300` empty star): `gray` is already inverted → leave as-is, or use `text-dark-500` for a muted mark. Do not "fix" gray.

---

### Task 0: Create the working branch

**Files:** none (git only)

- [ ] **Step 1: Create and switch to the branch**

```bash
git checkout main
git checkout -b control-room-consistency
```

- [ ] **Step 2: Verify baseline build passes**

```bash
cd frontend && npm run build
```
Expected: exits 0 (baseline green before any edits).

- [ ] **Step 3: Start the dev server (leave running)**

```bash
cd frontend && npm run dev
```
Expected: Vite serves on http://localhost:3000. Keep this process alive for visual checks in later tasks.

---

### Task 1: ScanAsset.jsx (indigo + purple, never redesigned)

**Files:**
- Modify: `frontend/src/pages/ScanAsset.jsx`

**Matched lines and targets** (apply the mapping):
- L121 `text-purple-600` (AI chip) → `text-accent-500`
- L147, L177 `bg-indigo-600 … text-white` full-width buttons → replace the color utilities with `.btn-primary` (keep `w-full flex … gap-2`)
- L169 `bg-amber-50 … text-amber-900` info note → `bg-warning-500/10 text-warning-500`
- L173 `border-2 border-indigo-600 … text-indigo-700` outline button → `.btn-secondary` (drop the indigo border/text)
- L185 `bg-green-50 … text-green-900` success note → `bg-success-500/10 text-success-500`
- L233 `border border-purple-200 bg-purple-50` AI panel → `border border-accent-500/30 bg-accent-500/10`
- L234 `text-purple-900`, L237 `text-purple-800`, L239 `text-purple-700`, L249 `text-purple-900` → `text-accent-500` (vary opacity if hierarchy needed: `text-accent-500`, `text-dark-700`)
- L242 `bg-amber-100 … text-amber-900` → `bg-warning-100 text-warning-600`
- L248 `bg-purple-100`, L286 `bg-indigo-50 … text-indigo-900` → `bg-accent-100 text-accent-600`
- L273 `bg-indigo-50` (selected row) → `bg-accent-500/10`
- L280 `text-indigo-600` check icon → `text-accent-500`
- L293, L313 `bg-indigo-600 … text-white` submit buttons → `.btn-primary`

- [ ] **Step 1: Apply all replacements above in `ScanAsset.jsx`.**
- [ ] **Step 2: Build.** Run: `cd frontend && npm run build` — Expected: exits 0.
- [ ] **Step 3: Visual check.** Open http://localhost:3000/scan (or the scan route). Confirm: no indigo/purple; buttons are signal-green `.btn-primary`; AI panel is a dark info-blue wash; notes read as amber/green dark washes. No pale boxes.
- [ ] **Step 4: Commit.**

```bash
git add frontend/src/pages/ScanAsset.jsx
git commit -m "Sweep ScanAsset onto control-room tokens (indigo/purple → primary/accent)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Equipment.jsx (highest volume)

**Files:**
- Modify: `frontend/src/pages/Equipment.jsx`

**Match clusters and targets:**
- L597–598 `from-purple-50 to-purple-100` + `text-purple-300` placeholder image tile → `from-dark-200 to-dark-300` + `text-dark-500`
- L647 `text-yellow-600` (has-issues), L652 `text-green-600` (no issues), L655 `text-blue-600` → `text-warning-500` / `text-success-500` / `text-accent-500`
- L688 `hover:bg-red-100`, L690 `text-red-500` (delete) → `hover:bg-danger-500/10` / `text-danger-500`
- L835–836 `bg-purple-100` + `text-purple-400` monitor tile → `bg-dark-200` + `text-dark-500`
- L843 `bg-red-600 text-white hover:bg-red-700` (remove badge) → `.btn-danger` classes (or `bg-danger-500 text-dark-50 hover:bg-danger-400`)
- L861 `bg-green-600 text-white hover:bg-green-700` (confirm badge) → `bg-success-500 text-dark-50 hover:bg-success-400`
- L1021–1023 status dots red/yellow/green + `bg-gray-400` → `bg-danger-500`/`bg-warning-500`/`bg-success-500`/`bg-dark-400` (gray-400 already inverted; fine, or `bg-dark-500`)
- L1029–1031 priority pills red/orange/yellow `-100/-700` → `bg-danger-100 text-danger-600` / `bg-warning-100 text-warning-600` / `bg-warning-100 text-warning-600` (orange & yellow both → warning; if both appear, keep distinct: orange=warning, yellow=`bg-warning-100 text-warning-500`)
- L1088 `bg-blue-50 hover:bg-blue-100` manual row → `bg-accent-500/10 hover:bg-accent-500/20`; L1095 `text-blue-600` → `text-accent-500`
- L1105 `hover:text-blue-600`, L1112 `hover:text-red-600` → `hover:text-accent-500` / `hover:text-danger-500`
- L1123–1148 yellow "no manuals" panel (`bg-yellow-50 border-yellow-200`, `text-yellow-800/700/600`, `bg-yellow-100 hover:bg-yellow-200 text-yellow-800`) → warning tokens: panel `bg-warning-500/10 border-warning-500/30`, text `text-warning-500`, buttons `bg-warning-100 hover:bg-warning-200 text-warning-600`
- L1207–1213 green "manufacturer website" panel → success wash (`bg-success-500/10 border-success-500/30`, `text-success-500`)
- L1222–1228 blue "documentation" panel → accent wash
- L1288 `text-yellow-500`, L1294 `text-red-500` → `text-warning-500` / `text-danger-500`
- L1336 `text-purple-500`, L1341 `bg-purple-50 border-purple-200 hover:bg-purple-100`, L1350 `text-purple-600` (AI suggest) → accent tokens
- L1464 `text-red-600 hover:bg-red-50` on a `.btn-secondary` → `text-danger-500 hover:bg-danger-500/10`
- L1557–1563 blue import info panel → accent wash
- L1573–1596 mapping-status pills green/yellow/blue `-50/-700 border-200` → success/warning/accent washes
- L1624–1628 legend chips `bg-green-200 border-green-300` / `bg-blue-200 border-blue-300` → `bg-success-500/30 border-success-500/50` / `bg-accent-500/30 border-accent-500/50`
- L1683–1709 import-results: `bg-green-100`/`bg-yellow-100` icon circles, `text-green-600`/`text-yellow-600`, count `text-green-600`/`text-yellow-600`, chips `bg-green-100 text-green-700` → success/warning tokens

- [ ] **Step 1: Apply all replacements above.**
- [ ] **Step 2: Build.** `cd frontend && npm run build` — Expected: exits 0.
- [ ] **Step 3: Visual check.** Open `/equipment`, then open a unit's detail/manuals section and the CSV-import modal. Confirm all pills, panels, dots, and the import wizard use control-room hues; no pale/white blocks; delete actions are tally-red.
- [ ] **Step 4: Commit.**

```bash
git add frontend/src/pages/Equipment.jsx
git commit -m "Sweep Equipment onto control-room tokens

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Todos.jsx

**Files:**
- Modify: `frontend/src/pages/Todos.jsx`

**Matched lines and targets:**
- L98 `bg-green-500`/`bg-green-400` swipe-complete → `bg-success-500`/`bg-success-400`
- L108 `bg-red-500`/`bg-red-400` swipe-delete → `bg-danger-500`/`bg-danger-400`
- L182–184 priority dot map: high `bg-red-500`→`bg-danger-500`, medium `bg-yellow-500`→`bg-warning-500`, low `bg-green-500`→`bg-success-500`
- L242, L409 completed checkbox `bg-green-500 border-green-500 text-white` → `bg-success-500 border-success-500 text-dark-50`
- L263 `badge bg-red-100 text-red-700` → `badge bg-danger-100 text-danger-600`
- L269 `badge bg-orange-100 text-orange-700` → `badge bg-warning-100 text-warning-600`
- L336, L1031 `text-red-500` overdue → `text-danger-500`
- L377, L1178 `bg-red-500 text-white` remove buttons → `bg-danger-500 text-dark-50`
- L424, L534 `text-red-500` (delete icons) and L531 `hover:bg-red-50` → `text-danger-500` / `hover:bg-danger-500/10`
- L1034 `text-orange-500` (due today) and L1302 `text-orange-600` (Today heading) → `text-warning-500` / `text-warning-600`
- L1083–1089 filter-active `bg-green-100 text-green-700` and count `bg-green-200 text-green-800` → `bg-success-100 text-success-500` / `bg-success-500/30 text-success-500`
- L1116 listening `bg-red-100 text-red-600` → `bg-danger-100 text-danger-600`
- L1224 `text-green-300` empty-state icon → `text-success-500/60` (or `text-dark-400`)
- L1300–1303 group heading colors: Overdue/High `text-red-600`→`text-danger-500`, Today `text-orange-600`→`text-warning-500`, Completed `text-green-600`→`text-success-500`

- [ ] **Step 1: Apply all replacements above.**
- [ ] **Step 2: Build.** `cd frontend && npm run build` — Expected: exits 0.
- [ ] **Step 3: Visual check.** Open `/todos`. Confirm priority dots, badges, completed checkboxes, swipe actions, group headings, and the voice-listening state all use control-room hues.
- [ ] **Step 4: Commit.**

```bash
git add frontend/src/pages/Todos.jsx
git commit -m "Sweep Todos onto control-room tokens (orange → warning)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Dashboard.jsx (JUDGMENT — category gradients + carrier colors)

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`

**Policy for this page (decided, not open):**
- **Category / stat icon gradients** (L94–532: `from-orange-400 to-orange-600`, red, purple, blue, indigo, cyan …): collapse to the restrained palette. Use a **semantic** token where the tile has status meaning — issues/critical → `from-danger-400 to-danger-600`, resolved/ok → `from-success-400 to-success-600`, warnings/pending → `from-warning-400 to-warning-600`, info/counts → `from-accent-400 to-accent-600`. For any remaining brand-only/neutral tile, use `from-primary-400 to-primary-600` (matches `.avatar` / `.feature-card-icon`). Do **not** keep orange/purple/indigo/cyan.
- **Carrier badges** (L406–409: usps/ups/fedex/dhl per-brand colors): drop per-brand color; render as a neutral instrument pill — `bg-dark-200 text-dark-700 border border-dark-400 font-mono`. This reads as a control-room readout and avoids six off-palette hues.

- [ ] **Step 1: Apply the gradient collapse and carrier-pill changes per the policy above.**
- [ ] **Step 2: Build.** `cd frontend && npm run build` — Expected: exits 0.
- [ ] **Step 3: Visual check.** Open `/` (Dashboard). Confirm every icon gradient is green/red/amber/blue only (no orange/purple/indigo/cyan), carrier badges are neutral mono pills, and the page reads as one restrained control-room surface. This is the highest-judgment page — look carefully.
- [ ] **Step 4: Commit.**

```bash
git add frontend/src/pages/Dashboard.jsx
git commit -m "Sweep Dashboard onto restrained control-room palette

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: ActivityLog.jsx

**Files:**
- Modify: `frontend/src/pages/ActivityLog.jsx`

**Matched lines and targets** — action color map + icon chips:
- L37 login `bg-green-100 text-green-700` → `bg-success-100 text-success-500`
- L38 create `bg-blue-100 text-blue-700` → `bg-accent-100 text-accent-600`
- L39 update `bg-yellow-100 text-yellow-700` → `bg-warning-100 text-warning-600`
- L40 delete `bg-red-100 text-red-700` → `bg-danger-100 text-danger-600`
- L149–150 `bg-green-100` + `text-green-600` → `bg-success-100` + `text-success-500`
- L162–163 `bg-blue-100` + `text-blue-600` → `bg-accent-100` + `text-accent-600`
- L175–176 `bg-yellow-100` + `text-yellow-600` → `bg-warning-100` + `text-warning-600`
- L188–189 `bg-red-100` + `text-red-600` → `bg-danger-100` + `text-danger-600`

- [ ] **Step 1: Apply all replacements above.**
- [ ] **Step 2: Build.** `cd frontend && npm run build` — Expected: exits 0.
- [ ] **Step 3: Visual check.** Open `/activity` (or the activity-log route). Confirm the four action types read as green/blue/amber/red dark pills, icon chips match.
- [ ] **Step 4: Commit.**

```bash
git add frontend/src/pages/ActivityLog.jsx
git commit -m "Sweep ActivityLog action colors onto control-room tokens

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Users.jsx

**Files:**
- Modify: `frontend/src/pages/Users.jsx`

**Matched lines and targets:**
- L20 admin `color: 'text-red-600'` → `text-danger-500`
- L21 technician `color: 'text-blue-600'` → `text-accent-500`
- L213 active/inactive `bg-green-100 text-green-800` / `bg-red-100 text-red-800` → `bg-success-100 text-success-500` / `bg-danger-100 text-danger-600`
- L243 `hover:bg-red-50`, L246 `text-red-500` (delete) → `hover:bg-danger-500/10` / `text-danger-500`

- [ ] **Step 1: Apply all replacements above.**
- [ ] **Step 2: Build.** `cd frontend && npm run build` — Expected: exits 0.
- [ ] **Step 3: Visual check.** Open `/users`. Confirm role colors, active/inactive badges, and delete action use control-room hues.
- [ ] **Step 4: Commit.**

```bash
git add frontend/src/pages/Users.jsx
git commit -m "Sweep Users role/status colors onto control-room tokens

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: IssueDetail.jsx

**Files:**
- Modify: `frontend/src/pages/IssueDetail.jsx`

**Matched lines and targets:**
- L501 `bg-red-600 text-white hover:bg-red-700` (delete) → `.btn-danger` classes or `bg-danger-500 text-dark-50 hover:bg-danger-400`
- L584 accepted solution `bg-green-50 border-l-4 border-green-500` → `bg-success-500/10 border-l-4 border-success-500`
- L590 `text-green-600` accepted label → `text-success-500`
- L611–612 star rating: `hover:text-yellow-500` and `text-yellow-500` filled → `text-warning-500`; `text-gray-300` empty → leave (gray inverted) or `text-dark-500`

- [ ] **Step 1: Apply all replacements above.**
- [ ] **Step 2: Build.** `cd frontend && npm run build` — Expected: exits 0.
- [ ] **Step 3: Visual check.** Open an issue detail page. Confirm the accepted-solution highlight is a green dark wash, star rating is amber, delete is tally-red.
- [ ] **Step 4: Commit.**

```bash
git add frontend/src/pages/IssueDetail.jsx
git commit -m "Sweep IssueDetail onto control-room tokens

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Manuals.jsx

**Files:**
- Modify: `frontend/src/pages/Manuals.jsx`

**Matched lines and targets:**
- L158–159 `bg-red-100` + `text-red-600` PDF icon chip → `bg-danger-100` + `text-danger-600`
- L200 `hover:bg-red-50`, L203 `text-red-500` (delete) → `hover:bg-danger-500/10` / `text-danger-500`

- [ ] **Step 1: Apply all replacements above.**
- [ ] **Step 2: Build.** `cd frontend && npm run build` — Expected: exits 0.
- [ ] **Step 3: Visual check.** Open `/manuals`. Confirm PDF chip and delete action are tally-red on dark.
- [ ] **Step 4: Commit.**

```bash
git add frontend/src/pages/Manuals.jsx
git commit -m "Sweep Manuals onto control-room tokens

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: NewIssue.jsx

**Files:**
- Modify: `frontend/src/pages/NewIssue.jsx`

**Matched lines and targets:**
- L256, L275 `text-red-600` field errors → `text-danger-500`
- L505 `btn bg-green-600 hover:bg-green-700 text-white` submit → `.btn-success` (drop the raw green utilities)
- L517 `text-green-500`, L534 `text-green-600` (AI-suggestion accents) → `text-success-500`

- [ ] **Step 1: Apply all replacements above.**
- [ ] **Step 2: Build.** `cd frontend && npm run build` — Expected: exits 0.
- [ ] **Step 3: Visual check.** Open `/issues/new`. Trigger a validation error; confirm error text is tally-red, submit button is `.btn-success`.
- [ ] **Step 4: Commit.**

```bash
git add frontend/src/pages/NewIssue.jsx
git commit -m "Sweep NewIssue onto control-room tokens

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Issues.jsx

**Files:**
- Modify: `frontend/src/pages/Issues.jsx`

**Matched lines and targets** — status icons:
- L69 open `text-blue-500` → `text-accent-500`
- L70 in_progress `text-yellow-500` → `text-warning-500`
- L71 resolved `text-green-500` → `text-success-500`
- L204 `text-green-600` "Solved" → `text-success-500`

- [ ] **Step 1: Apply all replacements above.**
- [ ] **Step 2: Build.** `cd frontend && npm run build` — Expected: exits 0.
- [ ] **Step 3: Visual check.** Open `/issues`. Confirm status icons and the "Solved" marker use control-room hues.
- [ ] **Step 4: Commit.**

```bash
git add frontend/src/pages/Issues.jsx
git commit -m "Sweep Issues status colors onto control-room tokens

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Search.jsx

**Files:**
- Modify: `frontend/src/pages/Search.jsx`

**Matched lines and targets:**
- L286 AI banner `bg-gradient-to-r from-primary-50 to-purple-50 … border-primary-200` → `bg-gradient-to-r from-primary-500/10 to-accent-500/10 … border border-primary-500/30` (drop purple; `primary-50` is already dark green so it's acceptable, but unify to the `/10` wash)
- L309 error `bg-red-50 text-red-700` → `bg-danger-500/10 text-danger-500`

- [ ] **Step 1: Apply both replacements above.**
- [ ] **Step 2: Build.** `cd frontend && npm run build` — Expected: exits 0.
- [ ] **Step 3: Visual check.** Open `/search`, run an AI search and force an error. Confirm the AI banner is a green→blue dark wash and the error is a red dark wash.
- [ ] **Step 4: Commit.**

```bash
git add frontend/src/pages/Search.jsx
git commit -m "Sweep Search AI banner + error onto control-room tokens

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Register.jsx (trivial)

**Files:**
- Modify: `frontend/src/pages/Register.jsx`

**Matched lines and targets:**
- L71, L85, L108, L122 `text-red-600` field errors → `text-danger-500`

- [ ] **Step 1: Replace all four `text-red-600` with `text-danger-500`.**
- [ ] **Step 2: Build.** `cd frontend && npm run build` — Expected: exits 0.
- [ ] **Step 3: Visual check.** Open `/register`, trigger validation. Confirm error text is tally-red.
- [ ] **Step 4: Commit.**

```bash
git add frontend/src/pages/Register.jsx
git commit -m "Sweep Register error text onto control-room tokens

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: BarcodeScanner.jsx (trivial)

**Files:**
- Modify: `frontend/src/components/BarcodeScanner.jsx`

**Matched line and target:**
- L114 scan laser `bg-red-500/70` → `bg-danger-500/70` (token consistency; visually identical tally red)

- [ ] **Step 1: Replace `bg-red-500/70` with `bg-danger-500/70`.**
- [ ] **Step 2: Build.** `cd frontend && npm run build` — Expected: exits 0.
- [ ] **Step 3: Visual check.** Open the scan flow; confirm the scan line still shows as a red laser.
- [ ] **Step 4: Commit.**

```bash
git add frontend/src/components/BarcodeScanner.jsx
git commit -m "Use danger token for BarcodeScanner scan line

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: vite.config.js PWA manifest colors

**Files:**
- Modify: `frontend/vite.config.js:15-16`

**Change:**
- `theme_color: '#0284c7'` → `theme_color: '#0A0D12'`
- `background_color: '#ffffff'` → `background_color: '#0A0D12'`

- [ ] **Step 1: Apply both changes.**
- [ ] **Step 2: Build.** `cd frontend && npm run build` — Expected: exits 0 (PWA manifest regenerates with the new colors).
- [ ] **Step 3: Verify manifest.** Confirm `frontend/dist/manifest.webmanifest` (or the generated manifest) shows `theme_color`/`background_color` as `#0A0D12`.
- [ ] **Step 4: Commit.**

```bash
git add frontend/vite.config.js
git commit -m "Set PWA manifest colors to control-room ground

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Verify-clean pages (no commit expected)

**Files (inspect only):**
- `frontend/src/pages/RMADetail.jsx`
- `frontend/src/pages/RMAs.jsx`
- `frontend/src/pages/Login.jsx`
- `frontend/src/pages/Settings.jsx`
- `frontend/src/components/InstallPrompt.jsx`

These showed no raw-hue matches (their earlier broad-grep hits were `text-white` on colored buttons and intentional gradient hex). Confirm they render correctly and need no change.

- [ ] **Step 1: Re-grep to confirm no raw hues remain.**

```bash
cd frontend && grep -rnE '(bg|text|border|ring|from|to|via|hover:bg|hover:text)-(blue|green|red|yellow|indigo|orange|purple|amber|emerald|teal|cyan|sky|violet|rose|lime|pink)-[0-9]{2,3}|bg-white|text-black' src/pages/RMADetail.jsx src/pages/RMAs.jsx src/pages/Login.jsx src/pages/Settings.jsx src/components/InstallPrompt.jsx
```
Expected: no output (or only intentional matches you then fold into a commit per the mapping).

- [ ] **Step 2: Visual check.** Open `/rmas`, an RMA detail, `/login`, `/settings`. Confirm each renders as correct control-room dark with no pale boxes or off-palette hues.
- [ ] **Step 3:** If any real leftover is found, apply the mapping and commit that file individually (message: `Sweep <File> onto control-room tokens`). Otherwise, no commit.

---

### Task 16: Final full-app sweep verification + merge

**Files:** none (verification + git)

- [ ] **Step 1: Confirm no raw hues remain app-wide.**

```bash
cd frontend && grep -rnE '(bg|text|border|ring|from|to|via|hover:bg|hover:text)-(blue|green|red|yellow|indigo|orange|purple|amber|emerald|teal|cyan|sky|violet|rose|lime|pink)-[0-9]{2,3}|bg-white|text-black' src/
```
Expected: only intentional survivors (documented gradient hex is separate; this pattern excludes hex). Any real leftover → fix + commit that file, then re-run.

- [ ] **Step 2: Final build.** `cd frontend && npm run build` — Expected: exits 0.

- [ ] **Step 3: Final visual pass.** Click through every changed page in the dev server one more time; confirm a uniform control-room surface.

- [ ] **Step 4: Merge to main.**

```bash
git checkout main
git merge --no-ff control-room-consistency -m "Merge control-room-consistency: uniform dark-theme token sweep

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Push (triggers auto-deploy).**

```bash
git push origin main
```
Expected: GitHub webhook runs `deploy.sh`; verify the deploy succeeds and https://kb.4tmrw.net renders the swept theme.
