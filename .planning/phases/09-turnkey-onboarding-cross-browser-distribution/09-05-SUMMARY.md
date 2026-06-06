---
phase: 09-turnkey-onboarding-cross-browser-distribution
plan: "05"
subsystem: extension+host
tags: [origin-folder-routing, target-dir, path-validation, anti-spoof, back-compat, reliability, gap-closure, d-04]
dependency_graph:
  requires:
    - host/src/native-host.ts (09-04: validateChosenFolder source — now relocated to validate-folder.ts)
    - host/src/server.ts (08: createHostServer, token gate, isInsideDir confinement)
    - host/src/config.ts (ensureNotesDir, resolveConfig — back-compat --root flow)
    - host/src/security.ts (isInsideDir path-traversal guard)
    - host/src/write-note.ts (writeNote), host/src/serial.ts (withSerialLock, getNextSerial)
    - host/src/read-note.ts (listAnnotations, editNote, deleteNote)
    - entrypoints/background.ts (09-04: handlePickFolder, onMessage switch, resolveRoute usage)
    - lib/routing.ts (resolveRoute — origin→host), lib/storage.ts (sfxOriginMap holds origin→host AND origin→folder)
    - entrypoints/review.content/chip.ts (08/03: Send relay call site, inline toast/feedback)
    - lib/types.ts (SFX_MSG.PICK_FOLDER, MsgPickFolder, AnnotationResponse shapes)
  provides:
    - host/src/validate-folder.ts validateChosenFolder() — single source of truth, used by BOTH native host and HTTP server
    - host/src/server.ts resolveNotesDir(cfg, targetDir?) — per-request re-validated + confined notes dir on all five endpoints
    - entrypoints/background.ts isFolderValue(), getActivePairedHost(), resolveFolderAwareRoute(), withTargetDir() — folder-aware relay routing
    - entrypoints/background.ts handleGetRoute folder-awareness (silent reuse for folder-mapped origins)
    - entrypoints/review.content/chip.ts needs-folder → PICK_FOLDER → single auto-retry, visible toast on cancel
    - host/test/validate-folder.test.ts (shared validator coverage)
    - host/test/server.test.ts D-04 targetDir suite (write/read/list/confine + 400 + back-compat)
  affects:
    - host/src/native-host.ts (local validateChosenFolder removed; imports + re-exports from validate-folder.ts)
    - host/src/types.ts (AnnotationPayload gains optional routing-only targetDir)
    - entrypoints/background.ts (all CRUD relays now folder-aware via resolveFolderAwareRoute/withTargetDir)
    - entrypoints/review.content/chip.ts (wireSendButton refactored into reusable sendOnce; unmapped state keeps Send live)
tech_stack:
  added: []
  patterns:
    - shared folder validator as a standalone module (validate-folder.ts) imported by both the native host and the HTTP server — one deny-list, one absolute/exists/isDirectory check
    - per-request targetDir RE-VALIDATED server-side on EVERY request, then writes confined to <validated>/notes (D-04 extension of the Phase 8 confined-writes invariant)
    - InvalidTargetDirError marker (statusCode:400) so an invalid/system targetDir is a 400 with no write, never a 500 or a write to the wrong place
    - absent targetDir → cfg.notesDir, byte-for-byte unchanged (back-compat / no regression)
    - sfxOriginMap value disambiguation by absolute-path shape (isFolderValue) so origin→host and origin→folder coexist without corruption
    - SW routing precedence: origin→folder (paired host + targetDir) ▸ origin→host (no targetDir) ▸ needs-folder
    - single auto-retry after a successful folder pick (allowRetry flag prevents dialog loops)
    - origin-from-tab + X-Stickyfix-Token attachment preserved on every targetDir request (anti-spoof + no new unauthenticated surface)
    - reliability: cancelled/failed folder pick surfaces a visible chip toast — note never silently dropped (REL-01)
key_files:
  created:
    - host/src/validate-folder.ts
    - host/test/validate-folder.test.ts
  modified:
    - host/src/native-host.ts
    - host/src/server.ts
    - host/src/types.ts
    - host/test/server.test.ts
    - entrypoints/background.ts
    - entrypoints/review.content/chip.ts
decisions:
  - "Extracted validateChosenFolder into its own module so native host and server share one validator (no duplicated deny-list)."
  - "targetDir is routing-only: carried in the POST body for /annotation and as ?targetDir= for GET/PUT/DELETE/screenshot; the host re-validates it and never persists it to note frontmatter."
  - "handleGetRoute made folder-aware (Rule 3 blocking fix) so a folder-mapped origin resolves silently to the paired host — without it, the 'second note reuses silently' requirement could not be met."
  - "Unmapped chip state keeps Send live (drives the folder dialog) rather than disabling it, so 'drop the first note → dialog' works; the host dropdown remains as the origin→host alternative."
metrics:
  tasks_completed: 4
  duration: ~25m
  completed_date: 2026-06-06
  commits: 4
  files_created: 2
  files_modified: 6
---

# Phase 9 Plan 05: First-Note Folder Dialog (D-04 Gap Closure) Summary

Wave 4 gap closure that wires D-04 end-to-end: dropping the first note on an unmapped origin opens the OS folder dialog, the chosen folder is persisted (origin→folder) and used for the write into `<chosen>/notes`, and every subsequent note on that origin reuses the folder silently — with full back-compat for the existing `--root` / origin→host flow and all Phase 8 security invariants preserved.

## What was built (Tasks 1–4)

**Task 1 — Shared folder validation (commit `93d4e3b`)**
Created `host/src/validate-folder.ts` as the single source of truth for `validateChosenFolder()` (absolute + `existsSync` + `isDirectory` + system-dir deny-list, normalized + case-insensitive on win32). `native-host.ts` now imports and re-exports it (local copy removed; behavior identical). New `host/test/validate-folder.test.ts` covers valid dir, non-absolute, missing, file-not-dir, and each system dir → null. `native-host.test.js` stays green via the re-export.

**Task 2 — Host honors optional per-request targetDir (commit `0fbcd29`)**
Added `resolveNotesDir(cfg, targetDir?)` to `server.ts`: a non-empty targetDir is re-validated via the shared validator and confined to `<validated>/notes` (created on demand); an invalid/system/non-existent targetDir throws `InvalidTargetDirError` → HTTP 400 with no write; an absent targetDir returns `cfg.notesDir` unchanged. Wired into all five endpoints — POST `/annotation` (body `targetDir`), GET `/annotations`, PUT/DELETE `/annotation/:serial`, GET `/screenshot` (query `?targetDir=`). The `/screenshot` `isInsideDir` confinement now guards the resolved per-request dir. 6 new server tests prove: write to `<targetDir>/notes` (and NOT cfg.notesDir), system-dir → 400 no write, non-existent → 400, no-targetDir regression guard, list-from-targetDir, and a re-validated read path.

**Task 3 — SW threads origin→folder through the relay (commit `b3b889b`)**
Added `isFolderValue()` (absolute-path-shape disambiguation so origin→host and origin→folder coexist in `sfxOriginMap` without corruption), `getActivePairedHost()`, `resolveFolderAwareRoute()`, and `withTargetDir()`. `handleSendAnnotation` precedence: origin→folder (paired host + targetDir in the POST body) ▸ origin→host (Phase 3 path, no targetDir, unchanged) ▸ `{ok:false, reason:'needs-folder', origin}`. The list/edit/delete/screenshot relays pass `?targetDir=` for folder-mapped origins. `AnnotationPayload` gained an optional routing-only `targetDir`. origin-from-tab and token attachment are untouched.

**Task 4 — Chip needs-folder → dialog → retry, toast on cancel (commit `a49855a`)**
Refactored `wireSendButton` into a reusable `sendOnce(payload, allowRetry)`: a `needs-folder` response triggers `SFX_PICK_FOLDER`, and on success shows "Saving notes to <folder>" then auto-retries the same payload exactly once (`allowRetry=false` on the retry prevents dialog loops). A cancelled/invalid/failed pick surfaces a visible toast — "No folder chosen — note not saved. Drop again to pick one." — so the note is never silently dropped (REL-01). The unmapped chip state now keeps Send live (driving the folder dialog) alongside the existing host dropdown. `AnnotationResponse` gained `reason:'needs-folder'`; a `PickFolderResponse` type was added. `handleGetRoute` was made folder-aware so a folder-mapped origin resolves silently to the paired host (enables "second note reuses silently — no dialog").

## Verification

- `npx tsc --noEmit -p tsconfig.host.json` — clean
- `npx tsc --noEmit` (extension) — clean
- `npm run build` — green (wxt build + tsc host + esbuild host bins)
- `npm test` — **199 pass, 0 unexpected fail, 1 known environmental failure**

### Known environmental test artifact (NOT a regression, NOT in scope)

`host/test/index.test.ts` "WR-06: server scans past occupied 39240" fails with `EADDRINUSE: 127.0.0.1:39240`. This is the user's live UAT host occupying port 39240 during this execution — a pre-existing environmental condition explicitly flagged in the execution brief, not caused by any change in this plan. Every other test (including all new D-04 targetDir tests and all existing server.test.ts / native-host.test.ts regression cases) passes.

## Security & invariants upheld

- **T-09-14b (Tampering):** every targetDir is re-validated server-side on every request via the shared `validateChosenFolder`; writes confined to `<validated>/notes`; invalid/system targetDir → 400, never a write outside.
- **T-09-15 (Spoofing):** origin is still derived from `chrome.tabs.get` in the SW, never from the message body.
- **T-08-tokengate (Info disclosure):** every targetDir request still requires `X-Stickyfix-Token`; no new unauthenticated surface.
- **REL-01 (Reliability):** a cancelled folder dialog surfaces a visible chip toast and never silently drops the note.
- **Back-compat:** absent targetDir → `cfg.notesDir` byte-for-byte unchanged; existing origin→host routing untouched; `server.test.ts` and `native-host.test.ts` regression cases pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Made `handleGetRoute` folder-aware**
- **Found during:** Task 4
- **Issue:** With `handleGetRoute` unchanged, a folder-mapped origin returned `reason:'unmapped'` → the chip rendered the host dropdown (Send disabled) on the *second* note, defeating the "reuse silently — no dialog" must-have. The plan scopes Task 4 to chip.ts/types.ts and Task 3 to background.ts handlers, but neither lists `handleGetRoute`.
- **Fix:** Added a folder-aware branch at the top of `handleGetRoute` (before `resolveRoute`): a folder-mapped origin resolves silently to the paired host with the chosen folder shown as the routed label; Send rides `targetDir` via `SEND_ANNOTATION`. Falls through to the dropdown only if no paired host exists yet.
- **Files modified:** entrypoints/background.ts
- **Commit:** a49855a

**2. [Rule 3 - Blocking] Kept Send live in the unmapped chip state**
- **Found during:** Task 4
- **Issue:** `renderDropdown` disabled the Send button while unmapped, so a truly-unmapped origin (0 or 2+ hosts, no folder) had no way to trigger the folder dialog by "dropping a note" — contradicting the D-04 trigger ("drop the first note → dialog").
- **Fix:** Wired `wireSendButton` in the unmapped state (host arg is ignored by the relay; the SW resolves routing from the origin) so a Send click drives `needs-folder` → dialog → auto-retry. The host dropdown remains as the origin→host alternative; label updated to reflect both paths.
- **Files modified:** entrypoints/review.content/chip.ts
- **Commit:** a49855a

Both deviations are correctness-required to satisfy the plan's own must-haves and were committed within Task 4. No architectural (Rule 4) changes were made.

## Known Stubs

None. The Send payload remains the existing "stickyfix relay proof" free-note stub from earlier plans (unchanged by this plan); wiring real note content is outside D-04 gap-closure scope and is handled by the note-authoring plans.

## Commits

- `93d4e3b` refactor(09-05): extract shared validateChosenFolder to validate-folder.ts
- `0fbcd29` feat(09-05): host honors optional per-request targetDir, re-validated + confined
- `b3b889b` feat(09-05): SW threads origin->folder through the relay (precedence + targetDir)
- `a49855a` feat(09-05): chip drives needs-folder -> dialog -> retry, toast on cancel

## Remaining

**Task 5 (checkpoint:human-verify, blocking-human)** — Live UAT of the first-note folder dialog end-to-end (dialog appears, note lands in chosen folder, second note silent, cancel surfaces toast, origin→host regression). STATE.md / ROADMAP.md are intentionally NOT advanced pending Omer's UAT.

## Self-Check: PASSED

- All 8 referenced source/test files exist on disk (2 created, 6 modified).
- All 4 task commits exist in git history (93d4e3b, 0fbcd29, b3b889b, a49855a).
