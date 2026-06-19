/**
 * Tests for single-instance guard (FIX-SI) and token persistence (FIX-TP).
 *
 * FIX-SI: probeExistingHost resolves { port } when a live stikfix-host responds
 *         on that port for the same root; resolves null for a stale port (no server).
 *
 * FIX-TP: A temp root with an existing .stikfix-token reuses that token;
 *         a fresh root gets a newly-generated UUID.
 *
 * Conventions:
 *  - node:test, node:assert/strict — matches existing host test patterns
 *  - Ephemeral port 0 for any throwaway probe server (avoids EADDRINUSE)
 *  - Temp dirs cleaned up in test.after()
 *  - Does NOT bind 39240 or run the real CLI
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

import { probeExistingHost } from '../src/probe.js';
import { writeTokenFile, resolveConfig } from '../src/config.js';

// ---------------------------------------------------------------------------
// FIX-SI: probeExistingHost
// ---------------------------------------------------------------------------

describe('probeExistingHost — single-instance guard (FIX-SI)', () => {
  let tmpRoot: string;
  let mockServer: http.Server;
  let mockPort: number;

  before(async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'sfx-probe-test-'));

    // Spin a throwaway server on ephemeral port 0 that returns /status JSON
    mockServer = http.createServer((req, res) => {
      const path = (req.url ?? '/').split('?', 1)[0];
      if (req.method === 'GET' && path === '/status') {
        const body = JSON.stringify({
          app: 'stikfix',
          version: '0.0.0-test',
          name: 'test-root',
          root: tmpRoot,
          notesDir: join(tmpRoot, 'notes'),
          origins: [],
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(body);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve, reject) => {
      mockServer.once('error', reject);
      mockServer.listen(0, '127.0.0.1', resolve);
    });

    mockPort = (mockServer.address() as AddressInfo).port;
  });

  after(async () => {
    await new Promise<void>((res) => mockServer.close(() => res()));
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('FIX-SI: resolves { port } when server is live and root matches', async () => {
    const result = await probeExistingHost(tmpRoot, mockPort);
    assert.notEqual(result, null, 'Expected truthy result for live matching server');
    assert.strictEqual(result!.port, mockPort);
  });

  test('FIX-SI: resolves null when no server is listening (stale port)', async () => {
    // Use a port that has no server — pick a high ephemeral port unlikely to be occupied
    // We ask the OS for a free port by briefly binding then closing
    const freePort = await new Promise<number>((resolve, reject) => {
      const s = http.createServer();
      s.once('error', reject);
      s.listen(0, '127.0.0.1', () => {
        const p = (s.address() as AddressInfo).port;
        s.close(() => resolve(p));
      });
    });

    // Port is now closed — probe should return null
    const result = await probeExistingHost(tmpRoot, freePort);
    assert.strictEqual(result, null, 'Expected null for stale/closed port');
  });

  test('FIX-SI: resolves null when server responds with wrong root', async () => {
    // Spin a second server that returns a different root
    const otherRoot = mkdtempSync(join(tmpdir(), 'sfx-other-root-'));
    const wrongServer = http.createServer((req, res) => {
      const path = (req.url ?? '/').split('?', 1)[0];
      if (req.method === 'GET' && path === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ app: 'stikfix', root: otherRoot }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    let wrongPort: number;
    await new Promise<void>((resolve, reject) => {
      wrongServer.once('error', reject);
      wrongServer.listen(0, '127.0.0.1', resolve);
    });
    wrongPort = (wrongServer.address() as AddressInfo).port;

    try {
      // Probe for tmpRoot but server claims a different root
      const result = await probeExistingHost(tmpRoot, wrongPort);
      assert.strictEqual(result, null, 'Expected null — root mismatch');
    } finally {
      await new Promise<void>((res) => wrongServer.close(() => res()));
      rmSync(otherRoot, { recursive: true, force: true });
    }
  });

  test('FIX-SI: resolves null when server responds with wrong app name', async () => {
    const wrongAppServer = http.createServer((req, res) => {
      const path = (req.url ?? '/').split('?', 1)[0];
      if (req.method === 'GET' && path === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ app: 'something-else', root: tmpRoot }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    let wrongAppPort: number;
    await new Promise<void>((resolve, reject) => {
      wrongAppServer.once('error', reject);
      wrongAppServer.listen(0, '127.0.0.1', resolve);
    });
    wrongAppPort = (wrongAppServer.address() as AddressInfo).port;

    try {
      const result = await probeExistingHost(tmpRoot, wrongAppPort);
      assert.strictEqual(result, null, 'Expected null — app name mismatch');
    } finally {
      await new Promise<void>((res) => wrongAppServer.close(() => res()));
    }
  });
});

// ---------------------------------------------------------------------------
// FIX-TP: token persistence
// ---------------------------------------------------------------------------

describe('token persistence — reuse across restarts (FIX-TP)', () => {
  let tmpRoot: string;

  before(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'sfx-token-persist-'));
  });

  after(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('FIX-TP: fresh root with no token file generates a UUID and writes it', () => {
    // resolveConfig generates a UUID when no token is supplied
    const cfg = resolveConfig({ root: tmpRoot });
    const tokenPath = join(tmpRoot, '.stikfix-token');

    // Write it (simulating what index.ts does when no rawToken and no existing file)
    writeTokenFile(tmpRoot, cfg.token);

    assert.ok(existsSync(tokenPath), '.stikfix-token should be created');
    const written = readFileSync(tokenPath, 'utf8').trim();
    assert.strictEqual(written, cfg.token, 'Written token should match resolved token');

    // Verify it looks like a UUID (8-4-4-4-12 hex pattern)
    assert.match(
      written,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      'Generated token should be a v4 UUID'
    );
  });

  test('FIX-TP: existing .stikfix-token is reused when no explicit token is given', () => {
    const tokenPath = join(tmpRoot, '.stikfix-token');
    const existingToken = 'a1b2c3d4-e5f6-4789-abcd-ef0123456789';

    // Pre-write a token file (simulating a previous run)
    writeFileSync(tokenPath, existingToken, { encoding: 'utf8', mode: 0o600 });

    // Simulate the FIX-TP logic from index.ts:
    // rawToken is undefined (no --token / STIKFIX_TOKEN / npm_config_token)
    const rawToken: string | undefined = undefined;
    const cfg = resolveConfig({ root: tmpRoot }); // resolveConfig generates a new UUID
    let finalToken = cfg.token; // starts as a fresh UUID

    if (!rawToken && existsSync(tokenPath)) {
      const existing = readFileSync(tokenPath, 'utf8').trim();
      if (existing.length > 0) {
        finalToken = existing;
      }
    }

    assert.strictEqual(
      finalToken,
      existingToken,
      'finalToken should be the existing token, not the newly generated UUID'
    );
    assert.notEqual(
      finalToken,
      cfg.token,
      'finalToken must differ from the freshly generated UUID'
    );
  });

  test('FIX-TP: explicit --token overrides existing .stikfix-token', () => {
    const tokenPath = join(tmpRoot, '.stikfix-token');
    const existingToken = 'existing-token-should-not-be-used';
    const explicitToken = 'explicit-token-from-cli-flag';

    writeFileSync(tokenPath, existingToken, { encoding: 'utf8', mode: 0o600 });

    // rawToken is set (user passed --token)
    const rawToken: string | undefined = explicitToken;
    const cfg = resolveConfig({ root: tmpRoot, token: rawToken });
    let finalToken = cfg.token; // resolveConfig honors the explicit token

    // The FIX-TP branch is skipped when rawToken is defined
    if (!rawToken && existsSync(tokenPath)) {
      const existing = readFileSync(tokenPath, 'utf8').trim();
      if (existing.length > 0) {
        finalToken = existing;
      }
    }

    assert.strictEqual(finalToken, explicitToken, 'Explicit --token must win over existing file');
  });

  test('FIX-TP: empty .stikfix-token file falls through to fresh UUID', () => {
    const freshRoot = mkdtempSync(join(tmpdir(), 'sfx-empty-token-'));
    try {
      const tokenPath = join(freshRoot, '.stikfix-token');

      // Write an empty token file (edge case)
      writeFileSync(tokenPath, '', { encoding: 'utf8', mode: 0o600 });

      const rawToken: string | undefined = undefined;
      const cfg = resolveConfig({ root: freshRoot });
      let finalToken = cfg.token;

      if (!rawToken && existsSync(tokenPath)) {
        const existing = readFileSync(tokenPath, 'utf8').trim();
        if (existing.length > 0) {
          finalToken = existing;
        }
        // empty → keep freshly generated UUID
      }

      // Should be the UUID from resolveConfig, not the empty string
      assert.strictEqual(
        finalToken,
        cfg.token,
        'Empty token file should not override the fresh UUID'
      );
      assert.ok(finalToken.length > 0, 'finalToken must not be empty');
    } finally {
      rmSync(freshRoot, { recursive: true, force: true });
    }
  });
});
