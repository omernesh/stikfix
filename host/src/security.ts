/**
 * Security helpers for stikfix-host.
 * D-04: readBody with 12 MB hard cap
 * D-06/HOST-05: checkToken with crypto.timingSafeEqual
 * D-10/HOST-09: isInsideDir path-traversal guard (Windows-correct with path.sep)
 */

import { timingSafeEqual } from 'node:crypto';
import { resolve, sep } from 'node:path';
import type { IncomingMessage } from 'node:http';

const MAX_BODY = 12 * 1024 * 1024; // 12 MB hard cap (D-04)

// ---------------------------------------------------------------------------
// Token auth (HOST-05, T-02-auth, T-02-timing)
// ---------------------------------------------------------------------------

/**
 * Validate X-Stikfix-Token header using constant-time comparison.
 * Returns false if header is missing, not a string, or wrong length/value.
 */
export function checkToken(req: Pick<IncomingMessage, 'headers'>, expectedToken: string): boolean {
  const provided = req.headers['x-stikfix-token'];
  if (typeof provided !== 'string') return false;
  // Compare UTF-8 byte lengths — timingSafeEqual requires equal-length buffers (Pattern 5)
  // Using Buffer.from(...,'utf8') avoids a RangeError when multibyte chars make
  // UTF-16 .length equal but UTF-8 byte length differ (CR-01).
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expectedToken, 'utf8');
  if (a.length !== b.length) return false; // byte-length guard
  return timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Body size cap (HOST-11, T-02-dos)
// ---------------------------------------------------------------------------

/**
 * Accumulate request body as a string with a hard 12 MB cap.
 * Calls req.destroy() + rejects with statusCode 413 if cap is exceeded (Pattern 3).
 */
export function readBody(req: Pick<IncomingMessage, 'on' | 'destroy'>): Promise<string> {
  return new Promise((resolve2, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let rejected = false;

    req.on('data', (chunk: Buffer) => {
      if (rejected) return;
      total += chunk.length;
      if (total > MAX_BODY) {
        rejected = true;
        req.destroy();
        reject(Object.assign(new Error('Payload Too Large'), { statusCode: 413 }));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (!rejected) resolve2(Buffer.concat(chunks).toString('utf8'));
    });

    req.on('error', (err: Error) => {
      if (!rejected) reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// Path-traversal guard (HOST-09, T-02-traversal)
// ---------------------------------------------------------------------------

/**
 * Return true if `target` resolves to `root` itself or a path strictly inside it.
 * Uses path.sep to prevent the /rootfoo-prefix bypass (Pitfall 4, Pattern 6).
 */
export function isInsideDir(root: string, target: string): boolean {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  return resolvedTarget === resolvedRoot ||
    resolvedTarget.startsWith(resolvedRoot + sep);
}
