#!/usr/bin/env node
/**
 * stikfix bootstrapper CLI — npx stikfix init / uninstall
 *
 * ONB-01: One-command, cross-platform setup for the native host.
 *
 * Compiled to dist/host/bin/stikfix.js by tsconfig.host.json, then
 * bundled to dist/host/stikfix-init.cjs by esbuild (npm run build:host-bin).
 *
 * Node builtins only — no WXT, no Chrome imports.
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join, basename, dirname } from 'node:path';
import { homedir } from 'node:os';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

import { registerNativeHost, createLauncherFiles, registerStartup, unregisterStartup, teardownHost, DEFAULT_GECKO_ID } from '../host/src/bootstrap/register.js';
import type { TargetBrowser } from '../host/src/bootstrap/register.js';
import { STABLE_EXTENSION_ID, MANIFEST_PUBLIC_KEY } from '../host/src/extension-id.js';
import { installReviewNotesSkill, removeReviewNotesSkill } from './skill-install.js';
// esbuild inlines this file's text via `--loader:.md=text` (build:host-bin);
// tsc sees it as `string` through the ambient `*.md` module decl (bin/md-text.d.ts).
import SKILL_MD from '../skill/SKILL.md';

// ---------------------------------------------------------------------------
// CLI parsing — positionals for subcommand dispatch
// ---------------------------------------------------------------------------

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    root: { type: 'string' },
    'extension-id': { type: 'string' },
    port: { type: 'string' },
    browser: { type: 'string' },
    startup: { type: 'boolean' },
    'no-startup': { type: 'boolean' },
    'no-skill': { type: 'boolean' },
  },
  strict: false,
});

const [subcommand] = positionals;

// ---------------------------------------------------------------------------
// Browser resolution (shared by init + uninstall)
// ---------------------------------------------------------------------------

/**
 * Resolve the --browser flag to a TargetBrowser, exiting with an error on any
 * value other than chrome/firefox. Default (flag absent) is chrome — which
 * covers Chrome + Edge. Used by both init and uninstall so an unknown value is
 * never silently coerced to chrome.
 */
function resolveBrowser(raw: unknown): TargetBrowser {
  if (raw === undefined) return 'chrome';
  if (typeof raw !== 'string' || !['chrome', 'firefox'].includes(raw.toLowerCase())) {
    console.error(`stikfix: unknown --browser "${String(raw)}" (expected chrome or firefox)`);
    process.exit(1);
  }
  return raw.toLowerCase() === 'firefox' ? 'firefox' : 'chrome';
}

// ---------------------------------------------------------------------------
// Startup (Windows login autoload) — flag resolution + interactive prompt
// ---------------------------------------------------------------------------

/**
 * Read a single line SYNCHRONOUSLY from stdin (fd 0). Needed because the init
 * flow is top-level synchronous code compiled to a CJS bundle (esbuild
 * --format=cjs), which cannot use top-level await — so readline's async
 * `question` is unavailable here. Returns the trimmed line (without newline),
 * or '' on EOF/read error.
 */
function promptLineSync(): string {
  // Import lazily so a non-interactive path never touches fs for this.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { readSync } = require('node:fs') as typeof import('node:fs');
  const buf = Buffer.alloc(1);
  let line = '';
  for (;;) {
    let bytes = 0;
    try {
      bytes = readSync(0, buf, 0, 1, null);
    } catch {
      // EAGAIN or closed stdin — stop reading.
      break;
    }
    if (bytes === 0) break; // EOF
    const ch = buf.toString('utf8', 0, 1);
    if (ch === '\n') break;
    if (ch === '\r') continue;
    line += ch;
  }
  return line.trim();
}

/**
 * Decide whether to register Windows startup autoload, honoring flags first,
 * then an interactive prompt (DEFAULT ON), then a non-TTY skip. Only meaningful
 * on win32; callers already gate on platform for the actual registration.
 *
 * Returns true = register, false = skip.
 */
function resolveStartupChoice(
  forceOn: boolean,
  forceOff: boolean,
  isTTY: boolean,
): boolean {
  if (forceOn) return true;
  if (forceOff) return false;
  if (isTTY) {
    process.stdout.write('Start stikfix host automatically on Windows login? [Y/n] ');
    const answer = promptLineSync().toLowerCase();
    // Empty / y / yes = yes (DEFAULT ON); n / no = no.
    if (answer === 'n' || answer === 'no') return false;
    return true;
  }
  // Non-TTY, no flag: skip (can be enabled with --startup).
  return false;
}

// ---------------------------------------------------------------------------
// Config path
// ---------------------------------------------------------------------------

const CONFIG_DIR = join(homedir(), '.config', 'stikfix');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

// ---------------------------------------------------------------------------
// init subcommand
// ---------------------------------------------------------------------------

if (subcommand === 'init') {
  const rawRoot = values['root'];
  const rawExtId = values['extension-id'];
  const rawPort = values['port'];
  const rawBrowser = values['browser'];

  // --root is optional: when omitted, default to the current working directory
  // so `npx stikfix init` "just works" in the project folder you're standing in.
  const rootArg: string =
    rawRoot && typeof rawRoot === 'string' ? rawRoot : process.cwd();
  if (!rawRoot || typeof rawRoot !== 'string') {
    console.error(`stikfix init: no --root given, using current directory: ${process.cwd()}`);
  }

  // Resolve target browser (default chrome — covers Chrome + Edge).
  const browser: TargetBrowser = resolveBrowser(rawBrowser);
  const isFirefox = browser === 'firefox';

  // Resolve the extension identity.
  //  - chrome:  default to the stable derived extension ID (pinned by the
  //             manifest `key` in wxt.config.ts). Override via --extension-id
  //             after a CWS publish that uses a different key.
  //  - firefox: default to the gecko add-on id (matches
  //             browser_specific_settings.gecko.id). --extension-id may pass a
  //             custom gecko id string.
  const extensionId: string =
    rawExtId && typeof rawExtId === 'string'
      ? rawExtId
      : isFirefox
        ? DEFAULT_GECKO_ID
        : STABLE_EXTENSION_ID;

  const port: number | undefined = rawPort ? parseInt(rawPort as string, 10) : undefined;

  const root = resolve(rootArg);
  const name = basename(root);
  const notesDir = join(root, 'notes');

  // Resolve the HTTP host entry path (node dist/host/src/index.js) up front so
  // it can be persisted into config.json for the native START_HOST handler.
  // __dirname here is dist/host/ (esbuild CJS output directory).
  const hostEntryPath = resolve(join(__dirname, 'src', 'index.js'));

  // Write config file — read by native host at startup.
  // hostEntry + nodePath let the native START_HOST handler spawn a detached
  // HTTP host without re-deriving these paths (nodePath = the Node that ran init).
  mkdirSync(CONFIG_DIR, { recursive: true });
  const config = { root, name, notesDir, hostEntry: hostEntryPath, nodePath: process.execPath };
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o600 });

  // Absolute path to the native host bundle — must be absolute (Pitfall 4)
  // The native host bundle is produced by esbuild alongside this file.
  // In esbuild CJS output, __dirname is the directory of the bundle file.
  const hostBinPath = resolve(join(__dirname, 'stikfix-native.cjs'));

  try {
    registerNativeHost({ extensionId, hostBinPath, browser });
  } catch (err) {
    console.error('stikfix init: failed to register native host:', String(err));
    process.exit(1);
  }

  // Find the launcher icon — resolve relative to the dist/host dir (go up two
  // levels to the project / installed-package root). On Windows a .lnk
  // IconLocation needs a real .ico (a .png renders unreliably as a shortcut
  // icon), so prefer the multi-size stikfix.ico there; elsewhere the .desktop
  // Icon= takes the 128px PNG.
  const projectRoot = resolve(join(__dirname, '..', '..'));

  // Resolve the WXT output directory for the target browser. WXT can emit
  // firefox as MV2 or MV3 depending on config, so probe both names and fall back
  // to the first that exists (else firefox-mv3 for the load instructions).
  const firefoxOutputCandidates = [
    join(projectRoot, '.output', 'firefox-mv2'),
    join(projectRoot, '.output', 'firefox-mv3'),
  ];
  const chromeOutputDir = join(projectRoot, '.output', 'chrome-mv3');
  const browserOutputDir = isFirefox
    ? (firefoxOutputCandidates.find((d) => existsSync(d)) ?? firefoxOutputCandidates[1])
    : chromeOutputDir;

  const icoCandidates = [
    join(projectRoot, 'public', 'icon', 'stikfix.ico'),
    join(browserOutputDir, 'icon', 'stikfix.ico'),
  ];
  const pngCandidates = [
    join(browserOutputDir, 'icon', '128.png'),
    join(projectRoot, 'public', 'icon', '128.png'),
    join(projectRoot, 'assets', 'icon', '128.png'),
  ];
  const iconCandidates =
    process.platform === 'win32' ? [...icoCandidates, ...pngCandidates] : pngCandidates;
  const iconPath = iconCandidates.find((p) => existsSync(p));

  const launcherResult = createLauncherFiles({
    hostEntryPath,
    root,
    port,
    iconPath,
  });

  // Surface any non-fatal launcher warnings
  for (const warn of launcherResult.warnings) {
    console.warn('  [warn] ' + warn);
  }

  // ---------------------------------------------------------------------------
  // Windows startup autoload (default ON) — register an HKCU Run entry that
  // launches the hidden VBS launcher (just written by createLauncherFiles) on
  // login. Flags: --startup (force on) / --no-startup (force off) skip the
  // prompt. Interactive TTY prompts (default ON); non-TTY with no flag skips.
  // Windows-only for now.
  // ---------------------------------------------------------------------------

  if (process.platform === 'win32') {
    const wantStartup = resolveStartupChoice(
      values['startup'] === true,
      values['no-startup'] === true,
      Boolean(process.stdin.isTTY),
    );
    if (wantStartup) {
      try {
        registerStartup();
        console.log('  Startup:      enabled — the host will start on Windows login.');
      } catch (err) {
        console.warn(
          '  [warn] Could not register Windows startup autoload (non-fatal): ' + String(err),
        );
      }
    } else {
      // Ensure any prior autoload entry is cleared if the user opted out.
      try {
        unregisterStartup();
      } catch {
        // Idempotent — ignore.
      }
      const hint =
        values['no-startup'] !== true && !process.stdin.isTTY
          ? ' (enable later with: npx stikfix init --root <dir> --startup)'
          : '';
      console.log('  Startup:      not enabled' + hint + '.');
    }
  } else if (values['startup'] === true) {
    // Honor the explicit flag with a clear note that it is Windows-only for now.
    console.log('  Startup:      skipped — startup autoload is Windows-only for now.');
  }

  // ---------------------------------------------------------------------------
  // Success output
  // ---------------------------------------------------------------------------

  console.log('');
  console.log('stikfix: native host registered successfully.');
  console.log('');
  console.log('  Extension ID: ' + extensionId);
  console.log('  Root:         ' + root);
  console.log('  Notes dir:    ' + notesDir);
  console.log('');

  if (extensionId === STABLE_EXTENSION_ID) {
    console.log('  Using stable extension ID (derived from the committed public key).');
    console.log('  The manifest key in wxt.config.ts pins this ID across machines.');
  } else {
    console.log('  Using custom extension ID (override via --extension-id).');
  }

  console.log('');
  console.log('--- Next steps (no terminal required after these) ---');
  console.log('');
  if (isFirefox) {
    console.log('  1. Load the extension (temporary add-on):');
    console.log('       about:debugging#/runtime/this-firefox  →  Load Temporary Add-on…');
    console.log('       Pick: ' + resolve(join(browserOutputDir, 'manifest.json')));
  } else {
    console.log('  1. Load the extension (unpacked):');
    console.log('       chrome://extensions  →  Developer mode ON  →  Load unpacked');
    console.log('       Folder: ' + resolve(browserOutputDir));
  }
  console.log('');
  console.log('  2. Start the backend — double-click the desktop launcher:');

  if (process.platform === 'win32') {
    // createLauncherFiles resolves the REAL Desktop folder (OneDrive Known
    // Folder Move aware) at shortcut-creation time and reports the ACTUAL
    // .lnk path it wrote in `written` — never assume join(home, 'Desktop', ...).
    const lnkPath = launcherResult.written.find((p) => p.endsWith('.lnk')) ?? '';
    const batchPath = launcherResult.written.find((p) => p.endsWith('.bat')) ?? '';
    if (lnkPath && existsSync(lnkPath)) {
      console.log('       Desktop shortcut: "Stikfix Host" (icon on your Desktop)');
    } else if (batchPath) {
      console.log('       Batch file: ' + batchPath);
      console.log('       (Desktop shortcut creation is in progress or was skipped — use the batch file above)');
    }
  } else if (process.platform === 'darwin') {
    const commandPath = launcherResult.written[0] ?? '';
    console.log('       ' + commandPath);
    console.log('       (Double-click in Finder, or drag to the Dock for quick access)');
  } else {
    const shPath = launcherResult.written.find((p) => p.endsWith('.sh')) ?? '';
    console.log('       ' + shPath);
    console.log('       (Or use the .desktop shortcut in your Applications menu)');
  }

  console.log('');
  console.log('  3. Open the extension popup and click "Pair with host".');
  console.log('     The token is delivered automatically — no copy-paste needed.');
  console.log('');
  console.log('  Extension ID: ' + extensionId);
  console.log('');

  // Install the review-notes skill for Claude Code (user-level, all projects),
  // unless the user opted out with --no-skill. Best-effort: a failure here never
  // fails init (the native host is already registered) — just surfaces a warning.
  if (values['no-skill'] === true) {
    console.log('  Skill:        skipped — review-notes skill not installed (--no-skill).');
  } else {
    const skillResult = installReviewNotesSkill(homedir(), SKILL_MD);
    if (skillResult.ok) {
      console.log('  ✓ Installed the review-notes skill for Claude Code → ' + skillResult.path);
    } else {
      console.error('stikfix init: could not install review-notes skill: ' + skillResult.error + ' (copy skill/SKILL.md manually)');
    }
  }
  console.log('');

  console.log('To keep the host up-to-date:');
  console.log('  npx --yes stikfix@latest init --root ' + root);

// ---------------------------------------------------------------------------
// uninstall subcommand
// ---------------------------------------------------------------------------

} else if (subcommand === 'uninstall') {
  const browser: TargetBrowser = resolveBrowser(values['browser']);

  // Shared teardown (also used by the standalone exe's `uninstall` subcommand)
  // — removes the native-host manifest/registry keys/launchers, the startup
  // autoload entry, and config.json. Each step is idempotent internally.
  const teardown = teardownHost({ browser });

  if (teardown.manifestError) {
    console.error('stikfix uninstall: error removing native-host manifest:', teardown.manifestError);
    // Continue to remove config file even if manifest removal failed
  }

  if (teardown.startupError) {
    console.error('stikfix uninstall: error removing startup entry:', teardown.startupError);
    // Non-fatal — continue.
  }

  // Best-effort removal of the user-level review-notes skill (never fails uninstall).
  const skillRemoval = removeReviewNotesSkill(homedir());

  console.log('stikfix: native host unregistered.');
  console.log('  manifest removed');
  console.log('  launcher files removed');
  console.log('  startup entry removed');
  console.log('  config removed');
  console.log(
    skillRemoval.removed
      ? '  review-notes skill removed'
      : '  review-notes skill not present (nothing to remove)',
  );

// ---------------------------------------------------------------------------
// unknown subcommand
// ---------------------------------------------------------------------------

} else {
  console.error('Usage: npx stikfix <init|uninstall> [--root <dir>] [--browser <chrome|firefox>] [--extension-id <id>] [--port <port>] [--no-skill]');
  console.error('');
  console.error('  init        Register the native host, write config, and install the review-notes skill');
  console.error('  uninstall   Remove the native host manifest, launchers, config, and review-notes skill');
  console.error('');
  console.error('  --no-skill  (init) Skip installing the review-notes Claude Code skill');
  process.exit(1);
}
