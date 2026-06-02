---
phase: 5
slug: element-note-mode-rich-context-capture
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-02
source: [05-RESEARCH.md]
---

# Phase 5 — Validation Strategy

> Per-phase validation contract. The element-context extraction, selector wrapping,
> React fiber-name walk, test-id lookup, summary formatting, and highlight-box canvas
> math are pure and unit-testable in `node:test` (mirrors Phase-4 `computeCropCoords`).
> The picker hover-overlay lifecycle, the `+1.png` own-UI-absent capture, and the
> end-to-end `.md` on disk are Chrome-runtime-bound and verified by manual UAT.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` + `node:assert` (Node built-in, no install) for pure lib logic; manual Chrome UAT for runtime-bound UI |
| **Config file** | `tsconfig.lib.json` — `include` extended to add `lib/element-context.ts` + `lib/highlight-draw.ts` |
| **Quick run command** | `npm run test:lib` |
| **Full suite command** | `npm run check` (tsc ×2 + clean-room grep + host smoke + all node:test) |
| **Estimated runtime** | ~25–45 seconds (WXT build dominates) |

---

## Sampling Rate

- **After every task commit:** `npm run test:lib` (pure unit tests, < 5s)
- **After every plan wave:** `npm run check` (full)
- **Before `/gsd:verify-work`:** full suite green, then manual Chrome UAT (Success Criteria 1–4)
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| ELEM-02 | `buildSelector` wraps `finder` + tagName fallback on throw | unit | `npm run test:lib` | ❌ W0: `lib/test/element-context.test.ts` | ⬜ pending |
| ELEM-03 | `captureElementContext` extracts tag/id/classList/role/ariaLabel; text truncation @~1000 | unit | `npm run test:lib` | ❌ W0: `lib/test/element-context.test.ts` | ⬜ pending |
| ELEM-04 | `CURATED_STYLE_PROPS` length ~25; `outerHTML` slice @2000 | unit | `npm run test:lib` | ❌ W0: `lib/test/element-context.test.ts` | ⬜ pending |
| ELEM-05 | `getReactComponentName` returns name from mock fiber; `undefined` w/o `__reactFiber$`; max-steps guard | unit | `npm run test:lib` | ❌ W0: `lib/test/element-context.test.ts` | ⬜ pending |
| ELEM-06 | `nearestTestId` returns own / ancestor `data-testid`; `undefined` if none | unit | `npm run test:lib` | ❌ W0: `lib/test/element-context.test.ts` | ⬜ pending |
| ELEM-07 | `buildContextSummary` formats variants (no text / no component / no id) | unit | `npm run test:lib` | ❌ W0: `lib/test/element-context.test.ts` | ⬜ pending |
| ELEM-08 | `drawHighlightBox` strokes/fills DPR-scaled coords (mock ctx records calls) | unit | `npm run test:lib` | ❌ W0: `lib/test/highlight-draw.test.ts` | ⬜ pending |
| ELEM-01 | Hover overlay appears/moves/hides; single-shot pick state machine; Esc exits cleanly | manual | — (Chrome runtime) | 🟡M |
| ELEM-08 | `+1.png` shows page + box, no sfx own-UI visible (D-02a) | manual | — (Chrome runtime + paint) | 🟡M |
| ELEM-09 | `.md` on disk has frontmatter + element section + styles table + truncated outerHTML | manual | — (end-to-end host) | 🟡M |

*Status: ⬜ pending · ✅ green · 🟢M manual-verified · 🟡M manual-deferred · ❌ red.*

---

## Wave 0 Requirements

- [ ] `npm install @medv/finder@4.0.2` — must precede any import of the package compiling
- [ ] `tsconfig.lib.json` `include` extended — add `lib/element-context.ts`, `lib/highlight-draw.ts`
- [ ] `lib/test/element-context.test.ts` — ELEM-02, 03, 04, 05, 06, 07 (mock-element / mock-fiber driven; do NOT call real `finder` or real DOM)
- [ ] `lib/test/highlight-draw.test.ts` — ELEM-08 canvas math (mock canvas ctx with recorded calls)

*Pure extraction/format/canvas-math is unit-tested; Chrome-API-bound UI is manual Chrome UAT.*

---

## Manual-Only Verifications (Chrome UAT — Success Criteria 1–4)

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Hover outline + cursor-following `tag · WxH` label; Esc cancels | ELEM-01 | Live Chrome injection + pointer events | Enter Review Mode → 🎯 picker → hover elements (outline + label follow) → Esc (no card) |
| Click → unique selector + pre-filled context post-it | ELEM-02 | Live page DOM + @medv/finder | Click an element → single post-it opens with read-only context header (`tag.class · "text" · <Component> · WxH`) |
| `.md` has selector + component + styles table + outerHTML + dataset + aria + testId + rect | ELEM-03,04,05,06,09 | Live host write | Send → `notes/000N-*.md` contains element-context section + curated styles table + truncated outerHTML |
| `+1.png` = full viewport + highlight box, no own-UI | ELEM-08 | SW-only capture + paint timing + D-02a | Send → `+1.png` shows the page with a box on the element; chip/FAB/overlay absent from the image |

---

## Validation Sign-Off

- [ ] Pure lib functions (selector wrap, context extraction, fiber-name, testId, summary, highlight math) have `node:test` coverage
- [ ] Type-check (`tsc --noEmit`) green for extension + host
- [ ] `tsconfig.lib.json` updated; `npm run test:lib` green (existing 32 + new)
- [ ] No watch-mode flags
- [ ] Manual Chrome UAT items recorded as HUMAN-UAT (Success Criteria 1–4)
- [ ] `nyquist_compliant: true` set in frontmatter once Wave 0 lands

**Approval:** pending
