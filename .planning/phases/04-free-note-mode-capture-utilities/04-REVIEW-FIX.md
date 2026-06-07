---
phase: 04-free-note-mode-capture-utilities
fixed_at: 2026-06-01T00:00:00Z
review_path: .planning/phases/04-free-note-mode-capture-utilities/04-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 04: Code Review Fix Report

**Fixed at:** 2026-06-01
**Source review:** `.planning/phases/04-free-note-mode-capture-utilities/04-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (2 blockers + 4 warnings)
- Fixed: 6
- Skipped: 0

## Fixed Issues

### CR-01: `wireSendButton` uses `addEventListener` — listeners stack on D-09 re-route

**Files modified:** `entrypoints/review.content/chip.ts`
**Commit:** `dd8caa6` (combined with WR-03)
**Applied fix:** Replaced `sendBtn.addEventListener('click', ...)` with `sendBtn.onclick = ...` in `wireSendButton`. This is idempotent — re-calling `wireSendButton` on D-09 re-map now overwrites the handler rather than stacking a second one. Matches the existing `label.onclick`/`dismiss.onclick` pattern in the file.

Reviewer asked to also verify `card.ts`'s Send wiring. `card.ts` uses `sendBtn.addEventListener('click', ...)` for the card's own Send button, but `openCard` is called only once per card instance (not re-called on re-map), so there is no stacking risk. No change needed in `card.ts` for CR-01.

### CR-02: `cropToRect` silently produces a blank PNG when element rect is zero-dimension

**Files modified:** `lib/capture.ts`, `lib/test/capture.test.ts`
**Commit:** `a5fd551`
**Applied fix:** Guard `sw <= 0 || sh <= 0` is checked before canvas setup. `computeCropCoords` is called first (before `new Image()`), and if either dimension is zero the Promise rejects with a descriptive error message. Also added three `computeCropCoords` tests covering zero-width, zero-height, and DPR=0 inputs.

### WR-01: FAB `aria-expanded` never flipped to `'true'`

**Files modified:** `entrypoints/review.content/index.ts`
**Commit:** `6c5e07f`
**Applied fix:** `mountFab` already returns the FAB element. Assigned the return value to `fab` and set `fab.setAttribute('aria-expanded', 'true')` before calling `openCard`, and passed a real `onDismiss` callback that sets it back to `'false'` when the card closes.

### WR-02: Dead `sendBtn.disabled = false` in `card.ts` error path

**Files modified:** `entrypoints/review.content/card.ts`
**Commit:** `1024e2f`
**Applied fix:** Removed the `sendBtn.disabled = false` at line 297. The content-based re-evaluation `sendBtn.disabled = !hasText` at line 303 is the authoritative rule and immediately overwrote it anyway.

### WR-03: Module-level `feedbackTimer` singleton in `chip.ts`

**Files modified:** `entrypoints/review.content/chip.ts`
**Commit:** `dd8caa6` (combined with CR-01)
**Applied fix:** Moved `feedbackTimer` and `showFeedback` inside `mountChip` as a per-instance closure. `showFeedback` is threaded down to `wireSendButton`, `renderDropdown`, and `renderRoutedLabel` via a `showFeedbackFn` parameter. Each chip instance now owns its own timer; re-injection cannot cancel a detached chip's auto-dismiss.

### WR-04: `card-state.ts` stale `active` flag on CS re-injection

**Files modified:** `entrypoints/review.content/card.ts`
**Commit:** `b367704`
**Applied fix:** Added a reconciliation guard in `openCard`: if `tryOpenCard()` returns `'focus-existing'` but `activeCard` is `null`, the state machine has a stale flag (module cache reused after re-injection). Reset via `closeCardState()` + `tryOpenCard()` and proceed to open fresh. If `activeCard` is non-null, behavior is unchanged (focus existing textarea). Documents the invariant inline.

Note: `card-state.ts` itself is DOM-free by design. The reconciliation guard lives in `card.ts` (the DOM half) where `activeCard` is accessible, preserving the testability invariant of `card-state.ts`.

## Skipped Issues

None.

---

## Verification

All checks run from main repo after fast-forward merge of fix commits:

- `tsc --noEmit` (extension config) — PASS
- `tsc --noEmit -p tsconfig.host.json` — PASS
- `tsc --noEmit -p tsconfig.lib.json` — PASS
- `node scripts/clean-room-check.mjs` — PASS
- `node scripts/host-smoke-test.mjs` — PASS
- `npm run test:lib` — 32/32 PASS
- `npm test` — 57/57 PASS
- **Total: 89/89 tests, 0 failures**

---

_Fixed: 2026-06-01_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
