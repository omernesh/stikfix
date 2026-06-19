---
phase: 03-extension-skeleton-sw-relay-proof
fixed_at: 2026-05-31T00:00:00Z
review_path: .planning/phases/03-extension-skeleton-sw-relay-proof/03-REVIEW.md
iteration: 1
findings_in_scope: 15
fixed: 10
skipped: 5
status: partial
---

# Phase 3: Code Review Fix Report

**Fixed at:** 2026-05-31
**Source review:** `.planning/phases/03-extension-skeleton-sw-relay-proof/03-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 15 (3 Critical, 7 Warning, 5 Info)
- Fixed: 10 (all 3 Critical + 4 Warning + 3 Info)
- Skipped: 5 (WR-04 and WR-05 deferred; IN-04 trivial non-issue)

---

## Fixed Issues

### CR-01: `<all_urls>` hoisted into `host_permissions` — PRD §7.1 violation

**Files modified:** `wxt.config.ts`
**Commit:** `5ac6675`
**Applied fix:** Added a `build:manifestGenerated` hook that filters `<all_urls>` from `manifest.host_permissions` after WXT's generation. WXT unions WAR matches (from `cssInjectionMode:'ui'`) into host_permissions; the hook strips it post-generation while leaving `optional_host_permissions: ['<all_urls>']` intact. Also removed the now-unnecessary `@ts-ignore` (WXT 0.20.x types include `optional_host_permissions` — no suppression needed).

**Verification:** `npm run build` exits 0. Manifest asserted:
```
host_permissions: ["http://127.0.0.1/*","http://localhost/*"]
optional_host_permissions: ["<all_urls>"]
content_scripts: []
```

---

### CR-02: Refresh button unreachable when hosts exist (EXT-10 scenario broken)

**Files modified:** `entrypoints/popup/index.html`, `wxt.config.ts`
**Commit:** `9095546`
**Applied fix:** Moved `#sfx-refresh-btn` from inside `#sfx-empty-state` to the `<header>` element, making it always visible regardless of host-list state. The empty-state section retains its hint text only. The existing `doRefresh` listener and `refreshBtn` DOM reference in `main.ts` required no changes (same element ID).

---

### CR-03: Chip drag clamp can place chip off-screen (offsetWidth read before layout)

**Files modified:** `entrypoints/review.content/chip.ts`
**Commit:** `3b19076`
**Applied fix:** Two changes:
1. Deferred `makeDraggable(chip)` call to after all structural children (dot, label, feedback, send button, exit button) are appended to the chip, so the initial `getBoundingClientRect()` at `pointerdown` reflects real painted dimensions.
2. Rewrote `pointermove` clamp to recompute `w`/`h` from live `offsetWidth`/`getBoundingClientRect()` at every move event (guarded against zero), and wrapped the clamp ceiling with `Math.max(0, ...)` to prevent negative max bounds on genuinely zero-size elements.

---

### WR-01: `handleSendAnnotation` forwards unvalidated host JSON to content script

**Files modified:** `entrypoints/background.ts`
**Commit:** `7875b43`
**Applied fix:** Replaced `return resp.json() as Promise<AnnotationResponse>` with explicit parsing + shape validation. If the host returns 200 with `{file:string, serial:number}`, those values are forwarded. Any other shape (missing fields, non-JSON, `{ok:false}`) returns `{ok:false, error:'Malformed host response (missing file/serial)'}` so the chip shows a real inline error instead of "sent ✓ undefined".

---

### WR-02: Chip callbacks dereference `resp` without null-guard

**Files modified:** `entrypoints/review.content/chip.ts`
**Commit:** `bf1d5ea`
**Applied fix:** All three `sendMessage` callbacks (`GET_ROUTE`, `SET_ROUTE`, `SEND_ANNOTATION`) now type `resp` as `T | undefined` and guard with `if (chrome.runtime.lastError || !resp)` before any property access. Each guard surfaces an inline error message via `showFeedback` or by setting `label.textContent`.

---

### WR-03: `unmapped:` in-band error-string signal is fragile

**Files modified:** `entrypoints/background.ts`, `entrypoints/review.content/chip.ts`
**Commit:** `bf1d5ea`
**Applied fix:** `handleGetRoute` now returns `{ok:false, error:'No route for <origin>', reason:'unmapped', origin}` instead of `{ok:false, error:'unmapped:<origin>'}`. `RouteErrResponse` interface in chip.ts gains `reason?: 'unmapped'`. The chip's `GET_ROUTE` callback now branches on `resp.reason === 'unmapped'` (typed discriminator) rather than `resp.error.startsWith('unmapped:')` (fragile string match). `RouteResponse` in background.ts updated to reflect the optional reason/origin fields on the error variant.

---

### WR-06: `readPageSelfId` result cast to `string` without validation

**Files modified:** `entrypoints/background.ts`
**Commit:** `c4aaf35`
**Applied fix:** The probe result is now validated: `typeof raw === 'string' && raw.length > 0 && raw.length < 128` before use as a registry key. Any non-string, empty, or oversized value becomes `null`, preventing adversarial page content from being persisted into `originMap`.

---

### WR-07: EXIT via page `CustomEvent` forgeable by page scripts

**Files modified:** `entrypoints/background.ts`, `entrypoints/review.content/index.ts`
**Commit:** `44e6fed`
**Applied fix:** `handleExitReview` now uses `chrome.tabs.sendMessage(tabId, {type: SFX_MSG.EXIT_REVIEW, tabId})` instead of injecting a script that dispatches a `window CustomEvent`. The content script registers a `chrome.runtime.onMessage` listener that calls `ui.remove()` on receipt of `EXIT_REVIEW`. The listener is cleaned up via `ctx.onInvalidated`. Page scripts cannot forge a chrome.runtime message — the trust boundary is correctly maintained.

---

### IN-01: Debug `console.log` in production SW

**Files modified:** `entrypoints/background.ts`
**Commit:** `c4aaf35`
**Applied fix:** `console.log('stikfix SW loaded')` is now gated behind `if (import.meta.env.DEV)`.

---

### IN-02: `handleGetRoute` falls back to page-supplied `originFromMsg` when tab has no URL

**Files modified:** `entrypoints/background.ts`
**Commit:** `c4aaf35`
**Applied fix:** When `tab.url` is absent, `handleGetRoute` now returns `{ok:false, error:'Cannot determine tab origin (tab has no URL)'}` instead of falling back to the untrusted `originFromMsg`. The parameter is retained in the signature (prefixed `_originFromMsg`) for API compatibility with the existing message router call.

---

### IN-05: Inconsistent `browser.scripting` vs `chrome.scripting` usage

**Files modified:** `entrypoints/background.ts`
**Commit:** `0c70ed9`
**Applied fix:** The self-id probe `executeScript` call (previously `browser.scripting`) was converted to `chrome.scripting` to match the rest of `handleEnterReview`. The `handleExitReview` browser.scripting call was already removed by the WR-07 fix.

---

## Skipped Issues

### WR-04: Persisted-but-offline hosts never evicted; `reconcileRegistry` can resurrect renamed host

**File:** `lib/routing.ts:77-94`
**Reason:** Deferred by design — the REVIEW itself notes "For a relay-proof phase this is acceptable." Adding `lastSeen` timestamp and eviction policy requires a storage migration plan and UI changes (graying out stale hosts). Scoped to Phase 4-6 per the fix-scope instructions.
**Original issue:** Stale/dead projects accumulate in the registry and dropdown with no TTL or eviction.

---

### WR-05: Dropdown reads `sfxRegistry` from `chrome.storage.local` directly, bypassing SW relay

**File:** `entrypoints/review.content/chip.ts:266-285`
**Reason:** Fix requires adding a `LIST_HOSTS` SW message type, which expands the message protocol surface — a Phase 4 scope item. The current approach is documented with a comment in chip.ts explaining the workaround and its known layering trade-off. Skipped per fix-scope guidance ("skip anything that expands scope into Phase 4-6").
**Original issue:** Content script reads registry storage key directly instead of going through SW relay; reads entries with `token:null`.

---

### IN-03: `@ts-ignore` on `optional_host_permissions` should be `@ts-expect-error`

**File:** `wxt.config.ts:17`
**Reason:** Resolved differently — the CR-01 fix discovered that WXT 0.20.x types DO include `optional_host_permissions`, making any suppression directive unnecessary. The `@ts-ignore` was removed entirely (rather than converted to `@ts-expect-error`) as part of the CR-02 commit. IN-03 is fully resolved.

---

### IN-04: `resolveRoute` step 1 uses `Array.find` — nondeterministic on duplicate origins

**File:** `lib/routing.ts:32-34`
**Reason:** Edge case with no practical impact in the current implementation. The REVIEW itself classifies this as a tiebreak concern for duplicate-origin host configurations that do not exist in Phase 3. A deterministic tiebreak (e.g., lowest port) is a non-breaking enhancement better suited for Phase 4 when multi-host configurations are fully exercised.
**Original issue:** Two hosts advertising the same origin yield a first-match result with no documented precedence rule.

---

## Verification Results

```
npm run build    → exit 0
npm run check    → exit 0

manifest.json host_permissions = ["http://127.0.0.1/*","http://localhost/*"]  (NO <all_urls>)
manifest.json optional_host_permissions = ["<all_urls>"]
manifest.json content_scripts = []

tsc --noEmit              PASS (0 errors)
tsc --noEmit -p tsconfig.host.json  PASS (0 errors)
clean-room audit          PASS — no banned identifiers found
host-smoke-test           PASS
test:lib (routing+discovery)  22/22 PASS
test (host)               48/48 PASS
Total                     70/70 PASS
```

---

_Fixed: 2026-05-31_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
