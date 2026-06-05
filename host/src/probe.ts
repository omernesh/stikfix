/**
 * Single-instance guard probe helper (FIX-SI).
 *
 * Extracted into its own module so tests can import probeExistingHost
 * without triggering the top-level CLI code in index.ts.
 *
 * Builtins only: node:http, node:path. No new dependencies.
 */

import * as http from 'node:http';
import { resolve as resolvePath } from 'node:path';
import { BIND_HOST } from './bind.js';

/**
 * Probe an existing host instance on the given port.
 *
 * Returns { port } if a live stickyfix-host is running for the same root,
 * or null if the port is stale / belongs to something else / unreachable.
 *
 * Bounded by a 700 ms timeout. Uses node:http only (builtins, no new deps).
 */
export function probeExistingHost(root: string, port: number): Promise<{ port: number } | null> {
  return new Promise((resolve) => {
    const options: http.RequestOptions = {
      hostname: BIND_HOST,
      port,
      path: '/status',
      method: 'GET',
    };

    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
          if (
            body['app'] === 'stickyfix' &&
            typeof body['root'] === 'string' &&
            resolvePath(body['root'] as string) === resolvePath(root)
          ) {
            resolve({ port });
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
    });

    // Bounded timeout: destroy socket and resolve null
    req.setTimeout(700, () => {
      req.destroy();
      resolve(null);
    });

    req.on('error', () => {
      resolve(null);
    });

    req.end();
  });
}
