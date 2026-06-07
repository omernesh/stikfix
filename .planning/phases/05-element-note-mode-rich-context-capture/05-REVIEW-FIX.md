---
phase: 05-element-note-mode-rich-context-capture
fixed_at: 2026-06-02T00:00:00Z
review_path: .planning/phases/05-element-note-mode-rich-context-capture/05-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 5: Code Review Fix Report

**Fixed at:** 2026-06-02
**Source review:** .planning/phases/05-element-note-mode-rich-context-capture/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (WR-01, WR-02, WR-03, WR-04)
- Fixed: 4
- Skipped: 0

## Fixed Issues

### WR-01: SW send failure after successful capture leaves controls permanently disabled

**Files modified:** `entrypoints/review.content/card.ts`
**Commit:** 3f87506
**Applied fix:** After both `restoreControls()` calls in `_doElementSend` (the `lastError || !resp` branch and the `!resp.ok` branch), added `sendBtn.disabled = textarea.value.trim().length === 0;` to re-apply the textarea-empty rule — mirroring the `_doSend` (free-note) failure path. `openCard`/`_doSend` were not touched.

---

### WR-02: React fiber name filter threshold `> 2` silently drops valid 2-character component names

**Files modified:** `lib/element-context.ts`, `lib/test/element-context.test.ts`
**Commit:** 3f87506
**Applied fix:** Changed `name.length > 2` to `name.length >= 2` on line 109 of `element-context.ts`. Added a new test case `'accepts 2-character PascalCase component names (WR-02)'` that asserts `reactComponent === 'HR'` for a fiber with `type.name = 'HR'`. All 82 tests pass (81 pre-existing + 1 new).

---

### WR-03: `onDismiss: () => {}` no-op in index.ts loses FAB state consistency for element card

**Files modified:** `entrypoints/review.content/index.ts`
**Commit:** 3f87506
**Applied fix:** Expanded the inline `() => {}` to `() => { /* element card has no FAB to collapse */ }` with a comment, making the intent clear to future maintainers.

---

### WR-04: Hover overlay uses `document.createElement` but is appended to shadow container — scoping mismatch risk

**Files modified:** `entrypoints/review.content/picker.ts`
**Commit:** 3f87506
**Applied fix:** Changed `document.createElement('div')` and `document.createElement('span')` in `enterPickMode` to `container.ownerDocument.createElement('div')` and `container.ownerDocument.createElement('span')` respectively, ensuring elements are owned by the same document as their insertion point.

---

## Verification Gates

- `npx tsc --noEmit`: exit 0 (clean)
- `npm run test:lib`: 82/82 pass (81 pre-existing + 1 new WR-02 test)
- `grep -c "function openCard" entrypoints/review.content/card.ts`: 1 (regression guard confirmed)

---

_Fixed: 2026-06-02_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
