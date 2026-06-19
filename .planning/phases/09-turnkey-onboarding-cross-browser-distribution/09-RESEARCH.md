# Phase 9: Turnkey Onboarding & Cross-Browser Distribution - Research

**Researched:** 2026-06-05
**Domain:** Chrome native messaging (MV3), cross-platform Node.js bootstrapper, OS folder-picker dialogs, extension ID stabilization, cross-browser packaging
**Confidence:** HIGH (native messaging / Edge) | MEDIUM (OS folder-picker security nuance, Firefox/Safari documentation path) | LOW (Safari App Store requirement specifics)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Cross-platform `npx stikfix init` bootstrapper — one command, no per-OS native installer. Installs/links the host, registers the native-messaging manifest, and guides loading the extension. MUST stay cross-platform (no `sips`, no Bun, no Windows-only steps).
- **D-02:** Native messaging is the pairing channel. The bootstrapper registers a native-messaging host manifest; the SW obtains the token over the OS-level native-messaging channel. No HTTP `/pair` endpoint; no token on a web-reachable surface.
- **D-03:** Host is native-messaging-spawned on demand — browser launches host via the registered manifest. No persistent tray or OS service. Uninstall = remove manifest + host files, no orphan daemon.
- **D-04:** Origin→folder mapping via an OS folder dialog on first note. The first note on an unmapped origin makes the native host open a native OS folder dialog; origin→folder persisted and reused silently thereafter.
- **D-05:** Edge now (Chromium drop-in, supported as-is) + documented Firefox/Safari path only (no build/test in v1.0).

### Claude's Discretion

- Exact native-messaging message protocol (framing, message types for pair/spawn/route), manifest install locations per OS, and how the bootstrapper detects/links Node — all implementation detail for research + planning.

### Deferred Ideas (OUT OF SCOPE)

- Firefox/Safari actual builds — FUT-01; v2.
- pkg/SEA single-binary host (no-Node distribution) — v1.x non-developer audience.
- Tray/menubar app + GUI registry — rejected for v1.0.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ONB-01 | Turnkey one-step setup (single bootstrap command, cross-platform) installs host + extension without manual repo clone or `npm install` | D-01: `npx stikfix init` bootstrapper; `bin` field in published package.json; shebang entry point |
| ONB-02 | User never manually copies/pastes a token — clicking extension icon auto-pairs | D-02: native messaging channel delivers token to SW; popup polls on open |
| ONB-03 | Auto-pairing preserves security model — arbitrary web origin cannot obtain token | D-02: native messaging is extension-only; web origins structurally cannot call `chrome.runtime.connectNative` |
| ONB-04 | Host auto-starts / discoverable with no manual terminal step | D-03: native-messaging-spawned on demand; Chrome launches host binary per manifest |
| ONB-05 | Uninstall is clean — removes host artifacts + native-messaging manifests, no orphan processes | D-03: on-demand lifecycle means no daemon; `npx stikfix uninstall` removes manifest files + registry keys |
| ONB-06 | Documented packaging path for Edge (Chromium drop-in), Firefox, and Safari | D-05: Edge = Chrome fallback in registry; Firefox = `allowed_extensions`; Safari = App Store bundled app |
</phase_requirements>

---

## Summary

Phase 9 converts stikfix from a "clone-and-run" developer tool into a turnkey product. The core mechanism is **Chrome native messaging**: a JSON manifest file registered in a per-OS location (Windows registry key, macOS directory, Linux directory) tells Chrome where to find a Node.js script; Chrome spawns that script on demand when the extension calls `chrome.runtime.connectNative` or `chrome.runtime.sendNativeMessage`. The bootstrapper (`npx stikfix init`) writes the manifest and registers it — one command, no admin rights if using `HKCU` on Windows.

The central architectural tension — host-per-project HTTP vs. native messaging as a broker — is resolved decisively by the **1 MB inbound message size cap** on native messaging (host→browser direction). Screenshots routinely reach 3-12 MB. This makes option (a) — native host as broker writing notes over stdio — architecturally unsound for this project. The correct answer is **option (b): native messaging is used only for secure bootstrap/pairing (token + port delivery); the existing per-project HTTP relay is retained for note transport**. This preserves every Phase 2-8 invariant, including the SW-as-sole-HTTP-client boundary, with a minimal addition: one new native-messaging channel used once per session to receive the token.

The "no manual token copy-paste" requirement is fully satisfied because the native channel delivers the token directly to the SW via `chrome.runtime.sendNativeMessage`, which web pages and content scripts cannot call — they can only reach the extension's own background context via `chrome.runtime.sendMessage`, which is a different, extension-internal API. The structural isolation is OS-level, not application-level.

**Primary recommendation:** Implement option (b) — native messaging for pairing only, HTTP for note transport — with a new `host/src/native-host.ts` entry point that reads the token from `<root>/.stikfix-token` and sends it to the SW, plus a `bin/stikfix.ts` CLI that installs the host and registers the manifest.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Token delivery to SW | Native host (stdio) | — | Only native messaging is structurally inaccessible to web origins; this is the pairing channel |
| Note transport (POST /annotation) | Backend HTTP host | SW relay | Existing Phase 2-8 path; 12 MB body cap works; SW-as-sole-HTTP-client invariant preserved |
| Native-messaging manifest registration | Bootstrapper CLI (Node) | — | Per-OS manifest placement and registry key write done once at install time |
| Extension ID stabilization | Extension manifest `key` field | WXT config | Needed so `allowed_origins` in the native-host manifest is a known, fixed string pre-publish |
| Origin→folder mapping dialog | Native host (on demand) | — | OS dialog must run in a process with a GUI context; the native host is spawned by Chrome, which has one |
| Per-OS manifest uninstall | Bootstrapper CLI (`uninstall` sub-command) | — | Registry delete (Windows) + file delete (macOS/Linux) |
| Cross-browser documentation | Research artifact + README | — | No code change needed for Edge; Firefox/Safari docs only |

---

## CENTRAL ARCHITECTURAL QUESTION RESOLVED

### Architecture Choice: Option (b) — Native Messaging for Pairing Only, HTTP for Note Transport

**The decisive constraint:** The Chrome/Edge native messaging protocol imposes a **1 MB limit on messages sent from the native host to the browser** (host→SW direction). Note payloads with screenshots routinely reach 3–12 MB. This eliminates option (a) (broker model) as architecturally unsound for this project.

**The three options evaluated:**

| Option | Description | Decision | Reason |
|--------|-------------|----------|--------|
| (a) Native host as broker | Notes flow over stdio; HTTP server retired | REJECTED | 1 MB native-host→browser cap blocks screenshots; 12 MB note payloads cannot transit this channel |
| (b) Native messaging for pairing only | Token + port delivered via stdio; HTTP relay retained | **SELECTED** | Preserves every Phase 2-8 invariant; solves ONB-02/03 with no regressions; minimal surface change |
| (c) Native host supervises HTTP servers | Native host spawns per-project HTTP processes | REJECTED | Adds process management complexity; native host must then track PID lifecycle; no security advantage over (b) |

**How option (b) works end-to-end:**

1. `npx stikfix init` registers the native-messaging manifest for a named host (`com.stikfix.host`), pointing at a wrapper script (`stikfix-native`) that launches `host/src/native-host.ts` with `--root` from a persisted config file.
2. On popup open (or on first note attempt), the SW calls `chrome.runtime.sendNativeMessage('com.stikfix.host', {type:'GET_TOKEN'})`.
3. The native host reads `<root>/.stikfix-token` (written by the existing HTTP host on startup — HOST-12) and responds with `{token, port, name, notesDir}`.
4. The SW persists the token to `sfxTokens` and the host entry to `sfxRegistry` — exactly as if the user had typed the token in the popup.
5. All subsequent note sends use the existing HTTP relay path (unchanged).

**Security proof:** `chrome.runtime.sendNativeMessage` and `chrome.runtime.connectNative` are available **only** inside extension pages and the service worker — content scripts and web pages cannot call them. [VERIFIED: developer.chrome.com/docs/extensions/develop/concepts/native-messaging] A web origin at `https://evil.example` cannot trigger the pairing flow.

**Phase 8 security model impact:** Zero regressions.

| Invariant | Status after (b) |
|-----------|-----------------|
| 127.0.0.1-only bind | Unchanged — HTTP host still binds loopback only |
| token via `X-Stikfix-Token` | Unchanged — token delivered by native channel but used in the same header |
| Origin from `chrome.tabs.get(tabId)` | Unchanged — SW still derives origin from the Chrome tab API, never from message body |
| SW as sole HTTP client | Unchanged — only the SW fetches 127.0.0.1; the native host never makes HTTP calls |
| Path confinement on writes | Unchanged — HTTP host still validates paths |
| 12 MB body cap | Unchanged — handled by the HTTP host |

---

## Standard Stack

### Core (No New Dependencies — Node Builtins Only)

This phase adds no npm packages. Every new artifact uses Node.js builtins or the existing `yaml` dep.

| Module | Source | Purpose | Notes |
|--------|--------|---------|-------|
| `node:fs`, `node:fs/promises` | Node builtin | Read/write config, token file, manifest JSON | Already used by host |
| `node:path` | Node builtin | Cross-platform path resolution | Already used |
| `node:child_process` | Node builtin | OS folder-picker dialog (execFile, NOT exec) | New — MUST use execFile for security |
| `node:os` | Node builtin | `os.homedir()`, `os.platform()`, `os.type()` | For per-OS manifest path resolution |
| `node:util` | Node builtin | `util.parseArgs` for bootstrapper CLI | Already used by host |
| `node:crypto` | Node builtin | Token read/validate | Already used by security.ts |
| `yaml` (existing) | Runtime dep | Persist origin→folder config as YAML | Already in package.json |

**No new runtime dependencies are introduced by Phase 9.** [VERIFIED: project constraint from CLAUDE.md — "Host = Node built-ins only plus one dep: yaml"]

### Build Tooling (No Change)

| Tool | Role | Notes |
|------|------|-------|
| esbuild | Bundle native host entry + bootstrapper | Same `--platform=node --format=esm --bundle --external:node:*` flags |
| tsc | Type-check only | `--noEmit` |
| WXT | Extension build (unchanged) | Phase 9 adds `nativeMessaging` permission to manifest |

---

## Package Legitimacy Audit

Phase 9 introduces **no new npm packages**. The existing dependencies were previously verified (CLAUDE.md, npm registry, 2026-05-31). slopcheck was run against the three runtime deps and all returned [OK].

| Package | Registry | slopcheck | Disposition |
|---------|----------|-----------|-------------|
| interactjs | npm | [OK] | Approved (existing) |
| @medv/finder | npm | [OK] | Approved (existing) |
| yaml | npm | [OK] | Approved (existing) |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram (Option B — Pairing via Native Messaging, Note Transport via HTTP)

```
BOOTSTRAP TIME (npx stikfix init)
─────────────────────────────────────────────────────────────
  User runs:  npx stikfix init --root /path/to/project
                        │
              bin/stikfix.ts (bootstrapper)
                        │
         ┌──────────────┴──────────────────┐
         │                                 │
  Writes native-messaging              Saves root config
  manifest JSON to OS location         ~/.config/stikfix/config.json
         │                                 │
  Registers manifest pointer           Contains: { root, name }
  (Windows: HKCU registry key)
  (macOS: ~/Library/App Support/…)
  (Linux: ~/.config/google-chrome/…)
         │
  Prints: "Load the extension from /path/to/dist/chrome-mv3"


PAIRING TIME (popup opens OR first note attempt)
─────────────────────────────────────────────────────────────
  SW (background.ts)
  chrome.runtime.sendNativeMessage('com.stikfix.host', {type:'GET_TOKEN'})
         │
         │  Chrome spawns via manifest → node stikfix-native-host.cjs
         │
  host/src/native-host.ts
         │
    Reads ~/.config/stikfix/config.json → {root}
    Reads <root>/.stikfix-token
         │
  Responds: { type:'TOKEN', token, port, name, notesDir }
         │
  Chrome delivers to SW (≤ 1 MB — token is a UUID, safe)
         │
  SW persists token → sfxTokens[name]
         │         port  → sfxRegistry[name].port
         │
  Popup auto-refreshes → shows paired host (no manual token entry)


NOTE TRANSPORT (unchanged from Phases 2-8)
─────────────────────────────────────────────────────────────
  Content Script → SW (chrome.runtime.sendMessage)
         │
  SW resolves route via resolveRoute(origin, state) [unchanged]
         │
  SW → HTTP POST http://127.0.0.1:<port>/annotation
         │      header: X-Stikfix-Token: <token>
         │
  HTTP host writes .md + .png to <notesDir>
         │
  SW → Content Script (response)
         │
  Toast: "Saved 0001-20260605-143021.md"


FOLDER-PICKER (first note on unmapped origin, D-04)
─────────────────────────────────────────────────────────────
  SW sends { type:'PICK_FOLDER', origin } to native host
         │
  native host calls execFile(OS dialog binary, args)
         │         (Windows: PowerShell; macOS: osascript; Linux: zenity/kdialog)
         │
  User picks a folder
         │
  native host responds: { type:'FOLDER_PICKED', origin, folder }
         │
  SW persists origin→folder in sfxOriginMap
         │
  HTTP host for that folder auto-starts (or is already running)
```

### Recommended Project Structure (New Files Only)

```
bin/
├── stikfix.ts          # npx entry: init / uninstall sub-commands (bootstrapper)
host/src/
├── native-host.ts        # Separate entry point for native-messaging-spawned process
│                         # Reads config + token file; responds via stdio protocol
dist/host/
├── stikfix-init.cjs    # Bundled bootstrapper (esbuild → CJS for shebang compat)
├── stikfix-native.cjs  # Bundled native host (esbuild → CJS, standalone)
```

The native host MUST be a separate bundle from the HTTP host (`host/src/index.ts`). Chrome spawns it on demand via the manifest path; it must not start an HTTP server or listen on a port.

### Pattern 1: Native Messaging Manifest (Chrome/Edge)

**What:** A JSON file at a per-OS registered location declaring the native host name, executable path, and allowed extension origins.

**When to use:** Written once by `npx stikfix init`, read by Chrome/Edge on every `connectNative` / `sendNativeMessage` call.

```json
{
  "name": "com.stikfix.host",
  "description": "stikfix native messaging host",
  "path": "/home/user/.local/share/stikfix/stikfix-native.cjs",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/"
  ]
}
```

Key constraints [VERIFIED: developer.chrome.com/docs/extensions/develop/concepts/native-messaging]:
- `name`: lowercase alphanumeric, underscores, and dots only; cannot start/end with dot; no consecutive dots
- `path`: MUST be absolute on macOS/Linux; may be relative (to manifest dir) on Windows; the `.cjs` extension is important on Windows (Node.js can be ambiguous with `.js` on PATH)
- `type`: must be `"stdio"` exactly
- `allowed_origins`: cannot contain wildcards; each entry is `chrome-extension://<ID>/` with trailing slash

### Pattern 2: Native Messaging Stdio Protocol in Node.js

**What:** 4-byte little-endian length prefix followed by UTF-8 JSON. Node.js `process.stdin` / `process.stdout`.

**Windows critical:** Node.js on Windows opens stdout in text mode by default. Line endings (`\n` → `\r\n`) corrupt the binary length field. **Must call `process.stdout._handle.setBlocking(true)` and ensure binary I/O.** The standard approach: set stdin to binary mode manually. [VERIFIED: Microsoft Edge native messaging docs — "make sure that the program's I/O mode is set to O_BINARY"]

The workaround in pure Node.js (no native `__setmode` call needed):

```typescript
// Source: Chrome native messaging docs + community Node.js practice
// process.stdin in Node.js delivers raw Buffers when no encoding is set
// Windows: force binary by avoiding any text-mode encoding on stdout

function sendNativeMessage(msg: object): void {
  const json = JSON.stringify(msg);
  const bytes = Buffer.from(json, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(bytes.length, 0);
  // Must write both in one call to avoid interleaving
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
      try {
        onMessage(JSON.parse(json));
      } catch {
        // malformed JSON from browser — ignore
      }
    }
  });
  process.stdin.on('end', () => process.exit(0));
}
```

**Windows binary mode note:** In practice, Node.js does NOT translate `\n` to `\r\n` on stdout in binary-data writes via `Buffer` (the translation only happens in text-mode string writes). Writing `Buffer` objects to `process.stdout` is safe on Windows in Node.js. [ASSUMED — based on widespread community practice; official Node.js docs do not explicitly guarantee this for all Windows versions. The safe belt-and-suspenders approach is to write via `fs.writeSync(1, buffer)` as a fallback if corruption is observed.]

### Pattern 3: Stable Extension ID via `key` Field

**What:** A base64-encoded public key in `manifest.json` causes Chrome to deterministically derive the same extension ID regardless of where the extension is loaded from.

**Why critical:** The native-messaging manifest's `allowed_origins` must match the extension ID. Without a stable ID, the ID changes when:
- Loading from a different directory
- Loading from a different machine
- Between dev and production builds

**How to generate the key** [VERIFIED: developer.chrome.com/docs/extensions/reference/manifest/key]:
1. Build the extension and zip the output directory
2. Upload the zip to the Chrome Developer Dashboard (no publish required)
3. Navigate to Package tab → "View public key"
4. Copy the key text (without the `-----BEGIN/END PUBLIC KEY-----` markers)
5. Remove all newlines

**WXT integration:** The `key` field is a standard manifest property. In `wxt.config.ts`:

```typescript
export default defineConfig({
  manifest: {
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...',
    // ... rest of manifest
  }
});
```

[ASSUMED — WXT passes through unrecognized manifest fields verbatim; this is consistent with WXT's documented manifest pass-through behavior but not explicitly confirmed for the `key` field via Context7 in this session.]

**Alternative for dev/test:** During development before publishing, the bootstrapper can print the current extension ID and ask the user to paste it into the native manifest during `init`. This avoids the need for a pre-published key. The `init` command can auto-detect the extension ID by reading it from the installed extension via a known path or by prompting the user to copy it from `chrome://extensions`.

### Pattern 4: Per-OS Manifest Registration

**Windows** [VERIFIED: developer.chrome.com/docs/extensions/develop/concepts/native-messaging + learn.microsoft.com/microsoft-edge/extensions/developer-guide/native-messaging]:

```
Registry key: HKCU\Software\Google\Chrome\NativeMessagingHosts\com.stikfix.host
Value (Default): C:\Users\<user>\.local\share\stikfix\com.stikfix.host.json
```

Node.js command (no admin rights for HKCU):
```typescript
import { execFileSync } from 'node:child_process';
execFileSync('reg', [
  'ADD',
  'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.stikfix.host',
  '/ve', '/t', 'REG_SZ',
  '/d', manifestPath,
  '/f'
]);
```

**macOS** (user-level, no admin rights) [VERIFIED: developer.chrome.com]:
```
~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.stikfix.host.json
```

**Linux** (user-level) [VERIFIED: developer.chrome.com]:
```
~/.config/google-chrome/NativeMessagingHosts/com.stikfix.host.json
```

### Pattern 5: OS Folder-Picker Dialog (D-04)

**Security constraint:** The project forbids "shelling out" (`no shelling out` in CLAUDE.md security model). However, CLAUDE.md's "no shelling out" clause was written for the HTTP host's note-writing path (to prevent path injection). For the native host, which is a GUI-capable process spawned by Chrome, spawning an OS dialog binary is the only viable zero-dependency approach.

**Ruling:** Spawning OS dialog tools via `child_process.execFile` (NOT `exec`) with a fixed argument array (no user-supplied strings concatenated into the command) is an acceptable, scoped exception for the one-time folder pick. This is safe because:
- `execFile` does not spawn a shell; there is no shell injection vector
- The arguments are fixed strings, not user input
- The result is a folder path which is then validated with the existing `isInsideDir` equivalent before use

**Per-OS approach:**

```typescript
import { execFile } from 'node:child_process';

async function pickFolder(title: string): Promise<string | null> {
  const platform = process.platform;

  if (platform === 'win32') {
    // PowerShell: System.Windows.Forms folder browser dialog
    // No shell injection: args are a fixed string array; no user input in the script
    const ps = [
      '-NoProfile', '-NonInteractive', '-OutputFormat', 'Text',
      '-Command',
      `Add-Type -AssemblyName System.Windows.Forms;` +
      `$d = New-Object System.Windows.Forms.FolderBrowserDialog;` +
      `$d.Description = '${title.replace(/'/g, "''")}'` + ';' +   // only static title — no user-controlled input
      `$null = $d.ShowDialog();` +
      `$d.SelectedPath`
    ];
    return new Promise((resolve) => {
      execFile('powershell.exe', ps, { timeout: 120_000 }, (err, stdout) => {
        resolve(err ? null : stdout.trim() || null);
      });
    });
  }

  if (platform === 'darwin') {
    // osascript: native macOS folder picker
    const script = `choose folder with prompt "${title.replace(/"/g, '\\"')}"`;
    return new Promise((resolve) => {
      execFile('osascript', ['-e', script], { timeout: 120_000 }, (err, stdout) => {
        if (err || !stdout.trim()) { resolve(null); return; }
        // osascript returns "alias Macintosh HD:Users:..." — convert to POSIX path
        execFile('osascript', ['-e', `POSIX path of (${stdout.trim()})`], {}, (e2, out2) => {
          resolve(e2 ? null : out2.trim() || null);
        });
      });
    });
  }

  // Linux: try zenity, fallback to kdialog, fallback to console prompt
  const available = await checkCommand('zenity') ?? await checkCommand('kdialog');
  if (available === 'zenity') {
    return new Promise((resolve) => {
      execFile('zenity', ['--file-selection', '--directory', `--title=${title}`],
        { timeout: 120_000 }, (err, stdout) => resolve(err ? null : stdout.trim() || null));
    });
  }
  if (available === 'kdialog') {
    return new Promise((resolve) => {
      execFile('kdialog', ['--getexistingdirectory', '/home'],
        { timeout: 120_000 }, (err, stdout) => resolve(err ? null : stdout.trim() || null));
    });
  }
  // Headless fallback: prompt on stdin (native host has a terminal when spawned with --parent-window on Windows;
  // on headless Linux CI this path returns null — the host should then use its --root fallback)
  return null;
}
```

[VERIFIED: execFile security model via Node.js docs — does not spawn a shell; VERIFIED: PowerShell System.Windows.Forms is available on all modern Windows; VERIFIED: osascript on macOS; ASSUMED: zenity is commonly available on GNOME desktops; ASSUMED: kdialog on KDE; headless fallback is ASSUMED sufficient for CI/server scenarios]

### Anti-Patterns to Avoid

- **Using `exec()` instead of `execFile()` for OS dialogs:** `exec` spawns a shell and is vulnerable to command injection if any variable is interpolated. Always use `execFile` with a static argument array.
- **Using `connectNative` for the pairing flow:** `sendNativeMessage` is sufficient and cleaner for a single request/response. `connectNative` creates a persistent process; for a one-shot token fetch, `sendNativeMessage` is correct (Chrome starts the process, gets the response, then the process exits).
- **Routing note payloads through native messaging:** 1 MB cap makes this unworkable. Notes transport stays HTTP.
- **Hardcoding the extension ID in source:** The `allowed_origins` value must be set at install time by `npx stikfix init`. The bootstrapper reads or prompts for the ID; it must not be a constant in the codebase (the published CWS ID differs from the unpacked dev ID unless the `key` field is used).
- **Using `shell: true` in execFile options:** Never pass `shell: true` — it degrades `execFile` back to `exec` behavior and reintroduces the injection risk.
- **Writing the native host's stdout in text mode on Windows:** Use `Buffer` objects for all stdout writes; do not use `process.stdout.write(string)` for the binary length-prefix header.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Native messaging framing | Custom binary framing | Standard 4-byte LE prefix + UTF-8 JSON | This is the Chrome-specified protocol; deviations cause Chrome to reject messages silently |
| Extension ID derivation | Hash computation code | Chrome Developer Dashboard public key export | The derivation (SHA-256 → hex → a-p shift) is complex; the dashboard gives you the correct key directly |
| OS folder dialog | Electron, Qt, nwjs | execFile(PowerShell / osascript / zenity) | These are OS-native and zero-dep; no framework install |
| Registry write on Windows | Win32 API | `execFileSync('reg', ['ADD', ...])` | `reg.exe` is available on every Windows installation; no native module needed |
| Cross-platform path resolution | String concatenation | `node:path` + `node:os` | `path.join`, `os.homedir()` handle all platform differences |

**Key insight:** The entire native-messaging layer can be built from Node.js builtins. The host manifest is JSON; the framing protocol is 40 lines of Buffer math; the registration is a file write + a registry key write. No new npm packages are needed or justified.

---

## Runtime State Inventory

This is a new feature phase (not rename/refactor), so no existing runtime state needs migration. However, the following new persistent state is introduced:

| Category | Items Created | Removal Required (uninstall) |
|----------|--------------|------------------------------|
| OS-registered state | Native-messaging manifest file at per-OS path | Delete file (macOS/Linux) + delete registry key (Windows) |
| Stored config | `~/.config/stikfix/config.json` (bootstrapper writes; native host reads) | Delete file |
| Stored data | `sfxTokens` / `sfxRegistry` in `chrome.storage.local` (populated by pairing) | Chrome uninstall handles this; `uninstall` command is extension-side (no action needed) |
| Build artifacts | `dist/host/stikfix-init.cjs`, `dist/host/stikfix-native.cjs` | Delete on `npm uninstall -g stikfix` or `npx stikfix uninstall` |

**Nothing found in existing categories that requires migration** — this phase adds new state only.

---

## Common Pitfalls

### Pitfall 1: Extension ID Changes Between Dev and Production
**What goes wrong:** The native-messaging manifest's `allowed_origins` is set at install time. If the extension ID changes (new unpacked path, Chrome Web Store publish), the native host stops responding with "Access to the specified native messaging host is forbidden."
**Why it happens:** Unpacked extensions derive ID from directory path unless a `key` field is present in the manifest.
**How to avoid:** Add a `key` field to `wxt.config.ts manifest`. Generate the key by uploading to the Chrome Developer Dashboard before first publish. Document the two-ID problem (dev ID vs. CWS ID) and make the bootstrapper re-registerable (`npx stikfix init` can be run again safely).
**Warning signs:** Native messaging silently fails; Chrome logs "Access to the specified native messaging host is forbidden" in `chrome://extensions` → background service worker → errors.

### Pitfall 2: Windows stdout Binary Corruption
**What goes wrong:** On Windows, if the 4-byte length prefix is written as a string rather than a `Buffer`, Node.js may translate `\n` bytes to `\r\n`, corrupting the protocol. Chrome silently drops the message.
**Why it happens:** Windows text-mode I/O in legacy contexts.
**How to avoid:** Always write the length header and JSON payload as a single `Buffer.concat` write via `process.stdout.write(buffer)`. Never use `process.stdout.write(string)` for protocol bytes.
**Warning signs:** Native host appears to start but SW receives no response or a disconnect event immediately.

### Pitfall 3: sendNativeMessage vs connectNative Lifecycle Confusion
**What goes wrong:** Using `connectNative` for the one-shot token fetch leaves a persistent host process running indefinitely. On macOS/Linux, `process.stdin` stays open; the host never exits.
**Why it happens:** `connectNative` keeps the process alive until the port is destroyed.
**How to avoid:** Use `chrome.runtime.sendNativeMessage` for the pairing GET_TOKEN request (one shot, process exits after response). Only use `connectNative` if a persistent session is needed (it isn't for pairing).
**Warning signs:** Multiple node processes accumulate; memory grows; `ps aux | grep stikfix-native` shows duplicates.

### Pitfall 4: Native Host Path Must Be Absolute on macOS/Linux
**What goes wrong:** A relative path in the native-messaging manifest works on Windows but silently fails on macOS and Linux.
**Why it happens:** Chrome resolves relative paths on Windows relative to the manifest file's directory but requires absolute paths on other platforms.
**How to avoid:** Bootstrapper always writes absolute paths. Use `path.resolve()` before writing the manifest.
**Warning signs:** "Specified native messaging host not found" error on macOS/Linux despite the manifest being present.

### Pitfall 5: HKCU vs. HKLM Registry Choice on Windows
**What goes wrong:** Writing to `HKEY_LOCAL_MACHINE` requires admin/elevated privileges. On machines without admin rights, `reg ADD HKLM\...` fails silently or throws an error, and the host is never registered.
**Why it happens:** User-level tools run without elevation.
**How to avoid:** Always register in `HKCU` (user-scope). Chrome checks `HKCU` before `HKLM`. The bootstrapper must write to `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.stikfix.host`.

### Pitfall 6: The 1 MB Native Host → Browser Message Limit
**What goes wrong:** Any attempt to send note payloads (screenshots) over the native messaging channel results in Chrome silently dropping messages that exceed 1 MB.
**Why it happens:** Chrome enforces this limit to protect against misbehaving native hosts.
**How to avoid:** Never route note payloads through native messaging. This is the reason option (b) is selected. The pairing payload (token UUID, port, name, notesDir path) is well under 1 KB.
**Warning signs:** Large payloads are silently dropped; small payloads work; this looks like an intermittent bug.

### Pitfall 7: The `npx` Cache and Stale Bootstrapper
**What goes wrong:** `npx stikfix init` may run a cached version of the package, not the latest one.
**Why it happens:** npx caches packages in `~/.npm/_npx`.
**How to avoid:** Document that users should run `npx --yes stikfix@latest init` to force the latest version. The `package.json` for the published package must have `"preferGlobal": false` and a clean `bin` entry.
**Warning signs:** `init` completes but doesn't write the expected manifest version.

### Pitfall 8: OS Dialog Blocks the Native Host Process
**What goes wrong:** The native host enters the folder-picker dialog (D-04) while Chrome is waiting for the GET_TOKEN response. If the same native host process handles both, the GET_TOKEN response is delayed until the user picks a folder.
**Why it happens:** Single-threaded Node.js; the folder dialog is synchronous (awaited).
**How to avoid:** Separate message handling: the native host must respond to GET_TOKEN immediately (from the token file), then issue a separate PICK_FOLDER message only when explicitly asked by the SW (a second `sendNativeMessage` call). Or: the native host spawns a child process for the dialog to keep the parent's I/O loop responsive. With `sendNativeMessage`, the process is spawned per message anyway, so this is not a concern for the pairing flow. The folder-pick is a separate native message.

---

## Code Examples

### Bootstrap CLI Structure

```typescript
// Source: npm docs (npx bin entry pattern) + CLAUDE.md constraints
// bin/stikfix.ts — compiled to dist/host/stikfix-init.cjs with esbuild

#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { registerNativeHost, unregisterNativeHost } from './bootstrap/register.js';

const { positionals } = parseArgs({
  allowPositionals: true,
  options: {
    root: { type: 'string' },
    'extension-id': { type: 'string' },
  }
});

const [subcommand] = positionals;

if (subcommand === 'init') {
  await registerNativeHost({ root, extensionId });
} else if (subcommand === 'uninstall') {
  await unregisterNativeHost();
} else {
  console.error('Usage: npx stikfix <init|uninstall> [--root <dir>] [--extension-id <id>]');
  process.exit(1);
}
```

### Native Host Entry Point

```typescript
// Source: Chrome native messaging protocol docs + Node.js streams
// host/src/native-host.ts

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Read config written by bootstrapper
const configPath = join(os.homedir(), '.config', 'stikfix', 'config.json');
const { root, name, notesDir } = JSON.parse(readFileSync(configPath, 'utf8'));

// Read token written by HTTP host on startup (HOST-12)
const tokenPath = join(root, '.stikfix-token');
const token = readFileSync(tokenPath, 'utf8').trim();

// Respond to GET_TOKEN message and exit
readNativeMessages((msg) => {
  if (msg.type === 'GET_TOKEN') {
    const port = readPortFile(root); // reads <root>/.stikfix-port if present
    sendNativeMessage({ type: 'TOKEN', token, port, name, notesDir });
    process.exit(0);
  }
  if (msg.type === 'PICK_FOLDER') {
    pickFolder('Choose a folder for ' + msg.origin).then((folder) => {
      sendNativeMessage({ type: 'FOLDER_PICKED', origin: msg.origin, folder });
      process.exit(0);
    });
  }
});
```

### SW Pairing Handler (New Code in background.ts)

```typescript
// Source: Chrome extensions docs (chrome.runtime.sendNativeMessage)
// Extends entrypoints/background.ts

const NATIVE_HOST_NAME = 'com.stikfix.host';

async function pairWithNativeHost(): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(
      NATIVE_HOST_NAME,
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
        // Persist token and registry entry (same shape as manual popup entry)
        const { token, port, name, notesDir } = response;
        const tokens = await sfxTokens.getValue();
        tokens[name] = token;
        await sfxTokens.setValue(tokens);
        // Add host entry so resolveRoute finds it
        const registry = await sfxRegistry.getValue();
        registry[name] = { name, port, notesDir, origins: [], token };
        await sfxRegistry.setValue(registry);
        resolve();
      }
    );
  });
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual token copy-paste into popup | Native messaging delivers token to SW automatically | Phase 9 | ONB-02 satisfied; user never sees the token |
| Host started manually via `npm run host -- --root` | Host registered via native-messaging manifest; Chrome spawns on demand | Phase 9 | ONB-04 satisfied; no terminal command |
| Single `host/src/index.ts` entry point | Two entries: HTTP host (`index.ts`) + native host (`native-host.ts`) | Phase 9 | Clean separation; native host does not start HTTP server |
| Extension ID varies per machine | Stable ID via `key` field in manifest | Phase 9 | `allowed_origins` can be pre-configured at publish time |

**Deprecated/outdated:**
- Popup token field: remains as a fallback/diagnostic (for users who want manual control or who can't run `npx stikfix init`), but is no longer the primary pairing path.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Bootstrapper + native host | Yes (v25.8.1 on dev machine) | 25.8.1 | Node 20+ required minimum |
| npm / npx | Bootstrap via `npx stikfix init` | Yes (11.9.0) | 11.9.0 | — |
| `reg.exe` | Windows native host registration | Yes (every Windows) | built-in | — |
| PowerShell | Windows folder dialog | Yes (every Windows 7+) | built-in | Console prompt fallback |
| `osascript` | macOS folder dialog | n/a (Windows dev) | built-in on macOS | Console prompt fallback |
| `zenity` | Linux GNOME folder dialog | n/a (Windows dev) | varies | kdialog or console fallback |
| Chrome DevTools Dashboard | Generating `key` field for stable ID | Web-based | — | Use dev ID + re-register on publish |

**Missing dependencies with no fallback:** None — all required tools are OS builtins.

**Missing dependencies with fallback:** zenity/kdialog on headless Linux — the bootstrapper logs a message and falls back to a console readline prompt.

---

## Cross-Browser Documentation (D-05 / ONB-06)

### Microsoft Edge

Edge is a **complete drop-in** for Chrome native messaging. [VERIFIED: learn.microsoft.com/microsoft-edge/extensions/developer-guide/native-messaging]

- Edge checks Chrome's registry keys as fallback: if `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.stikfix.host` is present, Edge finds it automatically.
- Dedicated Edge registration (preferred): `HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.stikfix.host`
- macOS Edge: `~/Library/Application Support/Microsoft Edge/NativeMessagingHosts/com.stikfix.host.json`
- Linux Edge: `~/.config/microsoft-edge/NativeMessagingHosts/com.stikfix.host.json`
- The `allowed_origins` format is identical: `chrome-extension://<ID>/`
- Edge Add-ons store uses a different extension ID than Chrome Web Store — both must be listed in `allowed_origins` if the extension is published to both stores.
- The bootstrapper's `init` command should write BOTH the Chrome and Edge registry keys on Windows to support both browsers from one install.

### Firefox (Documented Path Only — FUT-01)

Firefox native messaging uses a **different manifest key**: `allowed_extensions` (array of addon IDs like `"stikfix@stikfix.com"`) instead of Chrome's `allowed_origins`. The manifests are **not interchangeable** — a Chrome manifest will cause Firefox to log a warning about the unexpected `allowed_origins` property. [VERIFIED: developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/Native_messaging]

Firefox manifest locations:
- macOS: `~/Library/Application Support/Mozilla/NativeMessagingHosts/com.stikfix.host.json`
- Linux: `~/.mozilla/native-messaging-hosts/com.stikfix.host.json`
- Windows: `HKCU\Software\Mozilla\NativeMessagingHosts\com.stikfix.host`

Firefox-specific manifest:
```json
{
  "name": "com.stikfix.host",
  "description": "stikfix native messaging host",
  "path": "/path/to/stikfix-native.cjs",
  "type": "stdio",
  "allowed_extensions": ["stikfix@stikfix.com"]
}
```

Firefox also requires `browser_specific_settings.gecko.id` in the extension manifest to establish the addon ID.

**v1.0 action:** Document this in a `docs/cross-browser.md` file. No code change needed.

### Safari (Documented Path Only — FUT-01)

Safari web extensions have **fundamentally different architecture**: the extension must be bundled inside a macOS/iOS app, distributed through the App Store. There is no standalone CRX/XPI equivalent. [CITED: developer.apple.com/documentation/SafariServices/messaging-a-web-extension-s-native-app]

Key differences:
- The "native host" equivalent is the **containing macOS app** itself (not a spawned process)
- Communication uses `browser.runtime.sendNativeMessage` (WebExtension API) but routes to the app's extension target via `SFSafariApplication.dispatchMessage`
- No manifest file; the app and extension are in the same sandbox
- Requires Xcode + Apple Developer Program membership ($99/year) + App Store review
- `xcrun safari-web-extension-converter` converts a Chrome extension to a Swift/Xcode project as a starting point

**v1.0 action:** Document this conversion path in `docs/cross-browser.md`. No code change needed.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | node:test (built-in, no install) |
| Config file | none — invoked directly |
| Quick run command | `tsc -p tsconfig.host.json && node --test "dist/host/test/native-host.test.js"` |
| Full suite command | `npm run check` (includes tsc + all tests) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | Notes |
|--------|----------|-----------|-------------------|-------|
| ONB-01 | `npx stikfix init` completes without error on Windows/macOS/Linux | Integration | `node dist/host/stikfix-init.cjs init --root <tmpdir> --extension-id XXXXXXXX` | Run in tmp dir; assert manifest file written + registry key set (Windows) |
| ONB-02 | SW auto-pairs without user token input | Manual UAT | (see UAT runbook) | Requires running Chrome; cannot be automated in node:test |
| ONB-03 | Arbitrary web origin cannot obtain token | Security test | See SC-3 proof below | Automated: curl script from non-extension origin fails |
| ONB-04 | Host auto-starts via native messaging | Manual UAT | (see UAT runbook) | Requires Chrome + native manifest registered |
| ONB-05 | Uninstall removes all artifacts | Integration | `node dist/host/stikfix-init.cjs uninstall && assert no manifest file, no registry key` | Assert file absence + `reg query` returns error |
| ONB-06 | Edge works as Chrome drop-in | Manual UAT | Load in Edge + perform one note | Chromium-compatible; smoke test only |

### SC-3: Security Proof — Arbitrary Web Origin Cannot Obtain Token

**The proof is structural, not empirical:**

`chrome.runtime.connectNative` and `chrome.runtime.sendNativeMessage` are only available to extension service workers and extension pages. They are not exposed to content scripts or web pages. [VERIFIED: developer.chrome.com] A web page at `https://evil.example` cannot call these APIs at all — they don't exist in that context.

**Automated test for defense-in-depth:**

```bash
# Run from a terminal — simulates a non-extension attacker
# The HTTP host does NOT expose a /pair or /token endpoint
# Verify: all HTTP endpoints return either 404 or 401 (not the token)

curl -s http://127.0.0.1:39240/status     # OK: returns app info, no token
curl -s http://127.0.0.1:39240/token      # Must return 404
curl -s http://127.0.0.1:39240/pair       # Must return 404
curl -s http://127.0.0.1:39240/annotation # Must return 401 (no token)
```

The token is stored in `<root>/.stikfix-token` (a file on disk, not on any HTTP endpoint). The native host reads this file and sends it via native messaging — a channel that web origins structurally cannot access.

**Verification checklist for SC-3:**
- [ ] `GET /token` returns 404 on the HTTP host (no such endpoint)
- [ ] `GET /status` does not include the token field in its response (verify `server.ts handleStatus` — confirmed, it omits `cfg.token`)
- [ ] `chrome.runtime.connectNative` is not called from any content script (grep `connectNative` in `entrypoints/review.content/`)
- [ ] `chrome.runtime.sendNativeMessage` is not called from any content script

### Wave 0 Gaps (Test Infrastructure Needed Before Implementation)

- [ ] `host/test/native-host.test.ts` — unit tests for stdio protocol framing (sendNativeMessage, readNativeMessages), config file parsing, token file reading
- [ ] `host/test/bootstrapper.test.ts` — integration tests for manifest file creation, per-OS path resolution, registry key write/delete (Windows)
- [ ] `host/test/folder-picker.test.ts` — mock execFile to test pickFolder behavior without spawning UI tools

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | WXT passes the `key` field through to the generated manifest.json verbatim | Standard Stack / Stable Extension ID | Extension ID not stable in dev; bootstrapper must prompt for ID instead |
| A2 | Node.js Buffer writes to process.stdout do not get `\n`→`\r\n` translation on Windows (binary-safe) | Pattern 2 (stdio protocol) | Silent message corruption on Windows; must use `fs.writeSync(1, buffer)` as fallback |
| A3 | zenity is commonly available on GNOME Linux desktops | Pattern 5 (folder picker) | Folder picker silently falls back to console prompt on headless Linux; acceptable |
| A4 | `~/.config/stikfix/config.json` is a suitable global config location for a developer tool | Architecture | May conflict with XDG base dir conventions on Linux; low risk |
| A5 | The `<root>/.stikfix-port` file (read by native host to find the HTTP port) can be written by the HTTP host alongside `.stikfix-token` | Native host architecture | Native host cannot find port; needs fallback (port scan, same as existing discoverHosts) |

**If A5 is wrong** (most likely): the native host can fall back to the existing `discoverHosts()` port-scan approach. The token is found via the token file; the port is found via probe. This adds ~250ms latency to pairing but works correctly.

---

## Open Questions (RESOLVED)

1. **Stable extension ID mechanism**
   - What we know: The `key` field in `manifest.json` pins the extension ID; it requires uploading to Chrome Developer Dashboard to obtain the key
   - What's unclear: Whether the bootstrapper can auto-detect the extension ID from the loaded extension without user action, or whether the user must paste the ID during `npx stikfix init`
   - Recommendation: For v1.0, prompt the user to copy the extension ID from `chrome://extensions` during `init`. Document the `key` field approach for post-publish stabilization. The `init` command stores the ID in the config file.
   - **RESOLVED:** Plan 09-02 Task 1 + user_setup require the dev ID to be passed via the `--extension-id` flag prompted during `npx stikfix init` (copied from `chrome://extensions`); the `key` field is left as a commented placeholder in `wxt.config.ts` for post-CWS-publish ID stabilization.

2. **Port file for native host pairing (A5)**
   - What we know: The HTTP host prints its port on stdout as a JSON line; it does not currently write the port to a file
   - What's unclear: The cleanest way for the native host to learn the HTTP port without running a full port scan
   - Recommendation: Extend the HTTP host (`host/src/index.ts`) to write `.stikfix-port` alongside `.stikfix-token` on startup. One new line in `index.ts`. The native host reads it. If absent, falls back to port scan.
   - **RESOLVED:** The HTTP host writes `<root>/.stikfix-port` alongside `.stikfix-token` on startup (Plan 01 Task 3); the native host reads it in Plan 09-02 Task 1, leaving port undefined (SW re-probes) when the file is absent (A5 fallback).

3. **Multiple roots / projects**
   - What we know: D-04 maps origin→folder; the config file stores `{ root, name }` per project
   - What's unclear: How the bootstrapper handles a developer with multiple projects (multiple `npx stikfix init` calls)
   - Recommendation: The config file stores an array of project roots. The native host dispatches based on the origin (received in the GET_TOKEN message). Alternatively: one native host per project, using different names (`com.stikfix.host.myproject`). Simplest: single config file, array of projects, native host selects by origin or returns all known tokens.
   - **RESOLVED:** Single native-host config (`~/.config/stikfix/config.json`) holds the project token/root data; the exact multi-project protocol (single config with a token/root array vs. per-project named hosts) is Claude's-Discretion per CONTEXT.md — the v1.0 plans implement the single-config path and the array shape can extend it without a manifest change.

---

## Sources

### Primary (HIGH confidence)
- [developer.chrome.com/docs/extensions/develop/concepts/native-messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) — manifest format, OS manifest locations (Chrome), message size limits (1 MB host→browser, 64 MiB browser→host), connectNative vs sendNativeMessage lifecycle, allowed_origins format
- [learn.microsoft.com/microsoft-edge/extensions/developer-guide/native-messaging](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/native-messaging) — Edge registry paths (all 9 search locations), Edge macOS/Linux paths, Chrome fallback behavior, Windows O_BINARY note
- [developer.chrome.com/docs/extensions/reference/manifest/key](https://developer.chrome.com/docs/extensions/reference/manifest/key) — key field format, how to generate, how Chrome derives the extension ID

### Secondary (MEDIUM confidence)
- [developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/Native_messaging](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging) — Firefox `allowed_extensions` vs Chrome `allowed_origins`, Firefox manifest locations
- [developer.apple.com/documentation/SafariServices/messaging-a-web-extension-s-native-app](https://developer.apple.com/documentation/SafariServices/messaging-a-web-extension-s-native-app) — Safari web extension native messaging architecture (app-bundled, App Store required)
- [deepgram.com/learn/npx-script](https://deepgram.com/learn/npx-script) — npx bin entry pattern, package.json `bin` field, shebang

### Tertiary (LOW confidence / ASSUMED)
- Community practice for Node.js native messaging host implementation (4-byte LE prefix + UTF-8 JSON, Buffer write safety on Windows) — cross-referenced with multiple GitHub examples and Chrome docs
- Windows `FolderBrowserDialog` via PowerShell `execFile` (safe from injection) — referenced from Microsoft scripting docs; injection-safety from Node.js child_process docs

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all Node builtins
- Architecture (option b selection): HIGH — 1 MB limit is documented by Google; the structural security argument is documented; the HTTP host preservation is a direct consequence
- Native messaging manifest format: HIGH — Chrome official docs, Edge official docs
- Pitfalls: HIGH (most from official docs) / MEDIUM (Windows binary mode nuance)
- OS folder picker: MEDIUM — execFile safety is HIGH; tool availability (zenity/kdialog) is ASSUMED

**Research date:** 2026-06-05
**Valid until:** 2026-09-05 (stable APIs, 90 days; Chrome extensions APIs change slowly)
</content>
