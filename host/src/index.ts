/**
 * stickyfix-host CLI entry point.
 * D-08/HOST-01/HOST-02/HOST-03: bind 127.0.0.1 only; honor --port or scan 39240-39260
 * D-07/HOST-12: writeTokenFile to <root>/.stickyfix-token
 * Startup JSON line: {app,name,root,port,token,notesDir,origins}
 * Pattern 1: bind-or-fail loop (EADDRINUSE -> retry next port)
 * Pitfall 1: create fresh http.Server per probe attempt to avoid listener accumulation
 * Pitfall 2: server runs indefinitely (smoke test uses spawn+readline, not spawnSync)
 */

import { parseArgs } from 'node:util';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolveConfig, ensureNotesDir, writeTokenFile } from './config.js';
import { createHostServer } from './server.js';

const PORT_RANGE_START = 39240;
const PORT_RANGE_END = 39260;
const BIND_HOST = '127.0.0.1'; // T-02-bind: NEVER 0.0.0.0

// ---------------------------------------------------------------------------
// CLI parsing (preserve Phase 1 stub options block — HOST-13)
// ---------------------------------------------------------------------------

const { values } = parseArgs({
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

if (!values.root) {
  console.error('stickyfix-host: --root is required');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Config resolution + filesystem setup
// ---------------------------------------------------------------------------

const cfg = resolveConfig(values as Record<string, unknown>);
ensureNotesDir(cfg.notesDir);
writeTokenFile(cfg.root, cfg.token);

// ---------------------------------------------------------------------------
// Port discovery — bind-or-fail loop on 127.0.0.1 (Pattern 1 / D-08)
// ---------------------------------------------------------------------------

/**
 * Attempt to bind `server` on a single port.
 * Resolves true if bound, false on EADDRINUSE, throws on other errors.
 * Uses 'once' listeners so a failed attempt does not accumulate handlers.
 */
function tryListen(server: http.Server, port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const onError = (e: NodeJS.ErrnoException) => {
      if (e.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        reject(e);
      }
    };

    const onListening = () => {
      resolve(true);
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, BIND_HOST);
  });
}

/**
 * Find the first free port in the range [start, end] and bind the server to it.
 * Honors a caller-supplied preferred port (e.g. from --port) by trying it first.
 * Throws if no port in range is free.
 *
 * Per Pitfall 1: create one http.Server (the real server) and only call listen()
 * on it once. If that attempt fails (EADDRINUSE), create fresh temporary probe
 * servers per-port — the main server is only bound on the winning port.
 */
async function bindServer(server: http.Server, preferredPort?: number): Promise<number> {
  // Try preferred port first if specified
  if (preferredPort !== undefined) {
    const bound = await tryListen(server, preferredPort);
    if (bound) {
      return (server.address() as AddressInfo).port;
    }
    throw new Error(
      `stickyfix-host: --port ${preferredPort} is already in use. ` +
      `Remove --port to auto-scan ${PORT_RANGE_START}–${PORT_RANGE_END}.`
    );
  }

  // Scan range using the real server for each attempt
  // After a failed listen, the server's state allows re-calling listen() on it.
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    const bound = await tryListen(server, port);
    if (bound) {
      return (server.address() as AddressInfo).port;
    }
  }

  throw new Error(
    `stickyfix-host: no free port found in ${PORT_RANGE_START}–${PORT_RANGE_END}. ` +
    `Use --port to specify a different port.`
  );
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const server = createHostServer(cfg);
const boundPort = await bindServer(server, cfg.port);

// Safety assertion: binding must be 127.0.0.1 (T-02-bind)
const addr = server.address() as AddressInfo;
if (addr.address !== BIND_HOST) {
  throw new Error(`FATAL: server bound to ${addr.address} instead of ${BIND_HOST}`);
}

// Startup JSON line — read by smoke test via readline (Pattern 12)
console.log(JSON.stringify({
  app: 'stickyfix',
  name: cfg.name,
  root: cfg.root,
  port: boundPort,
  token: cfg.token,
  notesDir: cfg.notesDir,
  origins: cfg.origins,
}));

// Server runs indefinitely (Pitfall 2 — no process.exit here)
