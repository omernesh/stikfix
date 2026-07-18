/**
 * `stikfix-host doctor` — environment / registration diagnostics.
 *
 * Runs a series of independent checks (config presence, HTTP host reachability,
 * token/port files, native-messaging manifest + registry wiring, force-install
 * policy, notes dir writability) and reports a checklist — human-readable by
 * default, or a single JSON object with `--json`.
 *
 * Every check is wrapped individually so one thrown check never aborts the
 * rest (a thrown check becomes a 'fail' entry with the error message).
 *
 * win32-focused: on non-win32 platforms the registry-dependent checks
 * (native-manifest, native-registry, forcelist-policy) degrade to a 'warn'
 * with a "this check is win32-only" detail instead of failing or crashing.
 *
 * Node builtins only — no WXT, no Chrome imports. Registry access is
 * READ-ONLY (`reg QUERY` via execFileSync — never `exec`, never a shell
 * string built from external data).
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import * as http from 'node:http';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';

import { nativeManifestPath } from './bootstrap/register.js';
import { STABLE_EXTENSION_ID } from './extension-id.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface DoctorCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface DoctorResult {
  ok: boolean;
  summary: { pass: number; warn: number; fail: number };
  checks: DoctorCheck[];
}

interface DoctorOptions {
  plat?: NodeJS.Platform;
  home?: string;
  rootOverride?: string;
  extensionIdOverride?: string;
}

// ---------------------------------------------------------------------------
// Constants (must match host/src/bootstrap/register.ts + extension-id.ts)
// ---------------------------------------------------------------------------

// Must match NATIVE_HOST_NAME in bootstrap/register.ts (not exported there).
const NATIVE_HOST_NAME = 'com.stikfix.host';

const NATIVE_MSG_REG_KEY: Record<'chrome' | 'edge', string> = {
  chrome: `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
  edge: `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
};

type BrowserId = 'chrome' | 'edge' | 'brave';

const BROWSER_LABEL: Record<BrowserId, string> = {
  chrome: 'Chrome',
  edge: 'Edge',
  brave: 'Brave',
};

// Relative exe paths under Program Files / Program Files (x86) / LocalAppData.
const BROWSER_EXE_REL: Record<BrowserId, string> = {
  chrome: join('Google', 'Chrome', 'Application', 'chrome.exe'),
  edge: join('Microsoft', 'Edge', 'Application', 'msedge.exe'),
  brave: join('BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
};

const FORCELIST_REG_KEY_SUFFIX: Record<BrowserId, string> = {
  chrome: 'Software\\Policies\\Google\\Chrome\\ExtensionInstallForcelist',
  edge: 'Software\\Policies\\Microsoft\\Edge\\ExtensionInstallForcelist',
  brave: 'Software\\Policies\\BraveSoftware\\Brave\\ExtensionInstallForcelist',
};

// ---------------------------------------------------------------------------
// Config + default resolution
// ---------------------------------------------------------------------------

function configPath(home: string): string {
  return join(home, '.config', 'stikfix', 'config.json');
}

/** Default notes root, mirroring exe-main.ts defaultRoot(). */
function defaultRoot(plat: NodeJS.Platform, home: string): string {
  if (plat === 'win32') {
    return join(home, 'Documents', 'stikfix-notes');
  }
  return join(home, 'stikfix-notes');
}

interface LoadedConfig {
  data: Record<string, unknown> | null;
  /** 'missing' | 'invalid' — undefined when data loaded successfully. */
  problem?: 'missing' | 'invalid';
  errorMessage?: string;
}

function loadConfig(home: string): LoadedConfig {
  const p = configPath(home);
  if (!existsSync(p)) {
    return { data: null, problem: 'missing' };
  }
  try {
    const raw = readFileSync(p, 'utf8');
    const data = JSON.parse(raw) as Record<string, unknown>;
    return { data };
  } catch (err) {
    return {
      data: null,
      problem: 'invalid',
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// reg.exe helpers — pure parsers exported for unit testing, plus the
// execFileSync wrappers that call reg QUERY (read-only, never write).
// ---------------------------------------------------------------------------

/** Parse the `(Default)` value out of `reg QUERY <key> /ve` output. */
export function parseRegDefaultOutput(output: string): string | null {
  const m = output.match(/REG_SZ\s+(.+)/);
  return m ? m[1].trim() : null;
}

/** Parse every named value out of `reg QUERY <key>` output. */
export function parseRegValues(output: string): Array<{ name: string; data: string }> {
  const lines = output.split(/\r?\n/);
  const result: Array<{ name: string; data: string }> = [];
  for (const line of lines) {
    const m = line.match(/^\s{4}(\S+)\s+REG_(?:SZ|EXPAND_SZ|MULTI_SZ)\s+(.*)$/);
    if (m) {
      result.push({ name: m[1], data: m[2].trim() });
    }
  }
  return result;
}

function queryRegDefault(key: string): string | null {
  try {
    const out = execFileSync('reg', ['QUERY', key, '/ve'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return parseRegDefaultOutput(out);
  } catch {
    return null;
  }
}

function queryRegValuesAt(key: string): Array<{ name: string; data: string }> {
  try {
    const out = execFileSync('reg', ['QUERY', key], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return parseRegValues(out);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Browser detection
// ---------------------------------------------------------------------------

function isBrowserInstalled(browser: BrowserId): boolean {
  const rel = BROWSER_EXE_REL[browser];
  const bases = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)'], process.env['LocalAppData']].filter(
    (b): b is string => typeof b === 'string' && b.length > 0,
  );
  return bases.some((base) => existsSync(join(base, rel)));
}

/**
 * Broader detection for the forcelist check: exe path OR — for Chrome/Edge,
 * the two browsers stikfix itself registers a native-messaging host for —
 * the presence of our own NativeMessagingHosts key, which is only ever
 * written if that browser was present when `register`/`init` ran. Brave has
 * no native-messaging registration in this project, so only the exe-path
 * signal applies there.
 */
function isBrowserInstalledForForcelist(browser: BrowserId): boolean {
  if (isBrowserInstalled(browser)) return true;
  if (browser === 'chrome' || browser === 'edge') {
    return queryRegDefault(NATIVE_MSG_REG_KEY[browser]) !== null;
  }
  return false;
}

// ---------------------------------------------------------------------------
// /status HTTP probe
// ---------------------------------------------------------------------------

function fetchStatus(port: number, timeoutMs: number): Promise<Record<string, unknown>> {
  return new Promise((resolvePromise, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: '/status', method: 'GET', timeout: timeoutMs },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`unexpected status code ${String(res.statusCode)}`));
            return;
          }
          try {
            resolvePromise(JSON.parse(data) as Record<string, unknown>);
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        });
      },
    );
    req.on('timeout', () => {
      req.destroy(new Error('timed out waiting for /status'));
    });
    req.on('error', (err) => reject(err));
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Individual check implementations — each returns {status, detail} and is
// invoked through runCheck() below so a thrown error never escapes.
// ---------------------------------------------------------------------------

async function checkHostRunning(root: string): Promise<{ status: CheckStatus; detail: string }> {
  const HOST_NOT_RUNNING_DETAIL =
    'host not running — start it via the desktop launcher or it will auto-start on login';

  const portPath = join(root, '.stikfix-port');
  if (!existsSync(portPath)) {
    return { status: 'warn', detail: HOST_NOT_RUNNING_DETAIL };
  }

  const portStr = readFileSync(portPath, 'utf8').trim();
  const port = Number(portStr);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return {
      status: 'warn',
      detail: `${HOST_NOT_RUNNING_DETAIL} (invalid port file content: "${portStr}")`,
    };
  }

  try {
    const body = await fetchStatus(port, 1500);
    if (body['app'] === 'stikfix') {
      return {
        status: 'pass',
        detail: `reachable on 127.0.0.1:${port} (version=${String(body['version'] ?? 'unknown')}, root=${String(body['root'] ?? 'unknown')}, notesDir=${String(body['notesDir'] ?? 'unknown')})`,
      };
    }
    return {
      status: 'warn',
      detail: `unexpected response from 127.0.0.1:${port}/status: ${JSON.stringify(body)}`,
    };
  } catch {
    return { status: 'warn', detail: HOST_NOT_RUNNING_DETAIL };
  }
}

function checkTokenPortFiles(root: string): { status: CheckStatus; detail: string } {
  const portPath = join(root, '.stikfix-port');
  const tokenPath = join(root, '.stikfix-token');
  const portExists = existsSync(portPath);
  const tokenExists = existsSync(tokenPath);
  if (portExists && tokenExists) {
    return { status: 'pass', detail: `${portPath} and ${tokenPath} both present` };
  }
  const missing: string[] = [];
  if (!portExists) missing.push(portPath);
  if (!tokenExists) missing.push(tokenPath);
  return { status: 'fail', detail: `missing: ${missing.join(', ')}` };
}

function checkNativeManifest(
  plat: NodeJS.Platform,
  home: string,
  extensionId: string,
): { status: CheckStatus; detail: string } {
  if (plat !== 'win32') {
    return { status: 'warn', detail: `native-manifest check is win32-only; skipped on platform "${plat}"` };
  }

  const manifestPath = nativeManifestPath(plat, home, 'chrome');
  if (!existsSync(manifestPath)) {
    return { status: 'fail', detail: `manifest not found at ${manifestPath}` };
  }

  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  } catch (err) {
    return {
      status: 'fail',
      detail: `manifest at ${manifestPath} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const hostPath = manifest['path'];
  if (typeof hostPath !== 'string' || !existsSync(hostPath)) {
    return {
      status: 'fail',
      detail: `manifest "path" field ("${String(hostPath)}") does not point at a file that exists on disk`,
    };
  }

  const origins = Array.isArray(manifest['allowed_origins']) ? (manifest['allowed_origins'] as unknown[]) : [];
  const expectedOrigin = `chrome-extension://${extensionId}/`;
  if (!origins.includes(expectedOrigin)) {
    return {
      status: 'fail',
      detail: `allowed_origins is missing "${expectedOrigin}" (found: ${JSON.stringify(origins)})`,
    };
  }

  return { status: 'pass', detail: `${manifestPath} -> ${hostPath} (allowed_origins OK)` };
}

function checkNativeRegistry(plat: NodeJS.Platform, manifestPath: string): { status: CheckStatus; detail: string } {
  if (plat !== 'win32') {
    return { status: 'warn', detail: `native-registry check is win32-only; skipped on platform "${plat}"` };
  }

  const lines: string[] = [];
  let anyFail = false;
  let anyWarn = false;

  for (const browser of ['chrome', 'edge'] as const) {
    const installed = isBrowserInstalled(browser);
    const key = NATIVE_MSG_REG_KEY[browser];
    const regValue = queryRegDefault(key);

    if (regValue === null) {
      if (installed) {
        anyFail = true;
        lines.push(`${BROWSER_LABEL[browser]}: MISSING (key not found: ${key})`);
      } else {
        anyWarn = true;
        lines.push(`${BROWSER_LABEL[browser]}: not installed — skipped`);
      }
      continue;
    }

    if (regValue === manifestPath) {
      lines.push(`${BROWSER_LABEL[browser]}: OK (${key} -> ${regValue})`);
    } else {
      anyFail = true;
      lines.push(`${BROWSER_LABEL[browser]}: MISMATCH (${key} -> "${regValue}", expected "${manifestPath}")`);
    }
  }

  const status: CheckStatus = anyFail ? 'fail' : anyWarn ? 'warn' : 'pass';
  return { status, detail: lines.join('\n') };
}

function checkForcelistForBrowser(
  browser: BrowserId,
  extensionId: string,
): { installed: boolean; status: CheckStatus; line: string } {
  const installed = isBrowserInstalledForForcelist(browser);
  if (!installed) {
    return { installed: false, status: 'warn', line: `${BROWSER_LABEL[browser]}: not installed — skipped` };
  }

  const suffix = FORCELIST_REG_KEY_SUFFIX[browser];
  const values = [...queryRegValuesAt(`HKLM\\${suffix}`), ...queryRegValuesAt(`HKCU\\${suffix}`)];
  const match = values.find((v) => v.data.startsWith(`${extensionId};`));

  if (match) {
    const updateUrl = match.data.slice(extensionId.length + 1);
    return { installed: true, status: 'pass', line: `${BROWSER_LABEL[browser]}: OK (update_url=${updateUrl})` };
  }

  return {
    installed: true,
    status: 'warn',
    line: `${BROWSER_LABEL[browser]}: extension not force-installed for ${BROWSER_LABEL[browser]} — run the installer or load unpacked`,
  };
}

function checkForcelistPolicy(plat: NodeJS.Platform, extensionId: string): { status: CheckStatus; detail: string } {
  if (plat !== 'win32') {
    return { status: 'warn', detail: `forcelist-policy check is win32-only; skipped on platform "${plat}"` };
  }

  const results = (['chrome', 'edge', 'brave'] as const).map((b) => checkForcelistForBrowser(b, extensionId));
  const anyInstalled = results.some((r) => r.installed);
  if (!anyInstalled) {
    return { status: 'warn', detail: 'No Chromium browsers detected (Chrome, Edge, Brave all missing)' };
  }

  // Never 'fail' — an absent forcelist entry is expected pre-installer (WARN only).
  const status: CheckStatus = results.some((r) => r.status === 'warn') ? 'warn' : 'pass';
  return { status, detail: results.map((r) => r.line).join('\n') };
}

function checkNotesDir(notesDir: string): { status: CheckStatus; detail: string } {
  if (!existsSync(notesDir)) {
    return { status: 'fail', detail: `notes directory does not exist: ${notesDir}` };
  }
  const probe = join(notesDir, `.doctor-write-test-${randomUUID()}`);
  try {
    writeFileSync(probe, 'doctor write test');
    unlinkSync(probe);
    return { status: 'pass', detail: `writable: ${notesDir}` };
  } catch (err) {
    return {
      status: 'fail',
      detail: `notes directory exists but is not writable: ${notesDir} (${err instanceof Error ? err.message : String(err)})`,
    };
  }
}

// ---------------------------------------------------------------------------
// runCheck — try/catch wrapper so one failing check never aborts doctor
// ---------------------------------------------------------------------------

async function runCheck(
  id: string,
  label: string,
  fn: () => { status: CheckStatus; detail: string } | Promise<{ status: CheckStatus; detail: string }>,
): Promise<DoctorCheck> {
  try {
    const r = await fn();
    return { id, label, status: r.status, detail: r.detail };
  } catch (err) {
    return {
      id,
      label,
      status: 'fail',
      detail: `check threw: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// collectDoctorResult — runs all checks, returns the structured result.
// Exported so tests can exercise the full pipeline without going through the
// CLI argv/print/exitCode plumbing.
// ---------------------------------------------------------------------------

export async function collectDoctorResult(opts: DoctorOptions = {}): Promise<DoctorResult> {
  const plat = opts.plat ?? process.platform;
  const home = opts.home ?? homedir();

  const loaded = loadConfig(home);
  const cfgData = loaded.data ?? {};

  const root =
    opts.rootOverride ?? (typeof cfgData['root'] === 'string' ? (cfgData['root'] as string) : defaultRoot(plat, home));
  const notesDir =
    !opts.rootOverride && typeof cfgData['notesDir'] === 'string'
      ? (cfgData['notesDir'] as string)
      : join(root, 'notes');
  const extensionId =
    opts.extensionIdOverride ??
    (typeof cfgData['extensionId'] === 'string' ? (cfgData['extensionId'] as string) : STABLE_EXTENSION_ID);

  const manifestPath = nativeManifestPath(plat, home, 'chrome');

  const checks: DoctorCheck[] = [];

  checks.push(
    await runCheck('config', 'Config file present and parseable', () => {
      if (loaded.problem === 'missing') {
        return {
          status: 'fail',
          detail: `config.json not found at ${configPath(home)} — using defaults (root=${root}, extensionId=${extensionId})`,
        };
      }
      if (loaded.problem === 'invalid') {
        return {
          status: 'fail',
          detail: `config.json at ${configPath(home)} is not valid JSON: ${loaded.errorMessage ?? 'unknown error'}`,
        };
      }
      return { status: 'pass', detail: `root=${root}, extensionId=${extensionId}` };
    }),
  );

  checks.push(await runCheck('host-running', 'HTTP host reachable', () => checkHostRunning(root)));

  checks.push(
    await runCheck('token-port-files', 'Token + port files present', () => checkTokenPortFiles(root)),
  );

  checks.push(
    await runCheck('native-manifest', 'Native-messaging manifest valid', () =>
      checkNativeManifest(plat, home, extensionId),
    ),
  );

  checks.push(
    await runCheck('native-registry', 'Native-messaging registry keys', () =>
      checkNativeRegistry(plat, manifestPath),
    ),
  );

  checks.push(
    await runCheck('forcelist-policy', 'Extension force-install policy', () =>
      checkForcelistPolicy(plat, extensionId),
    ),
  );

  checks.push(await runCheck('notes-dir', 'Notes directory exists + writable', () => checkNotesDir(notesDir)));

  const summary = { pass: 0, warn: 0, fail: 0 };
  for (const c of checks) {
    summary[c.status] += 1;
  }

  return { ok: summary.fail === 0, summary, checks };
}

// ---------------------------------------------------------------------------
// Human-readable printer — plain ASCII only (Windows console codepage safe).
// ---------------------------------------------------------------------------

function printHuman(result: DoctorResult): void {
  console.log('Stikfix Doctor');
  console.log('==============');
  console.log('');

  for (const c of result.checks) {
    const tag = c.status === 'pass' ? '[OK]' : c.status === 'warn' ? '[WARN]' : '[FAIL]';
    console.log(`${tag} ${c.label}`);
    for (const line of c.detail.split('\n')) {
      console.log(`    ${line}`);
    }
  }

  console.log('');
  const { pass, warn, fail } = result.summary;
  console.log(`${pass} passed, ${warn} warnings, ${fail} failed`);
}

// ---------------------------------------------------------------------------
// runDoctor — CLI entry point (exe-main.ts: `stikfix-host doctor`)
// ---------------------------------------------------------------------------

/**
 * Run the doctor diagnostics. `argv` is the args AFTER the `doctor` subcommand.
 *
 * Flags:
 *   --json               print a single JSON object instead of the checklist
 *   --root <path>        override the detected/default root
 *   --extension-id <id>  override the detected/default extension id
 *
 * Sets process.exitCode (not process.exit — this must stay safe to call from
 * a test process) to 1 if any check failed, 0 otherwise.
 */
export async function runDoctor(argv: string[] = []): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      json: { type: 'boolean' },
      root: { type: 'string' },
      'extension-id': { type: 'string' },
    },
    strict: false,
  });

  const rootOverride = typeof values['root'] === 'string' ? (values['root'] as string) : undefined;
  const extensionIdOverride =
    typeof values['extension-id'] === 'string' ? (values['extension-id'] as string) : undefined;

  const result = await collectDoctorResult({ rootOverride, extensionIdOverride });

  if (values['json'] === true) {
    console.log(JSON.stringify(result));
  } else {
    printHuman(result);
  }

  process.exitCode = result.summary.fail > 0 ? 1 : 0;
}
