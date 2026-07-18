/**
 * Unit tests for host/src/update-check.ts.
 *
 * Fully offline: every test injects a fake `fetch` — no real network request is
 * ever made. Covers compareSemver, fetchLatestManifest shape/error handling, and
 * runUpdateCheck state transitions (mirrors git-sync.test.ts conventions).
 *
 * Pattern 12: node:test lifecycle hooks, node:assert/strict.
 */

import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareSemver,
  fetchLatestManifest,
  runUpdateCheck,
  getUpdateState,
  __resetUpdateStateForTests,
  type LatestManifest,
} from '../src/update-check.js';

const VALID_SHA = 'a'.repeat(64);

/**
 * Build a fake `fetch` returning one response. `ok`/`status` model the HTTP
 * result; `body` is returned from `.json()`. Pass `throws` to simulate a network
 * error (fetch itself rejects). Matches what fetchLatestManifest calls: fetch(url,
 * {signal}) → resp.ok, resp.json().
 */
function makeFetch(opts: {
  ok?: boolean;
  status?: number;
  body?: unknown;
  throws?: boolean;
  jsonThrows?: boolean;
}): typeof fetch {
  const { ok = true, status = 200, body, throws = false, jsonThrows = false } = opts;
  const fn = async (): Promise<Response> => {
    if (throws) throw new Error('network down');
    return {
      ok,
      status,
      json: async () => {
        if (jsonThrows) throw new SyntaxError('bad json');
        return body;
      },
    } as unknown as Response;
  };
  return fn as unknown as typeof fetch;
}

describe('compareSemver', () => {
  test('equal versions → 0', () => {
    assert.equal(compareSemver('1.7.0', '1.7.0'), 0);
  });

  test('greater → 1', () => {
    assert.equal(compareSemver('1.7.0', '1.6.2'), 1);
    assert.equal(compareSemver('2.0.0', '1.9.9'), 1);
  });

  test('less → -1', () => {
    assert.equal(compareSemver('1.6.2', '1.7.0'), -1);
  });

  test('short vs long treats missing segments as 0', () => {
    assert.equal(compareSemver('1.7', '1.7.0'), 0);
    assert.equal(compareSemver('1.7.0', '1.7'), 0);
  });

  test('malformed / empty inputs do not throw and treat missing as 0', () => {
    assert.doesNotThrow(() => compareSemver('', ''));
    assert.equal(compareSemver('', ''), 0);
    assert.equal(compareSemver('', '0.0.0'), 0);
    assert.equal(compareSemver('1.7.0', ''), 1);
    // non-numeric suffix contributes only the leading integer
    assert.equal(compareSemver('1.7.0-rc1', '1.7.0'), 0);
    assert.equal(compareSemver('abc', 'def'), 0);
  });
});

describe('fetchLatestManifest', () => {
  test('valid manifest (2xx) → returns the object', async () => {
    const body: LatestManifest = { version: '1.8.0', url: 'https://x/y.exe', sha256: VALID_SHA };
    const result = await fetchLatestManifest(makeFetch({ body }));
    assert.deepEqual(result, body);
  });

  test('non-2xx (404) → null', async () => {
    const result = await fetchLatestManifest(makeFetch({ ok: false, status: 404, body: {} }));
    assert.equal(result, null);
  });

  test('fetch throws (network) → null', async () => {
    const result = await fetchLatestManifest(makeFetch({ throws: true }));
    assert.equal(result, null);
  });

  test('malformed JSON (json() throws) → null', async () => {
    const result = await fetchLatestManifest(makeFetch({ jsonThrows: true }));
    assert.equal(result, null);
  });

  test('missing fields → null', async () => {
    assert.equal(await fetchLatestManifest(makeFetch({ body: { version: '1.8.0' } })), null);
    assert.equal(await fetchLatestManifest(makeFetch({ body: { url: 'https://x', sha256: VALID_SHA } })), null);
    assert.equal(await fetchLatestManifest(makeFetch({ body: {} })), null);
  });

  test('bad sha256 shape → null', async () => {
    const body = { version: '1.8.0', url: 'https://x/y.exe', sha256: 'not-a-hash' };
    assert.equal(await fetchLatestManifest(makeFetch({ body })), null);
  });

  test('non-object body → null', async () => {
    assert.equal(await fetchLatestManifest(makeFetch({ body: 'a string' })), null);
    assert.equal(await fetchLatestManifest(makeFetch({ body: null })), null);
  });
});

describe('runUpdateCheck', () => {
  beforeEach(() => {
    __resetUpdateStateForTests();
  });

  test('getUpdateState returns the default shape before any check', () => {
    const s = getUpdateState();
    assert.deepEqual(s, {
      available: false,
      latestVersion: null,
      url: null,
      sha256: null,
      checkedAt: 0,
      error: null,
    });
  });

  test('newer remote version → available true, fields set, error null, checkedAt > 0', async () => {
    const body: LatestManifest = { version: '1.8.0', url: 'https://x/y.exe', sha256: VALID_SHA };
    const before = Date.now();
    const state = await runUpdateCheck('1.7.0', makeFetch({ body }));
    assert.equal(state.available, true);
    assert.equal(state.latestVersion, '1.8.0');
    assert.equal(state.url, 'https://x/y.exe');
    assert.equal(state.sha256, VALID_SHA);
    assert.equal(state.error, null);
    assert.ok(state.checkedAt >= before);
    // module singleton reflects it too
    assert.deepEqual(getUpdateState(), state);
  });

  test('equal remote → available false, url/sha256 null', async () => {
    const body: LatestManifest = { version: '1.7.0', url: 'https://x/y.exe', sha256: VALID_SHA };
    const state = await runUpdateCheck('1.7.0', makeFetch({ body }));
    assert.equal(state.available, false);
    assert.equal(state.latestVersion, '1.7.0');
    assert.equal(state.url, null);
    assert.equal(state.sha256, null);
    assert.equal(state.error, null);
  });

  test('older remote → available false, url/sha256 null', async () => {
    const body: LatestManifest = { version: '1.6.0', url: 'https://x/y.exe', sha256: VALID_SHA };
    const state = await runUpdateCheck('1.7.0', makeFetch({ body }));
    assert.equal(state.available, false);
    assert.equal(state.url, null);
    assert.equal(state.sha256, null);
  });

  test('fetch failure → available stays false, error set, does not throw', async () => {
    let state: Awaited<ReturnType<typeof runUpdateCheck>> | undefined;
    await assert.doesNotReject(async () => {
      state = await runUpdateCheck('1.7.0', makeFetch({ throws: true }));
    });
    assert.ok(state);
    assert.equal(state.available, false);
    assert.equal(state.error, 'update check failed');
    assert.equal(state.checkedAt, 0); // never bumped without a successful check
  });

  test('failure after a prior success keeps prior fields, sets error, does not bump checkedAt', async () => {
    const body: LatestManifest = { version: '1.8.0', url: 'https://x/y.exe', sha256: VALID_SHA };
    const ok = await runUpdateCheck('1.7.0', makeFetch({ body }));
    const priorCheckedAt = ok.checkedAt;
    const state = await runUpdateCheck('1.7.0', makeFetch({ throws: true }));
    assert.equal(state.available, true); // preserved from prior success
    assert.equal(state.latestVersion, '1.8.0');
    assert.equal(state.url, 'https://x/y.exe');
    assert.equal(state.sha256, VALID_SHA);
    assert.equal(state.error, 'update check failed');
    assert.equal(state.checkedAt, priorCheckedAt); // not bumped
  });
});
