/**
 * Config resolution for stikfix-host.
 * D-07: token resolution order --token -> STIKFIX_TOKEN -> crypto.randomUUID()
 * D-09: ensureNotesDir creates notesDir + .gitkeep (HOST-12)
 * D-10: resolveConfig rejects notesDir outside root (HOST-09)
 * Pattern 11: VERSION read from package.json at runtime via import.meta.url
 * Windows-PowerShell compat: npm 11.x on Windows strips unknown flags and exposes
 *   them as process.env.npm_config_<key>. resolveConfig accepts all three sources
 *   with precedence: parsed flag > STIKFIX_* env > npm_config_* env.
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { resolve, join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { isInsideDir } from './security.js';
import type { Config } from './types.js';

// ---------------------------------------------------------------------------
// VERSION — read from package.json at runtime (Pattern 11)
// dist/host/src/config.js → ../../../package.json
// ---------------------------------------------------------------------------
// Build-time constant injected by the SEA build (scripts/build-sea.mjs via
// esbuild --define). Undefined in the normal tsc/node build, where the version
// is read from package.json on disk instead. Declared so both builds type-check.
declare const __STIKFIX_VERSION__: string | undefined;

function resolveVersion(): string {
  // 1. SEA exe: the bundle has no package.json at a stable relative path, so the
  //    version is inlined at build time. `typeof` guards against ReferenceError
  //    in builds where the constant was never defined.
  try {
    if (typeof __STIKFIX_VERSION__ === 'string' && __STIKFIX_VERSION__.length > 0) {
      return __STIKFIX_VERSION__;
    }
  } catch {
    // Not defined in this build — fall through to the on-disk read.
  }
  // 2. Normal tsc/node build: dist/host/src/config.js → ../../../package.json.
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(dir, '../../../package.json'), 'utf8')) as { version: string };
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

export const VERSION: string = resolveVersion();

// ---------------------------------------------------------------------------
// resolveConfigValues — three-tier env resolution (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Merge parsed CLI flags with env-variable fallbacks.
 *
 * Precedence (first defined wins) per key:
 *   1. Real parsed flag  (values.root, values.origin, …)         — git bash / macOS / Linux
 *   2. STIKFIX_* env   (STIKFIX_ROOT, STIKFIX_ORIGINS, …) — explicit env override
 *   3. npm_config_* env  (npm_config_root, npm_config_origin, …) — npm-on-Windows PowerShell
 *
 * Callers must not assume root is present — resolveConfig validates below.
 */
export function resolveConfigValues(
  values: Record<string, unknown>,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): Record<string, unknown> {
  // root
  const root =
    (values['root'] as string | undefined) ??
    env['STIKFIX_ROOT'] ??
    env['npm_config_root'];

  // origin / origins — flag: string[] (multiple:true); env: comma-separated string
  const originFlag = values['origin'] as string[] | undefined;
  let origins: string[] | undefined;
  if (originFlag !== undefined && originFlag.length > 0) {
    origins = originFlag;
  } else {
    const originsEnv =
      env['STIKFIX_ORIGINS'] ??
      env['npm_config_origin'];
    if (originsEnv !== undefined && originsEnv !== '') {
      origins = originsEnv.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }

  // name
  const name =
    (values['name'] as string | undefined) ??
    env['STIKFIX_NAME'] ??
    env['npm_config_name'];

  // notes-dir
  const notesDir =
    (values['notes-dir'] as string | undefined) ??
    env['STIKFIX_NOTES_DIR'] ??
    env['npm_config_notes_dir'];

  // port
  const port =
    (values['port'] as string | undefined) ??
    env['STIKFIX_PORT'] ??
    env['npm_config_port'];

  // token — D-07 (STIKFIX_TOKEN already documented in PRD §8.1)
  const token =
    (values['token'] as string | undefined) ??
    env['STIKFIX_TOKEN'] ??
    env['npm_config_token'];

  // git-sync — flag (boolean) > STIKFIX_GIT_SYNC > npm_config_git_sync.
  // Presence of --git-sync (boolean true), or env value '1'/'true', enables it.
  // Returned under the same 'git-sync' key so it survives the double resolution
  // (index.ts resolves once, resolveConfig resolves again).
  const gitSyncFlag = values['git-sync'];
  let gitSync: boolean | undefined;
  if (typeof gitSyncFlag === 'boolean') {
    gitSync = gitSyncFlag;
  } else {
    const gitSyncEnv = env['STIKFIX_GIT_SYNC'] ?? env['npm_config_git_sync'];
    if (gitSyncEnv !== undefined) {
      gitSync = gitSyncEnv === '1' || gitSyncEnv.toLowerCase() === 'true';
    }
  }

  return {
    root,
    origin: origins,
    name,
    'notes-dir': notesDir,
    port,
    token,
    'git-sync': gitSync,
  };
}

// ---------------------------------------------------------------------------
// resolveConfig
// ---------------------------------------------------------------------------

/**
 * Resolve CLI parseArgs values into a validated Config.
 * Applies three-tier env resolution via resolveConfigValues before validation.
 * Throws if notesDir resolves outside root (D-10).
 */
export function resolveConfig(values: Record<string, unknown>): Config {
  const v = resolveConfigValues(values);

  if (typeof v['root'] !== 'string' || !v['root']) {
    throw new Error('--root is required');
  }

  const root = resolve(v['root'] as string);
  const name = (v['name'] as string | undefined) ?? basename(root);

  // origins: resolved by resolveConfigValues, fallback to []
  const origins = (v['origin'] as string[] | undefined) ?? [];

  const notesDirRaw = v['notes-dir'] as string | undefined;
  const notesDir = resolve(notesDirRaw ?? join(root, 'notes'));

  // D-10: notesDir must be inside root
  if (!isInsideDir(root, notesDir)) {
    throw new Error(
      `--notes-dir must be inside --root.\n  root:     ${root}\n  notesDir: ${notesDir}`
    );
  }

  const portStr = v['port'] as string | undefined;
  let port: number | undefined;
  if (portStr !== undefined) {
    // WR-05: validate port — Number('abc') → NaN, Number('0x10') → 16, etc.
    port = Number(portStr);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`--port must be an integer 1-65535, got: ${portStr}`);
    }
  }

  // D-07 token resolution order (npm_config_token handled in resolveConfigValues)
  const token = (v['token'] as string | undefined) ?? randomUUID();

  // git-sync default false (opt-in). resolveConfigValues resolved the three tiers.
  const gitSync = (v['git-sync'] as boolean | undefined) ?? false;

  return { root, notesDir, name, origins, port, token, gitSync };
}

// ---------------------------------------------------------------------------
// ensureNotesDir (HOST-12)
// ---------------------------------------------------------------------------

/**
 * Create notesDir (recursively) if it does not exist.
 * Write a .gitkeep file if absent so the empty dir is tracked by git.
 */
export function ensureNotesDir(notesDir: string): void {
  mkdirSync(notesDir, { recursive: true });
  const gitkeep = join(notesDir, '.gitkeep');
  if (!existsSync(gitkeep)) {
    writeFileSync(gitkeep, '');
  }
}

// ---------------------------------------------------------------------------
// writeTokenFile (HOST-12)
// ---------------------------------------------------------------------------

/**
 * Write the resolved token to <root>/.stikfix-token for developer convenience.
 * The file is already gitignored (verified in Phase 1).
 *
 * The token is a credential, so the file is created owner-only (mode 0o600).
 * Any pre-existing file is removed first so a prior, looser-permissioned inode
 * (e.g. 0o644) is not reused. POSIX mode bits are honored on macOS/Linux; on
 * Windows they are largely ignored by the filesystem, which is acceptable.
 */
export function writeTokenFile(root: string, token: string): void {
  const tokenPath = join(root, '.stikfix-token');
  if (existsSync(tokenPath)) {
    rmSync(tokenPath, { force: true });
  }
  writeFileSync(tokenPath, token, { encoding: 'utf8', mode: 0o600 });
}
