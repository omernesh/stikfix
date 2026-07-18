/**
 * stikfix native-messaging host entry point.
 *
 * Chrome spawns this process via the registered native-messaging manifest
 * (com.stikfix.host). It responds to GET_TOKEN with { type:'TOKEN', ... }
 * from disk-backed files, then exits (sendNativeMessage one-shot — Pitfall 3).
 *
 * ONB-02: Reads the token from <root>/.stikfix-token and delivers it to the SW.
 * ONB-04: Chrome spawns this on demand; no persistent process or HTTP server.
 *
 * Security:
 *  T-09-07: MUST NOT call createHostServer, bindServer, or listen on any port.
 *  T-09-09: Token read from disk file (mode 0o600), sent only over native messaging.
 *
 * Node builtins only — no WXT, no Chrome imports.
 */

import { readFileSync, statSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { sendNativeMessage, readNativeMessages } from './native-msg.js';
import { pickFolder } from './folder-picker.js';
import { validateChosenFolder } from './validate-folder.js';

// Re-export so existing importers (native-host.test.ts) keep working unchanged
// after the validation logic moved to validate-folder.ts (single source of truth).
export { validateChosenFolder };

// ---------------------------------------------------------------------------
// Config + token/port resolution
// ---------------------------------------------------------------------------

const CONFIG_PATH = join(homedir(), '.config', 'stikfix', 'config.json');

interface StikFixConfig {
  root: string;
  name: string;
  notesDir: string;
  /**
   * Absolute path to the runnable HTTP host bundle (dist/host/src/index.js),
   * written by `npx stikfix init`. Read by START_HOST to spawn the detached
   * host. Optional for backward compatibility with older configs (fallback
   * resolves it relative to this native host's own location).
   */
  hostEntry?: string;
  /**
   * Absolute path to the Node executable used to run the HTTP host
   * (process.execPath captured at init time). Optional — START_HOST falls back
   * to this process's own process.execPath.
   */
  nodePath?: string;
  /**
   * Absolute path to the standalone single-executable host (stikfix-host.exe),
   * written by `stikfix-host register`. When present, START_HOST spawns
   * `<hostExe> serve --root <root>` instead of `node <hostEntry> --root <root>`
   * — the exe self-detects its subcommand, so no node/.cjs wrapper is involved.
   * Absent (the npx/node install path) → exact prior `node hostEntry` behavior.
   */
  hostExe?: string;
}

/**
 * Resolve the absolute path to the HTTP host entry bundle. Prefers the
 * `hostEntry` field written into config.json by `npx stikfix init`. If absent
 * (older config), falls back to resolving `src/index.js` relative to THIS
 * native host bundle's own directory — the shipped layout is
 * dist/host/stikfix-native.cjs alongside dist/host/src/index.js, so __dirname/src/index.js
 * is the co-located HTTP host entry.
 */
function resolveHostEntry(cfg: StikFixConfig): string {
  if (typeof cfg.hostEntry === 'string' && cfg.hostEntry.length > 0) {
    return cfg.hostEntry;
  }
  // Fallback: dist/host/stikfix-native.cjs → dist/host/src/index.js
  // In the esbuild CJS bundle, __dirname is the bundle's directory.
  return join(__dirname, 'src', 'index.js');
}

/**
 * Handle a START_HOST native message: validate `root` is an existing directory,
 * then SPAWN the HTTP host as a DETACHED process (never bind/listen here —
 * invariant T-09-07) so it outlives this one-shot native process. Replies
 * HOST_STARTING on success, ERROR on invalid input. `out` is injectable for tests.
 *
 * Returns true if the host was spawned (caller should exit 0), false on a
 * validation error (caller should exit 1). The actual process.exit is left to
 * the caller so this helper stays unit-testable without side effects.
 */
export function handleStartHost(
  cfg: StikFixConfig,
  root: unknown,
  spawnFn: typeof spawn = spawn,
  out?: { write(b: Buffer): boolean },
): boolean {
  const emit = (msg: object) => (out ? sendNativeMessage(msg, out) : sendNativeMessage(msg));

  if (typeof root !== 'string' || root.length === 0) {
    emit({ type: 'ERROR', error: 'START_HOST requires a non-empty "root" string.' });
    return false;
  }

  // Normalize the incoming root (collapse `..`, consistent separators) before
  // using it for the directory check and the spawned host's --root arg. No
  // confinement check — cross-project roots over the extension-exclusive native
  // channel are intentional; normalization is the correct hardening.
  const resolvedRoot = resolve(root);

  // Validate root is an existing directory (no silent failure).
  try {
    if (!statSync(resolvedRoot).isDirectory()) {
      emit({ type: 'ERROR', error: `START_HOST root is not a directory: ${resolvedRoot}` });
      return false;
    }
  } catch {
    emit({ type: 'ERROR', error: `START_HOST root does not exist: ${resolvedRoot}` });
    return false;
  }

  const nodePath =
    typeof cfg.nodePath === 'string' && cfg.nodePath.length > 0 ? cfg.nodePath : process.execPath;
  const hostEntry = resolveHostEntry(cfg);

  // Standalone-exe install path: when config points at a single-executable host,
  // spawn `<exe> serve --root <root>` (the exe self-detects the subcommand).
  // Otherwise keep the exact prior behavior: `node <hostEntry> --root <root>`.
  const hostExe = typeof cfg.hostExe === 'string' && cfg.hostExe.length > 0 ? cfg.hostExe : undefined;
  const spawnCmd = hostExe ?? nodePath;
  const spawnArgs = hostExe
    ? ['serve', '--root', resolvedRoot]
    : [hostEntry, '--root', resolvedRoot];

  // CRITICAL (T-09-07): the native host MUST NOT bind/listen itself. It only
  // spawns a SEPARATE, detached process that is the HTTP host. Detached +
  // stdio:'ignore' + unref() so the child outlives this one-shot native process.
  try {
    const child = spawnFn(spawnCmd, spawnArgs, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
  } catch (err) {
    emit({ type: 'ERROR', error: `Failed to start host: ${String((err as Error).message)}` });
    return false;
  }

  emit({ type: 'HOST_STARTING', root: resolvedRoot });
  return true;
}

// ---------------------------------------------------------------------------
// PICK_FOLDER handler — open the OS dialog, validate, respond, exit (Pitfall 8)
// Folder validation lives in validate-folder.ts (shared with the HTTP server).
// ---------------------------------------------------------------------------

/**
 * Handle a PICK_FOLDER native message: open the OS folder dialog, validate the
 * chosen path, send a FOLDER_PICKED frame echoing the origin, then exit(0).
 *
 * Pitfall 8: Chrome spawns a FRESH process per sendNativeMessage, so PICK_FOLDER
 * is handled per-spawn entirely separately from GET_TOKEN — the blocking folder
 * dialog can never delay a token fetch (which is a different spawn).
 *
 * `pickFn` is injectable so tests can stub the OS dialog.
 */
export async function handlePickFolder(
  origin: string | undefined,
  pickFn: (title: string) => Promise<string | null> = pickFolder,
  plat: NodeJS.Platform = process.platform,
  out?: { write(b: Buffer): boolean },
): Promise<void> {
  let chosen: string | null;
  try {
    chosen = await pickFn('Choose a folder for ' + (origin ?? 'this site'));
  } catch {
    // Dialog spawn error — never crash; respond with null (no silent drop).
    chosen = null;
  }
  const folder = validateChosenFolder(chosen, plat);
  if (out) {
    sendNativeMessage({ type: 'FOLDER_PICKED', origin, folder }, out);
  } else {
    sendNativeMessage({ type: 'FOLDER_PICKED', origin, folder });
  }
}

// ---------------------------------------------------------------------------
// Message dispatch — handle one message and exit (Pitfall 3)
// ---------------------------------------------------------------------------

/**
 * Native-host entry point. Reads config from disk (required), then dispatches
 * the single inbound native message and exits. The token/port are read LAZILY
 * inside the GET_TOKEN branch only — PICK_FOLDER does not need them.
 *
 * Kept as a function (not top-level side effects) so the pure helpers above
 * (validateChosenFolder / handlePickFolder) can be imported by unit tests
 * WITHOUT triggering a config read + process.exit on import.
 */
export function main(): void {
  let cfg: StikFixConfig;
  try {
    cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as StikFixConfig;
  } catch {
    // Config missing — respond with a structured error so the SW gets {ok:false}
    // rather than Chrome reporting "native host exited unexpectedly"
    sendNativeMessage({ type: 'ERROR', error: 'Config not found. Run: npx stikfix init' });
    process.exit(1);
  }

  // NOTE: the token (and optional port) are read LAZILY inside the GET_TOKEN
  // branch below — NOT upfront. PICK_FOLDER does not need the token, so reading
  // it here would wrongly fail the folder dialog whenever .stikfix-token is
  // absent (e.g. host never started). Config is the only upfront requirement.
  readNativeMessages((msg) => {
    const m = msg as { type?: string; origin?: string; root?: string };

    if (m.type === 'GET_TOKEN') {
      // Optional `root`: if the inbound message carries a valid existing
      // directory, read the token/port/identity from THAT root instead of
      // cfg.root. Absent/invalid → exact current behavior (backward compatible).
      let tokenRoot = cfg.root;
      let name = cfg.name;
      let notesDir = cfg.notesDir;
      if (typeof m.root === 'string' && m.root.length > 0) {
        // Caller explicitly asked for a specific root. Normalize it (collapse
        // `..`, consistent separators), then require it to be an existing
        // directory. NEVER silently fall back to cfg.root — that would return a
        // DIFFERENT project's token mislabeled as the requested one.
        const resolvedRoot = resolve(m.root);
        let isDir = false;
        try {
          isDir = statSync(resolvedRoot).isDirectory();
        } catch {
          isDir = false;
        }
        if (!isDir) {
          sendNativeMessage({
            type: 'ERROR',
            error: 'GET_TOKEN root not accessible: ' + resolvedRoot,
          });
          process.exit(1);
        }
        tokenRoot = resolvedRoot;
        name = basename(resolvedRoot);
        notesDir = join(resolvedRoot, 'notes');
      }

      // Token is required ONLY for GET_TOKEN — read it lazily here.
      let token: string;
      try {
        token = readFileSync(join(tokenRoot, '.stikfix-token'), 'utf8').trim();
      } catch {
        sendNativeMessage({
          type: 'ERROR',
          error: 'No .stikfix-token in ' + tokenRoot + '. Start the host first.',
        });
        process.exit(1);
      }

      // Port is optional — read if present; SW falls back to port scan (A5 fallback)
      let port: number | undefined;
      try {
        const raw = readFileSync(join(tokenRoot, '.stikfix-port'), 'utf8').trim();
        const parsed = parseInt(raw, 10);
        if (!isNaN(parsed)) {
          port = parsed;
        }
      } catch {
        // .stikfix-port absent is OK — SW re-probes (A5)
      }

      // Send token + port (if known) + host identity, then exit (one-shot)
      sendNativeMessage({
        type: 'TOKEN',
        token,
        port,
        name,
        notesDir,
      });
      process.exit(0);
    }

    if (m.type === 'START_HOST') {
      // Spawn a DETACHED HTTP host for the requested root, then exit (one-shot).
      // The native host itself NEVER binds/listens (T-09-07) — it only spawns.
      const ok = handleStartHost(cfg, m.root);
      process.exit(ok ? 0 : 1);
    }

    if (m.type === 'PICK_FOLDER') {
      // PICK_FOLDER is a SEPARATE spawn from GET_TOKEN (Pitfall 8) — the dialog
      // never blocks a token fetch. It does NOT require the token (read lazily
      // for GET_TOKEN only), so it works even before the host has ever started.
      // Open the dialog, validate, respond, exit.
      handlePickFolder(m.origin).then(
        () => process.exit(0),
        () => process.exit(0),
      );
      return;
    }

    // Unknown message type — exit cleanly (Chrome expects process to exit)
    process.exit(0);
  });
}

/**
 * Async-friendly entry alias for the SEA dispatcher (exe-main.ts). The native
 * message loop is event-driven, so this resolves immediately after wiring up the
 * stdin listener; the process stays alive until stdin closes (Chrome closes the
 * pipe) or a handler calls process.exit. Delegates to main() so the direct
 * require.main path below is unchanged.
 */
export async function runNativeHost(): Promise<void> {
  main();
}

// Compile-time flag: `true` ONLY inside the single-executable bundle (esbuild
// --define in scripts/build-sea.mjs), where exe-main.ts dispatches native mode
// explicitly. Undefined in the standalone stikfix-native.cjs and the node:test
// build, so `typeof` is safely 'undefined' there and the require.main guard runs
// as before. This is REQUIRED: in the SEA bundle esbuild shares the entry's
// `module`/`require` across bundled CJS modules, so `require.main === module`
// wrongly evaluates true here and would attach a stdin listener at import time —
// whose immediate 'end' (a serve process has no native stdin) calls exit(0) and
// tears the HTTP host down right after startup.
declare const __STIKFIX_BUNDLED__: boolean | undefined;
function bundledInExe(): boolean {
  try {
    return typeof __STIKFIX_BUNDLED__ !== 'undefined' && __STIKFIX_BUNDLED__ === true;
  } catch {
    return false;
  }
}

// Run only when invoked as the entry point (standalone stikfix-native.cjs),
// never on import. In that esbuild CJS bundle `require`/`module` are CJS scope
// locals and `require.main === module` is true when run directly. The node:test
// compile path emits ESM where these are undefined at runtime — the `typeof`
// guards keep main() from running on import there.
if (
  !bundledInExe() &&
  typeof require !== 'undefined' &&
  typeof module !== 'undefined' &&
  require.main === module
) {
  main();
}
