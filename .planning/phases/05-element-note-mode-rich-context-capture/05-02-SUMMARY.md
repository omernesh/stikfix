---
phase: 05-element-note-mode-rich-context-capture
plan: 02
subsystem: extension-ui
status: checkpoint
tags: [pick-mode, hover-overlay, chip, element-note, ELEM-01]
dependency_graph:
  requires: [05-01]
  provides: [enterPickMode, exitPickMode, mountChip-with-picker]
  affects: [entrypoints/review.content/picker.ts, entrypoints/review.content/chip.ts, entrypoints/review.content/styles.css]
tech_stack:
  added: []
  patterns: [rAF-throttle, shadow-host-guard, textContent-only, INVARIANT-C, module-level-state, teardown-registry]
key_files:
  created:
    - entrypoints/review.content/picker.ts
  modified:
    - entrypoints/review.content/chip.ts
    - entrypoints/review.content/styles.css
decisions:
  - "picker.ts is a pure DOM/event module with no chrome.* calls — isolation boundary keeps card.ts clean and picker testable"
  - "exitPickMode() is idempotent (safe to call when not active) — simplifies teardown and toggle logic"
  - "Both mousemove guards (shadow-host + identity) evaluated synchronously before queuing rAF — prevents flickering and T-05-06 leakage"
  - "currentTarget assigned AFTER updateOverlay() inside rAF so the next mousemove for the same element is correctly short-circuited only after overlay reflects it"
  - "mountChip 3rd param is optional (onPickerClick?) so existing 2-arg call site in index.ts compiles unchanged; Plan 03 wires the real callback"
metrics:
  duration: 236s
  completed_date: "2026-06-02"
  tasks_completed: 2
  tasks_total: 3
  files_created: 1
  files_modified: 2
---

# Phase 05 Plan 02: Picker Button + Hover-Highlight Overlay Summary

**One-liner:** Pick-mode lifecycle via `enterPickMode`/`exitPickMode` in a new `picker.ts`, 🎯 toggle button on the chip with orange active state, and hover-highlight overlay (orange outline + `tag · WxH` label) — all pointer-events:none and textContent-only (ELEM-01).

## Status

CHECKPOINT REACHED — awaiting Chrome UAT (Task 3: `checkpoint:human-verify`).

Tasks 1 and 2 are complete and committed. Task 3 requires manual verification in Chrome.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | picker.ts — pick-mode lifecycle + hover overlay | eb8feaa | picker.ts (new), styles.css |
| 2 | chip.ts — 🎯 picker button + active-state toggle | df439b4 | chip.ts, styles.css |

## What Was Built

### Task 1: `entrypoints/review.content/picker.ts` (new, 228 lines)

- `enterPickMode(container, onElementClick, onEsc)` — appends `.sfx-hover-highlight` overlay + `.sfx-hover-label` span to container; adds `sfx-pick-mode` class to `:host`; registers `mousemove`, `click`, `keydown` on `document`
- `exitPickMode()` — runs all `_cleanupFns`, removes overlay from DOM, removes `sfx-pick-mode` class, resets state; idempotent
- mousemove handler: evaluates both guards synchronously (shadow-host guard + identity guard), then queues rAF with single `rafPending` flag; inside rAF: `updateOverlay(target)` first, `currentTarget = target` after
- `updateOverlay()`: positions overlay at `getBoundingClientRect()` (position:fixed), sets label `textContent` to `prefix · W×H`, flips label above/below at 24px-from-bottom threshold
- `buildLabelPrefix()`: returns `tag`, `tag#id`, or `tag.class` capped at ≤20 chars — all via textContent (T-05-05)
- No `chrome.*` calls, no `innerHTML` in implementation code

### Task 2: `entrypoints/review.content/chip.ts` (extended)

- Import `enterPickMode`, `exitPickMode` from `./picker.js`
- `mountChip` signature extended: `mountChip(container, unmountFn, onPickerClick?: (el: Element) => void)` — optional 3rd param, existing 2-arg call site unchanged
- 🎯 picker button: `.sfx-chip-btn.sfx-picker-btn`, `textContent='🎯'`, `aria-label` resting/active, `aria-pressed` false/true
- Toggle logic: `activatePicker()`/`deactivatePicker()` helpers; `onElementClick` resets button + calls `onPickerClick?.(el)` (default no-op until Plan 03); `onEsc` resets button + `pickerBtn.focus()` (UI-SPEC §Focus Management)
- `teardownMap` extended: calls `exitPickMode()` before removing chip from DOM

### CSS additions to `styles.css`

- `.sfx-picker-btn`: 28px round, #f0f0f0 bg, #cccccc border, 16px emoji font
- `.sfx-picker-btn:hover`: #e0e0e0 bg
- `.sfx-picker-btn.sfx-active`: #fff3e0 bg, #ff6b00 border, 0 0 0 2px rgba(255,107,0,0.25) glow
- `:host(.sfx-pick-mode)`: `cursor: crosshair`
- `.sfx-hover-highlight`: `position:fixed`, `pointer-events:none`, `z-index:1`, `border: 2px solid rgba(255,140,0,0.85)`, `background: rgba(255,140,0,0.08)`, `border-radius:2px`
- `.sfx-hover-label`: `position:absolute`, dark pill bg `rgba(0,0,0,0.75)`, `#ffffff` text, 13px, `max-width:240px`, `text-overflow:ellipsis`, `pointer-events:none`

## Verification

- `npx tsc --noEmit` exits 0 after both tasks
- `grep chrome\. picker.ts` — all occurrences in comments only (0 actual API calls)
- `grep innerHTML picker.ts` — all occurrences in comments only (0 actual innerHTML assignments)
- Acceptance criteria for Tasks 1 and 2: all pass

## Deviations from Plan

None — plan executed exactly as written for Tasks 1 and 2.

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns introduced. The hover overlay is purely DOM-level within the shadow root. T-05-05 (textContent-only label) and T-05-06 (shadow-host guard) are both implemented as specified in the threat register.

## Known Stubs

- `onPickerClick` in `mountChip` is wired but no real callback is passed from `index.ts` yet — the 2-arg call site remains unchanged. The picker is functional (enters/exits, shows overlay, handles Esc) but clicking a page element currently exits pick mode without opening a card. Plan 03 wires `openElementCard`.

## Self-Check: PASSED

- `entrypoints/review.content/picker.ts` exists: FOUND
- `entrypoints/review.content/chip.ts` modified: FOUND
- Commit eb8feaa exists: FOUND
- Commit df439b4 exists: FOUND
