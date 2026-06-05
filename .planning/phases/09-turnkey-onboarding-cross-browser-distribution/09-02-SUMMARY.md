---
phase: 09-turnkey-onboarding-cross-browser-distribution
plan: "02"
subsystem: extension+host
tags: [native-messaging, bootstrapper, pairing, popup-ui, security, stable-id, desktop-launcher]
dependency_graph:
  requires:
    - host/src/native-msg.ts (09-01: sendNativeMessage, readNativeMessages)
    - host/src/bootstrap/register.ts (09-01: registerNativeHost, unregisterNativeHost)
    - host/src/index.ts (09-01: writes .stickyfix-port on startup)
  provides:
    - bin/stickyfix.ts → dist/host/stickyfix-init.cjs (npx stickyfix init|uninstall — no --extension-id required)
    - host/src/native-host.ts → dist/host/stickyfix-native.cjs (GET_TOKEN responder)
    - host/src/extension-id.ts (deriveExtensionId, STABLE_EXTENSION_ID, MANIFEST_PUBLIC_KEY)
    - host/src/bootstrap/register.ts createLauncherFiles() (bat+lnk/command/sh+desktop per OS)
    - entrypoints/background.ts handlePairNative (SW pairing handler)
    - entrypoints/popup/index.html #sfx-pairing-banner (additive section)
    - entrypoints/popup/main.ts pairing state machine (states 1-5)
  affects:
    - lib/types.ts (SFX_MSG.PAIR_NATIVE + MsgPairNative added)
    - wxt.config.ts (nativeMessaging permission + stable key field added)
    - package.json (bin field + build:host-bin script)
    - tsconfig.host.json (bin/**/*.ts added to include)
    - .gitignore (.keys/*.pem private key gitignored)
    - .keys/manifest-key.txt (committed public key — base64 SPKI/DER)
    - .keys/extension-id.txt (committed derived ID: ccdfmbhdcafhmnnnfjpbhgebfkfgjgca)
tech_stack:
  added: []
  patterns:
    - npx bin entry (package.json bin field → shebang CJS bundle via esbuild)
    - native-host one-shot GET_TOKEN responder (Pitfall 3: process.exit(0) after response)
    - handlePairNative mirrors handleAddHost persist shape (re-read at top, Pitfall 1)
    - popup state machine (states 1-5: not-paired/pairing/paired/failed/returning-user)
    - CSS-only spinner (::before pseudo-element, @keyframes sfx-spin, prefers-reduced-motion)
    - stable extension ID via manifest key field (sha256 SPKI/DER → a-p nibble map)
    - desktop launcher via execFile(powershell,[argArray]) — NEVER exec, NEVER shell interpolation
key_files:
  created:
    - bin/stickyfix.ts
    - host/src/native-host.ts
    - host/src/extension-id.ts
    - .keys/manifest-key.txt
    - .keys/extension-id.txt
  modified:
    - package.json
    - tsconfig.host.json
    - wxt.config.ts
    - lib/types.ts
    - entrypoints/background.ts
    - entrypoints/popup/index.html
    - entrypoints/popup/main.ts
    - entrypoints/popup/popup.css
    - host/src/bootstrap/register.ts
    - host/test/bootstrapper.test.ts
    - .gitignore
decisions:
  - "bin/stickyfix.ts uses __dirname (available in esbuild CJS output) for absolute stickyfix-native.cjs path — avoids fragile relative paths (Pitfall 4)"
  - "handlePairNative returns {ok:true,name} to let popup show host name in state 3 text"
  - "Popup state machine is button-driven (no auto-fire on open) per UI-SPEC rationale: auto-fire creates flash of 'Pairing…' → 'Failed' on machines without native host registered"
  - "State 4 builds DOM nodes for error text (not innerHTML) — safe with host-provided error strings"
  - "esbuild invoked via 'npx esbuild' in package.json scripts for cross-platform compatibility (avoids node_modules/.bin/ path separator issues on Windows CMD)"
  - "Extension 1: RSA-2048 keypair generated via node:crypto; only public key committed; private key gitignored (.keys/*.pem)"
  - "Enhancement 1: deriveExtensionId helper in host/src/extension-id.ts — sha256(DER)[0..15] → hex nibbles → a-p alphabet; known-vector test locks the stable ID"
  - "Enhancement 2: .lnk shortcut creation is async + non-fatal (batch file is the accepted fallback if PowerShell fails); written[] list records the shortcut path optimistically"
  - "Enhancement 2: createLauncherFiles mirrors folder-picker.ts safety: execFile only, static arg array, no user-controlled values in PowerShell script body"
metrics:
  duration: "approximately 60 minutes total (30 original + 30 enhancements)"
  completed: "2026-06-05"
  tasks_completed: 5
  files_changed: 14
---

# Phase 09 Plan 02: Turnkey Pairing Slice Summary

**One-liner:** Bootstrapper CLI (`npx stickyfix init`, no `--extension-id` required) + stable manifest key (deterministic ID `ccdfmbhdcafhmnnnfjpbhgebfkfgjgca`) + double-click desktop launcher (bat+lnk/command/sh+desktop) + native-messaging host (GET_TOKEN one-shot) + SW pairing handler + popup state machine — full token-delivery path with zero manual terminal steps post-init.

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | bin/stickyfix.ts bootstrapper CLI + host/src/native-host.ts + esbuild bundles + package.json bin | 00b0fa1 | Done |
| 2 | nativeMessaging manifest perm + SW handlePairNative + PAIR_NATIVE message case | 498d2a7 | Done |
| 3 | popup pairing banner — index.html + main.ts state machine + popup.css (09-UI-SPEC states 1-5) | be90044 | Done |
| 4 | Live pairing UAT | — | CHECKPOINT — awaiting human |
| E1 | Stable extension ID: RSA keypair + manifest key + deriveExtensionId + init default | bf09283 | Done |
| E2 | Desktop launcher + no-ID-required init (SC-1/SC-4 gap close) | aa3910b | Done |

## Verification Results

- `tsc --noEmit`: **0 errors** (both extension and host tsconfigs)
- `npm run build`: **green** (wxt build + tsc + esbuild — 0 errors)
- `npm test` (host): **160/160 pass** (18 new tests, no regressions)
- `manifest.json` nativeMessaging permission: **present**
- `manifest.json` key field: **present** (prefix `MIIBIjANBgkqhkiG9w0B`)
- `connectNative`/`sendNativeMessage` in content scripts: **0 hits** (ONB-03 grep clean)
- `handleSendAnnotation` origin-from-tab invariant: **preserved**
- `createHostServer`/`bindServer`/`.listen(` in native-host.ts: **0 hits** (T-09-07)
- esbuild bundles: `stickyfix-init.cjs` (14.8kb), `stickyfix-native.cjs` (2.5kb)
- Private key NOT staged/committed: `git status` shows `.keys/stickyfix-extension.pem` untracked

## Enhancement 1: Stable Extension ID

**Stable ID:** `ccdfmbhdcafhmnnnfjpbhgebfkfgjgca`

**How it works:**
1. RSA-2048 keypair generated via `node:crypto.generateKeyPairSync`
2. Public key (base64 SPKI/DER) committed to `wxt.config.ts` as `key` field and to `.keys/manifest-key.txt`
3. Chrome derives the same extension ID from the key regardless of load path or machine
4. `deriveExtensionId(publicKeyBase64)` in `host/src/extension-id.ts` re-derives the ID locally (sha256 first 16 bytes → hex nibbles → a-p alphabet)
5. `npx stickyfix init` now defaults `allowed_origins` to this stable ID with no `--extension-id` flag required
6. `--extension-id <id>` remains as an optional override (back-compat for CWS publish with a different ID)
7. Private key stored at `.keys/stickyfix-extension.pem` (gitignored, needed only for CWS publish to keep the same ID)

## Enhancement 2: Desktop Backend Launcher

**What was created by `npx stickyfix init`:**

| Platform | Primary launcher | Desktop shortcut |
|----------|-----------------|-----------------|
| Windows | `~/.local/share/stickyfix/stickyfix-host.bat` | `~/Desktop/Stickyfix Host.lnk` (icon = built 128px PNG) |
| macOS | `~/.config/stickyfix/stickyfix-host.command` (chmod 755) | User drags to Dock |
| Linux | `~/.config/stickyfix/stickyfix-host.sh` (chmod 755) | `~/.local/share/applications/stickyfix-host.desktop` |

**Security:** Windows `.lnk` created via `execFile('powershell.exe', ['-NoProfile','-NonInteractive','-Command', psScript])` — mirrors `folder-picker.ts` exactly. All paths are developer-controlled constants; no user-supplied values are interpolated into the PowerShell script body. If `.lnk` creation fails (non-fatal), the batch file alone is the fallback.

**Uninstall:** `unregisterNativeHost()` now removes launcher + shortcut alongside manifest and registry keys. `enumerateArtifacts()` includes all launcher paths (ONB-05 completeness).

## Terminal-Free User Steps (Post-init)

```
1. Load the extension (unpacked):
     chrome://extensions → Developer mode ON → Load unpacked
     Folder: <project>/.output/chrome-mv3

   Extension ID (stable, no copy needed): ccdfmbhdcafhmnnnfjpbhgebfkfgjgca

2. Start the backend — double-click the desktop launcher:
     Windows: "Stickyfix Host" icon on Desktop (or stickyfix-host.bat)
     macOS:   stickyfix-host.command (double-click in Finder)
     Linux:   Stickyfix Host (Applications menu) or stickyfix-host.sh

3. Open the extension popup and click "Pair with host".
   The token is delivered automatically — no copy-paste needed.
```

## Deviations from Plan

### Auto-fixed Issues (original plan 09-02)

**1. [Rule 1 - Bug] TypeScript `parseArgs` values type is `string | boolean`**
- **Found during:** Task 1 tsc
- **Issue:** `values['extension-id']` has type `string | boolean` — passing directly to `registerNativeHost({ extensionId })` caused TS2345
- **Fix:** Added `typeof rawExtId !== 'string'` guard before use; extracted `const extensionId: string = rawExtId` after narrowing
- **Files modified:** bin/stickyfix.ts
- **Commit:** 00b0fa1

**2. [Rule 3 - Blocking] esbuild node_modules path separator fails on Windows CMD**
- **Found during:** Task 1 build
- **Issue:** `node_modules/.bin/esbuild ...` in npm scripts fails on Windows CMD with "not recognized as internal command"
- **Fix:** Changed to `npx esbuild ...` which resolves correctly cross-platform
- **Files modified:** package.json
- **Commit:** 00b0fa1

### Post-UAT Enhancements (wave-2 gap closure)

**E1: [SC-1/SC-4 Gap] --extension-id was required, now optional**
- Wave-2 UAT found SC-1 violated: user had to copy extension ID manually from chrome://extensions
- Fix: generate RSA keypair, add `key` to manifest, derive stable ID, default init to it
- Files: wxt.config.ts, host/src/extension-id.ts, .keys/*, .gitignore, bin/stickyfix.ts
- Commits: bf09283

**E2: [SC-4 Gap] Backend required manual terminal step to start**
- Wave-2 UAT found SC-4 violated: user had to run `npm run host` in a terminal
- Fix: createLauncherFiles() writes OS-appropriate double-click launchers; init output now shows terminal-free next-steps
- Files: host/src/bootstrap/register.ts, bin/stickyfix.ts, host/test/bootstrapper.test.ts
- Commits: aa3910b

## Known Stubs

- `host/src/native-host.ts` PICK_FOLDER branch: responds `{ type:'FOLDER_PICKED', folder: null }` — stub for Plan 04. SW handles `null` gracefully. Intentional per plan spec.
- Desktop `.lnk` shortcut is created asynchronously (fire-and-forget) — the batch file is the reliable fallback if PowerShell is slow or fails.

## Threat Flags

No new threat surface beyond plan's `<threat_model>`. Launcher creation mitigations:

| Threat ID | Status |
|-----------|--------|
| T-09-06 (pairing token via native messaging) | Mitigated — allowed_origins now defaults to stable derived ID; manifest key pins ID across machines |
| T-09-07 (native host opens no port) | Mitigated — no createHostServer/bindServer/.listen in native-host.ts |
| T-09-08 (origin-from-tab invariant) | Mitigated — handleSendAnnotation + chrome.tabs.get derivation untouched |
| T-09-09 (token at rest) | Accepted — same posture as Phase 3 manual entry |
| T-09-E2 (launcher subprocess injection) | Mitigated — execFile([argArray]) only; all path values are developer-controlled constants; no user/dynamic input in PowerShell script |
| Private key exposure | Mitigated — .keys/*.pem gitignored; only public data (.keys/manifest-key.txt, .keys/extension-id.txt) committed |

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| bin/stickyfix.ts exists | FOUND |
| host/src/native-host.ts exists | FOUND |
| host/src/extension-id.ts exists | FOUND |
| .keys/manifest-key.txt exists | FOUND |
| .keys/extension-id.txt contains ccdfmbhdcafhmnnnfjpbhgebfkfgjgca | FOUND |
| .keys/stickyfix-extension.pem NOT staged | CONFIRMED (untracked, gitignored) |
| dist/host/stickyfix-init.cjs exists | FOUND |
| dist/host/stickyfix-native.cjs exists | FOUND |
| manifest.json key field present | PASS |
| manifest.json nativeMessaging present | PASS |
| commit 00b0fa1 (Task 1) | FOUND |
| commit 498d2a7 (Task 2) | FOUND |
| commit be90044 (Task 3) | FOUND |
| commit bf09283 (Enhancement 1) | FOUND |
| commit aa3910b (Enhancement 2) | FOUND |
| npm test 160/160 | PASS |
| tsc --noEmit: 0 errors | PASS |
| npm run build: green | PASS |
| ONB-03 grep (no native API in content scripts) | PASS |
