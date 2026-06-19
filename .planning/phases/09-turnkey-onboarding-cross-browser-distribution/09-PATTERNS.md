# Phase 9: Turnkey Onboarding & Cross-Browser Distribution - Pattern Map

**Mapped:** 2026-06-05
**Files analyzed:** 9 new/modified files
**Analogs found:** 9 / 9

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `bin/stikfix.ts` | utility (CLI entry) | request-response | `host/src/index.ts` | role-match |
| `host/src/native-host.ts` | service (stdio host) | event-driven | `host/src/server.ts` + `host/src/index.ts` | role-match |
| `host/src/bootstrap/register.ts` | utility (manifest writer) | file-I/O | `host/src/config.ts` | role-match |
| `host/src/native-msg.ts` | utility (framing) | streaming | `host/src/security.ts` | partial-match |
| `host/src/folder-picker.ts` | utility | request-response | `host/src/config.ts` (execFileSync ref in RESEARCH.md) | partial-match |
| `wxt.config.ts` (modify) | config | — | `wxt.config.ts` | exact |
| `entrypoints/background.ts` (modify) | service worker | event-driven | `entrypoints/background.ts` | exact |
| `host/test/native-host.test.ts` | test | — | `host/test/config.test.ts` | exact |
| `host/test/bootstrapper.test.ts` | test | — | `host/test/index.test.ts` | exact |

---

## Pattern Assignments

### `bin/stikfix.ts` (CLI entry, request-response)

**Analog:** `host/src/index.ts`

**Imports pattern** (`host/src/index.ts` lines 11–15):
```typescript
import { parseArgs } from 'node:util';
import type { AddressInfo } from 'node:net';
import { resolveConfig, resolveConfigValues, ensureNotesDir, writeTokenFile } from './config.js';
import { createHostServer } from './server.js';
import { bindServer, BIND_HOST } from './bind.js';
```

**CLI parsing pattern** (`host/src/index.ts` lines 21–31):
```typescript
const { values: rawValues } = parseArgs({
  options: {
    root: { type: 'string' },
    origin: { type: 'string', multiple: true },
    name: { type: 'string' },
    'notes-dir': { type: 'string' },
    port: { type: 'string' },
    token: { type: 'string' },
  },
  strict: false,
});
```

**New pattern for bin/stikfix.ts** — add `allowPositionals: true` and a `subcommand` dispatch:
```typescript
// bin/stikfix.ts — bootstrapper entry for npx stikfix init / uninstall
// Compiled to dist/host/stikfix-init.cjs via esbuild (CJS for shebang compat)
// #!/usr/bin/env node  ← shebang added by esbuild or prepended manually

import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    root:           { type: 'string' },
    'extension-id': { type: 'string' },
  },
  strict: false,
});

const [subcommand] = positionals;
if (subcommand === 'init') {
  // call registerNativeHost(...)
} else if (subcommand === 'uninstall') {
  // call unregisterNativeHost(...)
} else {
  console.error('Usage: npx stikfix <init|uninstall> [--root <dir>] [--extension-id <id>]');
  process.exit(1);
}
```

**Error-exit pattern** (`host/src/index.ts` lines 38–41):
```typescript
if (!values['root']) {
  console.error('stikfix-host: --root is required');
  process.exit(1);
}
```

---

### `host/src/native-host.ts` (stdio service, event-driven)

**Analog:** `host/src/index.ts` (startup JSON line) + `host/src/server.ts` (message dispatch)

**File read pattern** (mirrors `host/src/config.ts` lines 176–182 — `writeTokenFile` / `readFileSync`):
```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Read config written by bootstrapper — same shape as writeTokenFile writes root
const configPath = join(homedir(), '.config', 'stikfix', 'config.json');
const cfg = JSON.parse(readFileSync(configPath, 'utf8'));

// Read token file written by HTTP host on startup (writeTokenFile pattern)
const token = readFileSync(join(cfg.root, '.stikfix-token'), 'utf8').trim();
```

**Stdio framing pattern** (new — no exact analog; copy from RESEARCH.md Pattern 2):
```typescript
// 4-byte little-endian length prefix + UTF-8 JSON — the Chrome native messaging protocol.
// MUST write Buffer (not string) to avoid Windows text-mode \n→\r\n corruption (Pitfall 2).
function sendNativeMessage(msg: object): void {
  const json = JSON.stringify(msg);
  const bytes = Buffer.from(json, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(bytes.length, 0);
  process.stdout.write(Buffer.concat([header, bytes]));
}

function readNativeMessages(onMessage: (msg: unknown) => void): void {
  let buf = Buffer.alloc(0);
  process.stdin.on('data', (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 4) {
      const msgLen = buf.readUInt32LE(0);
      if (buf.length < 4 + msgLen) break;
      const json = buf.slice(4, 4 + msgLen).toString('utf8');
      buf = buf.slice(4 + msgLen);
      try { onMessage(JSON.parse(json)); } catch { /* malformed JSON — ignore */ }
    }
  });
  process.stdin.on('end', () => process.exit(0));
}
```

**Message dispatch pattern** (mirror `host/src/server.ts` route switch, lines 350–424):
```typescript
// Dispatch on msg.type — same structural shape as the HTTP server's route table.
// Each branch: validate, respond, exit(0) (sendNativeMessage is one-shot per Chrome spawn).
readNativeMessages((msg) => {
  const m = msg as { type?: string; origin?: string };
  if (m.type === 'GET_TOKEN') {
    sendNativeMessage({ type: 'TOKEN', token, port, name: cfg.name, notesDir: cfg.notesDir });
    process.exit(0);
  }
  if (m.type === 'PICK_FOLDER') {
    pickFolder('Choose folder for ' + (m.origin ?? 'project')).then((folder) => {
      sendNativeMessage({ type: 'FOLDER_PICKED', origin: m.origin, folder });
      process.exit(0);
    });
  }
});
```

**No HTTP server started** — this entry point MUST NOT call `createHostServer` or `bindServer`. It is a separate bundle (`stikfix-native.cjs`) from the HTTP host (`index.js`).

---

### `host/src/bootstrap/register.ts` (manifest writer, file-I/O)

**Analog:** `host/src/config.ts`

**File I/O pattern** (`host/src/config.ts` lines 12–17, 155–182):
```typescript
import { readFileSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { resolve, join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
```

**ensureNotesDir pattern** (lines 155–161) — use for manifest dir creation:
```typescript
export function ensureNotesDir(notesDir: string): void {
  mkdirSync(notesDir, { recursive: true });
  const gitkeep = join(notesDir, '.gitkeep');
  if (!existsSync(gitkeep)) {
    writeFileSync(gitkeep, '');
  }
}
```
**For the manifest writer:** replace `.gitkeep` creation with `writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')`.

**writeTokenFile pattern for owner-only file** (lines 176–182):
```typescript
export function writeTokenFile(root: string, token: string): void {
  const tokenPath = join(root, '.stikfix-token');
  if (existsSync(tokenPath)) {
    rmSync(tokenPath, { force: true });
  }
  writeFileSync(tokenPath, token, { encoding: 'utf8', mode: 0o600 });
}
```
**For the manifest writer on macOS/Linux:** write manifest JSON with mode 0o644 (not a credential). On Windows the manifest is plain JSON; the registry key is written via `execFileSync('reg', [...])` (no file mode needed).

**Per-OS path dispatch** — copy the `process.platform` switch from RESEARCH.md Pattern 4:
```typescript
import { homedir, platform } from 'node:os';

function nativeManifestDir(): string {
  switch (process.platform) {
    case 'darwin':
      return join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts');
    case 'linux':
      return join(homedir(), '.config', 'google-chrome', 'NativeMessagingHosts');
    case 'win32':
      return join(homedir(), '.local', 'share', 'stikfix'); // manifest file only; registry key written separately
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}
```

**Windows registry write** (from RESEARCH.md Pattern 4 — use `execFileSync` from `node:child_process`, NOT `exec`):
```typescript
import { execFileSync } from 'node:child_process';

execFileSync('reg', [
  'ADD',
  'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.stikfix.host',
  '/ve', '/t', 'REG_SZ',
  '/d', manifestPath,
  '/f',
]);
// Also register for Edge (drop-in):
execFileSync('reg', [
  'ADD',
  'HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.stikfix.host',
  '/ve', '/t', 'REG_SZ',
  '/d', manifestPath,
  '/f',
]);
```

**isInsideDir pattern for path validation** (`host/src/security.ts` lines 78–83):
```typescript
export function isInsideDir(root: string, target: string): boolean {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  return resolvedTarget === resolvedRoot ||
    resolvedTarget.startsWith(resolvedRoot + sep);
}
```
Apply after reading the folder-picker result to validate the chosen folder path.

---

### `host/src/folder-picker.ts` (utility, request-response)

**Analog:** `host/src/config.ts` (cross-platform `process.platform` awareness) + RESEARCH.md Pattern 5

**Security rule (from CONTEXT.md + RESEARCH.md):** Use `execFile` (NOT `exec` or `shell: true`). Arguments must be a static array — no user-supplied strings interpolated into a shell command. The folder path returned by the dialog is validated with `isInsideDir` before use.

**execFile pattern** (RESEARCH.md Pattern 5 — excerpt for Windows):
```typescript
import { execFile } from 'node:child_process';

async function pickFolder(title: string): Promise<string | null> {
  if (process.platform === 'win32') {
    const ps = [
      '-NoProfile', '-NonInteractive', '-OutputFormat', 'Text',
      '-Command',
      `Add-Type -AssemblyName System.Windows.Forms;` +
      `$d = New-Object System.Windows.Forms.FolderBrowserDialog;` +
      `$d.Description = '${title.replace(/'/g, "''")}';` +
      `$null = $d.ShowDialog();` +
      `$d.SelectedPath`,
    ];
    return new Promise((resolve) => {
      execFile('powershell.exe', ps, { timeout: 120_000 }, (err, stdout) => {
        resolve(err ? null : stdout.trim() || null);
      });
    });
  }
  // macOS: execFile('osascript', [...])
  // Linux: execFile('zenity', [...]) with kdialog fallback
  // headless fallback: return null
}
```

**No `exec`, no `shell: true`** — enforced by project security model. Never concatenate user input into the PowerShell `-Command` string.

---

### `wxt.config.ts` (config, modify)

**Analog:** `wxt.config.ts` (exact — modify in place)

**Existing permissions pattern** (`wxt.config.ts` lines 14–18):
```typescript
permissions: ['activeTab', 'scripting', 'storage', 'tabs'],
host_permissions: ['http://127.0.0.1/*', 'http://localhost/*'],
optional_host_permissions: ['<all_urls>'],
```

**Modification:** Add `'nativeMessaging'` to the `permissions` array. Also add the `key` field when the CWS public key is available:
```typescript
permissions: ['activeTab', 'scripting', 'storage', 'tabs', 'nativeMessaging'],
// key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...',  // add after CWS upload
```

**Existing hook pattern** (`wxt.config.ts` lines 26–31) — preserve unchanged:
```typescript
'build:manifestGenerated'(_wxt, manifest) {
  manifest.host_permissions = (manifest.host_permissions ?? [])
    .filter((p: string) => p !== '<all_urls>');
},
```

---

### `entrypoints/background.ts` (service worker, event-driven — modify)

**Analog:** `entrypoints/background.ts` (exact — add new handler + message cases)

**Storage re-read pattern** (lines 77–82 — MANDATORY per Pitfall 1 comment):
```typescript
// Re-read storage at handler top (MV3 SW may have been recycled — Pitfall 1)
const [persisted, tokens] = await Promise.all([
  sfxRegistry.getValue(),
  sfxTokens.getValue(),
]);
```
**Every new handler must follow this pattern at its top.**

**Async handler + return true pattern** (lines 730–745 — MANDATORY per Pitfall 2):
```typescript
case SFX_MSG.REFRESH_HOSTS:
  handleRefreshHosts()
    .then(sendResponse)
    .catch((err: unknown) =>
      sendResponse({ ok: false, error: String(err) })
    );
  return true; // keep channel open — MANDATORY for all async handlers
```

**New pairing handler shape** (mirrors `handleSendAnnotation` lines 287–361 — same read/resolve/act/respond structure):
```typescript
async function handlePairNative(): Promise<{ ok: true } | { ok: false; error: string }> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(
      'com.stikfix.host',
      { type: 'GET_TOKEN' },
      async (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response || response.type !== 'TOKEN') {
          reject(new Error('Unexpected native host response'));
          return;
        }
        // Persist — same shape as handleAddHost (lines 600-624)
        const { token, port, name, notesDir } = response;
        const [registry, tokens] = await Promise.all([
          sfxRegistry.getValue(),
          sfxTokens.getValue(),
        ]);
        tokens[name] = token;
        registry[name] = { name, port, notesDir, origins: [], token };
        await Promise.all([
          sfxTokens.setValue(tokens),
          sfxRegistry.setValue(registry),
        ]);
        resolve({ ok: true });
      }
    );
  });
}
```

**Folder-pick response handler** (dispatches a second `sendNativeMessage` — same `chrome.runtime.lastError` guard):
```typescript
async function handlePickFolder(origin: string): Promise<{ ok: true; folder: string } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    chrome.runtime.sendNativeMessage(
      'com.stikfix.host',
      { type: 'PICK_FOLDER', origin },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message ?? 'native error' });
          return;
        }
        if (!response || response.type !== 'FOLDER_PICKED' || !response.folder) {
          resolve({ ok: false, error: 'No folder selected' });
          return;
        }
        resolve({ ok: true, folder: response.folder });
      }
    );
  });
}
```

**Message router additions** — add new cases to the existing `chrome.runtime.onMessage.addListener` switch (lines 719–880). Follow the exact `case / handler().then(sendResponse).catch(...) / return true` shape.

**sfxOriginMap persist pattern** (lines 224–228 — for persisting origin→folder after PICK_FOLDER):
```typescript
const originMap = await sfxOriginMap.getValue();
originMap[origin] = hostName;  // ← replace hostName with folder path for D-04
await sfxOriginMap.setValue(originMap);
```

---

### `host/test/native-host.test.ts` (test)

**Analog:** `host/test/config.test.ts`

**Test file structure** (lines 1–8):
```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Import the module under test — no Chrome/WXT imports needed
```

**tmpdir + cleanup pattern** (lines 14–21):
```typescript
let tmpRoot: string;

test.before(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'sfx-native-host-test-'));
});

test.after(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});
```

**Error assertion pattern** (lines 33–40):
```typescript
assert.throws(
  () => fn(),
  (err: any) => {
    assert.ok(err.message.includes('expected-fragment'), `got: ${err.message}`);
    return true;
  }
);
```

**Test scope for native-host.test.ts:**
- stdio framing: `sendNativeMessage` produces correct 4-byte LE prefix + UTF-8 JSON
- `readNativeMessages`: reassembles chunked input correctly; handles partial buffers
- Config file parsing: reads root/name/notesDir correctly; throws on missing file
- Token file reading: reads and trims token; throws cleanly when token file absent

---

### `host/test/bootstrapper.test.ts` (test)

**Analog:** `host/test/index.test.ts`

**Server-lifecycle test pattern** (`host/test/index.test.ts` lines 1–11, 19–42):
```typescript
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { bindServer, BIND_HOST } from '../src/bind.js';

describe('bindServer — port scan (WR-06)', () => {
  let blocker: http.Server;
  before(async () => { /* setup */ });
  after(async () => { /* teardown — close servers */ });
  test('assertion', async () => { /* ... */ });
});
```

**Test scope for bootstrapper.test.ts:**
- Manifest JSON written to the correct per-OS path (mock `os.platform()` or test on tmpdir)
- Manifest JSON has required fields: `name`, `description`, `path`, `type: "stdio"`, `allowed_origins`
- `path` in manifest is absolute (`path.isAbsolute(manifestPath)`)
- Uninstall deletes the manifest file; on Windows: `reg query` returns error after unregister
- Config file (`~/.config/stikfix/config.json`) written with correct `{ root, name }` shape

---

## Shared Patterns

### Host imports (Node built-ins only)

**Source:** `host/src/config.ts` lines 12–17, `host/src/security.ts` lines 8–10
**Apply to:** `bin/stikfix.ts`, `host/src/native-host.ts`, `host/src/bootstrap/register.ts`, `host/src/folder-picker.ts`

```typescript
// ALL host-side files: Node builtins + yaml only. No npm packages. No WXT/Chrome imports.
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { resolve, join, basename, dirname, sep } from 'node:path';
import { homedir, platform } from 'node:os';
import { execFile, execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { randomUUID, timingSafeEqual } from 'node:crypto';
```

### Error handling (host-side)

**Source:** `host/src/index.ts` lines 38–41; `host/src/server.ts` lines 88–94
**Apply to:** `bin/stikfix.ts`, `host/src/native-host.ts`, `host/src/bootstrap/register.ts`

```typescript
// CLI-level: print to stderr + exit(1)
console.error('stikfix: <descriptive message>');
process.exit(1);

// Function-level: throw typed error with optional statusCode
throw Object.assign(new Error('descriptive message'), { statusCode: 400 });
```

### Path-traversal guard

**Source:** `host/src/security.ts` lines 78–83
**Apply to:** `host/src/bootstrap/register.ts` (validate folder-picker result), `host/src/native-host.ts`

```typescript
import { isInsideDir } from './security.js';

// Validate any path returned from outside (folder picker, config file) before use
if (!isInsideDir(expectedRoot, candidatePath)) {
  throw new Error('Path outside allowed root');
}
```

### Token file read (existing contract)

**Source:** `host/src/config.ts` lines 176–182 (`writeTokenFile`)
**Apply to:** `host/src/native-host.ts` (reads the file; HTTP host writes it)

```typescript
// The HTTP host writes <root>/.stikfix-token with mode 0o600 on startup.
// The native host reads it synchronously (fast, startup path).
const token = readFileSync(join(root, '.stikfix-token'), 'utf8').trim();
```

### Startup JSON line (used by tests + native host)

**Source:** `host/src/index.ts` lines 64–73
**Apply to:** `host/src/native-host.ts` MAY write a `.stikfix-port` file alongside `.stikfix-token` for the native host to read (per RESEARCH.md Open Question 2):

```typescript
// In host/src/index.ts — add one line after writeTokenFile:
// writeFileSync(join(cfg.root, '.stikfix-port'), String(boundPort), { encoding: 'utf8', mode: 0o600 });
```

### SW async handler pattern (MV3 mandatory)

**Source:** `entrypoints/background.ts` lines 719–732
**Apply to:** All new message cases added to `background.ts`

```typescript
// MANDATORY shape for ALL async handlers:
case SFX_MSG.NEW_CASE:
  handlerFn(args)
    .then(sendResponse)
    .catch((err: unknown) => sendResponse({ ok: false, error: String(err) }));
  return true;  // ← MUST return true synchronously to keep channel open (Pitfall 2)
```

### sfxTokens / sfxRegistry persistence pattern

**Source:** `lib/storage.ts` lines 17–29; `entrypoints/background.ts` lines 615–624 (`handleAddHost`)
**Apply to:** `entrypoints/background.ts` new `handlePairNative`

```typescript
// Re-read at handler top (Pitfall 1 — MV3 SW globals are zeroed after ~30s idle)
const [registry, tokens] = await Promise.all([
  sfxRegistry.getValue(),
  sfxTokens.getValue(),
]);
// Mutate + write back
tokens[name] = token;
registry[name] = { name, port, notesDir, origins: [], token };
await Promise.all([
  sfxTokens.setValue(tokens),
  sfxRegistry.setValue(registry),
]);
```

---

## No Analog Found

All files have analogs from the codebase. The following have **no codebase analog** for specific sub-patterns and must use RESEARCH.md directly:

| Sub-pattern | File | Reason | Use Instead |
|-------------|------|---------|-------------|
| stdio 4-byte LE framing | `host/src/native-host.ts` | No existing stdio host in codebase | RESEARCH.md Pattern 2 (verbatim) |
| Windows `reg.exe` invocation | `host/src/bootstrap/register.ts` | No registry writes anywhere in codebase | RESEARCH.md Pattern 4 |
| `FolderBrowserDialog` via PowerShell | `host/src/folder-picker.ts` | No GUI dialog calls anywhere in codebase | RESEARCH.md Pattern 5 |
| `chrome.runtime.sendNativeMessage` | `entrypoints/background.ts` | No native messaging anywhere in codebase | RESEARCH.md `SW Pairing Handler` example |
| `key` field in `manifest.json` | `wxt.config.ts` | Not yet present — must be added post-CWS-upload | RESEARCH.md Pattern 3 |

---

## Metadata

**Analog search scope:** `host/src/`, `host/test/`, `entrypoints/`, `lib/`, `wxt.config.ts`, `package.json`
**Files scanned:** 9 source files + 7 test files + 2 config files
**Pattern extraction date:** 2026-06-05
