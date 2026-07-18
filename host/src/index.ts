/**
 * stikfix-host CLI entry point.
 * D-08/HOST-01/HOST-02/HOST-03: bind 127.0.0.1 only; honor --port or scan 39240-39260
 * D-07/HOST-12: writeTokenFile to <root>/.stikfix-token
 * Startup JSON line: {app,name,root,port,token,notesDir,origins}
 * Pattern 1: bind-or-fail loop (EADDRINUSE -> retry next port)
 * WR-06: bindServer/tryListen extracted to bind.ts; removeAllListeners between attempts
 * Pitfall 2: server runs indefinitely (smoke test uses spawn+readline, not spawnSync)
 * FIX-SI: single-instance guard — probeExistingHost (probe.ts) reads .stikfix-port + probes /status
 * FIX-TP: token persistence — reuse .stikfix-token across restarts if no explicit token
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import type { AddressInfo } from 'node:net';
import { resolveConfig, resolveConfigValues, ensureNotesDir, writeTokenFile, VERSION } from './config.js';
import { createHostServer } from './server.js';
import { bindServer, BIND_HOST } from './bind.js';
import { probeExistingHost } from './probe.js';
import { startTray } from './tray.js';
import { runUpdateCheck } from './update-check.js';

/**
 * Start the HTTP host. Extracted from the former top-level module body so the
 * single-executable dispatcher (exe-main.ts) can call it as `serve`, while
 * `node dist/host/src/index.js` keeps running it via the direct-entry guard at
 * the bottom of this file. Behavior is byte-for-byte identical to the previous
 * top-level code — the only change is that argv is passed in (defaulting to
 * process.argv.slice(2)) instead of being read from the global process.argv.
 */
export async function startHttpHost(argv: string[] = process.argv.slice(2)): Promise<void> {
  // -------------------------------------------------------------------------
  // CLI parsing (preserve Phase 1 stub options block — HOST-13)
  // -------------------------------------------------------------------------

  const { values: rawValues } = parseArgs({
    args: argv,
    options: {
      root: { type: 'string' },
      origin: { type: 'string', multiple: true },
      name: { type: 'string' },
      'notes-dir': { type: 'string' },
      port: { type: 'string' },
      token: { type: 'string' },
      'git-sync': { type: 'boolean' },
    },
    strict: false,
  });

  // Apply three-tier env resolution (flag > STIKFIX_* > npm_config_*) so that
  // `npm run host -- --root <dir>` works in Windows PowerShell, where npm 11.x
  // intercepts unknown flags and re-exposes them as npm_config_<key> env vars.
  const values = resolveConfigValues(rawValues as Record<string, unknown>);

  if (!values['root']) {
    console.error('stikfix-host: --root is required');
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // Config resolution + filesystem setup
  // -------------------------------------------------------------------------

  const cfg = resolveConfig(values as Record<string, unknown>);
  ensureNotesDir(cfg.notesDir);

  // -------------------------------------------------------------------------
  // FIX-SI: Single-instance guard — BEFORE any file mutation
  // -------------------------------------------------------------------------

  const portFilePath = join(cfg.root, '.stikfix-port');
  if (existsSync(portFilePath)) {
    const portStr = readFileSync(portFilePath, 'utf8').trim();
    const existingPort = Number(portStr);
    if (Number.isInteger(existingPort) && existingPort > 0 && existingPort <= 65535) {
      const live = await probeExistingHost(cfg.root, existingPort);
      if (live !== null) {
        console.log(
          `stikfix-host: already running for ${cfg.root} on port ${live.port} — not starting a second instance.`
        );
        process.exit(0);
      }
      // else: stale port file — continue with normal startup
    }
  }

  // -------------------------------------------------------------------------
  // FIX-TP: Token persistence — reuse existing token if no explicit token given
  // -------------------------------------------------------------------------

  // An "explicit" token is one supplied via --token / STIKFIX_TOKEN / npm_config_token.
  // resolveConfig already resolved these; if none was supplied, randomUUID() was called.
  // We detect the "no explicit token" case by checking the raw resolved values BEFORE
  // randomUUID was applied.
  const rawToken =
    (values['token'] as string | undefined) ??
    (process.env['STIKFIX_TOKEN']) ??
    (process.env['npm_config_token']);

  const tokenFilePath = join(cfg.root, '.stikfix-token');
  let finalToken = cfg.token;

  if (!rawToken) {
    // No explicit token provided — try to reuse existing token file
    if (existsSync(tokenFilePath)) {
      const existing = readFileSync(tokenFilePath, 'utf8').trim();
      if (existing.length > 0) {
        finalToken = existing;
      }
      // else: empty file — keep freshly generated UUID from resolveConfig
    }
    // else: no existing file — keep freshly generated UUID from resolveConfig
  }

  // Write the final token (idempotent — fixes perms to 0o600 via writeTokenFile)
  writeTokenFile(cfg.root, finalToken);

  // -------------------------------------------------------------------------
  // Port discovery — bind-or-fail loop on 127.0.0.1 (Pattern 1 / D-08)
  // -------------------------------------------------------------------------

  const server = createHostServer({ ...cfg, token: finalToken });
  const boundPort = await bindServer(server, cfg.port);

  // Safety assertion: binding must be 127.0.0.1 (T-02-bind)
  const addr = server.address() as AddressInfo;
  if (addr.address !== BIND_HOST) {
    throw new Error(`FATAL: server bound to ${addr.address} instead of ${BIND_HOST}`);
  }

  // Publish bound port to disk so the native host can read it without a port scan
  // (RESEARCH Open Question 2 / A5). Mode 0o600 alongside existing token file.
  writeFileSync(join(cfg.root, '.stikfix-port'), String(boundPort), { encoding: 'utf8', mode: 0o600 });

  // Startup JSON line — read by smoke test via readline (Pattern 12)
  console.log(JSON.stringify({
    app: 'stikfix',
    name: cfg.name,
    root: cfg.root,
    port: boundPort,
    token: finalToken,
    notesDir: cfg.notesDir,
    origins: cfg.origins,
  }));

  // -------------------------------------------------------------------------
  // Windows system-tray indicator (best-effort, cosmetic, win32-only)
  // -------------------------------------------------------------------------
  // Only reached on genuine startup — the single-instance guard above exits(0)
  // before here, so a second instance never spawns a duplicate tray.
  const tray = startTray({
    port: boundPort,
    root: cfg.root,
    name: cfg.name,
    notesDir: cfg.notesDir,
    hostPid: process.pid,
  });

  // Host auto-update: check GitHub for a newer release on startup and every 6h.
  // Fire-and-forget + fully swallowed — a failed check must never crash or block
  // the host. runUpdateCheck updates the module state surfaced on GET /status.
  void runUpdateCheck(VERSION).catch(() => {});
  const updateTimer = setInterval(() => {
    void runUpdateCheck(VERSION).catch(() => {});
  }, 6 * 60 * 60 * 1000);
  // .unref() so the interval never keeps the process alive on its own.
  updateTimer.unref();

  // Kill the tray child when the host shuts down so a dead host has no tray.
  // (No prior signal handling existed here; these are additive.)
  let shuttingDown = false;
  function shutdown(signal: NodeJS.Signals): void {
    if (shuttingDown) return;
    shuttingDown = true;
    try { clearInterval(updateTimer); } catch { /* best-effort */ }
    try { tray?.kill(); } catch { /* best-effort */ }
    server.close(() => process.exit(0));
    // Fallback: exit even if server.close hangs on lingering connections.
    setTimeout(() => process.exit(0), 1000).unref();
    void signal;
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  // Belt-and-suspenders: also reap the tray on plain process exit.
  process.on('exit', () => { try { tray?.kill(); } catch { /* best-effort */ } });

  // Server runs indefinitely (Pitfall 2 — no process.exit here)
}

// ---------------------------------------------------------------------------
// Direct-entry guard — run startHttpHost() only when this module IS the process
// entry point (`node dist/host/src/index.js --root X`, START_HOST spawn, the
// desktop launcher). When bundled inside the single-executable app, the SEA
// dispatcher (exe-main.ts) calls startHttpHost() explicitly, so this guard must
// stay quiet there to avoid a double / arg-less start.
// ---------------------------------------------------------------------------

// Compile-time flag set to `true` ONLY in the single-executable bundle (esbuild
// --define in scripts/build-sea.mjs). Undefined in the normal tsc/node build,
// where `typeof` on the undeclared identifier is safely 'undefined'. This is
// authoritative — runtime SEA detection proved unreliable (import.meta.url in
// the bundle can coincide with the entry path), which double-started the host.
declare const __STIKFIX_BUNDLED__: boolean | undefined;

function isBundled(): boolean {
  try {
    return typeof __STIKFIX_BUNDLED__ !== 'undefined' && __STIKFIX_BUNDLED__ === true;
  } catch {
    return false;
  }
}

function isDirectEntry(): boolean {
  // In the single-executable bundle, exe-main.ts dispatches explicitly — this
  // guard must never fire there (it would double-start the host).
  if (isBundled()) return false;
  try {
    return import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
  } catch {
    return false;
  }
}

if (isDirectEntry()) {
  startHttpHost().catch((err: unknown) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exit(1);
  });
}
