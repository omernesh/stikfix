/**
 * node:test unit tests for lib/discovery.ts
 *
 * Covers EXT-04: only app==='stickyfix' /status responders become HostEntry;
 * non-responders (rejected) and non-stickyfix ports are dropped.
 *
 * Uses globalThis.fetch stub (assign + restore pattern) — no chrome API needed.
 */

import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { discoverHosts, probePort, PROBE_PORTS, PROBE_TIMEOUT_MS } from '../discovery.js';

// ---------------------------------------------------------------------------
// Fetch stub helpers
// ---------------------------------------------------------------------------

type FetchStub = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** Build a Response-like object for a stickyfix /status JSON payload */
function makeSfxResponse(port: number, name = `proj-${port}`): Response {
  const body = JSON.stringify({
    app: 'stickyfix',
    version: '0.1.0',
    name,
    notesDir: `/home/user/notes/${name}`,
    origins: [`https://${name}.example.com`],
  });
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Build a Response for a non-stickyfix service */
function makeOtherResponse(): Response {
  const body = JSON.stringify({ app: 'something-else', name: 'alien' });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('PROBE_PORTS constant', () => {
  test('has exactly 21 ports starting at 39240', () => {
    assert.strictEqual(PROBE_PORTS.length, 21);
    assert.strictEqual(PROBE_PORTS[0], 39240);
    assert.strictEqual(PROBE_PORTS[20], 39260);
  });
});

// ---------------------------------------------------------------------------
// probePort
// ---------------------------------------------------------------------------

describe('probePort', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('resolves to HostEntry for a valid stickyfix /status response', async () => {
    globalThis.fetch = (async (_input: string | URL | Request, _init?: RequestInit) => {
      return makeSfxResponse(39240, 'my-project');
    }) as FetchStub;

    const entry = await probePort(39240);
    assert.strictEqual(entry.name, 'my-project');
    assert.strictEqual(entry.port, 39240);
    assert.strictEqual(entry.token, null);
    assert.ok(Array.isArray(entry.origins));
  });

  test('rejects when response app is not stickyfix', async () => {
    globalThis.fetch = (async (_input: string | URL | Request, _init?: RequestInit) => {
      return makeOtherResponse();
    }) as FetchStub;

    await assert.rejects(
      () => probePort(39240),
      (err: Error) => {
        assert.ok(err.message.includes('not stickyfix'));
        return true;
      }
    );
  });

  test('rejects when fetch throws (connection refused / timeout)', async () => {
    globalThis.fetch = (async () => {
      throw new Error('connection refused');
    }) as FetchStub;

    await assert.rejects(() => probePort(39240));
  });

  test('rejects when response status is not 2xx', async () => {
    globalThis.fetch = (async () => {
      return new Response('not found', { status: 404 });
    }) as FetchStub;

    await assert.rejects(() => probePort(39240));
  });
});

// ---------------------------------------------------------------------------
// discoverHosts — EXT-04
// ---------------------------------------------------------------------------

describe('discoverHosts', () => {
  let originalFetch: typeof globalThis.fetch;

  before(() => {
    originalFetch = globalThis.fetch;
  });

  after(() => {
    globalThis.fetch = originalFetch;
  });

  test('only app==="stickyfix" responders make it into the result (EXT-04)', async () => {
    // Simulate: port 39240 = stickyfix, port 39241 = other service,
    // all other ports = rejected (connection refused)
    globalThis.fetch = (async (input: string | URL | Request, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes(':39240/')) return makeSfxResponse(39240, 'project-alpha');
      if (url.includes(':39241/')) return makeOtherResponse();
      throw new Error('connection refused');
    }) as FetchStub;

    const hosts = await discoverHosts();

    assert.strictEqual(hosts.length, 1, 'only one stickyfix host should survive');
    assert.strictEqual(hosts[0].name, 'project-alpha');
    assert.strictEqual(hosts[0].port, 39240);
  });

  test('returns empty array when no hosts respond (EXT-04)', async () => {
    globalThis.fetch = (async () => {
      throw new Error('connection refused');
    }) as FetchStub;

    const hosts = await discoverHosts();
    assert.strictEqual(hosts.length, 0);
  });

  test('collects multiple stickyfix hosts from different ports', async () => {
    globalThis.fetch = (async (input: string | URL | Request, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes(':39240/')) return makeSfxResponse(39240, 'proj-a');
      if (url.includes(':39255/')) return makeSfxResponse(39255, 'proj-b');
      throw new Error('connection refused');
    }) as FetchStub;

    const hosts = await discoverHosts();
    const names = hosts.map((h) => h.name).sort();
    assert.deepStrictEqual(names, ['proj-a', 'proj-b']);
  });

  test('all returned entries have token:null (user enters token in popup)', async () => {
    globalThis.fetch = (async (input: string | URL | Request, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes(':39242/')) return makeSfxResponse(39242, 'tok-test');
      throw new Error('connection refused');
    }) as FetchStub;

    const hosts = await discoverHosts();
    assert.strictEqual(hosts.length, 1);
    assert.strictEqual(hosts[0].token, null, 'token must be null from discovery');
  });
});
