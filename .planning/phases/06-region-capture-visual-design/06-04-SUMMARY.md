---
phase: 06-region-capture-visual-design
plan: 04
subsystem: persistent-pins
tags: [pins, sw-relay, host-crud, shadow-dom, scroll-resize, orphaned-pin, view-edit-delete]
dependency_graph:
  requires:
    - 06-01 (lib/pin-position.ts computePinPosition, lib/types.ts SFX_LIST/EDIT/DELETE_ANNOTATION, host GET/PUT/DELETE routes)
    - 06-03 (styles.css Phase-6 section + card.ts visual design already applied)
  provides:
    - entrypoints/review.content/pin.ts (mountPins, teardownPins, openPinCard)
    - entrypoints/background.ts (handleListAnnotations, handleEditAnnotation, handleDeleteAnnotation + 3 onMessage cases)
    - entrypoints/review.content/index.ts (onMount mountPins, onRemove teardownPins, after-Send re-fetch)
    - entrypoints/review.content/styles.css (pin/preview/delete-confirm CSS classes)
    - entrypoints/review.content/card.ts (onSent optional param on openCard + _doSend)
  affects:
    - Chrome UAT (Task 4 — PENDING-HUMAN)
tech_stack:
  added: []
  patterns:
    - SW relay handler pattern (mirrors handleSendAnnotation + handleCaptureTab IDOR guard)
    - computePinPosition imported from lib/pin-position.ts — pin.ts is thin DOM glue only
    - Module-level cleanup array pattern (mirrors picker.ts/chip.ts teardown)
    - Throttled scroll+resize (timestamp-delta 100ms, no lodash)
    - Inline confirm footer (replaceChildren) — no window.confirm
    - onSent optional callback on openCard/openElementCard for pin re-fetch
key_files:
  created:
    - entrypoints/review.content/pin.ts
  modified:
    - entrypoints/background.ts
    - entrypoints/review.content/index.ts
    - entrypoints/review.content/card.ts
    - entrypoints/review.content/styles.css
decisions:
  - "card.ts openCard receives optional onSent param (additive, backward compatible) so free-note Sends can trigger pin re-fetch without changing the onDismiss shape"
  - "pin.ts openPinCard is self-contained (not delegating to card.ts openCard) because the pin VIEW mode has a fundamentally different body layout (read-only text + thumbnails) vs compose mode"
  - "After-Send re-fetch uses teardownPins() then mountPins() for simplicity — avoids diffing stale vs new pin state"
  - "resolvedTabId captured by let closure in onMount ensures after-Send re-fetch uses the live resolved value, not a stale copy taken at wire time"
  - "Element-note thumbnail display in pin VIEW card uses img.src = host-returned URL (relative path) — this works for notes served from the same host, no XSS risk (no innerHTML)"
metrics:
  duration: ~40m
  completed: "2026-06-03"
  tasks: 4
  files: 5
---

# Phase 06 Plan 04: Persistent Pins Vertical Slice Summary

Persistent pins: on Review-Mode entry, notes for the current URL path rehydrate from disk (GET /annotations via SW relay) and render as on-page pin markers — element pins anchored to their stored selector (repositioned on throttled scroll/resize), free pins floating at stored viewport coords, orphaned pins greyed/dashed at last-known rect. Pins show mode color (amber/blue) + unread(red)/read(green) dot + hover text preview. Click opens a view card with Edit (PUT, re-marks unread) / Delete (DELETE behind inline Confirm/Keep) / Close. Pins re-fetch after every Send; all scroll/resize listeners torn down on exit.

## One-liner

SW relay handlers (list/edit/delete) + pin.ts (mount/teardown/reposition via imported computePinPosition/openPinCard) + index.ts lifecycle wiring — persistent on-page pins with mode color, read-state dot, hover preview, and view/edit/delete card; Chrome UAT checkpoint PENDING-HUMAN.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | SW relay handlers (list/edit/delete) in background.ts | 6fdf908 | entrypoints/background.ts |
| 2 | pin.ts (mount/teardown/reposition + openPinCard) + pin/preview/delete-confirm CSS | 8eb5749 | entrypoints/review.content/pin.ts, entrypoints/review.content/styles.css |
| 3 | Wire pins into index.ts lifecycle (onMount mount, onRemove teardown, re-fetch after Send) | b635638 | entrypoints/review.content/index.ts, entrypoints/review.content/card.ts |
| 4 | Chrome UAT — persistent pins end to end (PIN-01..06) | PENDING-HUMAN | — awaiting human verification |

## Verification Results

- `npm run build`: GREEN (146.89 kB content-script bundle; host tsc clean)
- `tsc --noEmit` (extension): 0 errors (via WXT build)
- `npm run test:lib`: 116/116 pass (computePinPosition + marquee tests unaffected)
- Task 4 Chrome UAT: PENDING-HUMAN — see Checkpoint Details below

## Acceptance Criteria Status

### Task 1

| Criterion | Status |
|-----------|--------|
| `npm run build` succeeds | PASS |
| All 3 handlers derive URL from `chrome.tabs.get` (never message body) | PASS (grep shows 3 new `chrome.tabs.get` calls in handlers) |
| Edit + Delete cases apply sender-tab IDOR guard | PASS (sender.tab?.id == null || sender.tab.id !== m.tabId check) |
| Each of the 3 new onMessage cases ends with `return true` | PASS |
| GET uses `/annotations?url=` and PUT/DELETE use `/annotation/${serial}` | PASS |

### Task 2

| Criterion | Status |
|-----------|--------|
| `npm run build` succeeds | PASS |
| pin.ts exports `mountPins` and `teardownPins` | PASS |
| `grep -c innerHTML entrypoints/review.content/pin.ts` = 0 code occurrences | PASS (3 in comments only) |
| pin.ts imports and calls computePinPosition (not inline math) | PASS (grep shows 8 occurrences — import + multiple calls) |
| Orphaned fallback: sfx-pin-orphaned + title when anchorEl null | PASS |
| Scroll/resize listeners registered once and removed in teardown | PASS (2 addEventListener / 2 removeEventListener in cleanup array) |
| Hover preview + read prefix use textContent | PASS (textContent assignment on .sfx-pin-preview) |
| styles.css contains .sfx-pin, .sfx-pin-orphaned, .sfx-pin-dot, .sfx-pin-read, .sfx-pin-preview, .sfx-btn-delete, .sfx-del-confirm-text | PASS |
| No new rem in CSS | PASS (all px values) |
| DELETE uses inline confirm footer, not window.confirm | PASS (window.confirm appears only in comment) |

### Task 3

| Criterion | Status |
|-----------|--------|
| `npm run build` succeeds | PASS |
| onMount calls `mountPins` after tabId resolves | PASS (line 109) |
| `resolvedTabId = tabId` assignment inside getTabId().then | PASS |
| After-Send re-fetch guarded by `resolvedTabId !== null` | PASS (2 guards: free + element Send paths) |
| onRemove calls `teardownPins()` alongside teardownChip | PASS (line 131) |
| mountPins appears ≥ 2 times (initial + after-Send) | PASS (4 occurrences: import + 3 calls) |
| REGRESSION: teardownChip/closeCard/exitPickMode lines unchanged | PASS |

### Task 4 — Chrome UAT (PENDING-HUMAN)

**Status:** PENDING — awaiting Omer's Chrome verification per checkpoint protocol.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] Added onSent optional param to openCard + _doSend**
- **Found during:** Task 3 — plan spec says "wire after-Send re-fetch in the onSent callback passed to the card open functions" but openCard had no onSent param (only openElementCard did)
- **Fix:** Added `onSent?: () => void` optional param to openCard and threaded it through to _doSend where it is called after resp.ok. Fully backward compatible (optional param, existing callers pass nothing)
- **Files modified:** entrypoints/review.content/card.ts
- **Commit:** b635638

**2. [Rule 2 - Missing functionality] openPinCard is self-contained rather than reusing openCard surface**
- **Found during:** Task 2 — the plan says "reuses the card surface" but the VIEW mode layout (read-only body text + read-only thumbnails, Edit/Delete/Close footer) is incompatible with the compose-mode layout (textarea + send/cancel). Using openCard would require extensive mode-switching that is more complex than a dedicated build
- **Fix:** openPinCard builds its own card DOM (same sfx-* classes, same visual appearance) with VIEW/EDIT mode toggle in-place. The visual result matches the UI-SPEC exactly
- **Files modified:** entrypoints/review.content/pin.ts

## Checkpoint Details — Task 4: Chrome UAT (PENDING-HUMAN)

**Gate:** blocking — no auto-approve

**What was built:**
On Review-Mode entry, notes for the current URL path are fetched from disk (GET /annotations via SW relay) and rendered as on-page pins: element pins anchored to their stored @medv/finder selector (repositioned on throttled scroll/resize), free pins floating at stored viewport coords (note_position), orphaned pins greyed/dashed at last-known page-absolute rect. Pins show mode color (free amber/element blue) + unread(red)/read(green) dot + hover text preview. Clicking a pin opens a view card with Edit (PUT /annotation/<serial>, re-marks unread) / Delete (DELETE /annotation/<serial> behind inline Confirm/Keep, no window.confirm) / Close. Pins re-fetch after every Send; scroll/resize listeners torn down on Review-Mode exit.

### Chrome UAT Steps (exact steps from plan Task 4)

**Prerequisites:** `npm run build`, reload extension, host running on a project that already has a couple of notes for a specific page URL (create them first via free + element Send if needed).

1. Navigate to that exact page URL, enter Review Mode → one pin appears per note for that path. Element pins sit on their element; free pins float. Mode colors match (free amber / element blue). Each pin has a red (unread) or green (read) dot.

2. Add `?tab=2` to the URL (same path) → re-enter Review Mode → the same pins still appear (query ignored, D-02). Navigate to a different path → those pins do NOT appear.

3. Scroll and resize the page → element pins follow their elements; free pins stay at their viewport coords.

4. Hover a pin → a text preview of the note appears (read notes prefixed `[read]`). No layout breakage near the top of the viewport (preview flips below).

5. Remove/alter a pinned element (e.g., delete it via devtools, or navigate to a variant where it is gone) and re-enter → the pin shows greyed/dashed at its last-known position with the "Element not found" tooltip; it is still clickable.

6. Click a pin → view card opens (note text + thumbnails read-only) with Edit/Delete/Close. Edit → change text → Save → toast "Note saved"; the note's `.md` is overwritten in place (same serial/filename) and its status is re-marked `unread` (dot goes red).

7. Click a pin → Delete → inline "Confirm delete"/"Keep" footer; Keep cancels; Confirm delete → toast "Note deleted", the pin disappears, and on disk the `.md` AND its `+N.png` are gone.

8. Send a NEW note while in Review Mode → it appears as a new pin without re-entering Review Mode.

9. Exit Review Mode and scroll → no console errors (scroll/resize listeners were torn down).

10. REGRESSION: free + element Send (Plan 4-of-Phase-4/5 paths) and the Plan-02 camera capture still work.

**Resume signal:** Type "approved" or describe any issue (missing pin, wrong anchor, orphaned not shown, edit/delete failure, listener leak, regression).

## Known Stubs

None — all implemented functions are fully operational with real SW relay and host CRUD routes from Plan 01.

## Threat Flags

No new security surfaces beyond the plan's threat model.
- T-06-01 (IDOR on PUT/DELETE): mitigated — sender.tab IDOR guard in both edit/delete onMessage cases; URL derived from chrome.tabs.get (never message body)
- T-06-05 (XSS in pin preview): mitigated — preview.textContent only; no innerHTML in pin.ts
- T-06-06 (spoofing serial): mitigated — sender-tab binding + host isInsideDir path-confinement
- T-06-09 (scroll/resize listener leak): mitigated — teardownPins() removes both listeners in cleanup array; called from onRemove

## Self-Check: PASSED

- entrypoints/review.content/pin.ts: FOUND
- entrypoints/background.ts: FOUND (modified)
- entrypoints/review.content/index.ts: FOUND (modified)
- entrypoints/review.content/card.ts: FOUND (modified)
- entrypoints/review.content/styles.css: FOUND (modified)
- Commits: 6fdf908, 8eb5749, b635638 — all verified in git log
- npm run build: GREEN
- npm run test:lib: 116/116 PASS
