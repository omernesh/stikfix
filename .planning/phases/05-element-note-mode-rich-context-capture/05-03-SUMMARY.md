---
phase: 05-element-note-mode-rich-context-capture
plan: 03
subsystem: extension-ui
status: complete
tags: [element-note, context-header, capture-pipeline, ELEM-02, ELEM-03, ELEM-04, ELEM-05, ELEM-06, ELEM-07, ELEM-08, ELEM-09]
dependency_graph:
  requires: [05-01, 05-02]
  provides: [openElementCard, element-send-capture-pipeline, picker-card-wiring]
  affects:
    - entrypoints/review.content/card.ts
    - entrypoints/review.content/index.ts
    - entrypoints/review.content/styles.css
tech_stack:
  added: []
  patterns: [parallel-function-extend, frozen-rect, hide-all-before-capture, SW-relay, textContent-only, INVARIANT-C, no-silent-failure]
key_files:
  created: []
  modified:
    - entrypoints/review.content/card.ts
    - entrypoints/review.content/index.ts
    - entrypoints/review.content/styles.css
decisions:
  - "openElementCard / _doElementSend are NEW parallel functions — openCard / _doSend (free path) untouched, preserving the Phase-4 capture-free invariant for free notes (regression guard held: grep -c 'function openCard' == 1)"
  - "card.ts header invariant amended: the 'MUST NOT import lib/capture.ts' rule now scopes to openCard/_doSend (free path) only — openElementCard IS the first capture-trio consumer and imports captureTab/waitTwoRafs/drawHighlightBox/buildContextSummary"
  - "Frozen rect: elementCtx.rect (captured at picker click time) is reused for both the canvas box-draw and the payload screenshot rect — never re-measured at Send (Pitfall 2)"
  - "Own-UI hidden via setSfxVisibility(false) → waitTwoRafs() → captureTab; box drawn onto the returned canvas AFTER capture (D-02a) so the +1.png contains zero sfx surfaces (Pitfall 3 / T-05-13)"
  - "index.ts: mountChip mounts synchronously BEFORE getTabId().then (chip-mount regression guard); picker handler closes over an onMount-scoped resolvedTabId mutable assigned inside .then — safe no-op until tabId resolves"
  - "Task 3 Chrome UAT (ELEM-01/02/03/08/09 runtime confirmation) DEFERRED-MANUAL (🟡M) to a single consolidated end-of-phase Chrome session covering 05-02 + 05-03 together — verifying the element slice standalone is wasteful and the pick→card→Send loop is only fully exercisable now that wiring lands"
metrics:
  duration: 0
  completed_date: "2026-06-02"
  tasks_completed: 2
  tasks_total: 3
  tasks_deferred_manual: 1
  files_created: 0
  files_modified: 3
---

# Phase 05 Plan 03: Element-Note Vertical Slice Summary

**One-liner:** `openElementCard` in `card.ts` (parallel to the untouched `openCard`) renders a read-only context-header strip over an empty textarea and, on Send, hides all sfx UI → `waitTwoRafs` → `captureTab` → draws the orange highlight box on the captured canvas at the frozen element rect → POSTs a `mode:'element'` payload (full ElementContext + `+1.png`) through the existing `SFX_SEND_ANNOTATION` relay; `index.ts` wires picker click → `captureElementContext` → `openElementCard`.

## Status

CODE-COMPLETE — Tasks 1-2 committed; `tsc --noEmit` green; `npm run test:lib` 81/81 pass. Task 3 (Chrome UAT) is DEFERRED-MANUAL (🟡M).

The runtime/visual confirmation of ELEM-02/03/04/05/06/07/08/09 (and ELEM-01 carried from Plan 02) is **NOT yet verified** — it is deferred to a single consolidated end-of-phase Chrome session covering 05-02 + 05-03 together. **ELEM-01/02/03/08/09 are NOT claimed as runtime-verified — they are code-complete-pending-UAT.**

## Tasks Completed

| Task | Description | Status | Commit | Files |
|------|-------------|--------|--------|-------|
| 1 | openElementCard — context header + element Send capture pipeline | ✅ committed | 74dea76 | card.ts, styles.css |
| 2 | index.ts — wire picker → captureElementContext → openElementCard | ✅ committed | 7afc5e3 | index.ts |
| 3 | Chrome UAT — full element-note slice end-to-end | 🟡M deferred-manual | — | (manual Chrome UAT pending, deferred to consolidated Phase-5 session) |

*Status legend (matches Phase 4 04-VALIDATION.md): ✅ automated/code-complete · 🟢M manual-verified (UAT pass) · 🟡M manual-deferred · ❌ red.*

## What Was Built

### Task 1: `entrypoints/review.content/card.ts` (extended)

- **New imports** (first capture-trio consumer): `captureTab`, `waitTwoRafs` from `lib/capture.js`; `drawHighlightBox` from `lib/highlight-draw.js`; `buildContextSummary` from `lib/element-context.js`; `type ElementContext` from `lib/types.js`.
- **Header invariant amended**: the "MUST NOT import lib/capture.ts" rule now scopes to `openCard` / `_doSend` (free path) only.
- **`openElementCard(container, tabId, elementCtx, onDismiss, showToastFn)`** — parallel to `openCard`, reusing the `tryOpenCard`/`closeCardState` single-card guard and the interactjs drag block verbatim. Adds:
  - `#sfx-card.sfx-card-element` modifier on the root
  - Header label `Element note`
  - Read-only `.sfx-ctx-header` strip (`role=note`, `aria-label "Element context"`) with `.sfx-ctx-header-text` set via `buildContextSummary(elementCtx)` — **textContent only** (INVARIANT C / T-05-09)
  - Secondary button label `Discard note`
  - Empty, focused textarea; Send disabled until trimmed textarea is non-empty (context header does not affect enablement)
- **`_doElementSend(...)`** — the 9-step element Send sequence:
  1. Disable Send (`Sending…`) + Discard + `textarea.readOnly`
  2. `setSfxVisibility(false)` — hide card, chip, FAB, hover overlay synchronously
  3. `await waitTwoRafs()`
  4. `const dataUrl = await captureTab(tabId)` (SW relay, `SFX_CAPTURE_TAB`)
  5. Build `Image` → canvas sized to `naturalWidth/Height` → `drawImage` → `drawHighlightBox(canvas, frozenRect, window.devicePixelRatio)`
  6. `canvas.toDataURL('image/png')`; restore sfx visibility
  7. Assemble `mode:'element'` `AnnotationPayload` (comment, page url/title, viewport w/h/dpr, `element: elementCtx`, `screenshots:[{kind:'+1', mime:'image/png', dataUrl, rect}]`)
  8. `chrome.runtime.sendMessage(SFX_MSG.SEND_ANNOTATION, …)`
  9. Success → `wrote notes\{resp.file}` toast + close; capture-fail → `Screenshot capture failed — note not sent` toast + restore controls; relay/runtime error → existing `lastError || !resp` guard restores controls + error toast
- **Frozen rect**: `frozenRect = elementCtx.rect` (captured at click time) is used for both the box draw and the payload screenshot `rect` — never re-measured at Send (Pitfall 2).

### Task 2: `entrypoints/review.content/index.ts` (extended)

- New imports: `openElementCard` (added to existing `card.js` destructure), `captureElementContext` from `lib/element-context.js`, `exitPickMode` from `picker.js`.
- `toast` adapter moved ABOVE the `mountChip` call so it is in scope for the picker handler (pure reorder of existing lines).
- `let resolvedTabId: number | null = null;` declared before `mountChip`.
- `mountChip` called synchronously (BEFORE `getTabId().then`) with the 3rd-arg picker handler: `(el) => { if (resolvedTabId === null) return; openElementCard(container, resolvedTabId, captureElementContext(el), () => {}, toast); }`.
- `resolvedTabId = tabId;` assigned as the first line inside the existing `getTabId().then` block.
- `onRemove` extended to also call `exitPickMode()` alongside `teardownChip` + `closeCard`.
- Free-note FAB → `openCard` wiring and the `EXIT_REVIEW` listener are unchanged.

### CSS additions to `styles.css`

- `#sfx-card.sfx-card-element` modifier hook (enables child selectors; no root override)
- `.sfx-ctx-header`: `padding 4px 12px`, `min-height 28px`, `background #f8f4f0`, `border-bottom 1px solid #e8e0d8`, `font-size 13px`, `font-weight 400`, `color #444444`, `line-height 1.4`, `overflow hidden`, `white-space nowrap`, `text-overflow ellipsis`
- `.sfx-ctx-header-text`: inherited ellipsis/typography

## Verification

### Automated (green)

- `npx tsc --noEmit` exits 0 after both tasks
- `npm run test:lib` exits 0 — 81/81 pass (Plan 01 element-context + highlight-draw cases still green)
- Regression guard: `grep -c "function openCard" card.ts` == 1; `_doSend` still present (free-note path intact)
- `innerHTML` appears only in 3 comment lines in card.ts — zero actual `innerHTML` assignments

### Manual Chrome UAT — DEFERRED (🟡M)

The following runtime behaviors are **NOT yet verified** and are deferred to a single consolidated end-of-phase Chrome session (covering 05-02 + 05-03 together):

- [ ] 🎯 → hover → click element opens ONE "Element note" card with the warm off-white context header (`tag.class · "text" · <Component> · WxH`), empty textarea, "Discard note" button; pick mode off (ELEM-01/02/07)
- [ ] Type comment → Send → success toast names the written file
- [ ] Element `.md` on disk carries `selector:` + (React) `react_component:` frontmatter, curated computed-styles table (~25 rows), truncated `outerHTML`, dataset, aria, nearestTestId, page-absolute rect (ELEM-03/04/05/06/09)
- [ ] `…+1.png` is full viewport + orange box on the picked element, with NO sfx UI anywhere in the image (ELEM-08 / D-02a)
- [ ] Frozen-rect behavior: pick → scroll → Send places the box at the click-time position (Pitfall 2)
- [ ] Host down → Send surfaces an error toast (no silent drop — REL-01)
- [ ] No stikfix console errors throughout

**Rationale for deferral:** The pick→element-card→Send loop is only fully exercisable now that this plan wires it; running a separate Chrome session for the element slice in isolation duplicates the 05-02 pick-mode UAT (also deferred). One consolidated session verifies 05-02 + 05-03 together with less rebuild/reload churn. Mirrors Phase 4's deferred-manual convention (04-VALIDATION.md Tests 1 & 5, 🟡M).

## Deviations from Plan

None — plan code (Tasks 1 and 2) executed exactly as written. The only change is process: Task 3 (the human-verify checkpoint) is recorded as deferred-manual rather than run now, per explicit instruction to consolidate Phase-5 Chrome UAT.

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns introduced. The threat-register mitigations were implemented as specified:

- **T-05-09** (XSS via context header): `buildContextSummary` output set via `textContent` ONLY; no `innerHTML` assignments in card.ts (comment-only occurrences).
- **T-05-10** (IDOR / origin-trust): no new privileged message added — `_doElementSend` reuses the existing `SFX_CAPTURE_TAB` + `SFX_SEND_ANNOTATION` relays; the content script supplies the payload only, the SW resolves tab/window/host itself.
- **T-05-13** (own-UI in +1.png): strict `setSfxVisibility(false)` → `waitTwoRafs()` → `captureTab` order; box drawn onto the canvas AFTER capture (D-02a), never the live overlay. Verified in the deferred checkpoint.

## Known Stubs

None. Both code tasks are fully wired — the picker click handler opens a real element card, and Send runs the full capture + relay pipeline. The only outstanding item is runtime/visual confirmation (deferred-manual UAT), not stubbed functionality.

## Self-Check: PASSED

- `entrypoints/review.content/card.ts` modified (openElementCard present): FOUND
- `entrypoints/review.content/index.ts` modified (openElementCard wired): FOUND
- `entrypoints/review.content/styles.css` modified (.sfx-ctx-header): FOUND
- Commit 74dea76 exists: FOUND
- Commit 7afc5e3 exists: FOUND
