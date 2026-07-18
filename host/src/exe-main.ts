/**
 * stikfix-host.exe — single-executable dispatcher (Node SEA entry).
 *
 * One binary multiplexes every host role by subcommand, plus a native-messaging
 * auto-detect so the SAME exe can be registered directly as the Chrome/Edge
 * native-messaging host (no node + .cjs wrapper needed):
 *
 *   stikfix-host serve   [--root <dir> ...]   → HTTP host (index.ts startHttpHost)
 *   stikfix-host native                        → native-messaging stdio host
 *   stikfix-host register [flags]              → non-interactive installer wiring
 *   stikfix-host uninstall [flags]              → remove native host + launchers + config
 *   stikfix-host doctor                        → diagnostics (stub for now)
 *   stikfix-host --version|-v                  → print version
 *   stikfix-host --help|-h|(no args)           → usage
 *
 * NATIVE AUTO-DETECT: a Chromium browser launches its native host as
 *   stikfix-host.exe "chrome-extension://<id>/" --parent-window=<hwnd>
 * so if the first positional looks like a chrome-extension:// origin, or any arg
 * starts with --parent-window, we route to the native handler — never treating
 * the origin as a subcommand.
 *
 * Node builtins + bundled deps only — no WXT, no Chrome imports.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { homedir } from 'node:os';
import { parseArgs } from 'node:util';

import { VERSION } from './config.js';
import { startHttpHost } from './index.js';
import { runNativeHost } from './native-host.js';
import { runDoctor } from './doctor.js';
import { registerNativeHost, createLauncherFiles, registerStartup, unregisterStartup, teardownHost } from './bootstrap/register.js';
import { STABLE_EXTENSION_ID } from './extension-id.js';

// ---------------------------------------------------------------------------
// Argument extraction — robust across `node script.js` and a Node SEA exe
// ---------------------------------------------------------------------------

/**
 * User args, independent of how the process was started. On every path that
 * runs this dispatcher — `node …/exe-main.js`, `node …/bundle.cjs`, and the
 * Node SEA exe (which mirrors execPath into argv[1]) — user args begin at
 * argv[2]. Verified against the built stikfix-host.exe.
 */
function getUserArgs(): string[] {
  return process.argv.slice(2);
}

// ---------------------------------------------------------------------------
// register subcommand
// ---------------------------------------------------------------------------

const CONFIG_DIR = join(homedir(), '.config', 'stikfix');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

/** Default notes root for the installer when --root is omitted. */
function defaultRoot(): string {
  if (process.platform === 'win32') {
    return join(homedir(), 'Documents', 'stikfix-notes');
  }
  return join(homedir(), 'stikfix-notes');
}

async function runRegister(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      root: { type: 'string' },
      'extension-id': { type: 'string' },
      port: { type: 'string' },
      startup: { type: 'boolean' },
      'no-startup': { type: 'boolean' },
      'host-exe': { type: 'string' },
    },
    strict: false,
  });

  const hostExe = resolve(
    typeof values['host-exe'] === 'string' && values['host-exe'] ? (values['host-exe'] as string) : process.execPath,
  );
  const root = resolve(
    typeof values['root'] === 'string' && values['root'] ? (values['root'] as string) : defaultRoot(),
  );
  const extensionId =
    typeof values['extension-id'] === 'string' && values['extension-id']
      ? (values['extension-id'] as string)
      : STABLE_EXTENSION_ID;
  const port =
    typeof values['port'] === 'string' && values['port'] ? parseInt(values['port'] as string, 10) : undefined;
  const name = basename(root);
  const notesDir = join(root, 'notes');

  // Ensure the root exists so START_HOST's directory check passes later.
  mkdirSync(root, { recursive: true });

  // (a) config.json — hostExe drives START_HOST/launchers to run the exe `serve`.
  mkdirSync(CONFIG_DIR, { recursive: true });
  const config = {
    root,
    name,
    notesDir,
    hostEntry: hostExe,
    nodePath: hostExe,
    hostExe,
  };
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o600 });

  // (b) native-messaging manifest points DIRECTLY at the exe (self-detects native mode).
  registerNativeHost({ extensionId, hostBinPath: hostExe, directPath: true });

  // (c) desktop launcher runs `<exe> serve --root <root>`.
  const launcherResult = createLauncherFiles({
    hostEntryPath: hostExe,
    root,
    port,
    hostExe,
  });

  // (d) Windows login autoload per flags (Windows-only; no-op elsewhere).
  let startupRegistered = false;
  const wantStartup = values['startup'] === true && values['no-startup'] !== true;
  if (process.platform === 'win32') {
    if (wantStartup) {
      try {
        registerStartup();
        startupRegistered = true;
      } catch {
        startupRegistered = false;
      }
    } else {
      try {
        unregisterStartup();
      } catch {
        // idempotent
      }
    }
  }

  console.log(
    JSON.stringify({
      ok: true,
      action: 'register',
      hostExe,
      root,
      notesDir,
      extensionId,
      port: port ?? null,
      configPath: CONFIG_PATH,
      launchersWritten: launcherResult.written,
      launcherWarnings: launcherResult.warnings,
      startupRegistered,
    }),
  );
}

// ---------------------------------------------------------------------------
// uninstall subcommand
// ---------------------------------------------------------------------------

/**
 * Mirror bin/stikfix.ts's `uninstall` teardown exactly, via the SAME shared
 * `teardownHost` helper (host/src/bootstrap/register.ts) — so the exe's
 * uninstall route is equivalent: native-messaging manifest + HKCU registry
 * keys removed, unregisterStartup() called, launcher files/config removed.
 * Idempotent — a missing key/file is fine (teardownHost tolerates it).
 *
 * --extension-id / --root are accepted (teardown doesn't need either to
 * locate the manifest/registry keys — those are derived from home + browser)
 * and echoed back in the JSON result for operator visibility.
 */
async function runUninstall(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      'extension-id': { type: 'string' },
      root: { type: 'string' },
    },
    strict: false,
  });

  const extensionId =
    typeof values['extension-id'] === 'string' && values['extension-id']
      ? (values['extension-id'] as string)
      : null;
  const root =
    typeof values['root'] === 'string' && values['root']
      ? resolve(values['root'] as string)
      : null;

  const result = teardownHost({});

  console.log(
    JSON.stringify({
      ok: true,
      action: 'uninstall',
      extensionId,
      root,
      manifestRemoved: result.manifestRemoved,
      manifestError: result.manifestError ?? null,
      startupError: result.startupError ?? null,
      configPath: result.configPath,
      configRemoved: result.configRemoved,
    }),
  );
}

// ---------------------------------------------------------------------------
// usage
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(
    [
      'stikfix-host ' + VERSION,
      '',
      'Usage: stikfix-host <command> [options]',
      '',
      'Commands:',
      '  serve [--root <dir>] [--port <n>] [--git-sync]   Start the HTTP host',
      '  native                                           Native-messaging stdio host',
      '  register [--root <dir>] [--extension-id <id>]    Register the native host + launchers',
      '           [--port <n>] [--startup|--no-startup]',
      '           [--host-exe <path>]',
      '  uninstall [--extension-id <id>] [--root <dir>]   Remove the native host + launchers + config',
      '  doctor                                           Print environment diagnostics',
      '',
      'Options:',
      '  -v, --version                                    Print version and exit',
      '  -h, --help                                       Print this help and exit',
      '',
      'Note: when launched by a Chromium browser as a native-messaging host',
      '      (first arg chrome-extension://…, or --parent-window=…), the exe',
      '      auto-detects native mode regardless of subcommand.',
    ].join('\n'),
  );
}

// ---------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = getUserArgs();

  // NATIVE-MODE AUTO-DETECT (must be first): a Chromium browser invokes
  //   stikfix-host.exe "chrome-extension://<id>/" --parent-window=<hwnd>
  const first = args[0] ?? '';
  const looksNative =
    /^chrome-extension:\/\//i.test(first) || args.some((a) => a.startsWith('--parent-window'));
  if (looksNative) {
    await runNativeHost();
    return;
  }

  const cmd = args[0];

  switch (cmd) {
    case 'serve':
      await startHttpHost(args.slice(1));
      return;
    case 'native':
      await runNativeHost();
      return;
    case 'register':
      await runRegister(args.slice(1));
      return;
    case 'uninstall':
      await runUninstall(args.slice(1));
      return;
    case 'doctor':
      await runDoctor(args.slice(1));
      return;
    case '--version':
    case '-v':
      console.log(VERSION);
      return;
    case '--help':
    case '-h':
    case undefined:
      printUsage();
      return;
    default:
      console.error(`stikfix-host: unknown command "${cmd}"`);
      printUsage();
      process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
