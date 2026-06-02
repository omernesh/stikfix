---
phase: 6
slug: region-capture-visual-design
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-03
source: [06-RESEARCH.md]
---

# Phase 6 — Validation Strategy

> Per-phase validation contract. The marquee rect/DPR math, URL-path matcher,
> pin-position math, and the host serial→file resolver / list / edit / delete
> functions are pure and unit-testable (`node:test`, mirroring Phase 4/5). The
> marquee UI, region crop, thumbnail attach, paper-aesthetic CSS isolation, and
> live on-page pin rendering/edit/delete are Chrome-runtime-bound and verified
> by manual UAT.
>
> Sampling-continuity note (Nyquist): `computePinPosition` is a PURE DOM-free
> function in `lib/pin-position.ts` (Plan 06-01 Task 1), unit-tested in
> `lib/test/pin-position.test.ts`. Plan 06-04's `pin.ts` IMPORTS it and supplies
> only `el.getBoundingClientRect()` + `window.scrollX/scrollY` as glue. This
> gives Plan 06-04's Wave-3 auto tasks (Tasks 1–3) automated behavioral coverage
> for the pin-position math even though their per-task `<verify>` is `npm run build`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` + `node:assert/strict` (Node built-in) for pure lib + host logic; manual Chrome UAT for runtime-bound UI |
| **Config file** | `tsconfig.lib.json` (extend `include` with `lib/marquee.ts`, `lib/pin-position.ts`) + `tsconfig.host.json` (extend with `host/src/read-note.ts`) |
| **Quick run command** | `npm run test:lib` |
| **Full suite command** | `npm run check` (tsc ×2 + clean-room grep + host tests + all node:test) |
| **Estimated runtime** | ~30–50 seconds (WXT build dominates) |

---

## Sampling Rate

- **After every task commit:** `npm run test:lib` (pure unit tests, < 5s)
- **After every plan wave:** `npm run check` (full)
- **Before `/gsd:verify-work`:** full suite green, then manual Chrome UAT (Success Criteria 1–6)
- **Max feedback latency:** 50 seconds

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| CAM-03 | `buildMarqueeRect` + `isBelowThreshold` — rect math, DPR, <6px threshold | unit | `npm run test:lib` | ❌ W0: `lib/test/marquee.test.ts` | ⬜ pending |
| PIN-01/02 | `matchesUrlPath` — exact path match, query ignored | unit | `npm run test:lib` | ❌ W0: `lib/test/pin-position.test.ts` | ⬜ pending |
| PIN-02/03 | `computePinPosition(anchorRect, storedRect, scrollX, scrollY, orphaned)` — pure DOM-free: element-anchored / free-floating / orphaned-fallback-at-last-known-rect math (lives in `lib/pin-position.ts`, imported by `pin.ts`) | unit | `npm run test:lib` | ❌ W0: `lib/pin-position.ts` + `lib/test/pin-position.test.ts` | ⬜ pending |
| HOST-14 | `listAnnotations` — reads frontmatter, path matches (imports matchesUrlPath), serial extraction, `note_position`→`viewportCoords` | unit | `npm test` | ❌ W0: `host/test/read-note.test.ts` | ⬜ pending |
| HOST-15 | `editNote` — overwrites body, preserves frontmatter, re-marks unread | unit | `npm test` | ❌ W0: `host/test/read-note.test.ts` | ⬜ pending |
| HOST-16 | `deleteNote` — removes .md + +N.png; 404 if not found; path-confined | unit | `npm test` | ❌ W0: `host/test/read-note.test.ts` | ⬜ pending |
| HOST-14 | `GET /annotations?url=…` route — token gate, 200 + JSON, CORS | integration | `npm test` | ❌ W0: extend `host/test/server.test.ts` | ⬜ pending |
| HOST-15 | `PUT /annotation/<serial>` route — 404 / 200 / 401 / path-confined / 413 | integration | `npm test` | ❌ W0: extend `host/test/server.test.ts` | ⬜ pending |
| HOST-16 | `DELETE /annotation/<serial>` route — 404 / 200 / 401 | integration | `npm test` | ❌ W0: extend `host/test/server.test.ts` | ⬜ pending |
| CAM-01..06 | Marquee UI, scrim+crosshair, region crop, deletable thumbnails, Send with +N.png | manual | — (Chrome runtime) | 🟡M |
| UI-01..04 | Paper aesthetic, mode header strips, styled toasts, no CSS bleed (Tailwind + reset page) | manual | — (visual, Chrome runtime) | 🟡M |
| PIN-01..06 | Pin rendering (positioned via the unit-tested computePinPosition), anchored/floating/orphaned, scroll/resize reposition, click → card, edit (PUT), delete (DELETE) | manual | — (Chrome runtime + host) | 🟡M |

*Status: ⬜ pending · ✅ green · 🟢M manual-verified · 🟡M manual-deferred · ❌ red.*

---

## Wave 0 Requirements

- [ ] `lib/marquee.ts` — `buildMarqueeRect`, `isBelowThreshold` (pure, node:test-safe; no top-level chrome/document/window)
- [ ] `lib/pin-position.ts` — `matchesUrlPath` + `computePinPosition` (BOTH pure, DOM-free, node:test-safe; computePinPosition takes scrollX/scrollY as params — never reads window.scrollX)
- [ ] `lib/test/marquee.test.ts` — rect math, sub-threshold cancel, DPR scaling
- [ ] `lib/test/pin-position.test.ts` — URL path match (query ignored) + computePinPosition: element-anchored, free-floating, orphaned-fallback at last-known rect
- [ ] `host/src/read-note.ts` — `resolveSerialFile`, `listAnnotations` (imports matchesUrlPath from lib/pin-position; reads `fm['note_position']` → `viewportCoords`), `editNote`, `deleteNote` (path-confined via `isInsideDir`)
- [ ] `host/src/write-note.ts` — buildFrontmatter writes canonical `note_position` (free) + `rect` (element); no `viewport_coords`
- [ ] `host/test/read-note.test.ts` — unit tests for all four functions (incl. note_position round-trip)
- [ ] Extend `host/test/server.test.ts` — `GET /annotations`, `PUT /annotation/<serial>`, `DELETE /annotation/<serial>` routes
- [ ] Extend `tsconfig.lib.json` include (`lib/marquee.ts`, `lib/pin-position.ts`) + `tsconfig.host.json` include (`host/src/read-note.ts`); wire into `npm run test:lib` / `npm test`

*Pure rect/path/position/CRUD logic is unit-tested; Chrome-API-bound UI is manual Chrome UAT.*

---

## Manual-Only Verifications (Chrome UAT — Success Criteria 1–6)

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Camera tool dims page (scrim) + crosshair; Esc / sub-6px drag cancels | CAM-01/02/03 | Live pointer events + scrim DOM | Open a note → 📷 → drag a region (thumbnail attaches); Esc and a tiny drag both cancel cleanly |
| Region crop + multi-thumbnail + Send | CAM-04/05/06 | Native captureVisibleTab + paint timing | Drag two regions → two deletable thumbnails (+1/+2) → delete one → Send → `.md` records remaining `+N.png`, host writes the PNGs |
| Paper aesthetic + CSS isolation | UI-01/02/03/04 | Visual + shadow-DOM bleed | Verify warm paper card, mode-colored header (free vs element), styled toasts; no CSS bleed on a Tailwind-heavy and a CSS-reset-heavy page |
| Pins rehydrate from disk on review-entry | PIN-01/02/04 | Live host GET + DOM anchoring (math itself unit-tested via computePinPosition) | Re-enter Review Mode on the same URL → one pin per note for that path; element pins on their element (reposition on scroll/resize), free pins floating; mode color + unread/read dot + hover preview |
| Orphaned pin fallback | PIN-03 | DOM-dependent (fallback math unit-tested via computePinPosition orphaned case) | Navigate so a pinned element is gone → pin shows greyed/dashed at last-known rect with tooltip, never hidden |
| Pin click → view/edit/delete | PIN-05/06 | Live host PUT/DELETE | Click a pin → card opens; edit text → PUT overwrites same serial in place (re-marked unread); delete (confirm) → DELETE removes `.md` + `+N.png`; pin updates/disappears; failures surface a toast |

---

## Validation Sign-Off

- [ ] Pure lib functions (marquee rect/threshold, url-path match, computePinPosition) have `node:test` coverage
- [ ] Host functions (serial→file resolve, list, edit, delete) have `node:test` coverage + route integration tests
- [ ] Type-check (`tsc --noEmit`) green for extension + host
- [ ] `tsconfig.lib.json` + `tsconfig.host.json` updated; `npm run test:lib` and `npm test` green
- [ ] No watch-mode flags
- [ ] Manual Chrome UAT items recorded as HUMAN-UAT (Success Criteria 1–6)
- [ ] `nyquist_compliant: true` set in frontmatter once Wave 0 lands

**Approval:** pending
</content>
