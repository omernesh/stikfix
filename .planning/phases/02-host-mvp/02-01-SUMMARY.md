---
phase: 02-host-mvp
plan: "01"
subsystem: host
tags: [serial-mutex, security, path-safety, body-cap, yaml-frontmatter, png-decode, node-test, tdd]
dependency_graph:
  requires: [01-scaffold-clean-room-foundation]
  provides: [host/src/types.ts, host/src/serial.ts, host/src/security.ts, host/src/write-note.ts, host/src/config.ts]
  affects: [host/test/serial.test.ts, host/test/security.test.ts, host/test/write-note.test.ts, package.json, tsconfig.host.json]
tech_stack:
  added: []
  patterns:
    - promise-queue mutex for serial assignment (no file locking)
    - timingSafeEqual with length pre-check for token auth
    - path.resolve + startsWith(root+sep) for path-traversal guard
    - streaming body accumulation with hard 12 MB cap + req.destroy()
    - yaml.stringify for YAML frontmatter (handles colons/quotes in URLs/titles)
    - Buffer.from(b64, 'base64') for PNG data-URL decode
    - import.meta.url to read package.json version at runtime
key_files:
  created:
    - host/src/types.ts
    - host/src/serial.ts
    - host/src/security.ts
    - host/src/write-note.ts
    - host/src/config.ts
    - host/test/serial.test.ts
    - host/test/security.test.ts
    - host/test/write-note.test.ts
  modified:
    - tsconfig.host.json
    - package.json
    - scripts/host-smoke-test.mjs
decisions:
  - tsconfig.host.json rootDir changed from host/src to host so test files compile to dist/host/test/
  - test script paths use dist/host/test/ prefix (not flat dist/host/) per rootDir layout
  - host script path updated to dist/host/src/index.js; smoke test HOST_DIST updated accordingly
  - writeNote takes serial as a parameter (not calling getNextSerial internally) for clean separation
  - screenshots key always present in frontmatter (empty array for no-screenshot notes)
metrics:
  duration: "~25 minutes"
  completed: "2026-05-31"
  tasks: 4
  files: 11
---

# Phase 02 Plan 01: Pure Host Modules + Unit Tests Summary

**One-liner:** Promise-queue serial mutex, timingSafeEqual token auth, path.sep traversal guard, 12 MB body cap, yaml.stringify YAML frontmatter + PNG data-URL decode — 26 node:test unit tests, all green.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | types.ts + serial.ts + serial.test.ts | 69be083 | host/src/types.ts, host/src/serial.ts, host/test/serial.test.ts, tsconfig.host.json, package.json, scripts/host-smoke-test.mjs |
| 2 | security.ts + security.test.ts | b9fcaf4 | host/src/security.ts, host/test/security.test.ts |
| 3 | write-note.ts + write-note.test.ts | 0a47b1b | host/src/write-note.ts, host/test/write-note.test.ts |
| 4 | config.ts | e151cbb | host/src/config.ts |

## Verification Results

- `npx tsc --noEmit`: PASS (extension tsconfig)
- `npx tsc --noEmit -p tsconfig.host.json`: PASS (host + test tsconfig)
- `node --test dist/host/test/serial.test.js`: 4/4 PASS
- `node --test dist/host/test/security.test.js`: 10/10 PASS
- `node --test dist/host/test/write-note.test.js`: 12/12 PASS
- `node scripts/clean-room-check.mjs`: PASS (no banned identifiers)
- `node scripts/host-smoke-test.mjs`: PASS

**Total: 26/26 unit tests passing.**

## Security Threat Coverage

| Threat | Status | Where |
|--------|--------|-------|
| T-02-auth (token tampering) | MITIGATED | checkToken: timingSafeEqual, length check first |
| T-02-traversal (path escape) | MITIGATED | isInsideDir: resolve + startsWith(root+sep) |
| T-02-dos (body OOM) | MITIGATED | readBody: 12 MB cap, req.destroy() before reject |
| T-02-timing (timing oracle) | MITIGATED | timingSafeEqual constant-time comparison |

## Deviations from Plan

### Structural Deviation (auto-handled)

**[Rule 3 - Blocking] tsconfig.host.json rootDir changed from `host/src` to `host`**

- **Found during:** Task 1 setup
- **Issue:** With `rootDir: "host/src"`, TypeScript cannot compile `host/test/**/*.ts` because the test directory is outside rootDir. The plan requires both src and test to compile into `dist/host/`.
- **Fix:** Changed `rootDir` from `"host/src"` to `"host"`. This means compiled output paths shift: `host/src/serial.ts` → `dist/host/src/serial.ts` and `host/test/serial.test.ts` → `dist/host/test/serial.test.js`.
- **Downstream adjustments:**
  - `package.json` `test` script uses `dist/host/test/` prefix for test file paths
  - `package.json` `host` script updated from `dist/host/index.js` to `dist/host/src/index.js`
  - `scripts/host-smoke-test.mjs` `HOST_DIST` updated to `dist/host/src/index.js`
- **Plan note:** The plan listed `dist/host/serial.test.js` (flat) but that path layout is incompatible with having test sources in `host/test/` and src in `host/src/`. The `dist/host/test/` layout is equivalent and correct.

### Implementation Decision

**writeNote takes `serial` as a parameter (not calling `getNextSerial` internally)**

- The plan spec says "serial passed in by the caller, which holds the lock" — implemented exactly that way. Server code (Plan 02) will call `getNextSerial` inside `withSerialLock` and pass the result to `writeNote`. This keeps write-note.ts cleanly unit-testable without a mutex dependency.

## Known Stubs

None. All module contracts are fully implemented. Plan 02 (server.ts + index.ts) will wire these modules into the HTTP server.

## Threat Flags

None. No new network endpoints, auth paths, or file access patterns beyond those in the plan's threat model.

## Self-Check: PASSED

- host/src/types.ts: FOUND
- host/src/serial.ts: FOUND
- host/src/security.ts: FOUND
- host/src/write-note.ts: FOUND
- host/src/config.ts: FOUND
- host/test/serial.test.ts: FOUND
- host/test/security.test.ts: FOUND
- host/test/write-note.test.ts: FOUND
- Commits 69be083, b9fcaf4, 0a47b1b, e151cbb: all FOUND in git log
