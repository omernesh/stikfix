---
phase: 09-turnkey-onboarding-cross-browser-distribution
plan: "04"
subsystem: extension+host
tags: [native-messaging, folder-picker, origin-mapping, zero-config, security-proof, path-validation, anti-spoof, sc-3]
dependency_graph:
  requires:
    - host/src/folder-picker.ts (09-01: pickFolder, buildPickerArgs)
    - host/src/native-msg.ts (09-01: sendNativeMessage, readNativeMessages, decodeNativeMessages)
    - host/src/native-host.ts (09-02: GET_TOKEN responder, PICK_FOLDER stub)
    - host/src/bootstrap/register.ts (09-01: buildManifest — allowed_origins gate)
    - host/src/server.ts (08: createHostServer — /status no-token, /annotation token gate, no /token|/pair)
    - host/src/security.ts (checkToken timing-safe; isInsideDir)
    - lib/storage.ts (sfxOriginMap origin→X persistence)
    - entrypoints/background.ts (09-02: handlePairNative sibling shape, onMessage switch)
  provides:
    - host/src/native-host.ts validateChosenFolder() + handlePickFolder() (PICK_FOLDER branch wired to pickFolder + path validation)
    - entrypoints/background.ts handlePickFolder(tabId) (origin-from-tab → native PICK_FOLDER → sfxOriginMap origin→folder persist)
    - lib/types.ts SFX_MSG.PICK_FOLDER + MsgPickFolder
    - host/test/security-pairing.test.ts (SC-3 proof: allowed_origins gate + no /token|/pair + token-gate regression + content-script native-API grep)
  affects:
    - host/src/native-host.ts (boot moved into main() gated by require.main===module so helpers are import-testable)
    - host/test/native-host.test.ts (validateChosenFolder + handlePickFolder tests added)
tech_stack:
  added: []
  patterns:
    - native-host PICK_FOLDER as a SEPARATE spawn from GET_TOKEN (Pitfall 8 — dialog never blocks token fetch)
    - chosen-folder defensive validation (absolute + existsSync + isDirectory + system-dir deny-list); isInsideDir does NOT apply (new root, not a child of an existing root)
    - entry-point boot gated by require.main===module so pure helpers are unit-testable on import
    - SW handlePickFolder mirrors handlePairNative (lastError guard + FOLDER_PICKED check) and the origin→host persist (re-read at top, Pitfall 1)
    - origin-from-tab (chrome.tabs.get) anti-spoof preserved — tabId carried in the message, origin derived in the SW
    - SC-3 structural security proof (HTTP surface has no token route + native allowed_origins pinned + content scripts cannot reach native API)
key_files:
  created:
    - host/test/security-pairing.test.ts
  modified:
    - host/src/native-host.ts
    - host/test/native-host.test.ts
    - lib/types.ts
    - entrypoints/background.ts
decisions:
  - "native-host boot moved into an exported main() gated by require.main===module: lets validateChosenFolder/handlePickFolder be imported by node:test without triggering a config read + process.exit(1) on import. The esbuild CJS bundle still auto-runs main() when launched by Chrome."
  - "SW handlePickFolder takes tabId (not origin) and derives origin via chrome.tabs.get inside the handler — strictly honoring the Phase 3/8 origin-from-tab anti-spoof invariant (T-09-15) rather than the plan's literal handlePickFolder(origin) signature."
  - "origin→folder persisted into sfxOriginMap exactly as the plan specified (originMap[origin]=folder), mirroring the existing origin→host one-time-prompt persist."
metrics:
  duration: ~30m
  completed: 2026-06-06
  tasks_completed: 3
  tasks_total: 4
  files_changed: 5
---

# Phase 9 Plan 4: D-04 Folder Mapping + SC-3 Security Proof Summary

D-04 zero-standing-config folder mapping plus the ONB-03/SC-3 security proof: on the first note from an unmapped origin the native host opens an OS folder dialog, the chosen (validated) folder becomes the persisted origin→folder mapping in `sfxOriginMap` for silent reuse, and a dedicated automated test proves a scripted web origin can neither reach the native channel (allowed_origins pinned + no native API in content scripts) nor extract the token over HTTP (no `/token`/`/pair`, `/status` token-free, 401 gate intact).

## What Was Built

**Task 1 — native-host PICK_FOLDER + path validation** (`host/src/native-host.ts`, `host/test/native-host.test.ts`):
- `validateChosenFolder(folder, plat)` — defensive validation: absolute (`isAbsolute`) + exists (`existsSync`) + directory (`statSync().isDirectory()`) + NOT a sensitive system dir (`/`, `/System`, `/usr`, `/etc`; win32 `C:\Windows`, `C:\Program Files`, normalized + case-insensitive on win32). A code comment explains why `isInsideDir` does NOT apply (the chosen folder is a brand-new root, not a child of a pre-existing root).
- `handlePickFolder(origin, pickFn, plat, out)` — awaits `pickFolder`, validates, sends a `FOLDER_PICKED` frame echoing origin with the validated dir or `null`. Cancel/invalid/system-dir → `folder:null` (no crash, no silent drop).
- The PICK_FOLDER dispatch branch awaits `handlePickFolder` then `process.exit(0)`; it is a separate spawn from GET_TOKEN (Pitfall 8 — the dialog never blocks a token fetch).
- Boot (config/token/port read + `readNativeMessages` dispatch) moved into an exported `main()` gated by `require.main === module` so the helpers are import-testable.
- Tests: FOLDER_PICKED shape for a valid dir, a null cancel, and a rejected system dir; plus `validateChosenFolder` unit coverage.

**Task 2 — SW handlePickFolder + origin→folder persist** (`entrypoints/background.ts`, `lib/types.ts`):
- `SFX_MSG.PICK_FOLDER` + `MsgPickFolder { type, tabId }` added to the message union.
- `handlePickFolder(tabId)` derives origin from `chrome.tabs.get(tabId).url` (origin-from-tab, T-09-15), sends `PICK_FOLDER` over `chrome.runtime.sendNativeMessage`, guards `lastError`/non-`FOLDER_PICKED`/empty folder → `{ok:false,error:'No folder selected'}`, re-reads `sfxOriginMap` (Pitfall 1), persists `originMap[origin]=folder`, resolves `{ok:true,folder}`.
- `case SFX_MSG.PICK_FOLDER` returns `true` synchronously (MV3 async invariant). `handleSendAnnotation` and `resolveRoute` untouched.

**Task 3 — SC-3 security proof** (`host/test/security-pairing.test.ts`):
- `/token` → 404, `/pair` → 404 (token never on an HTTP surface).
- `/status` → 200, body has no token value and no `token` field.
- `/annotation` without token → 401; with wrong token → 401 (Phase 8 gate regression).
- `buildManifest` pins `allowed_origins` to exactly `['chrome-extension://<id>/']`, excludes a hostile other-ID, and rejects malformed IDs (short, wrong alphabet, uppercase, wrong length).
- fs-grep: `connectNative`/`sendNativeMessage` absent under `entrypoints/review.content/`.

## Threat Model Coverage

| Threat ID | Mitigation delivered |
|-----------|----------------------|
| T-09-12 (spoof native channel) | `buildManifest` allowed_origins pinned; security-pairing.test asserts hostile IDs excluded + no native API in content scripts |
| T-09-13 (token over HTTP) | security-pairing.test: no `/token`/`/pair`, `/status` token-free, `/annotation` 401 gate |
| T-09-14 (folder-picker path) | `validateChosenFolder` absolute+exists+isDirectory+system-dir deny-list before the folder becomes a note root |
| T-09-15 (origin spoofing for routing) | SW `handlePickFolder` derives origin from `chrome.tabs.get`, never the message body |
| T-09-SC (package installs) | None installed — builtins + existing deps only |

## Deviations from Plan

### Auto-fixed / structural adjustments (no architectural change)

**1. [Rule 3 - Blocking] native-host boot gated by `require.main === module`**
- **Found during:** Task 1.
- **Issue:** `native-host.ts` ran config/token reads + `readNativeMessages` at module top level, calling `process.exit(1)` on import — impossible to unit-test the PICK_FOLDER helpers without a real config on disk.
- **Fix:** Moved boot into an exported `main()` and invoke it only when `require.main === module` (true in the esbuild CJS bundle launched by Chrome; false when node:test imports the ESM-compiled module). Pure helpers (`validateChosenFolder`, `handlePickFolder`) are now exported and import-safe.
- **Files modified:** `host/src/native-host.ts`
- **Commit:** 9dc0d95

**2. [Design] SW `handlePickFolder` takes `tabId`, not `origin`**
- **Found during:** Task 2.
- **Issue:** The plan's literal signature was `handlePickFolder(origin: string)`, but the same plan mandates origin MUST come from `chrome.tabs.get` (anti-spoof, T-09-15), never the message body.
- **Fix:** The handler takes `tabId` and derives origin internally via `chrome.tabs.get(tabId).url` — matching every other SW handler and strictly honoring the invariant. Persist logic (`originMap[origin]=folder`) follows the plan exactly.
- **Files modified:** `entrypoints/background.ts`, `lib/types.ts`
- **Commit:** cbbd6f9

## Verification

- `npx tsc --noEmit -p tsconfig.host.json` — green.
- `npx tsc --noEmit` (extension) — green.
- `npm run build` — green (wxt build 219 kB; host tsc; both CJS bundles built, native bundle 7.9 kB with the `require.main` entry guard).
- `node --test dist/host/test/native-host.test.js` — 23/23 pass (incl. 9 new PICK_FOLDER/validation tests).
- `node --test dist/host/test/security-pairing.test.js` — 9/9 pass.
- `npm test` (full host suite) — **186 pass, 1 fail (expected environmental artifact)**.

### Known / expected test artifact (NOT a regression)

`host/test/index.test.ts` → `WR-06: server scans past occupied 39240 and binds to 39241` FAILS with `EADDRINUSE 127.0.0.1:39240`. This is because a live paired UAT host (the user's mid-UAT session, pid ~21980) currently occupies port 39240, so the test's own blocker server cannot bind it. This is an environmental conflict with the running UAT host, not a code regression from this plan — none of this plan's changes touch `bind.ts`/`index.ts`/port-scan logic. Every other test (186) passes, including all new tests.

## Known Stubs

None. The prior PICK_FOLDER stub in `native-host.ts` (09-02) is now fully replaced with the validated implementation.

## Checkpoint Remaining

_None — Task 4 verified._

**Task 4 (`checkpoint:human-verify`, gate=blocking-human) — VERIFIED 2026-06-07 (Omer):**
- First note on unmapped origin → OS folder dialog → note on disk in chosen folder; second note → silent reuse. ✅ (see 09-05 Task 5)
- Hostile-origin probe (ONB-03), run in page DevTools on `https://*.walla.co.il`:
  - `typeof chrome.runtime.connectNative` === `"undefined"`, `typeof chrome.runtime.sendNativeMessage` === `"undefined"`. ✅
  - `GET /token` → 404, `GET /pair` → 404, `POST /annotation` (no token) → 401 — token never obtainable from page context. ✅
  - Host-side confirmed independently from localhost: same 404/404/401; `GET /status` 200 but body omits the token. ✅

## Self-Check: PASSED

- host/src/native-host.ts — FOUND (modified)
- host/test/native-host.test.ts — FOUND (modified)
- lib/types.ts — FOUND (modified)
- entrypoints/background.ts — FOUND (modified)
- host/test/security-pairing.test.ts — FOUND (created)
- Commit 9dc0d95 (Task 1) — FOUND
- Commit cbbd6f9 (Task 2) — FOUND
- Commit 3a0504a (Task 3) — FOUND
