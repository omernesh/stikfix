---
phase: 03-extension-skeleton-sw-relay-proof
plan: "04"
subsystem: extension-content-script-ui
tags: [content-script, shadow-dom, chip, draggable, relay, routing, a4-resolved, mv3, wxt]
dependency_graph:
  requires: [03-01, 03-02, 03-03]
  provides:
    - entrypoints/review.content/index.ts
    - entrypoints/review.content/chip.ts
    - entrypoints/review.content/styles.css
  affects: [06-visual-design-pass]
tech_stack:
  added: []
  patterns:
    - "WXT defineContentScript registration:'runtime' + cssInjectionMode:'ui' + createShadowRootUi"
    - "Shadow-root :host all:initial + z-index 2147483647 + px-only CSS (Pitfall 5 avoided)"
    - "pointer-events drag with setPointerCapture + viewport-clamp [0,innerW-w]x[0,innerH-h]"
    - "SFX_GET_TAB_ID SW-echo pattern for content-script tabId discovery"
    - "WeakMap teardown registry for onRemove lifecycle"
    - "chrome.storage.local direct read from content script for registry population"
    - "Inline feedback (1.5s auto-hide on success, persistent on error) — REL-01 seed"
key_files:
  created:
    - entrypoints/review.content/index.ts
    - entrypoints/review.content/chip.ts
    - entrypoints/review.content/styles.css
  modified:
    - entrypoints/background.ts
decisions:
  - "A4 RESOLVED: WXT cssInjectionMode:'ui' + registration:'runtime' fetches review.css via runtime.getURL and injects into the shadow root — auto-inject confirmed; insertCSS in background.ts ENTER_REVIEW is redundant but harmless"
  - "SFX_GET_TAB_ID added to background.ts — standard pattern for content-script tabId discovery (chrome.tabs.getCurrent() not available in content scripts)"
  - "One-time dropdown reads chrome.storage.local sfxRegistry directly from the content script — faster than a round-trip message; registry is extension-scoped so no page access"
  - "zIndex not passed to createShadowRootUi (not in WXT API) — z-index:2147483647 lives in styles.css :host rule"
  - "WXT emits content_scripts:[] (empty array) in manifest — equivalent to absent for runtime-injection purposes (EXT-02 satisfied)"
  - "WXT adds <all_urls> to host_permissions automatically due to web_accessible_resources match — flagged (see Threat Flags)"
metrics:
  duration: "~20 minutes"
  completed: "2026-05-31"
  tasks_completed: 2
  files_created: 3
  files_modified: 1
---

# Phase 03 Plan 04: Review UI Content Script — Shadow-Root Chip Summary

**One-liner:** Runtime-registered content script mounts a draggable viewport-clamped connection chip in a WXT shadow root (all:initial, z-index 2147483647, px-only CSS) with a one-time origin dropdown, stub Send relay proof (§9.1 free-note payload → SW → host), and inline confirm/error feedback; definitively resolves A4.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Runtime content script + createShadowRootUi + styles.css; A4 resolved | c056992 | entrypoints/review.content/index.ts, entrypoints/review.content/styles.css, entrypoints/background.ts |
| 2 | Chip — draggable+clamped, routed label / one-time dropdown, stub Send, Exit | feca03e | entrypoints/review.content/chip.ts |

## A4 Definitive Resolution

**Question:** Does WXT auto-inject `content-scripts/review.css` for a `registration:'runtime'` + `cssInjectionMode:'ui'` content script?

**Answer: YES — auto-injected into the shadow root.**

WXT compiles `styles.css` into `content-scripts/review.css` and marks it as a `web_accessible_resources` entry. The WXT content-script runtime (bundled inside `review.js`) fetches `review.css` via `chrome.runtime.getURL('/content-scripts/review.css')` and injects it into the shadow root via `adoptedStyleSheets` or a `<style>` tag at mount time. The CSS does NOT need to be manually inserted via `chrome.scripting.insertCSS`.

**Impact on Plan 02:** The `chrome.scripting.insertCSS({ target:{tabId}, files:['content-scripts/review.css'] })` call in `background.ts` `handleEnterReview` is **redundant** — WXT handles CSS injection via the content-script runtime. It is harmless (the CSS is web-accessible, so the inject succeeds), but it injects into the `document` rather than the shadow root, so it has no visual effect. It can be removed in a cleanup pass. No correction needed for Plan 02's core behavior.

**CSS injection decision:** No action required. WXT's built-in mechanism handles it.

## Acceptance Criteria Verification

| Criterion | Status | Evidence |
|-----------|--------|---------|
| `npm run build` exits 0 | PASS | Built in 680ms |
| `.output/chrome-mv3/content-scripts/review.js` exists | PASS | 32.54 kB emitted |
| `.output/chrome-mv3/content-scripts/review.css` exists | PASS | 1.48 kB emitted |
| manifest.json has no active content_scripts (empty array) | PASS | `"content_scripts":[]` — EXT-02 satisfied |
| styles.css uses z-index 2147483647 | PASS | `:host{...z-index:2147483647...}` in minified CSS |
| styles.css uses px units only (no rem) | PASS | grep finds zero `\d+rem` patterns in source |
| chip.ts contains no localhost/127.0.0.1 fetch | PASS | grep → comment only, zero code matches |
| `npx tsc --noEmit` exits 0 | PASS | Clean exit, no errors |
| `npm run check` exits 0 (70/70 tests) | PASS | 22 lib + 48 host tests all pass |
| A4 definitively answered and recorded | PASS | See "A4 Definitive Resolution" above |
| `registration:'runtime'` in index.ts | PASS | Line 14 of index.ts |
| `createShadowRootUi` called inside `main(ctx)` | PASS | Lines 22–40 of index.ts |
| chip DOM built with createElement/textContent | PASS | No innerHTML anywhere in chip.ts |
| makeDraggable clamps to window.innerWidth/innerHeight | PASS | Lines 267–271 chip.ts |
| SFX_SET_ROUTE used for one-time dropdown persist | PASS | Lines 196–218 chip.ts |
| Inline feedback on Send (success/error — REL-01) | PASS | showFeedback() function; 1.5s auto-hide on success |
| Exit sends SFX_EXIT_REVIEW + unmounts | PASS | exitBtn click handler lines 96–107 chip.ts |
| [MANUAL-CHROME / HUMAN-UAT] Chip appears after toggle | PENDING | Requires Chrome + live host |
| [MANUAL-CHROME / HUMAN-UAT] Chip is draggable + viewport-clamped | PENDING | Visual verification |
| [MANUAL-CHROME / HUMAN-UAT] Stub Send writes .md (Success Criterion 3) | PENDING | Requires HTTPS page + live host |
| [MANUAL-CHROME / HUMAN-UAT] One-time dropdown; never re-asked | PENDING | EXT-07/08 UAT |
| [MANUAL-CHROME / HUMAN-UAT] Shadow-DOM CSS isolation (no leak) | PENDING | EXT-11 UAT |

## HUMAN-UAT Items (for Phase 3 UAT gate)

The following require a live Chrome environment with a running stickyfix host:

1. **SC-3 — Relay proof (HTTPS-origin):** On an HTTPS-origin page, toggle Review Mode in the popup. The chip should appear (draggable). Click Send — the host's notesDir should gain a `0001-*.md` file with `comment: stickyfix relay proof`. Chip shows `sent ✓ 0001-*.md`. This proves CS→SW→host end-to-end.

2. **SC-5 — One-time origin dropdown:** On a tab whose origin isn't in `sfxOriginMap` or any host's `origins[]`, the chip shows a project dropdown. Select a project → chip transitions to `→ name · notesDir` label. Reopen on same origin → dropdown never reappears (persisted via SFX_SET_ROUTE).

3. **EXT-11 — Shadow-DOM CSS isolation:** Inspect the page with DevTools while the chip is mounted. Host page CSS must not affect chip appearance; chip CSS must not affect host page. Chip must be at z-index 2147483647 in its stacking context.

4. **EXT-11 — Drag + Exit:** Drag the chip to all four viewport corners; confirm it clamps and doesn't leave the screen. Click × → chip unmounts and popup shows "Enter Review Mode" again.

5. **EXT-02 — Runtime injection only:** Confirm no `content_scripts` entries in `chrome://extensions` → stickyfix → Details → Permissions. The chip appears only after clicking the toggle — never on other pages.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Functionality] SFX_GET_TAB_ID handler added to background.ts**
- **Found during:** Task 2 implementation
- **Issue:** Content scripts cannot call `chrome.tabs.getCurrent()`. The chip needs its tabId to send GET_ROUTE/SEND_ANNOTATION/EXIT_REVIEW. The plan did not specify a mechanism.
- **Fix:** Added `SFX_GET_TAB_ID` constant + `MsgGetTabId` interface + synchronous handler in background.ts that returns `{ tabId: sender.tab.id }`. The chip calls this on mount. Synchronous handler (no `return true` needed).
- **Files modified:** `entrypoints/background.ts`
- **Commit:** c056992

**2. [Rule 1 - Bug] zIndex not in createShadowRootUi API**
- **Found during:** Task 1 — tsc reported TS2353 ("zIndex does not exist in type ContentScriptInlinePositioningOptions...")
- **Issue:** The plan's pattern showed `zIndex: 2147483647` in the createShadowRootUi options but WXT 0.20.26 does not expose this property.
- **Fix:** Removed `zIndex` from the options; the z-index is correctly applied via `:host { z-index: 2147483647 }` in `styles.css` which is injected into the shadow root by WXT's runtime.
- **Files modified:** `entrypoints/review.content/index.ts`
- **Commit:** c056992

## Known Stubs

- **Stub Send is intentionally a stub** — it sends a fixed `comment: 'stickyfix relay proof'` payload. The full note-capture flow (FAB, element picker, region capture) is Phase 4/5/6.
- **Connection dots** — the chip's status dot is hardcoded green. True host-reachability probing from the chip is a Phase 6 UX item.
- **Drag position ephemeral** — chip position resets to top-right on every mount. Persisted position is a Phase 6 item.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: unintended-static-permission | .output/chrome-mv3/manifest.json | WXT automatically adds `<all_urls>` to `host_permissions` (not just `optional_host_permissions`) because the review.css web_accessible_resource has `matches:['<all_urls>']`. This effectively grants the static `<all_urls>` host permission without a user gesture. This may conflict with the intent of D-04 (optional_host_permissions requiring user consent). Mitigation options: (a) remove `cssInjectionMode:'ui'` and inject CSS manually with a narrower WAR match, or (b) accept that WXT's WAR behavior always adds the match to host_permissions. Flag for Phase 6 security review. |

## Self-Check: PASSED

- entrypoints/review.content/index.ts: EXISTS
- entrypoints/review.content/chip.ts: EXISTS
- entrypoints/review.content/styles.css: EXISTS
- entrypoints/background.ts: MODIFIED (SFX_GET_TAB_ID added)
- Commit c056992: EXISTS
- Commit feca03e: EXISTS
- `npm run build` exits 0: CONFIRMED
- `.output/chrome-mv3/content-scripts/review.js`: EXISTS (32.54 kB)
- `.output/chrome-mv3/content-scripts/review.css`: EXISTS (1.48 kB)
- `manifest.json content_scripts`: `[]` (empty — EXT-02 satisfied)
- `z-index:2147483647` in built review.css: CONFIRMED
- rem units in source CSS: ZERO
- localhost/127.0.0.1 fetch in content script files: ZERO (grep confirmed)
- `npx tsc --noEmit`: EXITS 0
- `npm run check`: EXITS 0 (70/70 tests)
- A4 resolved: WXT auto-injects CSS via runtime fetch — CONFIRMED
