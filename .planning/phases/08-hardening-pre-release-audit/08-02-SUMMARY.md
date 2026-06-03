---
phase: "08-hardening-pre-release-audit"
plan: "02"
subsystem: "entrypoints/review.content"
tags: [no-regression, error-toast, payload-size, consolidation, pre-flight]
dependency_graph:
  requires: ["lib/error-toast.ts mapSendOutcome", "lib/payload-size.ts exceedsBodyCap"]
  provides: ["card.ts consolidated Send error handling", "card.ts pre-flight size guard"]
  affects: []
tech_stack:
  added: []
  patterns: ["mapSendOutcome discriminated-union wiring", "exceedsBodyCap pre-flight before sendMessage"]
key_files:
  created: []
  modified:
    - entrypoints/review.content/card.ts
decisions:
  - "mapSendOutcome called with typed SendOutcome discriminated-union at each of the six branch points (3 per call-site x 2 call-sites)"
  - "Control-restore logic left inline at each call-site — only the string-construction replaced by mapSendOutcome"
  - "exceedsBodyCap pre-flight inserted between payload assembly and chrome.runtime.sendMessage in both _doSend and _doElementSend"
  - "Pre-flight control-restore in _doSend mirrors the existing relay-error branch inline; _doElementSend uses restoreControls() + disabled rule"
metrics:
  duration: "197s"
  completed_date: "2026-06-04"
  tasks_completed: 2
  files_changed: 1
---

# Phase 8 Plan 02: card.ts consolidation — mapSendOutcome wiring + exceedsBodyCap pre-flight

**One-liner:** Both Send call-sites in card.ts now route toast strings through `mapSendOutcome` (D-01a byte-identical no-regression), and oversize payloads are blocked pre-flight by `exceedsBodyCap` before the SW round-trip (D-04).

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Consolidate _doSend + _doElementSend toasts behind mapSendOutcome (D-01/D-01a) | 4c72566 | entrypoints/review.content/card.ts |
| 2 | Wire exceedsBodyCap pre-flight guard into both Send paths (D-04, REL-03) | 6f72ac2 | entrypoints/review.content/card.ts |

## What Was Built

### Task 1: mapSendOutcome consolidation (D-01 / D-01a)

Added imports to card.ts:
- `import { mapSendOutcome } from '../../lib/error-toast.js'`
- `import type { SendOutcome } from '../../lib/error-toast.js'`

Both `_doSend` (lines ~412-446) and `_doElementSend` (lines ~864-891) Send callbacks now:
1. Build a typed `SendOutcome` discriminated-union object for each branch
2. Call `mapSendOutcome(outcome)` to get `{ message, isError }`
3. Pass `spec.message` + `spec.isError` to `showToastFn`

The three-branch structure is preserved:
- **channel-dead:** `{ kind: 'channel-dead', lastErrorMessage: chrome.runtime.lastError?.message }` — dead-channel guard `chrome.runtime.lastError || !resp` remains exactly as-is
- **ok:** `{ kind: 'ok', file: resp.file }` — success path
- **relay-error:** `{ kind: 'relay-error', error: resp.error }` — host error pass-through

Control-restore logic remains inline at each call-site (unchanged). The three 'Screenshot capture failed' capture-pipeline toasts are untouched. chip.ts untouched.

### Task 2: exceedsBodyCap pre-flight (D-04 / REL-03)

Added import to card.ts:
- `import { exceedsBodyCap } from '../../lib/payload-size.js'`

Pre-flight inserted in **_doSend** immediately after `payload` assembled, before `chrome.runtime.sendMessage`:
```
if (exceedsBodyCap(JSON.stringify(payload))) {
  showToastFn('Screenshot too large to send (over 12 MB) — remove a capture and retry', true);
  [restore controls mirroring relay-error branch]
  return;
}
```

Pre-flight inserted in **_doElementSend** immediately after `payload` assembled (with `screenshots[]`), before `chrome.runtime.sendMessage`:
```
if (exceedsBodyCap(JSON.stringify(payload))) {
  showToastFn('Screenshot too large to send (over 12 MB) — remove a capture and retry', true);
  restoreControls();
  sendBtn.disabled = textarea.value.trim().length === 0;
  return;
}
```

The host 413 backstop is left intact. Under-cap payloads reach `sendMessage` unchanged.

## Verification

- `npx tsc --noEmit` exits 0 after each task
- `npm run test:lib` exits 0, 144/144 tests pass (unchanged from Plan 01)
- `grep 'Extension error: ' entrypoints/review.content/card.ts` → 0 matches (string removed from inline code; lives only in lib/error-toast.ts)
- `grep 'over 12 MB' entrypoints/review.content/card.ts` → 2 matches (one per Send path)
- `git diff --name-only` shows only `entrypoints/review.content/card.ts` modified; chip.ts untouched

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — both wiring changes are complete implementations with no placeholders.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced. The mapper and pre-flight are pure defense-in-depth consolidation at an existing trust boundary.

## Self-Check: PASSED

- [x] card.ts imports `mapSendOutcome` and `SendOutcome` from lib/error-toast.js
- [x] card.ts imports `exceedsBodyCap` from lib/payload-size.js
- [x] Both _doSend and _doElementSend call mapSendOutcome for all three branches
- [x] `grep 'Extension error: ' card.ts` → 0 matches
- [x] `grep 'over 12 MB' card.ts` → 2 matches
- [x] Dead-channel guard `chrome.runtime.lastError || !resp` present at both call-sites
- [x] chip.ts unchanged (git diff shows no chip.ts modification)
- [x] Capture-failure toasts untouched
- [x] `npx tsc --noEmit` exits 0
- [x] `npm run test:lib` exits 0, 144/144 pass
