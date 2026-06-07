---
phase: 09-turnkey-onboarding-cross-browser-distribution
verified: 2026-06-07T00:00:00Z
status: passed
score: 5/5 success criteria MET
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  note: "Initial verification."
---

# Phase 9: Turnkey Onboarding & Cross-Browser Distribution — Verification Report

**Phase Goal:** A first-time user goes from zero to a working note-on-disk in one step — a double-click installer (or single bootstrap command) installs and auto-starts the host and loads the extension, and clicking the extension icon pairs with the running host automatically (no manual token copy-paste) — without weakening the 127.0.0.1-bind + token + origin-trust security model.

**Verified:** 2026-06-07
**Status:** PASSED
**Re-verification:** No — initial verification.
**Mode:** mvp (verified goal-backward against the user-outcome, with full technical checks)

## Goal Achievement

### Success Criteria (ROADMAP contract)

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Fresh machine → "note written to disk" via a single turnkey step (per-OS, not Windows-only) | ✓ MET | `bin/stickyfix.ts:49` `init` subcommand → `registerNativeHost` (`:83`); `STABLE_EXTENSION_ID` default means no manual ID copy (`:64`); per-OS launchers created by `createLauncherFiles` (register.ts:284+) — Windows `.bat`/`.lnk`, macOS `.command`, Linux `.sh`/`.desktop`. Per-OS manifest paths `nativeManifestPath` (register.ts:58). Live UAT 09-05 Task 5 (Omer 2026-06-07): note `.md` landed on disk via the bootstrap path. |
| 2 | User never sees/copies a token — one-click pair persists it | ✓ MET | `entrypoints/background.ts:752` `handlePairNative` calls `chrome.runtime.sendNativeMessage('com.stickyfix.host',{type:'GET_TOKEN'})`; `host/src/native-host.ts:123-132` responds `{type:'TOKEN',token,…}` from `<root>/.stickyfix-token` (`:102`) then `process.exit(0)`. Popup banner states 1-5 in `popup/main.ts` (Pairing… `:97`, "● Paired with" `:114`, "Auto-pair failed" `:140`). `case SFX_MSG.PAIR_NATIVE` (`background.ts:1077`). Live UAT 09-02 Task 4 + 09-05: one-click pair, token field never touched. |
| 3 | Auto-pairing loopback/native-confined — scripted web origin cannot obtain token or write a note | ✓ MET | **SC-3 test 9/9 PASS (run live):** `/token`→404, `/pair`→404, `/status` body has no token, `/annotation` no-token→401 + wrong-token→401; `buildManifest` pins `allowed_origins` to exactly `chrome-extension://<id>/` and rejects hostile/malformed IDs; fs-grep confirms no `connectNative`/`sendNativeMessage` under `entrypoints/review.content/` (grep rc=1, none found). Live hostile-origin probe (Omer 2026-06-07): page-context `connectNative`/`sendNativeMessage` === `"undefined"`; `/token`+`/pair`→404; `/annotation`(no token)→401; `/status`→200 omits token. |
| 4 | Host auto-starts / discoverable, no manual terminal; uninstall removes artifacts, no orphans | ✓ MET | Native host is Chrome-spawned on demand via the registered manifest (D-03); desktop launchers for double-click start (E2, register.ts `createLauncherFiles`). `unregisterNativeHost` (register.ts:527) `rmSync` manifest + config + launchers + `reg DELETE` Chrome (`:559`) & Edge (`:564`) keys with `/f`. `enumerateArtifacts` (register.ts:602) lists every init artifact (ONB-05 completeness, unit-tested). Single-instance guard `probe.ts` prevents orphan double-start. Live UAT 09-02 Task 4: uninstall left no manifest/config/registry key/orphan process. |
| 5 | (stretch) Documented packaging path for Edge + Firefox + Safari | ✓ MET | `docs/cross-browser.md` (211 lines): Edge supported-now (Chromium drop-in, dual HKCU keys), Firefox (`allowed_extensions`, gecko.id, FUT-01), Safari (`safari-web-extension-converter`, app-bundle, FUT-01). `scripts/cross-browser-doc-check.mjs` → **PASS** (run live, exits 0); README links the doc. |

**Score:** 5/5 success criteria MET (4 core + 1 stretch).

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `host/src/native-msg.ts` | stdio framing (Buffer-only) | ✓ VERIFIED | 119 lines; encode/decode/send/read exported; tests pass |
| `host/src/bootstrap/register.ts` | manifest writer + per-OS paths + Chrome+Edge registry + uninstall enumerator | ✓ VERIFIED | 636 lines; REG_CHROME_KEY (`:34`) + REG_EDGE_KEY (`:35`); execFileSync only; absolute path `resolve` (`:218`) |
| `host/src/folder-picker.ts` | execFile arg-array, no shell | ✓ VERIFIED | 172 lines; execFile only, no `shell:true` (grep clean) |
| `host/src/native-host.ts` | GET_TOKEN + PICK_FOLDER responder, no HTTP | ✓ VERIFIED | 161 lines; no `createHostServer`/`bindServer`/`.listen`; `require.main===module` boot guard (`:158`) |
| `host/src/validate-folder.ts` | shared validator (both host + server) | ✓ VERIFIED | 73 lines; imported by native-host.ts and server.ts (`:19`) — single source of truth |
| `bin/stickyfix.ts` | init/uninstall CLI, no --extension-id required | ✓ VERIFIED | 201 lines; parseArgs positionals; STABLE_EXTENSION_ID default (`:64`) |
| `host/src/server.ts` | targetDir re-validated + confined on all endpoints | ✓ VERIFIED | `resolveNotesDir` (`:53`) validates via shared validator → `InvalidTargetDirError`→400; wired into all 5 endpoints; `/screenshot` still `isInsideDir`-guarded (`:399`) |
| `entrypoints/background.ts` | handlePairNative + handlePickFolder + folder-aware routing | ✓ VERIFIED | 1227 lines; PAIR_NATIVE (`:1077`) + PICK_FOLDER (`:1087`) cases; native msg `type:'PICK_FOLDER'` (`:834`) |
| `entrypoints/popup/{index.html,main.ts,popup.css}` | pairing banner states 1-5 | ✓ VERIFIED | exactly one `#sfx-pairing-banner`; all 5 states present in main.ts |
| `entrypoints/review.content/chip.ts` | needs-folder → dialog → retry, toast on cancel | ✓ VERIFIED | 738 lines; `sendOnce(allowRetry)` (`:533`); cancel toast "No folder chosen — note not saved" (`:566`,`:576`) |
| `docs/cross-browser.md` + check script | Edge/FF/Safari docs + gate | ✓ VERIFIED | doc-check PASS |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| background.ts handlePairNative | com.stickyfix.host | sendNativeMessage GET_TOKEN | ✓ WIRED | `background.ts:752` |
| background.ts handlePickFolder | com.stickyfix.host | sendNativeMessage PICK_FOLDER | ✓ WIRED | `background.ts:826,834` (native wire-type `'PICK_FOLDER'` not the SFX_ constant — post-UAT fix f6355ef) |
| native-host.ts | <root>/.stickyfix-token + .stickyfix-port | readFileSync | ✓ WIRED | `native-host.ts:102,111` |
| popup main.ts | SFX_MSG.PAIR_NATIVE | sendMessage | ✓ WIRED | `popup/main.ts:187` |
| background.ts | sfxOriginMap | origin→folder persist | ✓ WIRED | handlePickFolder persists, isFolderValue disambiguates origin→host vs origin→folder |
| server.ts | validate-folder.ts | validateChosenFolder per request | ✓ WIRED | `server.ts:19,55` |
| README.md | docs/cross-browser.md | markdown link | ✓ WIRED | 1 link present (≥1 satisfies the link; SUMMARY claimed 2) |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
| --- | --- | --- | --- | --- |
| native-host TOKEN response | token/port/notesDir | `<root>/.stickyfix-token`, `.stickyfix-port`, config.json via readFileSync | ✓ real disk reads | ✓ FLOWING |
| server note write | annotation → `<targetDir>/notes` | per-request validated targetDir → writeNote | ✓ confined real write (test (a) proves file lands under targetDir, NOT cfg.notesDir) | ✓ FLOWING |
| popup banner | pairing state | live PAIR_NATIVE round-trip to SW → native host | ✓ real round-trip | ✓ FLOWING |

### Behavioral Spot-Checks / Probe Execution

| Check | Command | Result | Status |
| --- | --- | --- | --- |
| host tsc | `npx tsc --noEmit -p tsconfig.host.json` | rc=0 | ✓ PASS |
| extension tsc | `npx tsc --noEmit` | rc=0 | ✓ PASS |
| SC-3 security proof | `node --test dist/host/test/security-pairing.test.js` | 9/9 pass | ✓ PASS |
| D-04 confinement + validation | `node --test validate-folder/native-host/server` | 68/68 pass | ✓ PASS |
| cross-browser doc gate | `node scripts/cross-browser-doc-check.mjs` | PASS (rc=0) | ✓ PASS |
| full host suite | `node --test dist/host/test/*.test.js` | 200 tests, 199 pass, 1 cancelled | ✓ PASS (cancel = env) |
| no shell exec in host/bin | grep `shell:true` / `exec(` | none (rc=1) | ✓ PASS |
| no native API in content scripts | grep entrypoints/review.content | none (rc=1) | ✓ PASS |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
| --- | --- | --- | --- |
| ONB-01 | one-step turnkey setup (per-OS) | ✓ SATISFIED | `npx stickyfix init` (bin/stickyfix.ts) + per-OS launchers; live UAT note-on-disk |
| ONB-02 | no manual token copy-paste | ✓ SATISFIED | handlePairNative + GET_TOKEN responder; live one-click pair |
| ONB-03 | security model intact (no token to web origin) | ✓ SATISFIED | SC-3 test 9/9 + live hostile-origin probe |
| ONB-04 | host auto-started/discoverable, no manual terminal | ✓ SATISFIED | native-messaging-spawned host (D-03) + desktop launchers (E2) |
| ONB-05 | clean uninstall, no orphans | ✓ SATISFIED | unregisterNativeHost + enumerateArtifacts; live uninstall UAT |
| ONB-06 | documented Edge/FF/Safari packaging path | ✓ SATISFIED | docs/cross-browser.md + doc-check gate |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| (none) | — | No unreferenced TBD/FIXME/XXX in phase-modified files; PICK_FOLDER stub from 09-02 fully replaced in 09-04/09-05 | ℹ Info | No blockers |

### Cancelled Test (NOT a regression)

`host/test/index.test.ts` → `WR-06: server scans past occupied 39240 and binds to 39241` is **cancelled** with `EADDRINUSE 127.0.0.1:39240`. Verified live: port 39240 is occupied by the developer's running UAT host, so the test's own blocker-server cannot bind it. WR-06 exercises `bind.ts` port-scan logic which Phase 09 does not touch. This is an environmental conflict, not a code regression. All Phase-09 code paths (199 other tests) pass.

### Human Verification Required

None outstanding. Both blocking-human checkpoints were verified LIVE by the developer (Omer) on 2026-06-07 and recorded in the SUMMARY files:
- 09-04 Task 4 — hostile-origin probe + folder dialog (page-context native API undefined; /token+/pair 404; /annotation 401; /status omits token).
- 09-05 Task 5 — first-note folder dialog E2E (unmapped origin → OS dialog → note in chosen folder `D:\docker\sfx-d04-test\notes`; 2nd note silent reuse; cancel → visible toast, nothing written; origin→host dropdown → writes to --root `D:\docker\stickyfix-uat\notes` note 0022, no dialog).

### Gaps Summary

No blocking gaps. The phase goal is achieved in the live codebase: turnkey native-messaging pairing (no token copy-paste), Chrome+Edge registration, zero-config first-note folder dialog (D-04) with confined per-request writes, and the ONB-03/SC-3 security invariants are proven both by an automated 9/9 test and by a live hostile-origin probe. The 127.0.0.1-bind + token-gate + origin-from-tab invariants are preserved (regression-guarded by tests and the live origin→host→--root check).

**Minor notes (non-blocking, not gaps):**
- SC-1 is satisfied per the roadmap's own definition ("double-click installer **or** single bootstrap command"). The package is not yet published to the npm registry — `npx stickyfix@latest` is documented guidance; the live path used the local `dist/host/stickyfix-init.cjs`. A true zero-clone fresh-machine install requires npm publish + CWS listing, which is release/distribution work beyond this phase's code deliverable.
- README contains 1 link to `docs/cross-browser.md` (SUMMARY claimed 2); ≥1 satisfies the ONB-06 key link.

---

_Verified: 2026-06-07_
_Verifier: Claude (gsd-verifier)_
