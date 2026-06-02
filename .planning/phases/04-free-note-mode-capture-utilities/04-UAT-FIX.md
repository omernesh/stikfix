# Phase 04 — Live UAT Fix Report

**Date:** 2026-06-02  
**Branch:** gsd/v1.0-milestone  
**Defects fixed:** 4 (3 confirmed MAJOR/BLOCKER + 1 secondary)

---

## FIX 1 — FAB native click swallowed (BLOCKER)

**Commit:** `8f85d3c`  
**File:** `entrypoints/review.content/fab.ts`

**Root cause:** `interact(fab).draggable(...)` consumed the pointer gesture on every pointerdown with no click/drag threshold. The synthetic `click` event never reached `fab.addEventListener('click', onOpen)`. Programmatic `fab.click()` worked because it bypasses the pointer pipeline.

**Fix:** Replaced interactjs entirely in `fab.ts` with a threshold-based pointer-events drag:
- `pointerdown` — records start x/y and current translate; does **not** `preventDefault` or `setPointerCapture`.
- `pointermove` — once `Math.hypot(dx, dy) >= 4px`, enters drag mode: `setPointerCapture`, applies `translate()` with viewport clamping.
- `pointerup` — if drag occurred, releases capture and installs a one-shot capture-phase click stopper (`addEventListener('click', stopper, {capture:true, once:true})`). If no drag (tap), does nothing → native `click` fires → `onOpen` runs.

`fab.addEventListener('click', onOpen)` is the sole click path. interactjs import removed from `fab.ts`. INVARIANT E (chip's `makeDraggable` untouched) preserved.

---

## FIX 2 — Chip routed-label click swallowed (MAJOR)

**Commit:** `10eaf4a`  
**File:** `entrypoints/review.content/chip.ts`

**Root cause:** `makeDraggable`'s pointerdown guard (line ~453) excluded `button, select, input, option, a, textarea` but not `span`. The `sfx-label-routed` span's click triggered `setPointerCapture + preventDefault`, swallowing the `label.onclick` D-09 re-map handler. The dropdown never opened.

**Fix:** Extended the `closest()` selector in the pointerdown guard to also bail on `.sfx-label-routed` and `.sfx-chip-dropdown`:

```ts
if (target && target.closest('button, select, input, option, a, textarea, .sfx-label-routed, .sfx-chip-dropdown')) {
  return;
}
```

The chip remains draggable by its non-interactive areas (status dot, padding, feedback span). `makeDraggable` signature is unchanged (INVARIANT E).

---

## FIX 3 — Chip z-order vs page popovers (MINOR — best-effort)

**Commit:** `d63862e`  
**File:** `entrypoints/review.content/index.ts`

**Root cause:** WXT `createShadowRootUi` with no `anchor` option defaults to appending the shadow host to `document.body`. Page popovers appended later (or with equal z-index) paint on top.

**Fix:** Added `anchor: document.documentElement` and `append: 'last'` to `createShadowRootUi`. WXT's `mountUi` calls `anchor.append(root)` for the `'last'` mode, placing the shadow host as the **last child of `<html>`**. With equal `z-index: 2147483647` on `:host`, DOM paint order gives our host precedence.

**Limitation:** This is best-effort — a page that appends its own elements to `<html>` after our mount will still paint on top. A MutationObserver re-appender was explicitly rejected (complexity vs. gain). For the common case of `<body>`-rooted page UI and fixed popovers, this fix is sufficient.

---

## FIX 4 — Card drag viewport clamp invalid (SECONDARY)

**Commit:** `8ae3218`  
**File:** `entrypoints/review.content/card.ts`

**Root cause:** `interact.modifiers.restrictRect({ restriction: 'window' })` — interactjs treats the string `'window'` as a CSS selector, `document.querySelector('window')` returns `null`, so the restriction is silently a no-op. The card was not clamped to the viewport during drag.

**Fix:** Replaced the string with a function returning the current viewport rect:

```ts
restriction: () => ({ left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight })
```

`fab.ts` was already fixed by FIX 1 (interactjs removed); only `card.ts` needed this change.

---

## Verification

| Check | Result |
|-------|--------|
| `tsc --noEmit` (extension) | Exit 0 |
| `tsc --noEmit -p tsconfig.host.json` | Exit 0 |
| `npm run test:lib` (32 tests) | 32 pass, 0 fail |
| `npm test` (host — 57 tests) | 56 pass, 0 fail, 1 cancelled* |
| `npm run build` | Exit 0, `.output/chrome-mv3` regenerated |

*The `WR-06 bindServer port-scan` test was already failing before these changes (port 39240 is occupied by the running stickyfix host on this machine — confirmed by verifying failure is identical on the baseline commit).
