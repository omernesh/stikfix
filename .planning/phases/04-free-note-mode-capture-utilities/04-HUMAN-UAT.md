---
status: partial
phase: 04-free-note-mode-capture-utilities
source: [04-VERIFICATION.md]
started: 2026-06-01
updated: 2026-06-01
---

## Current Test

[awaiting human testing — load unpacked extension from `.output/chrome-mv3/`, run `npm run host -- --root <test-dir>`, enter Review Mode on any HTTPS page]

## Tests

### 1. Capture trio round-trip
expected: `captureTab(tabId)` → SW `captureVisibleTab` → `waitTwoRafs` → `cropToRect` returns a DPR-correct PNG crop; the stickyfix own-UI (chip/FAB) is absent from the screenshot (double-rAF flush worked); a free note sent in the same session still writes `screenshots: []`.
result: [pending]

### 2. FAB drag + viewport clamp
expected: the `+` FAB drags smoothly in Review Mode (interactjs) and is clamped inside the window.
result: [pending]

### 3. Single-card enforcement
expected: double-clicking the FAB does not open a second post-it; the existing card is focused instead.
result: [pending]

### 4. Free-note Send end-to-end
expected: typing a note and pressing Send writes a `.md` file on disk with correct content; the success toast names the written file and auto-dismisses after ~3s.
result: [pending]

### 5. Host-down error toast persistence
expected: with the host stopped, Send surfaces a persistent error toast; the × dismiss works; the card stays open (no silent failure).
result: [pending]

### 6. Chip label re-map (D-09)
expected: the routed-label dropdown re-opens on click; selecting a new project persists the re-map.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
