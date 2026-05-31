---
status: partial
phase: 03-extension-skeleton-sw-relay-proof
source: [03-VERIFICATION.md]
started: 2026-05-31
updated: 2026-05-31
---

## Current Test

Manual Chrome UAT for the extension skeleton + SW relay proof (Success Criteria 1–5).

## Setup (once)

1. `npm run build`
2. Start a host pointed at any folder:  `npm run host -- --root D:\docker\stickyfix --origin https://example.com` (note the printed **token** and **notes dir**).
3. Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → `D:\docker\stickyfix\.output\chrome-mv3`.

## Tests

### 1. Popup lists discovered hosts + token entry (EXT-03, EXT-04)
expected: Open the popup on any tab → the running host appears (project name + port); paste/confirm its token in the per-host field; the token persists (reopen popup → still there).
result: [pending]

### 2. Review Mode injects the chip on demand (EXT-01, EXT-02, EXT-11)
expected: Click **Enter Review Mode** → Chrome prompts for site access (`<all_urls>` optional permission) → grant → a connection chip appears on the page showing "→ <project> · <notesDir>". No chip appears before toggling (no static injection).
result: [pending]

### 3. CS→SW→host relay proof on an HTTPS page (EXT-05) — THE KEY TEST
expected: On a real **HTTPS** site (e.g. https://example.com, matching the host's --origin or via the one-time map), click the chip's stub **Send** → a brief "sent ✓" → a file `NNNN-<ts>.md` with `comment: stickyfix relay proof` appears in the host's notes dir. (Proves the service worker — not the content script — reached 127.0.0.1.)
result: [pending]

### 4. Unknown origin → one-time dropdown, never re-asked (EXT-06, EXT-07, EXT-08)
expected: On an unmapped origin, the chip shows a project dropdown once; pick the project → it routes; revisit the same origin → no dropdown, routes automatically.
result: [pending]

### 5. State survives SW eviction + Chrome restart (EXT-09, EXT-10)
expected: Stop the service worker (`chrome://serviceworker-internals` → Stop, or wait ~5 min idle) → Send again → still routes correctly (no re-discovery prompt for the mapped origin). Bonus: restart Chrome and/or restart the host on a different port → it re-binds by project name and still routes.
result: [pending]

### 6. Chip is draggable, viewport-clamped, Exit works (EXT-11)
expected: Drag the chip around — it can't leave the viewport (no off-screen escape); the page's CSS doesn't alter the chip and vice-versa (shadow-DOM isolation); the × Exit button removes the chip and exits Review Mode.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
