---
phase: 02-host-mvp
fixed_at: 2026-05-31T00:00:00Z
review_path: .planning/phases/02-host-mvp/02-REVIEW.md
iteration: 1
findings_in_scope: 10
fixed: 10
skipped: 0
status: all_fixed
---

# Phase 2: Code Review Fix Report

**Fixed at:** 2026-05-31
**Source review:** .planning/phases/02-host-mvp/02-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 10 (CR-01, CR-02, WR-01..WR-06, IN-01, IN-02)
- Fixed: 10
- Skipped: 0

## Fixed Issues

### CR-01: checkToken byte-length guard, never throw 500 on auth

**Files modified:** `host/src/security.ts`, `host/test/security.test.ts`
**Commit:** 3adb12c
**Applied fix:** Replaced `provided.length !== expectedToken.length` (UTF-16 code units) with `Buffer.from(provided,'utf8')` / `Buffer.from(expectedToken,'utf8')` comparison on byte lengths. Buffers are built once and reused for `timingSafeEqual`. Added regression test: `'aéb'` (UTF-16 length 3, UTF-8 length 4) vs `'abc'` (UTF-16 length 3, UTF-8 length 3) returns `false` and never throws.

### CR-02: Decode screenshots before disk write, surface 400 on bad input

**Files modified:** `host/src/write-note.ts`, `host/src/server.ts`, `host/test/server.test.ts`
**Commit:** 3832843
**Applied fix:** In `writeNote`, all screenshots are decoded via `decodePngDataUrl` into `pngBuffers` before any `writeFile` call. A bad dataUrl throws `{statusCode:400}` before the `.md` is written — no partial on-disk state. In `handleAnnotation` (server.ts), the write-phase catch now reads `err.statusCode` and propagates 400-class errors as 400 (not hardcoded 500). Regression test: POST with a JPEG dataUrl prefix returns 400 and leaves notesDir unchanged.

### WR-01: Strip query string before route matching

**Files modified:** `host/src/server.ts`
**Commit:** 3a23a2c
**Applied fix:** Replaced `const url = req.url ?? '/'` with `const path = (req.url ?? '/').split('?', 1)[0]` and updated all route comparisons to use `path`. `/status?foo=1` and `/annotation?x=1` now route correctly.

### WR-02: Runtime payload shape guard before serial lock

**Files modified:** `host/src/server.ts`, `host/test/server.test.ts`
**Commit:** 14e2a97
**Applied fix:** Added a guard block after JSON.parse that checks `mode`, `comment`, `page.url`, `page.title`, `viewport.width/height/devicePixelRatio` are present and correctly typed. Returns 400 `{ok:false,error:'invalid payload'}` before reaching `withSerialLock`. Regression test: POST `{}` with valid token returns 400 and writes no files.

### WR-03: Await child exit with SIGKILL fallback in smoke test

**Files modified:** `scripts/host-smoke-test.mjs`
**Commit:** 343cebd
**Applied fix:** Replaced the fixed 200ms sleep with a `Promise` that resolves on the child's `'exit'` event; after 2 s falls back to `SIGKILL` to guarantee termination before `rmSync(tmpRoot)`. Eliminates EBUSY/EPERM race on Windows.

### WR-04: Assert PNG magic bytes after decode, reject zero-length buffers

**Files modified:** `host/src/write-note.ts`, `host/test/write-note.test.ts`
**Commit:** fa2037a
**Applied fix:** Added `PNG_SIGNATURE` constant (8-byte `89 50 4E 47 0D 0A 1A 0A`). After `Buffer.from(...,'base64')`, `decodePngDataUrl` now checks `buf.length < 8` (throws 400) and `buf.subarray(0,8).equals(PNG_SIGNATURE)` (throws 400 if mismatch). Two regression tests added: wrong magic bytes and empty base64 payload each return statusCode 400.

### WR-05: Validate --port range 1-65535, reject NaN/float/out-of-range

**Files modified:** `host/src/config.ts`, `host/test/config.test.ts`, `package.json`
**Commit:** 82059a0
**Applied fix:** In `resolveConfig`, replaced `const port = portStr ? Number(portStr) : undefined` with a validation block using `Number.isInteger(port) && port >= 1 && port <= 65535`. Invalid values throw `Error('--port must be an integer 1-65535, got: ...')`. New `config.test.ts` with 7 tests (valid port, undefined, garbage string, 0, 99999, negative, float).

### WR-06: Extract bindServer to bind.ts, removeAllListeners between port-scan attempts

**Files modified:** `host/src/bind.ts` (new), `host/src/index.ts`, `host/test/index.test.ts` (new), `package.json`
**Commit:** 972e6fb
**Applied fix:** Extracted `tryListen`, `bindServer`, `PORT_RANGE_START`, `PORT_RANGE_END`, `BIND_HOST` into `host/src/bind.ts`. `index.ts` imports from there. `bindServer` now calls `server.removeAllListeners('error'); server.removeAllListeners('listening')` before each attempt in the scan loop, making code and comment agree. Comment updated to document the single-server-reuse strategy. Regression test in `index.test.ts`: a blocker occupies 39240; `bindServer` resolves to 39241 and binds to 127.0.0.1 only.

### IN-01: Drop unused `base` parameter from buildFrontmatter

**Files modified:** `host/src/write-note.ts`
**Commit:** 2f432dd
**Applied fix:** Removed `base: string` as first parameter of `buildFrontmatter` (it was never read in the function body). Updated the call site in `writeNote`. `buildNoteBody` retains `base` — it is genuinely used to compose screenshot filenames like `${base}+${i+1}.png`.

### IN-02: Use reduce for max serial instead of spread

**Files modified:** `host/src/serial.ts`
**Commit:** 9b25002
**Applied fix:** Replaced `Math.max(...serials)` with `serials.reduce((a, b) => Math.max(a, b), 0)` to avoid call-stack limit on large `notes/` directories.

## Skipped Issues

None — all 10 findings were fixed.

---

**Verification:** `npm run check` exits 0.
- `tsc --noEmit` (root + host): clean
- `clean-room-check.mjs`: PASS
- `host-smoke-test.mjs`: PASS
- `node --test` (48 tests, 11 suites): 48 pass, 0 fail

_Fixed: 2026-05-31_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
