---
phase: 02-host-mvp
verified: 2026-05-31T00:00:00Z
status: passed
score: 13/13 must-haves verified
overrides_applied: 0
---

# Phase 2: Host MVP Verification Report

**Phase Goal:** Running `npm run host -- --root <dir>` starts a server on 127.0.0.1 that accepts POST /annotation with token auth, assigns serials via a mutex, and writes .md + .png files safely inside --root.
**Verified:** 2026-05-31
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Step 0: Previous Verification

No previous VERIFICATION.md found. Initial mode.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | HOST-01: `npm run host` prints startup JSON with app/name/port/token/notesDir/origins | VERIFIED | `index.ts:60-68` prints JSON line; smoke test asserts it; all fields present |
| 2 | HOST-02: Server binds 127.0.0.1 only | VERIFIED | `bind.ts:12` `BIND_HOST='127.0.0.1'`; `index.ts:55` safety assertion; `server.test.ts` asserts `addr.address==='127.0.0.1'`; no `0.0.0.0` in src |
| 3 | HOST-03: Free port in 39240–39260 (or honors --port) | VERIFIED | `bind.ts:10-11,66-73` range scan; `bindServer` honors preferredPort first; `index.test.ts` asserts skip-past-39240 lands on 39241 |
| 4 | HOST-04: GET /status returns {app,version,name,root,notesDir,origins}, no token required, token field absent | VERIFIED | `server.ts:46-58`; `server.test.ts` asserts `body.token===undefined`; smoke test asserts `status.token===undefined` |
| 5 | HOST-05: POST /annotation without/wrong X-Stickyfix-Token → 401 | VERIFIED | `server.ts:75-78`; `security.ts:22-31` `checkToken` with timingSafeEqual; `security.test.ts` covers missing/wrong/exact; `server.test.ts` two 401 cases; smoke test 401 assertion |
| 6 | HOST-06: Serial mutex yields 0001/0002 under concurrency, no collision | VERIFIED | `serial.ts:15-19` promise-queue mutex; `serial.test.ts` `Promise.all` concurrent test asserts distinct `['0001','0002']` and 2 files on disk |
| 7 | HOST-07: .md written with YAML frontmatter (id/created/mode/url/title/viewport/status:unread) | VERIFIED | `write-note.ts:71-99` `buildFrontmatter`; `write-note.test.ts` parses frontmatter, asserts all required keys and `status==='unread'` |
| 8 | HOST-08: Decoded +N.png written next to .md; listed in frontmatter and body | VERIFIED | `write-note.ts:171-185` decode-before-write; `write-note.test.ts` asserts `+1.png` exists, non-zero bytes, in frontmatter screenshots array and body Screenshots section |
| 9 | HOST-09: Path traversal rejected; notesDir outside --root rejected | VERIFIED | `security.ts:78-83` `isInsideDir` with `path.sep`; `config.ts:47-50` throws on notesDir outside root; `security.test.ts` covers `../sibling` and `rootfoo` sibling-prefix |
| 10 | HOST-10: CORS echoes Origin + allows X-Stickyfix-Token; OPTIONS → 204 | VERIFIED | `server.ts:26-30,35-39` `setCorsHeaders`/`setPreflightHeaders`; called at top of every handler (Pitfall 6); `server.test.ts` asserts echoed Origin on OPTIONS 204 and on 401 error responses |
| 11 | HOST-11: >12 MB body → 413 | VERIFIED | `security.ts:51-55` `readBody` cap with `req.destroy()`; `server.ts:85-91` maps `statusCode 413`; `security.test.ts` over-cap rejects with `statusCode===413` |
| 12 | HOST-12: Notes dir created with .gitkeep; .stickyfix-token written | VERIFIED | `config.ts:80-86` `ensureNotesDir` creates dir + .gitkeep; `config.ts:101-107` `writeTokenFile` with mode 0o600; called in `index.ts:43-44` |
| 13 | HOST-13: --origin/--name/--notes-dir/--token/--port/--root parsed via util.parseArgs | VERIFIED | `index.ts:21-31` full parseArgs options block; `config.ts:32-69` `resolveConfig` consumes all flags; token resolution order --token → STICKYFIX_TOKEN → randomUUID() |

**Score:** 13/13 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `host/src/types.ts` | AnnotationPayload, Config, ElementContext, Screenshot interfaces | VERIFIED | All 4 interfaces exported; matches PRD §9.1 shape |
| `host/src/serial.ts` | withSerialLock, getNextSerial | VERIFIED | Module-level promise queue; reduce-based max scan |
| `host/src/security.ts` | checkToken, readBody, isInsideDir | VERIFIED | Byte-length guard (CR-01 fix); path.sep guard; req.destroy on 413 |
| `host/src/write-note.ts` | writeNote, decodePngDataUrl, buildFrontmatter, buildNoteBody, localTimestamp | VERIFIED | PNG_SIGNATURE magic-byte check (WR-04 fix); decode-before-write (CR-02 fix) |
| `host/src/config.ts` | resolveConfig, ensureNotesDir, writeTokenFile, VERSION | VERIFIED | Port 1-65535 validation (WR-05 fix); owner-only token file; D-07 token order |
| `host/src/server.ts` | createHostServer with routing, CORS, /status, /annotation | VERIFIED | WR-01 query-strip; WR-02 payload guard; CR-02 statusCode propagation; setCorsHeaders on all paths |
| `host/src/index.ts` | CLI boot sequence binding 127.0.0.1 | VERIFIED | Delegates to bind.ts; safety assertion on bound address |
| `host/src/bind.ts` | tryListen, bindServer, BIND_HOST, PORT_RANGE_START/END | VERIFIED | WR-06 fix: removeAllListeners between scan attempts |
| `host/test/serial.test.ts` | Concurrency + queue-poison tests | VERIFIED | 4 tests pass |
| `host/test/security.test.ts` | Token/path/body-cap tests + CR-01 regression | VERIFIED | 9 tests pass including multibyte regression |
| `host/test/write-note.test.ts` | Free/element mode + PNG decode + WR-04 regressions | VERIFIED | 14 tests pass |
| `host/test/server.test.ts` | Integration: /status, 401 gate, write-to-disk, OPTIONS, CORS on errors, CR-02/WR-02 regressions | VERIFIED | 11 tests pass |
| `host/test/config.test.ts` | Port validation (WR-05) | VERIFIED | 7 tests pass |
| `host/test/index.test.ts` | Port-scan skip-occupied (WR-06) | VERIFIED | 1 test passes |
| `scripts/host-smoke-test.mjs` | spawn+readline end-to-end driver; no hang | VERIFIED | SIGTERM + SIGKILL fallback (WR-03 fix); exits cleanly; asserts port in range, /status, 401, 200+.md |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `host/src/index.ts` | `host/src/server.ts` | `createHostServer(cfg)` | WIRED | `index.ts:50` imports and calls `createHostServer` |
| `host/src/index.ts` | `host/src/bind.ts` | `bindServer(server, cfg.port)` | WIRED | `index.ts:15,51` imports `bindServer`, `BIND_HOST` |
| `host/src/server.ts` | `host/src/security.ts` | `checkToken + readBody` | WIRED | `server.ts:13` import; `server.ts:75,84` call sites |
| `host/src/server.ts` | `host/src/serial.ts` | `withSerialLock(getNextSerial + writeNote)` | WIRED | `server.ts:14,122-125` nested inside lock |
| `host/src/server.ts` | `host/src/write-note.ts` | `writeNote` inside lock | WIRED | `server.ts:15,124` |
| `host/src/config.ts` | `host/src/security.ts` | `isInsideDir` for notesDir guard | WIRED | `config.ts:13,47` |
| `scripts/host-smoke-test.mjs` | `dist/host/src/index.js` | `spawn + readline startup line` | WIRED | `host-smoke-test.mjs:31,45` |
| `package.json` | `node --test dist/host/test/*.js` | `test` script folded into `check` | WIRED | All 6 test files listed explicitly in scripts.test |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `server.ts` /status | cfg.name/root/notesDir/origins | `resolveConfig` from CLI args | Yes — real filesystem resolve | FLOWING |
| `server.ts` POST /annotation | payload | `readBody` → JSON.parse → validated shape | Yes — from HTTP request body | FLOWING |
| `write-note.ts` writeNote | serial | `getNextSerial(notesDir)` readdirSync scan | Yes — real dir read | FLOWING |
| `write-note.ts` writeNote | pngBuffers | `decodePngDataUrl` from payload.screenshots | Yes — base64 decode with magic-byte validation | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| npm run build exits 0 | `npm run build` | exit 0; WXT + tsc clean | PASS |
| npm run check exits 0 (tsc x2 + clean-room + smoke + 48 tests) | `npm run check` | exit 0; 48 pass, 0 fail | PASS |
| Smoke: startup app=stickyfix, port in 39240-39260 | `node scripts/host-smoke-test.mjs` (within check) | `smoke test: PASS` | PASS |
| Smoke: no-token POST → 401 | Assertion in smoke test | Verified | PASS |
| Smoke: token POST → 200 + .md on disk | Assertion in smoke test | Verified | PASS |
| No 0.0.0.0 bind in source | grep host/src | Only comment reference in bind.ts:12 | PASS |

---

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes exist. The equivalent gate is `npm run check` which includes the spawn-based smoke test. See Behavioral Spot-Checks above — exit 0 confirmed.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| HOST-01 | 02-02, 02-03 | Startup line with name/port/token/notesDir/origins | SATISFIED | `index.ts:60-68`; smoke test readline assertion |
| HOST-02 | 02-02 | 127.0.0.1 only, not LAN-reachable | SATISFIED | `bind.ts:12`; safety assertion `index.ts:55`; integration test `addr.address==='127.0.0.1'` |
| HOST-03 | 02-02 | Free port 39240–39260 or --port | SATISFIED | `bind.ts:10-11,50-73`; `index.test.ts` skips occupied port |
| HOST-04 | 02-02 | GET /status no-token JSON | SATISFIED | `server.ts:46-58`; token absent assertion in integration + smoke tests |
| HOST-05 | 02-01, 02-02 | Token auth, missing/wrong → 401 | SATISFIED | `security.ts:22-31`; 3 test cases in `security.test.ts` + `server.test.ts` |
| HOST-06 | 02-01 | Serial mutex, 0001/0002 no collision | SATISFIED | `serial.ts:15-19`; concurrent `Promise.all` test in `serial.test.ts` |
| HOST-07 | 02-01 | .md with YAML frontmatter (§9.2) | SATISFIED | `write-note.ts:71-99`; `write-note.test.ts` frontmatter key assertions |
| HOST-08 | 02-01 | Decoded +N.png next to .md | SATISFIED | `write-note.ts:171-185`; `write-note.test.ts` +1.png existence + content |
| HOST-09 | 02-01 | Path traversal + notesDir-outside-root rejected | SATISFIED | `security.ts:78-83` + `config.ts:47-50`; `security.test.ts` traversal + sibling-prefix cases |
| HOST-10 | 02-02 | CORS echoes Origin, allows X-Stickyfix-Token, OPTIONS 204 | SATISFIED | `server.ts:26-40`; `server.test.ts` OPTIONS + 401-with-CORS tests |
| HOST-11 | 02-01 | >12 MB body → 413 | SATISFIED | `security.ts:51-55`; `security.test.ts` over-cap rejection |
| HOST-12 | 02-01, 02-02 | .gitkeep + .stickyfix-token written | SATISFIED | `config.ts:80-86,101-107`; called in `index.ts:43-44`; token file mode 0o600 |
| HOST-13 | 02-01 | All flags parsed via util.parseArgs | SATISFIED | `index.ts:21-31` full options block; D-07 token order in `config.ts:64-67` |

All 13 HOST requirements SATISFIED.

---

### Security Review Fixes Confirmed Present

| Finding | Fix Applied | Evidence |
|---------|-------------|---------|
| CR-01: checkToken byte-length guard (no RangeError 500) | Yes | `security.ts:28-31` builds UTF-8 buffers, compares `a.length !== b.length`; regression test in `security.test.ts` |
| CR-02: Decode screenshots before disk write | Yes | `write-note.ts:171` `pngBuffers` computed before any `writeFile`; `server.ts:130-133` propagates statusCode |
| WR-01: Strip query string before route matching | Yes | `server.ts:151` `.split('?',1)[0]` |
| WR-02: Payload shape guard before serial lock | Yes | `server.ts:103-118` runtime guard; regression test in `server.test.ts` |
| WR-03: Await child exit with SIGKILL fallback | Yes | `host-smoke-test.mjs:183-192` |
| WR-04: PNG magic-byte check + zero-length rejection | Yes | `write-note.ts:31,47-58`; 2 regression tests in `write-note.test.ts` |
| WR-05: --port range 1-65535 validated | Yes | `config.ts:56-60`; `config.test.ts` 7 tests |
| WR-06: removeAllListeners between port-scan attempts | Yes | `bind.ts:67-68`; extracted to `bind.ts`; `index.test.ts` |
| IN-01: Drop unused `base` from buildFrontmatter | Yes | `write-note.ts:71-74` — `base` parameter removed |
| IN-02: reduce for max serial | Yes | `serial.ts:34` `serials.reduce(...)` |

---

### Anti-Patterns Found

Scanned all 12 files modified by phase. Zero blockers.

| File | Pattern | Severity | Assessment |
|------|---------|----------|------------|
| `write-note.ts:107` | `buildNoteBody(base, ...)` — `base` retained | Info | `base` IS used at line 109 for `${base}+${i+1}.png`; not dead code |
| No TBD/FIXME/XXX markers | — | — | Clean |
| No `return null` / `return {}` stubs | — | — | All implementations substantive |

---

### Human Verification Required

None. This is a host/server phase — all behaviors are fully automatable and all checks were executed programmatically.

`npm run check` exits 0 with:
- `tsc --noEmit` (extension): clean
- `tsc --noEmit -p tsconfig.host.json`: clean
- `node scripts/clean-room-check.mjs`: PASS
- `node scripts/host-smoke-test.mjs`: PASS (spawn+readline, exits cleanly)
- `node --test` (48 tests, 11 suites): 48 pass, 0 fail

---

### Gaps Summary

No gaps. All 13 HOST requirements verified in code. All security review fixes confirmed present. 48 tests pass. Build and check gates green.

---

_Verified: 2026-05-31_
_Verifier: Claude (gsd-verifier)_
