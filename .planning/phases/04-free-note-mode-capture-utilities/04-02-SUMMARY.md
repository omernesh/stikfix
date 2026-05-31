---
phase: 04-free-note-mode-capture-utilities
plan: 02
subsystem: free-note-mode-ui
tags: [fab, card, toast, interactjs, remap, d09, free-note, shadow-dom]
dependency_graph:
  requires:
    - 04-01 (card-state.ts, interactjs@1.10.27)
  provides:
    - entrypoints/review.content/fab.ts (mountFab)
    - entrypoints/review.content/card.ts (openCard, closeCard)
    - entrypoints/review.content/toast.ts (showToast)
    - D-09 re-map affordance on chip label
  affects:
    - entrypoints/review.content/index.ts (FAB/card/toast wired into onMount)
    - entrypoints/review.content/chip.ts (getTabId exported; renderRoutedLabel extended)
    - entrypoints/review.content/styles.css (FAB, card, toast, re-map CSS appended)
tech_stack:
  added: []
  patterns:
    - interactjs direct-element-ref drag + restrictRect window modifier (FAB + card)
    - pointer-events fallback drag if interactjs throws (fab.ts, card.ts)
    - tryOpenCard/closeCardState from card-state.ts for FREE-02 single-card guard
    - SFX_SEND_ANNOTATION relay (chip.ts wireSendButton pattern copied verbatim)
    - .onclick = assignment (not addEventListener) for idempotent re-map/dismiss (D-09, T-04-03)
    - textContent-only for all host-derived strings (T-04-03)
key_files:
  created:
    - entrypoints/review.content/fab.ts
    - entrypoints/review.content/card.ts
    - entrypoints/review.content/toast.ts
  modified:
    - entrypoints/review.content/index.ts
    - entrypoints/review.content/chip.ts
    - entrypoints/review.content/styles.css
decisions:
  - interactjs used with direct element reference (never CSS selector) inside WXT shadow root — Assumption A2/A3 confirmed; restrictRect window modifier works; no fallback needed in practice
  - getTabId exported from chip.ts; index.ts calls it once and shares tabId — canonical single definition, not duplicated
  - D-09 renderRoutedLabel extended with re-map params; both call sites updated; .onclick = assignment prevents stacking
  - screenshots:[] always empty in card.ts (D-06); capture.ts never imported
metrics:
  duration: "~9 minutes"
  completed: "2026-05-31"
  tasks: 3
  files: 6
---

# Phase 4 Plan 2: Free-Note Mode — FAB + Card + Toast + Re-map Summary

One-liner: interactjs-draggable + FAB opens a single post-it card that sends a mode:'free' text payload via the proven SW relay and surfaces the host-returned filename in a success toast — with chip label re-map affordance (D-09) completing the vertical slice.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | FAB component with interactjs drag + CSS | 80ea8f4 | fab.ts (new), styles.css |
| 2 | Post-it card + Send relay + toast | 358fba0 | card.ts (new), toast.ts (new) |
| 3 | Wire FAB/card/toast into index.ts + chip re-map | a041d8b | index.ts, chip.ts |

## Verification Results

- `tsc --noEmit`: exit 0
- `tsc --noEmit -p tsconfig.host.json`: exit 0
- `npm run build`: exit 0 (extension 156kB — interactjs bundled ~100kB, expected)
- `npm run test:lib`: 29 pass, 0 fail
- `npm test` (host): 57 pass, 0 fail
- `node scripts/clean-room-check.mjs`: PASS — no banned identifiers
- `npm run check`: exit 0 (all gates green)

## Deviations from Plan

None - plan executed exactly as written.

interactjs spike outcome: `interact(el).draggable({ modifiers: [interact.modifiers.restrictRect({ restriction: 'window', endOnly: false })] })` with direct element reference works inside the WXT open shadow root on first attempt. No fallback to pointer-events was required. The fallback code (`_applyPointerEventsDrag`, `_applyHeaderDrag`) remains in fab.ts and card.ts as a defensive try/catch guard per RESEARCH.md Assumption A2/A3, but was not exercised.

## Known Stubs

None. All exports are fully implemented and wired:
- `mountFab` builds and attaches a draggable + FAB that calls `openCard` on click
- `openCard` builds the full card UI and wires the Send relay to the SW
- `showToast` shows success/error feedback with correct auto-dismiss / persist behavior
- D-09 re-map: `renderRoutedLabel` sets `label.onclick` to reopen the dropdown; both call sites updated

## Threat Flags

None. All T-04-03/T-04-04/T-04-05/T-04-06 mitigations verified:
- T-04-03 (XSS via resp.file/error): all host-derived strings go into textContent only — enforced in card.ts (_doSend) and toast.ts (msgSpan.textContent); grep for .innerHTML returns no matches in card.ts or toast.ts
- T-04-04 (content-script localhost access): card.ts has no import from lib/capture.ts; no direct fetch; relay exclusively through SFX_SEND_ANNOTATION
- T-04-05 (page-controlled textarea): accepted — host validates shape + 12MB cap unchanged
- T-04-06 (spoofing): origin derived from chrome.tabs.get in SW — unchanged from Phase 3

## Self-Check: PASSED

- [x] entrypoints/review.content/fab.ts exists: FOUND
- [x] entrypoints/review.content/card.ts exists: FOUND
- [x] entrypoints/review.content/toast.ts exists: FOUND
- [x] Commit 80ea8f4 exists: FOUND
- [x] Commit 358fba0 exists: FOUND
- [x] Commit a041d8b exists: FOUND
- [x] tsc --noEmit: exit 0
- [x] npm run build: exit 0
- [x] npm run check: exit 0 (29 + 57 tests pass)
