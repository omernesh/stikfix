/**
 * Host discovery — parallel port scan for stickyfix hosts.
 *
 * Uses fetch only (no chrome/wxt API) so these functions are mockable in
 * node:test and callable from the SW without any extra permissions beyond
 * host_permissions: [http://127.0.0.1/*].
 */

import type { HostEntry } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** All ports in the stickyfix discovery range (39240–39260 inclusive) */
export const PROBE_PORTS: readonly number[] = Array.from(
  { length: 21 },
  (_, i) => 39240 + i
);

/** Per-probe timeout in ms. Loopback RTT is < 1ms; fail fast on closed ports. */
export const PROBE_TIMEOUT_MS = 800;

// ---------------------------------------------------------------------------
// probePort — exported for testing
// ---------------------------------------------------------------------------

/**
 * Attempt to contact a single port's /status endpoint.
 * Rejects if: timeout, connection refused, non-200, or app !== 'stickyfix'.
 *
 * @throws If the port does not respond with a valid stickyfix /status payload.
 */
export async function probePort(port: number): Promise<HostEntry> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);

  try {
    const resp = await fetch(`http://127.0.0.1:${port}/status`, {
      signal: ctrl.signal,
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const data = (await resp.json()) as {
      app: string;
      name: string;
      notesDir: string;
      origins?: string[];
    };

    if (data.app !== 'stickyfix') {
      throw new Error('not stickyfix');
    }

    return {
      name: data.name,
      port,
      origins: data.origins ?? [],
      notesDir: data.notesDir,
      token: null, // null until the user enters a token in the popup
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// discoverHosts — EXT-04
// ---------------------------------------------------------------------------

/**
 * Probe all PROBE_PORTS in parallel and collect every stickyfix host found.
 * Non-responders and non-stickyfix ports are silently dropped.
 *
 * @returns Array of HostEntry (may be empty if no hosts are running).
 */
export async function discoverHosts(): Promise<HostEntry[]> {
  const results = await Promise.allSettled(
    PROBE_PORTS.map((port) => probePort(port))
  );

  return results
    .filter(
      (r): r is PromiseFulfilledResult<HostEntry> => r.status === 'fulfilled'
    )
    .map((r) => r.value);
}
