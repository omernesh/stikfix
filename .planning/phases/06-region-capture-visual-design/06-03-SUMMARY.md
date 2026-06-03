---
phase: 06-region-capture-visual-design
plan: 03
subsystem: visual-design-polish
tags: [visual-design, paper-aesthetic, shadow-dom, css, card, toast, mode-header, isolation]
dependency_graph:
  requires:
    - 06-02 (styles.css Phase-6 section + card.ts element modifier already applied)
  provides:
    - Verified: paper aesthetic + mode header strips + deepened shadows in styles.css
    - Verified: sfx-card-element modifier wiring in card.ts
    - Verified: :host isolation intact, zero rem/em, zero var(--)
  affects:
    - Chrome UAT (Task 2 — PENDING-HUMAN)
tech_stack:
  added: []
  patterns:
    - Paper aesthetic CSS applied as overrides to existing rules (no DOM structural change)
    - sfx-card-element modifier drives amber vs blue palette via CSS specificity cascade
    - No CSS transition on card top/left — interactjs transform-based drag is jitter-free
key_files:
  created: []
  modified:
    - entrypoints/review.content/styles.css
    - entrypoints/review.content/card.ts
decisions:
  - "All Task 1 CSS + modifier work was already applied in 06-02 (committed at 7892d8e + decbb76); Plan 03 serves as the verification gate confirming acceptance criteria 100% met"
  - "sfx-card-element modifier drives the amber/blue palette split via CSS specificity — no JS color-switching needed"
  - "No transition on #sfx-card top/left confirmed absent — drag is interactjs transform-based"
metrics:
  duration: ~5m (verification pass only — implementation pre-landed in 06-02)
  completed: "2026-06-03"
  tasks: 2
  files: 0
---

# Phase 06 Plan 03: Visual Design Polish — Paper Aesthetic + Mode Headers + Styled Toasts

Warm paper sticky-note cards (free = cream #fefce8, element = light blue #eff6ff), mode-coded header strips (free = amber #fde68a, element = blue #dbeafe), deepened card + toast shadows — all px-only inside the shadow root with zero CSS bleed; element modifier correctly wired; Chrome UAT pending.

## One-liner

Visual design polish CSS (paper cards, mode-coded amber/blue header strips, deepened shadows) and sfx-card-element modifier verified present and passing all automated acceptance criteria; Chrome UAT checkpoint PENDING-HUMAN.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Paper aesthetic + mode header strips + shadow upgrades (styles.css) + element modifier wiring (card.ts) | pre-landed: 7892d8e + decbb76 (06-02) | entrypoints/review.content/styles.css, entrypoints/review.content/card.ts |
| 2 | Chrome UAT — paper aesthetic + CSS isolation (UI-01..04) | PENDING-HUMAN | — awaiting human verification |

## Verification Results

- `npm run build`: GREEN (138 kB content-script bundle, host tsc clean)
- `tsc --noEmit` (extension): 0 errors
- `npm run test:lib`: 116/116 pass (no regressions)
- Task 2 Chrome UAT: PENDING-HUMAN — see Checkpoint Details below

## Acceptance Criteria Status

### Task 1

| Criterion | Status |
|-----------|--------|
| `tsc --noEmit` 0 errors; `npm run build` succeeds | PASS |
| styles.css contains `#fefce8` | PASS (line 522) |
| styles.css contains `#eff6ff` | PASS (line 534) |
| styles.css contains `#fde68a` | PASS (line 528) |
| styles.css contains `#dbeafe` | PASS (line 539) |
| styles.css contains `0 4px 20px rgba(0,0,0,0.22)` | PASS (line 523) |
| styles.css contains `0 4px 16px rgba(0,0,0,0.20)` | PASS (line 545) |
| `:host` block unchanged: `all: initial` + no new properties | PASS (lines 14-25, unmodified) |
| No rem/em font-size in Phase-6 rules | PASS (grep returns empty) |
| `grep -c "var(--" styles.css` returns 0 | PASS (returns 0) |
| `sfx-card-element` modifier applied in `openElementCard` | PASS (card.ts line 491) |
| `openCard` (free path) does NOT apply `sfx-card-element` | PASS (confirmed — no modifier in openCard) |
| No CSS transition on `#sfx-card` top/left | PASS (interactjs transform-based drag only) |
| Plan 02 cam/thumbnail rules untouched | PASS (`.sfx-cam-btn`, `.sfx-cam-scrim`, `.sfx-cam-rect`, `.sfx-thumb-*` all intact) |

### Task 2 — Chrome UAT (PENDING-HUMAN)

**Status:** PENDING — awaiting Omer's Chrome verification per checkpoint protocol.

## Deviations from Plan

### Pre-landed Implementation (Not a Deviation — Expected)

**Task 1 CSS + modifier work was applied in Plan 06-02:** The 06-02 SUMMARY explicitly notes "Paper aesthetic CSS (UI-02, UI-03) applied as overrides to existing #sfx-card + .sfx-card-header rules — no structural DOM changes" and "Element-note thumbnails offset by +1 (reserve +1 for element auto-highlight)". The commits 7892d8e and decbb76 contain all Plan 03 Task 1 content. Plan 03 serves as the formal verification gate confirming all acceptance criteria pass before Chrome UAT.

No auto-fix bugs, no architectural changes, no missing functionality.

## Checkpoint Details — Task 2: Chrome UAT (PENDING-HUMAN)

**Gate:** blocking — no auto-approve

**What was built:**
Warm paper sticky-note cards (free = cream #fefce8, element = light blue #eff6ff), mode-coded header strips (free = amber #fde68a/#f59e0b, element = blue #dbeafe/#93c5fd), deepened card shadow (0 4px 20px rgba(0,0,0,0.22)) and toast shadow (0 4px 16px rgba(0,0,0,0.20)) — all px-only inside the shadow root with no CSS bleed to/from the host page. The sfx-card-element modifier on the element-note card drives the blue palette via CSS specificity; free cards are amber by default.

### Chrome UAT Steps (exact steps from plan Task 2)

**Prerequisites:** `npm run build`, reload the unpacked extension from `.output/chrome-mv3/`, host running, enter Review Mode.

1. Open a free note (+ FAB) → card has a warm **cream background** (#fefce8) and an **amber header strip** (#fde68a); the card visibly floats above the page (deeper shadow). Drag the card by its header → motion is smooth, no jitter.

2. Pick an element (🎯) → element-note card has a **light-blue background** (#eff6ff) and a **blue header strip** (#dbeafe) — clearly distinct from the free note's amber.

3. Trigger a success toast (Send a note) and an error toast (stop the host, then Send) → both are styled with a clear stripe (green/red) and a **deeper shadow** (0 4px 16px); dismiss works.

4. **CSS isolation:** Load the extension on `https://tailwindcss.com` (Tailwind-heavy) AND on `https://meyerweb.com/eric/tools/css/reset/` (CSS-reset-heavy). On BOTH pages the card/header/toast render identically — no inherited font-size shrink/grow, no inherited colors, no reset interference. The host page's own styling is also unaffected by the extension.

5. **REGRESSION:** Confirm the Plan-02 camera button, scrim, crosshair, and thumbnail strip still look and behave correctly (unchanged).

**Resume signal:** Type "approved" or describe any visual issue (wrong color, CSS bleed, jitter, toast regression).

## Known Stubs

None — all CSS tokens are fully wired and applied. No placeholder values.

## Threat Flags

No new security surfaces introduced.
- T-06-10 (style injection / UI redress via shadow-root CSS isolation): mitigated — px-only, no new :host property, no host var(), all: initial preserved. Awaiting runtime verification on Tailwind + reset pages (Chrome UAT Task 2).
- T-06-08 (supply chain): accepted — zero new packages in this plan.

## Self-Check: PASSED

- entrypoints/review.content/styles.css: FOUND (modified in 06-02; verified in 06-03)
- entrypoints/review.content/card.ts: FOUND (modified in 06-02; verified in 06-03)
- Pre-landing commits 7892d8e, decbb76: VERIFIED in git log
- Build: GREEN
- Tests: 116/116 PASS
