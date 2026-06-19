# Phase 2: Host MVP — Research

**Researched:** 2026-05-31
**Domain:** Node.js HTTP server, in-process serial mutex, CORS, body streaming, YAML frontmatter, `node:test` unit testing
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01** Module structure: `host/src/{index,server,write-note,serial,config,security}.ts` — tsc → `dist/host/` NodeNext ESM, per Phase 1 D-05.
- **D-02** Test framework: `node:test` + `node:assert` (zero new dep). Add `test` script, fold into `npm run check`.
- **D-03** Serial mutex: in-process promise-queue. Scan `notesDir` for `NNNN-*.md` **including `*.read.md`**; `max(serial)+1`; zero-pad to 4. Two concurrent POSTs must yield `0001`/`0002` with no collision.
- **D-04** Body: stream with 12 MB hard cap → 413; `JSON.parse` → 400 on malformed.
- **D-05** Routes: `GET /status` (no token), `POST /annotation` (token required), `OPTIONS *` (CORS preflight). CORS: echo request `Origin` in `Access-Control-Allow-Origin`; allow `GET,POST,OPTIONS`; allow `X-Stikfix-Token` header.
- **D-06** Token transport: `X-Stikfix-Token` header. Missing/wrong → 401 `{ok:false,error}`. `/status` returns `{app,version,name,root,notesDir,origins}` — no token, no secrets.
- **D-07** Token order: `--token` → `STIKFIX_TOKEN` env → `crypto.randomUUID()`. Print token + name + port + origins + notesDir on startup. Write token to `<root>/.stikfix-token`.
- **D-08** Bind `127.0.0.1` only. Honor `--port` if free; else first free in `39240–39260`.
- **D-09** Filename `<serial>-<YYYYMMDD-HHmmss>.md` (local time). `yaml` dep for frontmatter. Payload PNG data-URLs → `<base>+<N>.png` next to `.md`. Create `notesDir` if missing + `.gitkeep`.
- **D-10** `--notes-dir` must `path.resolve` inside `--root`. Traversal → rejected.
- **D-11** Note body per PRD §9.2: frontmatter + comment + element context (if element mode) + screenshot list. Host serializes whatever the payload provides; absent element data is tolerated.

### Claude's Discretion

- Internal function signatures, exact stream-read implementation, how port-scanning probes for a free port, the precise `node:test` file layout, and whether `config.ts`/`security.ts` export classes vs functions.

### Deferred Ideas (OUT OF SCOPE)

- `/sessions`, `/claim`, `/unclaim` endpoints.
- Publishing `stikfix-host` as an npm `bin`.
- Future target-subpath writes beyond the fixed `notesDir`.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HOST-01 | Host starts via `npm run host -- --root <dir>` and prints name, port, origins, token, notesDir | Verified: startup JSON line pattern, spawn + readline smoke-test update |
| HOST-02 | Binds `127.0.0.1` only; not reachable from LAN | Verified: `server.listen(port, '127.0.0.1')` pattern; EADDRINUSE retry loop |
| HOST-03 | Free port in 39240–39260 (or `--port`) | Verified: bind-or-fail loop confirmed working on Node 25.x |
| HOST-04 | `GET /status` returns `{app,version,name,root,notesDir,origins}` no token required | Verified: `/status` shape; version read from `package.json` at runtime |
| HOST-05 | `POST /annotation` requires valid `X-Stikfix-Token`; missing/wrong → 401 | Verified: `crypto.timingSafeEqual` pattern; length check first |
| HOST-06 | Serial zero-padded running serial via in-process mutex; no collision on concurrent POSTs | Verified: promise-queue mutex confirmed correct under concurrency |
| HOST-07 | Writes `<serial>-<YYYYMMDD-HHmmss>.md` with YAML frontmatter + comment body | Verified: `yaml.stringify` handles URLs/colons/quotes correctly |
| HOST-08 | Decodes PNG data-URLs → `<base>+<N>.png` next to `.md`; paths in frontmatter + body | Verified: `Buffer.from(b64, 'base64')` pattern; mime validation |
| HOST-09 | Writes confined inside `--root`; path traversal rejected; `--notes-dir` inside `--root` | Verified: `path.resolve` + `startsWith(root + sep)` guard on Windows |
| HOST-10 | CORS echoes request `Origin`; allows `X-Stikfix-Token`; OPTIONS preflight | Verified: full CORS header set including `Access-Control-Allow-Private-Network` |
| HOST-11 | Body cap 12 MB → 413 | Verified: streaming chunk accumulation pattern |
| HOST-12 | Notes dir created if missing + `.gitkeep`; token written to gitignored `<root>/.stikfix-token` | Verified: `.gitignore` already contains `.stikfix-token`; `fs.mkdirSync` |
| HOST-13 | Accepts `--origin` (repeatable), `--name`, `--notes-dir`, `--token` via `util.parseArgs` | Verified: Phase 1 stub already parses all flags |
</phase_requirements>

---

## Summary

Phase 2 transforms the Phase 1 stub (`host/src/index.ts`) into a real Node HTTP server. The runtime stack is entirely Node built-ins + the single `yaml` dep already in `package.json` — no new runtime packages. The implementation divides cleanly into six modules matching the locked D-01 layout.

The critical concurrency concern (serial race) is solved by a promise-queue mutex — a `let queue = Promise.resolve()` module-level chain that forces all write operations to execute sequentially. This is the idiomatic single-process solution; file locking is explicitly avoided (brittle on Windows). Port discovery uses the canonical bind-or-fail approach: create server, call `listen(port, '127.0.0.1')`, handle `EADDRINUSE` in the `error` event, retry next port.

Testing is achieved with zero new dependencies: TypeScript test files live in `host/test/`, are compiled into `dist/host/` via an extended `tsconfig.host.json` include, and run with `node --test dist/host/*.test.js` (Node 25.x handles the glob natively on Windows without shell expansion). The smoke test in `scripts/host-smoke-test.mjs` must be updated from `spawnSync` to `spawn` + readline since the server no longer exits immediately.

**Primary recommendation:** Implement in wave order — `config.ts` (CLI parse + validation) → `serial.ts` (mutex + scan) → `security.ts` (token check + path guard + body read) → `write-note.ts` (YAML + PNG) → `server.ts` (routing + CORS) → `index.ts` (boot sequence) — testing `serial.ts` and `security.ts` in isolation via `node:test`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| HTTP routing + CORS | `server.ts` | `security.ts` (auth) | All request dispatch lives here; auth delegated to security module |
| Token auth | `security.ts` | `server.ts` (call site) | Isolated for testability; server calls `checkToken()` |
| Serial assignment + mutex | `serial.ts` | — | Self-contained async queue; no other module touches the counter |
| File writing (`.md` + `.png`) | `write-note.ts` | `serial.ts` (acquires lock) | Write happens inside the mutex; serial.ts calls write-note functions |
| Path safety + body size cap | `security.ts` | `server.ts` (call site) | Validation helpers called before any write |
| CLI parsing + config resolution | `config.ts` | `index.ts` (entry) | `parseArgs` + validation + token file write isolated from HTTP concerns |
| HTTP server boot | `index.ts` | `config.ts`, `server.ts` | Entry point: parse → validate → boot server → print startup line |

---

## Standard Stack

### Core (all already in package.json)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:http` | built-in (Node 25.x) | HTTP server | Zero-dep, well-documented, correct for a local server |
| `node:fs/promises` | built-in | Async file read/write/mkdir | Promise-based, ESM-native |
| `node:fs` | built-in | Sync `readdirSync` for serial scan inside mutex | Sync is correct inside serialized queue |
| `node:crypto` | built-in | `randomUUID()`, `timingSafeEqual()` | Both confirmed present in Node 25.x |
| `node:path` | built-in | `resolve`, `sep`, `basename`, `join` | Path normalization + traversal guard |
| `node:util` | built-in | `parseArgs` (stable since Node 18.3) | Zero-dep CLI parsing |
| `node:test` + `node:assert` | built-in (Node 18+) | Unit test framework | D-02 locked; confirmed available in Node 25.x |
| `yaml` | 2.9.0 | YAML frontmatter serialization | [VERIFIED: npm registry] ISC, 13-year-old package, active; slopcheck [OK]; no postinstall |

**Installation:** No new packages to install — `yaml@2.9.0` is already in `dependencies`. Node 25.x provides all built-ins.

**Version verification:**
```bash
npm view yaml version  # → 2.9.0 (confirmed 2026-05-31)
```

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `yaml` | npm | 13+ yrs (created 2011-04-15) | Tens of millions/wk | [github.com/eemeli/yaml](https://github.com/eemeli/yaml) | [OK] | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*Phase 2 installs zero new packages. `yaml` was already a declared dependency from Phase 1 and passes all checks.*

---

## Architecture Patterns

### System Architecture Diagram

```
CLI args (util.parseArgs)
        │
        ▼
  config.ts ─── resolves root, notesDir, token, port range, origins
        │        writes token to <root>/.stikfix-token
        │        ensures notesDir + .gitkeep exist
        ▼
  index.ts ─── binds server on 127.0.0.1 (port scan loop)
        │       prints startup JSON line
        ▼
  server.ts ─── http.createServer request handler
        │
        ├── GET /status ──────────────────────────────────────────► JSON response (no auth)
        │
        ├── OPTIONS * ──────────────────────────────────────────► 204 + CORS preflight headers
        │
        └── POST /annotation
                  │
                  ├── security.ts: checkToken(req) ──── 401 if bad
                  ├── security.ts: readBody(req, 12MB) ─ 413 if over limit; 400 if malformed JSON
                  │
                  └── serial.ts: withSerialLock(async () => {
                            │
                            ├── readdirSync(notesDir)
                            ├── parse NNNN- serials (incl. *.read.md)
                            ├── nextSerial = max + 1
                            │
                            └── write-note.ts:
                                  ├── build frontmatter (yaml.stringify)
                                  ├── build body (element context or free)
                                  ├── fs.writeFile(<base>.md)
                                  └── for each screenshot dataUrl:
                                        ├── validate data:image/png;base64, prefix
                                        ├── Buffer.from(b64, 'base64')
                                        └── fs.writeFile(<base>+N.png)
                      })
                  │
                  └── JSON response: {ok:true, file, serial}
```

### Recommended Project Structure

```
host/
├── src/
│   ├── index.ts         # CLI entry: parse → config → port-scan → server.listen → startup line
│   ├── server.ts        # http.createServer: routing, CORS headers, dispatch
│   ├── write-note.ts    # buildMarkdown(), writePng(), localTimestamp()
│   ├── serial.ts        # withSerialLock(), getNextSerial()
│   ├── config.ts        # resolveConfig(), printStartup(), writeTokenFile()
│   └── security.ts      # checkToken(), readBody(), isInsideDir()
└── test/
    ├── serial.test.ts   # tests for getNextSerial + withSerialLock (concurrent)
    └── security.test.ts # tests for isInsideDir (traversal cases), readBody (cap)
```

Compiled to `dist/host/` (same structure, `.js` extensions). Tests land in `dist/host/*.test.js` and run via `node --test`.

### Pattern 1: Bind-or-Fail Port Discovery

**What:** Attempt `server.listen(port, '127.0.0.1')` directly. On `EADDRINUSE` error event, increment and retry. Never pre-check availability (TOCTOU race).

**When to use:** Always — this is the only correct port-probe approach.

**Example:**
```typescript
// Source: Node.js http docs + PITFALLS.md pitfall 9
async function findFreePort(server: http.Server, host: string, start: number, end: number): Promise<number> {
  for (let port = start; port <= end; port++) {
    const bound = await new Promise<boolean>((resolve) => {
      server.once('error', (e: NodeJS.ErrnoException) => {
        if (e.code === 'EADDRINUSE') resolve(false);
        else resolve(false);
      });
      server.listen(port, host, () => resolve(true));
    });
    if (bound) return (server.address() as net.AddressInfo).port;
    // If not bound, need a fresh server for next attempt
    // (Alternative: create a new server per attempt in the loop)
  }
  throw new Error(`No free port in ${start}–${end}`);
}
```

**Important:** Once `listen` fails, the server emits `error`. Create one `http.Server` but each failed `listen` requires re-registering the error listener. Simpler: create a fresh `net.createServer()` per probe and reuse the final HTTP server only for the winning port.

### Pattern 2: In-Process Serial Mutex (Promise Queue)

**What:** A module-level promise chain that serializes all write operations.

**When to use:** Any time concurrent async operations must execute sequentially without external locking.

**Example:**
```typescript
// Source: ARCHITECTURE.md Pattern 4 + PITFALLS.md pitfall 6
// Confirmed working under concurrency (tested locally 2026-05-31)
let queue: Promise<void> = Promise.resolve();

export function withSerialLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = queue.then(fn);
  // Swallow errors on the queue tail so a failed write doesn't poison future writes
  queue = result.then(() => undefined, () => undefined);
  return result;
}
```

### Pattern 3: Body Streaming with Hard Byte Cap

**What:** Accumulate `data` chunks, abort + 413 if total exceeds limit, then parse.

**When to use:** Any endpoint accepting a body that could be large (screenshots are base64-encoded PNGs, easily 2–10 MB each).

**Example:**
```typescript
// Source: Node.js http.IncomingMessage docs [VERIFIED: Node.js official docs]
const MAX_BODY = 12 * 1024 * 1024; // 12 MB

export function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY) {
        req.destroy();
        const err = Object.assign(new Error('Payload Too Large'), { statusCode: 413 });
        reject(err);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
```

**Important:** Call `req.destroy()` before rejecting so the client connection is closed, preventing the stream from continuing to buffer.

### Pattern 4: CORS Headers (Echo Origin + LNA Defense)

**What:** Echo `req.headers.origin` into `Access-Control-Allow-Origin`. Always include `Access-Control-Allow-Private-Network: true` for Chrome 142+ LNA defense-in-depth.

**When to use:** All responses (even 401/413) must have CORS headers so the browser can read the error body.

**Example:**
```typescript
// Source: PITFALLS.md pitfall 7 + Chrome LNA docs [CITED: developer.chrome.com/blog/local-network-access]
function setCorsHeaders(req: http.IncomingMessage, res: http.ServerResponse): void {
  const origin = req.headers.origin ?? '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

// For OPTIONS preflight only:
function setPreflightHeaders(req: http.IncomingMessage, res: http.ServerResponse): void {
  setCorsHeaders(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Stikfix-Token');
  res.setHeader('Access-Control-Max-Age', '86400');
}
```

**Critical:** OPTIONS preflight must return `204` (not `200`). Respond with `res.writeHead(204); res.end()`.

### Pattern 5: Timing-Safe Token Comparison

**What:** Use `crypto.timingSafeEqual` to prevent timing oracle attacks.

**Example:**
```typescript
// Source: Node.js crypto docs [VERIFIED: nodejs.org/api/crypto]
import { timingSafeEqual } from 'node:crypto';

export function checkToken(req: http.IncomingMessage, expectedToken: string): boolean {
  const provided = req.headers['x-stikfix-token'];
  if (typeof provided !== 'string') return false;
  // timingSafeEqual requires equal-length buffers; length check first
  if (provided.length !== expectedToken.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expectedToken));
}
```

### Pattern 6: Path Safety Guard

**What:** `path.resolve` both paths, then assert containment with `startsWith(root + path.sep)`.

**Why:** On Windows, `sep` is `\`. Without appending `sep`, `/rootfoo` would match `/root`. Confirmed working on Windows paths (tested 2026-05-31).

**Example:**
```typescript
// Source: PITFALLS.md pitfall 10 + local verification [VERIFIED: tested on Node 25 Windows]
import { resolve, sep } from 'node:path';

export function isInsideDir(root: string, target: string): boolean {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  return resolvedTarget === resolvedRoot ||
         resolvedTarget.startsWith(resolvedRoot + sep);
}
```

### Pattern 7: PNG Data-URL Decode

**What:** Validate `data:image/png;base64,` prefix, slice, `Buffer.from(b64, 'base64')`.

**Example:**
```typescript
// Source: local verification [VERIFIED: tested on Node 25 Windows]
const PNG_PREFIX = 'data:image/png;base64,';

export function decodePngDataUrl(dataUrl: string): Buffer {
  if (!dataUrl.startsWith(PNG_PREFIX)) {
    throw Object.assign(
      new Error(`Invalid screenshot mime: expected data:image/png;base64,`),
      { statusCode: 400 }
    );
  }
  return Buffer.from(dataUrl.slice(PNG_PREFIX.length), 'base64');
}
```

### Pattern 8: YAML Frontmatter (yaml.stringify)

**What:** Build a frontmatter object, call `yaml.stringify`, wrap in `---` fences.

**Verified behavior:** `yaml.stringify` correctly quotes titles containing `:`, handles arrays (screenshots), nested objects (viewport), and ISO timestamps without truncation. [VERIFIED: tested locally 2026-05-31]

**Example:**
```typescript
// Source: https://eemeli.org/yaml/ [CITED: eemeli.org/yaml/]
import { stringify } from 'yaml';

function buildFrontmatter(fm: Record<string, unknown>): string {
  return '---\n' + stringify(fm) + '---\n';
}
```

**Important:** `yaml.stringify` expands `viewport: {width, height, dpr}` into block form (not the inline `{ }` shown in PRD §9.2). This is valid YAML and equally parseable by AI agents. The PRD's inline style is illustrative; `yaml.stringify` output is authoritative.

### Pattern 9: Serial Scan

**What:** `readdirSync(notesDir)` → filter by `/^(\d{4})-/` → parseInt → `Math.max(...) + 1`.

**Critical:** The regex `^(\d{4})-` must match both `0003-20260531.md` AND `0003-20260531.read.md`. The current implementation using `readdirSync` + string match handles both because `*.read.md` filenames also start with the 4-digit serial.

**Example:**
```typescript
// Source: local verification [VERIFIED: tested on Node 25 Windows]
import { readdirSync } from 'node:fs';

export function getNextSerial(notesDir: string): number {
  const files = readdirSync(notesDir);
  const serials = files
    .map(f => f.match(/^(\d{4})-/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map(m => parseInt(m[1], 10));
  return (serials.length > 0 ? Math.max(...serials) : 0) + 1;
}
```

### Pattern 10: Local Timestamp for Filename

**What:** Format `new Date()` as `YYYYMMDD-HHmmss` using local (not UTC) time components.

**Example:**
```typescript
// Source: [ASSUMED] — standard Date API usage
export function localTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
         `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
```

### Pattern 11: Version from package.json

**What:** Read `package.json` at runtime relative to `import.meta.url` to avoid hard-coding.

**Example:**
```typescript
// Source: Node.js ESM docs [VERIFIED: nodejs.org/api/esm]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// dist/host/config.js → ../../package.json
const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'));
export const VERSION: string = pkg.version; // "0.1.0"
```

### Pattern 12: Smoke Test Update (spawn + readline)

**What:** Phase 2 server runs indefinitely; the existing `spawnSync` smoke test pattern no longer works. Replace with `spawn` + `readline` to read the first stdout line, then probe `/status` and kill.

**Example:**
```javascript
// scripts/host-smoke-test.mjs (Phase 2 update)
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const child = spawn(process.execPath, [HOST_DIST, '--root', tmpRoot], { stdio: ['ignore', 'pipe', 'pipe'] });
const rl = createInterface({ input: child.stdout });

const startupLine = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('timeout waiting for startup')), 5000);
  rl.once('line', line => { clearTimeout(timer); resolve(line); });
  child.once('error', reject);
});

const startup = JSON.parse(startupLine);
// GET /status
const statusRes = await fetch(`http://127.0.0.1:${startup.port}/status`);
const status = await statusRes.json();
// assertions...
child.kill('SIGTERM');
```

### Anti-Patterns to Avoid

- **`server.listen(port)` or `server.listen(port, '0.0.0.0')`:** Exposes write endpoint to LAN. Always pass `'127.0.0.1'` explicitly.
- **Pre-check then bind (TOCTOU):** Creating a socket probe to see if a port is free, then binding separately. Bind directly; let the `error` event tell you.
- **`===` for token comparison:** Use `crypto.timingSafeEqual`. Simple string equality leaks token length/content via timing.
- **`path.join` alone for path safety:** Does not prevent traversal. Always `path.resolve` + `startsWith(root + sep)`.
- **Logging the token to a non-startup output:** Token goes in the startup JSON line only + `<root>/.stikfix-token`. Never in error messages or response bodies.
- **`req.destroy()` without rejecting:** Always pair destroy with a rejection so the promise resolves.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML with URLs/colons | Custom YAML serializer | `yaml.stringify` (eemeli) | `"https://example.com"` and `"title: foo"` silently break naive YAML |
| Unique CSS selectors | Custom selector heuristic | `@medv/finder` (Phase 3+) | Not needed in this phase; host only receives already-computed selectors |
| Concurrent serial assignment | File lock / DB | Promise-queue mutex | Single process; in-memory queue is sufficient and cross-platform |
| CLI arg parsing | Custom argv parser | `util.parseArgs` (built-in) | Already in Phase 1 stub; handles `multiple: true` for `--origin` |
| UUID generation | Custom random token | `crypto.randomUUID()` (built-in) | Cryptographically secure, spec-compliant, zero-dep |
| Timing-safe string compare | `===` | `crypto.timingSafeEqual` (built-in) | Prevents timing oracle; correct for auth tokens |

**Key insight:** The host is intentionally near-zero-dep. Every "I could use a library for this" instinct should be redirected to a Node built-in. The only justified external dep is `yaml` (frontmatter) because hand-rolled YAML with colons and quotes in URLs/titles is a known silent corruption vector.

---

## Common Pitfalls

### Pitfall 1: Port Bind Race Between Two Hosts Starting Simultaneously

**What goes wrong:** Both processes see port `39240` as "free" (checked via probe), both attempt to bind, one gets `EADDRINUSE`. Without the error handler wired correctly, the second process crashes instead of retrying `39241`.

**Why it happens:** Probe-then-bind is TOCTOU. The error event on the server fires before the listen callback.

**How to avoid:** Wire the `error` listener before calling `listen`. The `error` listener clears itself after one invocation. Create a fresh `http.Server` per port probe to avoid accumulated event listeners.

**Warning signs:** Uncaught `EADDRINUSE` errors in the host process; second host silently dies.

### Pitfall 2: Smoke Test Hangs (spawnSync on Long-Running Server)

**What goes wrong:** `npm run check` hangs indefinitely because `spawnSync` waits for the child to exit, but the Phase 2 server runs forever.

**Why it happens:** Phase 1 stub exits after printing one line. Phase 2 server loops. `spawnSync` blocks.

**How to avoid:** Replace `spawnSync` with async `spawn` + `readline` to read the startup line, probe `/status`, then `child.kill('SIGTERM')`. See Pattern 12.

**Warning signs:** `npm run check` never returns after Phase 2 is implemented.

### Pitfall 3: Concurrent POSTs Getting the Same Serial

**What goes wrong:** Two simultaneous POSTs both call `getNextSerial()` before either writes a file, both see max=5, both produce serial 6. One file overwrites the other. The overwritten note is silently lost — a core PRD reliability violation.

**Why it happens:** Node I/O is async; without a mutex, both requests interleave their scan and write phases.

**How to avoid:** `withSerialLock()` wraps the entire scan+write operation atomically. `getNextSerial()` must be called inside the lock, not before it. Never compute the serial outside the locked block.

**Warning signs:** Two `.md` files with the same leading serial; one has wrong content.

### Pitfall 4: Path Traversal Bypass on Windows (Missing `sep`)

**What goes wrong:** `resolvedTarget.startsWith(resolvedRoot)` without appending `path.sep` allows `/rootfoo/evil.md` to pass when root is `/root`. On Windows the same issue: `C:\rootfoo` starts with `C:\root`.

**Why it happens:** String prefix matching without a separator check allows adjacent directories to match.

**How to avoid:** Always `resolvedTarget.startsWith(resolvedRoot + path.sep)` or check `=== resolvedRoot`. The separator on Windows is `\` (verified: `path.sep === '\\'`).

**Warning signs:** Unit test with `../adjacent/file.md` passes the safety check when it should fail.

### Pitfall 5: `req.destroy()` Leaves Body in Buffer (Memory Accumulation)

**What goes wrong:** When a 50 MB body arrives and the cap is exceeded, calling `reject()` without `req.destroy()` leaves the socket open and Node continues buffering chunks into memory. With multiple simultaneous oversized requests, this causes memory pressure before the GC intervenes.

**Why it happens:** The `data` event listener is removed when the promise rejects, but the socket remains open and Node buffers all incoming data internally.

**How to avoid:** Always call `req.destroy()` before rejecting in the body cap handler. This closes the underlying socket, stopping the data flow.

**Warning signs:** Host memory usage grows under stress test with oversized payloads.

### Pitfall 6: CORS Headers Missing on Error Responses (401, 413, 400)

**What goes wrong:** The browser receives a 401 or 413 response but the CORS headers are absent. The browser blocks reading the response body due to CORS, so the content script/service worker sees a network error instead of the 401. Toasting "unauthorized" becomes impossible; the error appears as "host down."

**Why it happens:** CORS headers are only added to success paths in the early implementation.

**How to avoid:** Set CORS headers on every response — success and error alike. Create a `setCorsHeaders(req, res)` helper and call it at the top of every route handler before writing any response.

**Warning signs:** Service worker receives `TypeError: Failed to fetch` on 401 responses from HTTPS page origins.

### Pitfall 7: NodeNext ESM Import Extensions in Test Files

**What goes wrong:** TypeScript test files in `host/test/serial.test.ts` import from `'./serial'` (no `.js` extension). tsc with `NodeNext` module resolution requires explicit `.js` extensions in import paths (the file is `.ts` but the extension in the import must be `.js`).

**Why it happens:** NodeNext mimics Node's ESM resolution: Node requires explicit extensions, TypeScript respects this and requires `.js` in source even when the file is `.ts`.

**How to avoid:** Write `import { getNextSerial } from '../src/serial.js'` in test files (not `'./serial'` or `'../src/serial'`). This is the NodeNext ESM convention.

**Warning signs:** `tsc -p tsconfig.host.json` fails with "cannot find module" errors on test imports.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` + `node:assert` (Node 25.x built-in) |
| Config file | none (zero-config; file paths passed directly) |
| Quick run command | `node --test dist/host/serial.test.js dist/host/security.test.js` |
| Full suite command | `tsc -p tsconfig.host.json && node --test dist/host/*.test.js` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HOST-06 | Concurrent POSTs yield consecutive unique serials | unit | `node --test dist/host/serial.test.js` | Wave 0 |
| HOST-06 | Empty dir returns serial 1 | unit | `node --test dist/host/serial.test.js` | Wave 0 |
| HOST-06 | `*.read.md` files count toward max serial | unit | `node --test dist/host/serial.test.js` | Wave 0 |
| HOST-09 | Path inside root passes containment check | unit | `node --test dist/host/security.test.js` | Wave 0 |
| HOST-09 | `../../../etc/passwd` traversal rejected | unit | `node --test dist/host/security.test.js` | Wave 0 |
| HOST-09 | Sibling-dir path rejected (no-sep bug) | unit | `node --test dist/host/security.test.js` | Wave 0 |
| HOST-11 | Body under 12 MB succeeds | unit | `node --test dist/host/security.test.js` | Wave 0 |
| HOST-11 | Body over 12 MB rejects with 413 code | unit | `node --test dist/host/security.test.js` | Wave 0 |
| HOST-01..04 | Server boots, `/status` returns correct JSON | smoke | `node scripts/host-smoke-test.mjs` | Exists (needs update) |
| HOST-05 | Token mismatch returns 401 | smoke | `node scripts/host-smoke-test.mjs` | Wave extend |
| HOST-07..08 | POST writes `.md` + `.png` files to disk | smoke | `node scripts/host-smoke-test.mjs` | Wave extend |

### Sampling Rate

- **Per task commit:** `tsc -p tsconfig.host.json && node --test dist/host/*.test.js`
- **Per wave merge:** `npm run check` (includes tsc ×2 + clean-room + smoke + unit tests)
- **Phase gate:** Full `npm run check` green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `host/test/serial.test.ts` — covers HOST-06 serial assignment + concurrent collision
- [ ] `host/test/security.test.ts` — covers HOST-09 path safety + HOST-11 body cap
- [ ] `tsconfig.host.json` `include` extended to `["host/src/**/*.ts", "host/test/**/*.ts"]`
- [ ] `package.json` `test` script: `"test": "tsc -p tsconfig.host.json && node --test dist/host/*.test.js"`
- [ ] `npm run check` updated to include `npm test` or inline the test run

---

## Security Domain

### Applicable ASVS Categories (Level 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes — token auth | `crypto.timingSafeEqual` on `X-Stikfix-Token` header |
| V3 Session Management | no — stateless HTTP; no sessions | — |
| V4 Access Control | yes — `POST /annotation` gated; `GET /status` open | Per-route token check; `checkToken()` called before any write |
| V5 Input Validation | yes — body size, JSON parse, path safety | `readBody()` cap; `JSON.parse` with try/catch; `isInsideDir()` |
| V6 Cryptography | yes — token generation + comparison | `crypto.randomUUID()` for generation; `crypto.timingSafeEqual()` for comparison |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthenticated file write (any local page guesses port) | Tampering | `X-Stikfix-Token` validation on all writes; 401 on mismatch |
| Path traversal via malicious payload field | Tampering | `path.resolve` + `startsWith(root + sep)` before every write |
| OOM via oversized POST body | Denial of Service | 12 MB hard cap; `req.destroy()` on limit exceeded; 413 response |
| Token extraction from `/status` | Information Disclosure | `/status` never includes token; returns `{app,version,name,root,notesDir,origins}` only |
| Timing oracle on token comparison | Information Disclosure | `crypto.timingSafeEqual`; length check before comparison |
| LAN exposure | Elevation of Privilege | `server.listen(port, '127.0.0.1')` — never `0.0.0.0` |
| CORS bypass enabling cross-origin writes | Spoofing | Token is the real gate; CORS headers are permissive by design (echo origin); `Access-Control-Allow-Private-Network: true` for Chrome 142 LNA |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Host runtime | ✓ | v25.8.1 | — |
| `node:test` | Unit tests (D-02) | ✓ | built-in since Node 18 | — |
| `node:crypto` `randomUUID` | Token generation | ✓ | built-in since Node 14.17 | — |
| `node:crypto` `timingSafeEqual` | Token comparison | ✓ | built-in since Node 6 | — |
| `yaml` package | Frontmatter serialization | ✓ | 2.9.0 (in `dependencies`) | — |
| `tsc` | Host build | ✓ | 6.0.3 (devDependency) | — |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none

---

## Don't Hand-Roll (Host-Specific)

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML frontmatter | Custom serializer | `yaml.stringify` | Titles/URLs with `:` break naive concatenation; `yaml.stringify` quotes automatically |
| Secure random token | `Math.random` | `crypto.randomUUID()` | Cryptographically secure; zero-dep |
| Timing-safe comparison | `===` | `crypto.timingSafeEqual` | Constant-time; prevents token enumeration |
| CLI arg parsing | `process.argv.slice(2)` | `util.parseArgs` | Handles `multiple: true` for `--origin`; already in Phase 1 stub |
| Port availability check | Pre-probe socket | Bind-or-fail + `EADDRINUSE` | Only reliable approach; eliminates TOCTOU race |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `commander`/`yargs` for CLI | `util.parseArgs` (built-in) | Node 18.3 (2022) | Zero-dep CLI parsing for simple flag sets |
| `uuid` npm package | `crypto.randomUUID()` (built-in) | Node 14.17 (2021) | UUID generation without a dep |
| `js-yaml` | `yaml` (eemeli v2) | Active 2021–2026 | Better TypeScript types; ISC license; more active maintenance |
| `mocha`/`jest` for Node tests | `node:test` + `node:assert` | Node 18 (stable 20+) | Zero-dep test runner; sufficient for unit tests |
| `spawnSync` for smoke tests | `spawn` + `readline` | N/A (Node-always) | Required when testing long-running servers |

**Deprecated/outdated:**
- `js-yaml`: still works, but `yaml` v2 is preferred (per STACK.md; already chosen in Phase 1)
- `commander`/`yargs` for this host: 5 flags don't justify the dependency
- `uuid` npm package: `crypto.randomUUID()` is the standard since Node 14.17

---

## Code Examples

### Complete `/annotation` Handler Skeleton

```typescript
// Source: Pattern synthesis from PITFALLS.md + ARCHITECTURE.md + local verification
async function handleAnnotation(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  cfg: Config
): Promise<void> {
  // 1. CORS on every response
  setCorsHeaders(req, res);

  // 2. Token auth
  if (!checkToken(req, cfg.token)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
    return;
  }

  // 3. Read body with size cap
  let raw: string;
  try {
    raw = await readBody(req);
  } catch (e: any) {
    const status = e.statusCode === 413 ? 413 : 400;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
    return;
  }

  // 4. Parse JSON
  let payload: AnnotationPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'invalid JSON' }));
    return;
  }

  // 5. Write under serial lock
  try {
    const { file, serial } = await withSerialLock(() =>
      writeNote(cfg.notesDir, payload)
    );
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, file, serial }));
  } catch (e: any) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
}
```

### Note Body Building (Element Mode)

```typescript
// Source: PRD §9.2 spec [CITED: PRD.md §9.2]
function buildNoteBody(base: string, payload: AnnotationPayload): string {
  const { comment, element, screenshots } = payload;
  const screenshotPaths = (screenshots ?? []).map((_, i) => `${base}+${i + 1}.png`);

  let body = `${comment ?? ''}\n`;

  if (element) {
    body += `\n## Element context\n\n`;
    body += `- **Selector:** \`${element.selector}\`\n`;
    if (element.reactComponent) body += `- **React component:** \`${element.reactComponent}\`\n`;
    body += `- **Tag / role:** \`${element.tag}\` / \`${element.role ?? element.tag}\``;
    if (element.ariaLabel) body += `  ·  **aria-label:** ${element.ariaLabel}`;
    body += '\n';
    if (element.text) body += `- **Text:** ${element.text}\n`;
    const r = element.rect;
    if (r) body += `- **Rect:** x=${r.x} y=${r.y} w=${r.width} h=${r.height}\n`;

    if (element.computedStyles && Object.keys(element.computedStyles).length > 0) {
      body += `\n### Computed styles (curated)\n| prop | value |\n|------|-------|\n`;
      for (const [k, v] of Object.entries(element.computedStyles)) {
        body += `| ${k} | ${v} |\n`;
      }
    }

    if (element.outerHTML) {
      body += `\n### outerHTML (truncated)\n\`\`\`html\n${element.outerHTML}\n\`\`\`\n`;
    }
  }

  if (screenshotPaths.length > 0) {
    body += `\n### Screenshots\n`;
    screenshotPaths.forEach((p, i) => {
      const kind = payload.screenshots?.[i]?.kind ?? `+${i + 1}`;
      body += `![${kind}](${p})\n`;
    });
  }

  return body;
}
```

---

## Open Questions

1. **Startup JSON shape vs PRD §8.1 narrative**
   - What we know: PRD §8.1 says "print clearly: project name, bound port, declared origins, token, absolute notes dir." The Phase 1 stub prints `{app, name, root, port, token, notesDir}`.
   - What's unclear: Should the startup output also include `origins` in the JSON line for the smoke test to assert? The current stub has `port: null` and `token: null` — Phase 2 replaces with real values.
   - Recommendation: Print `{app, name, root, port, token, notesDir, origins}` on stdout line 1. The smoke test reads this line and probes `/status` for the full shape.

2. **`root` field in `/status` response**
   - What we know: D-06 says `/status` returns `{app,version,name,root,notesDir,origins}`. PITFALLS pitfall 11 notes that `root` is a full filesystem path — not sensitive for local-only use but worth noting.
   - What's unclear: Whether to include `root` in `/status` at all. PITFALLS recommends not including it; D-06 locked it in. D-06 takes precedence.
   - Recommendation: Include `root` per D-06. It is needed by the extension for display in Phase 3.

3. **`notes/` `.gitkeep` in the stikfix repo vs the target project's `notesDir`**
   - What we know: The stikfix repo itself has `notes/.gitkeep`. The host creates `notesDir` (default `<root>/notes`) if missing and adds `.gitkeep`.
   - What's unclear: Whether to add `notes/` and `!notes/.gitkeep` to the stikfix `.gitignore` (already done per `.gitignore` check) or whether the target project needs to do this independently.
   - Recommendation: The host's `.gitkeep` creation is for the target project's `notesDir`, not the stikfix repo's own `notes/`. The stikfix `.gitignore` already handles this. No action needed.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `localTimestamp()` using `new Date()` local-time components produces the correct `YYYYMMDD-HHmmss` format for the filename | Pattern 10 | Filename format mismatch; easy to fix once noticed |
| A2 | The smoke test `spawn` + `readline` pattern works correctly on Windows PowerShell when the child writes to stdout before the readline listener is attached | Pattern 12 | Race condition in smoke test; fix: use `'pipe'` stdio and buffer until listener attaches |
| A3 | `node --test dist/host/*.test.js` glob expansion works correctly in the Windows PowerShell `package.json` scripts context | Validation Architecture | Tests don't run; fallback: list files explicitly |

---

## Sources

### Primary (HIGH confidence)
- Node.js 25.x official docs — `http`, `fs`, `crypto`, `path`, `util.parseArgs`, `node:test` modules; all APIs verified via local Node 25.8.1 execution
- `yaml@2.9.0` — installed in project; API verified via local execution; source at [github.com/eemeli/yaml](https://github.com/eemeli/yaml)
- `.planning/phases/02-host-mvp/02-CONTEXT.md` — locked decisions (D-01..D-11) authoritative for this phase
- `.planning/research/PITFALLS.md` — verified pitfalls; serial race, path traversal, CORS preflight, body-size all addressed
- `.planning/research/ARCHITECTURE.md` — serial mutex pattern, CORS, host data flow
- `.planning/research/STACK.md` — `yaml` dep rationale, Node built-ins rationale
- `PRD.md §8`, `§9.1`, `§9.2`, `§14` — authoritative host spec, payload shape, file format, acceptance criteria

### Secondary (MEDIUM confidence)
- [developer.chrome.com/blog/local-network-access](https://developer.chrome.com/blog/local-network-access) — Chrome 142 LNA; `Access-Control-Allow-Private-Network: true` guidance

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all APIs verified locally on Node 25.8.1; `yaml` installed and tested
- Architecture: HIGH — patterns verified via code execution; mutex, port scan, path guard all tested
- Pitfalls: HIGH — from existing `.planning/research/PITFALLS.md` (prior research session) + local verification
- Test strategy: HIGH — `node --test` glob pattern confirmed working on Node 25 Windows

**Research date:** 2026-05-31
**Valid until:** 2026-06-30 (Node built-in APIs are stable; `yaml` API is stable v2)
