---
phase: 03-extension-skeleton-sw-relay-proof
reviewed: 2026-05-31T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - wxt.config.ts
  - entrypoints/background.ts
  - entrypoints/popup/main.ts
  - entrypoints/review.content/index.ts
  - entrypoints/review.content/chip.ts
  - lib/types.ts
  - lib/storage.ts
  - lib/routing.ts
  - lib/discovery.ts
findings:
  critical: 3
  warning: 7
  info: 5
  total: 15
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-05-31
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 3 implements the WXT MV3 skeleton and the SW relay proof. The core security architecture is sound: the service worker is the only HTTP client, origin is derived from `chrome.tabs.get(tabId).url` (not the message body) in every relay/route handler, storage is re-read at the top of each handler with zero module-scope mutable state, and DOM is built with `createElement`/`textContent` (no `innerHTML`). The `permissions.request` ordering in the popup toggle is correct (first awaited call in the enter branch).

However the review surfaced **3 BLOCKERs**: (1) the confirmed `<all_urls>` privacy/scope regression in the built manifest's `host_permissions` — a direct PRD §7.1 violation; (2) the popup **Refresh button is unreachable** in the non-empty/host-present state because it lives only inside the `hidden` empty-state section, so users with hosts cannot refresh, and any token-input `blur` calls `renderHosts` which never re-wires it; (3) a **draggable viewport-clamp bug** that lets the chip escape the viewport on the first drag after the page has scrolled / on a fresh-position drag because `origLeft/origTop` are read from `getBoundingClientRect()` while `right:16px` is still in effect, but the clamp uses the wrong baseline when `offsetWidth` is 0 during async label population.

The relay correctness, MV3 ephemerality handling, and pure routing/discovery logic are largely correct, with the warnings below covering response-shape mismatches and silent-failure edges the PRD forbids.

## Critical Issues

### CR-01: `<all_urls>` hoisted into `host_permissions` — privacy/scope regression (PRD §7.1)

**File:** `wxt.config.ts:14-21` (root cause) → built `.output/chrome-mv3/manifest.json` `host_permissions`
**Issue:** The built manifest contains:
```json
"host_permissions":["http://127.0.0.1/*","http://localhost/*","<all_urls>"],
"web_accessible_resources":[{"resources":["content-scripts/review.css"],"use_dynamic_url":true,"matches":["<all_urls>"]}]
```
`<all_urls>` is granted **at install time** in `host_permissions`. PRD §7.1 mandates holding ONLY localhost host_permissions at install and requesting `<all_urls>` **on demand** via `optional_host_permissions`. This is a real privacy regression — the extension prompts "read and change all your data on all websites" at install, defeating the entire on-demand-grant design (the popup's `chrome.permissions.request({origins:['<all_urls>']})` becomes a no-op because the permission is already granted).

**Root cause:** WXT auto-derives `host_permissions` from `web_accessible_resources[].matches`. The runtime-registered content script (`review.content/index.ts`) declares `matches: ['<all_urls>']`, and its `cssInjectionMode:'ui'` emits `review.css` as a WAR with `matches:['<all_urls>']`. WXT then unions those match patterns into `host_permissions`. `optional_host_permissions:['<all_urls>']` is present but does NOT remove the duplicate from `host_permissions`.

**Fix:** Constrain the WAR match pattern so it does not widen install-time host_permissions, and add a manifest post-processing hook to strip `<all_urls>` from `host_permissions` (it is re-acquired at runtime via the optional permission). Minimal approach:
```ts
// wxt.config.ts
export default defineConfig({
  manifest: {
    // ...
    host_permissions: ['http://127.0.0.1/*', 'http://localhost/*'],
    // @ts-ignore valid MV3 key
    optional_host_permissions: ['<all_urls>'],
  },
  hooks: {
    'build:manifestGenerated'(_wxt, manifest) {
      // Strip <all_urls> that WXT hoists from WAR/runtime-CS matches.
      // It is requested on demand via optional_host_permissions (PRD §7.1).
      manifest.host_permissions = (manifest.host_permissions ?? [])
        .filter((p) => p !== '<all_urls>');
    },
  },
});
```
Verify after rebuild that `host_permissions` contains exactly the two localhost patterns and that the runtime-injected CSS still loads (it will: `web_accessible_resources` controls page-readability of the CSS, not install-time host grants; runtime injection happens under the optional grant obtained in the popup). If the WAR `matches:['<all_urls>']` itself is judged too broad, also narrow `cssInjectionMode` handling — but the host_permissions strip is the load-bearing fix for the §7.1 violation.

### CR-02: Refresh button is unreachable whenever hosts exist — and is dropped on token edit

**File:** `entrypoints/popup/index.html:21-25`, `entrypoints/popup/main.ts:69-81, 198-218`
**Issue:** `#sfx-refresh-btn` lives **only inside `#sfx-empty-state`** (index.html line 24). `renderHosts()` sets `emptyStateEl.hidden = false` only when `names.length === 0`; otherwise `emptyStateEl.hidden = true` (main.ts:69-76). Therefore the moment any host is discovered, the Refresh button is hidden and the user **cannot trigger discovery again** (e.g., after restarting a host on a new port — the exact EXT-10 scenario this phase exists to prove). The discovery-on-wake handlers help, but a popup with hosts present has no manual refresh affordance. Additionally, `refreshBtn.addEventListener('click', doRefresh)` is bound once at module load (main.ts:218) against an element inside a section that gets `hidden` toggled — the listener survives, but the control is invisible/non-interactive, so the binding is dead in the host-present state.

This also means `doRefresh()` (which re-enables `refreshBtn` at line 214) runs against a hidden button — harmless but indicates the control was misplaced.

**Fix:** Move the Refresh button out of the empty-state section into a persistently-visible location (e.g., the header or the toggle section) so it is reachable in both states:
```html
<!-- in #sfx-header or a dedicated controls row, OUTSIDE #sfx-empty-state -->
<button id="sfx-refresh-btn" type="button">Refresh</button>
```
Keep the empty-state hint text but reference the always-visible button. Re-verify `doRefresh` re-render path still works after the move.

### CR-03: Drag clamp can place chip off-screen on first drag (offsetWidth read before layout/while label is a placeholder)

**File:** `entrypoints/review.content/chip.ts:82-89, 437-469`
**Issue:** `makeDraggable(chip)` is called at line 89 **immediately after `container.appendChild(chip)` and before any child content beyond the initial placeholder is added** — and crucially before the async `GET_ROUTE` response replaces the label or adds a dropdown (lines 129-158). On `pointerdown`, the clamp upper bounds use `window.innerWidth - el.offsetWidth` and `window.innerHeight - el.offsetHeight` (lines 460, 464). The chip is `position:fixed; top:16px; right:16px` (styles.css:28-31) until the first drag flips it to `left/top`. `origLeft = rect.left` is computed correctly from `getBoundingClientRect()`, so the start is fine. The escape bug is in `pointermove`: if the chip's width grows **after drag start** (label text expands from "stikfix…" to "→ longname · /very/long/notesDir", or the dropdown is inserted), `el.offsetWidth` increases mid-drag, but `origLeft + dx` was anchored to the smaller box. With a right-anchored chip the visible result is the chip extruding past the right/bottom edge because the clamp ceiling (`innerWidth - offsetWidth`) shifts downward while `origLeft` stays large — `Math.min` can still allow `origLeft` (already near the right edge) to render with the now-wider box overflowing left-of-clamp is fine, but the chip can be dragged such that its right edge exceeds `innerWidth` is prevented; the genuine escape is the **opposite axis and the placeholder case**: when `offsetWidth`/`offsetHeight` are read while the element has not yet been laid out (0), `innerWidth - 0 = innerWidth`, so `newLeft` can equal `innerWidth`, placing the entire chip one viewport-width off the right edge. Because the first pointer interaction can coincide with the not-yet-painted shadow host, this is reproducible.

**Fix:** Recompute the box dimensions at the start of each drag and guard against zero, and clamp using the live rect rather than a stale `offsetWidth`:
```ts
el.addEventListener('pointermove', (e: PointerEvent) => {
  if (!isDragging || !el.hasPointerCapture(e.pointerId)) return;
  const dx = e.clientX - startX;
  const dy = e.clientY - startY;
  const w = el.offsetWidth || el.getBoundingClientRect().width || 0;
  const h = el.offsetHeight || el.getBoundingClientRect().height || 0;
  const maxLeft = Math.max(0, window.innerWidth - w);
  const maxTop = Math.max(0, window.innerHeight - h);
  el.style.left = `${Math.max(0, Math.min(maxLeft, origLeft + dx))}px`;
  el.style.top = `${Math.max(0, Math.min(maxTop, origTop + dy))}px`;
});
```
Also defer `makeDraggable(chip)` until after the chip's structural children are appended (move the call below the exit button append at line 120) so the first `getBoundingClientRect()` reflects real dimensions.

## Warnings

### WR-01: `handleSendAnnotation` trusts the host's JSON response shape without validation

**File:** `entrypoints/background.ts:307-309`
**Issue:** On `resp.ok`, the code does `return resp.json() as Promise<AnnotationResponse>` — it casts the localhost host's raw JSON directly into the response sent back to the content script. If the host returns `200` with a body that lacks `ok`/`file`/`serial` (or returns `{ok:false}`), the content script's `wireSendButton` callback reads `resp.file` on a shape that may be undefined, rendering `sent ✓ undefined`. The relay should normalize the success shape.
**Fix:**
```ts
if (resp.ok) {
  const body = (await resp.json().catch(() => ({}))) as Partial<AnnotationResponse>;
  if (typeof body.file === 'string' && typeof body.serial === 'number') {
    return { ok: true, file: body.file, serial: body.serial };
  }
  return { ok: false, error: 'Malformed host response' };
}
```

### WR-02: Chip `GET_ROUTE` callback dereferences `resp.error`/`resp.host` without null-guarding `resp`

**File:** `entrypoints/review.content/chip.ts:136-153, 296-298, 362-373`
**Issue:** In the `GET_ROUTE` callback, after the `lastError` check the code does `if (resp.ok)` then `else if (resp.error.startsWith(...))`. If the SW ever responds with `undefined`/`null` (e.g., a handler that returns without `sendResponse`, or a future message-type the SW doesn't answer), `resp.ok` throws `Cannot read properties of undefined`. The `lastError` check does not cover a successful channel that returns `undefined`. Same pattern in the SET_ROUTE callback (line 297 guards `!resp.ok` but line 298 reads `resp?.ok` defensively — inconsistent) and the SEND_ANNOTATION callback (line 368 `resp.ok` unguarded).
**Fix:** Guard `resp` before property access in each callback:
```ts
if (chrome.runtime.lastError || !resp) { /* show SW error */ return; }
if (resp.ok) { ... }
```

### WR-03: `handleGetRoute` returns `unmapped:<origin>` as an error string the chip string-matches — fragile protocol

**File:** `entrypoints/background.ts:215`, `entrypoints/review.content/chip.ts:147`
**Issue:** The "unmapped" state is signaled by `{ok:false, error: 'unmapped:'+origin}` and the chip detects it with `resp.error.startsWith('unmapped:')`. Any change to that prefix silently breaks the dropdown path, and a genuine error whose message happens to start with `unmapped:` would be misrouted into the dropdown. This is an in-band signal masquerading as an error.
**Fix:** Add an explicit discriminator, e.g. `{ok:false, reason:'unmapped', origin}` and branch on `resp.reason === 'unmapped'`. Keep `error` for true failures.

### WR-04: Persisted-but-offline hosts are never evicted, and `reconcileRegistry` can resurrect a renamed host

**File:** `lib/routing.ts:77-94`
**Issue:** `reconcileRegistry` starts from `{...persisted}` and only overlays discovered hosts; a host that has been permanently removed (config deleted, project gone) stays in the registry forever and keeps appearing in the popup and the dropdown. The doc comment calls this intentional ("may be temporarily offline"), but combined with the dropdown reading the full registry from `chrome.storage.local` (chip.ts:266), stale/dead projects accumulate with no TTL or "last seen" marker. For a relay-proof phase this is acceptable, but it is a latent correctness/UX defect.
**Fix:** Add a `lastSeen` timestamp to `HostEntry` updated on discovery, and either gray out or filter entries not seen in N cycles in the popup/dropdown. Minimum: track it now so eviction policy can be added without a storage migration later.

### WR-05: Dropdown populates from `chrome.storage.local` directly, bypassing token overlay and resolveRoute semantics

**File:** `entrypoints/review.content/chip.ts:266-285`
**Issue:** The dropdown reads the raw `sfxRegistry` registry object from storage in the content script. This works for listing names, but it couples the content script to the storage key/shape (a layering violation — everywhere else the content script goes through the SW relay) and reads registry entries whose `.token` is always `null` (tokens live in `sfxTokens`, applied only by `resolveRoute` in the SW). If any future code path uses the dropdown's `HostEntry` for more than its `name`, it will see `token:null` and a possibly-stale port. It also means the content script must be granted `storage` (it is, via `permissions`), expanding the content-script surface unnecessarily.
**Fix:** Add a `LIST_HOSTS` SW message returning `string[]` of host names (the SW already owns the registry), and have the dropdown call it instead of reading storage directly. Removes the storage-shape coupling acknowledged in the chip's own comments (lines 259-265).

### WR-06: `readPageSelfId` can return a non-string and is cast to `string`

**File:** `entrypoints/background.ts:87-91, 195`
**Issue:** `readPageSelfId` returns `(window...).__stikfix_project as string ?? null`. The page fully controls `window.__stikfix_project`; it could be a number, object, or a 10MB string. The result is then used as a registry key (`state.registry[projectName]`, line 200) and persisted into `originMap` (line 203). A non-string or adversarial value flows into storage keys. While `state.registry[projectName]` lookup would simply miss for a bogus key, persisting an attacker-influenced `originMap[origin] = projectName` only happens when `state.registry[projectName]` exists, which bounds it — but the type cast hides the fact that a page can supply arbitrary content for the self-id probe.
**Fix:** Validate in the SW after the probe:
```ts
const raw = probeResult[0]?.result;
projectName = (typeof raw === 'string' && raw.length > 0 && raw.length < 128) ? raw : null;
```

### WR-07: EXIT_REVIEW relies on a page-dispatched `CustomEvent` that any page script can forge/suppress

**File:** `entrypoints/background.ts:158-166`, `entrypoints/review.content/index.ts:51-53`
**Issue:** Exit is signaled by injecting a function that does `window.dispatchEvent(new CustomEvent('sfx-exit-review'))`, listened for with `{once:true}` in the content script. Because this event lives on the page's `window`, (a) any page script can dispatch `sfx-exit-review` to force the review UI to unmount (minor DoS of the extension's own UI), and (b) the `{once:true}` listener means if the event fires spuriously once, a later legitimate EXIT cannot re-trigger it (the chip is also torn down via `ui.remove`, so re-entry re-adds the listener — bounded, but the forge vector remains). Not a data-loss issue, but it crosses the page/extension trust boundary the rest of the design carefully avoids.
**Fix:** Prefer SW→content-script messaging via `chrome.tabs.sendMessage(tabId, {type: EXIT_REVIEW})` with an `onMessage` listener inside the content script (same-world, page cannot forge), instead of round-tripping through a page DOM event.

## Info

### IN-01: `console.log('stikfix SW loaded')` debug artifact in production background

**File:** `entrypoints/background.ts:448`
**Issue:** Debug log on every SW wake. Harmless but noisy; gate behind `import.meta.env.DEV`.

### IN-02: `originFromMsg` parameter is effectively dead for anti-spoof but still used as a fallback

**File:** `entrypoints/background.ts:171-180`
**Issue:** `handleGetRoute` derives origin from the tab URL (correct) but falls back to `originFromMsg` (the untrusted message body) when `tab.url` is absent. For a discarded/loading tab this would route based on a page-supplied origin. Low risk (no `tab.url` usually means no useful page), but it reintroduces the spoofable input the design forbids. Prefer returning an error when `tab.url` is missing, matching `handleSendAnnotation:271-273`.

### IN-03: `optional_host_permissions` requires `@ts-ignore` — type drift workaround

**File:** `wxt.config.ts:17`
**Issue:** WXT 0.20.x types omit `optional_host_permissions`. The `@ts-ignore` is fine but will silently swallow other errors on that line if the key is ever mistyped. Prefer `@ts-expect-error` so it fails loudly if WXT adds the type.

### IN-04: `resolveRoute` Step 1 uses `Array.find` over `Object.values` — first-match on duplicate origins is nondeterministic-ish

**File:** `lib/routing.ts:32-34`
**Issue:** If two registered hosts both advertise the same origin in `origins[]`, Step 1 returns whichever `Object.values` ordering yields first (insertion order in practice, but not a documented contract). Edge case for the proof phase; worth a deterministic tiebreak (e.g., lowest port or explicit originMap precedence) and/or a dev warning on duplicate origins.

### IN-05: `handleExitReview` uses `browser.scripting` while `handleEnterReview` uses `chrome.scripting` — inconsistent API surface

**File:** `entrypoints/background.ts:122, 158, 191`
**Issue:** Enter uses `chrome.scripting.executeScript` (with a documented rationale about `ScriptPublicPath`), but Exit and the self-id probe use `browser.scripting.executeScript`. Mixing the two is harmless under WXT's polyfill but inconsistent; pick one (the rationale comment only justifies `chrome` for the `files[]` case, so `browser` for `func:` injections is acceptable — just document it once).

---

_Reviewed: 2026-05-31_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
