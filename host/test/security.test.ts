import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, PassThrough } from 'node:stream';
import { join } from 'node:path';
import { checkToken, readBody, isInsideDir } from '../src/security.js';

// ---------------------------------------------------------------------------
// checkToken
// ---------------------------------------------------------------------------

describe('checkToken', () => {
  function makeReq(token?: string): { headers: Record<string, string | undefined> } {
    return { headers: token !== undefined ? { 'x-stickyfix-token': token } : {} };
  }

  test('missing header returns false', () => {
    const req = makeReq();
    assert.strictEqual(checkToken(req as any, 'secret-token'), false);
  });

  test('wrong token returns false', () => {
    const req = makeReq('wrong-token');
    assert.strictEqual(checkToken(req as any, 'secret-token'), false);
  });

  test('exact match returns true', () => {
    const req = makeReq('correct-token');
    assert.strictEqual(checkToken(req as any, 'correct-token'), true);
  });

  test('different-length token returns false without timing comparison', () => {
    const req = makeReq('short');
    assert.strictEqual(checkToken(req as any, 'much-longer-token-value'), false);
  });
});

// ---------------------------------------------------------------------------
// isInsideDir
// ---------------------------------------------------------------------------

describe('isInsideDir', () => {
  const root = join('C:', 'data', 'root');

  test('root itself is inside', () => {
    assert.strictEqual(isInsideDir(root, root), true);
  });

  test('child path is inside', () => {
    assert.strictEqual(isInsideDir(root, join(root, 'child.md')), true);
  });

  test('parent traversal is rejected', () => {
    assert.strictEqual(isInsideDir(root, join(root, '..', 'sibling', 'x.md')), false);
  });

  test('sibling-prefix path is rejected (sep guard)', () => {
    // e.g., C:\data\rootfoo\x.md must NOT match root C:\data\root
    const sibling = join('C:', 'data', 'rootfoo', 'x.md');
    assert.strictEqual(isInsideDir(root, sibling), false);
  });
});

// ---------------------------------------------------------------------------
// readBody
// ---------------------------------------------------------------------------

describe('readBody', () => {
  test('resolves utf8 string for body under 12 MB', async () => {
    const pt = new PassThrough();
    const bodyPromise = readBody(pt as any);
    pt.write(Buffer.from('{"ok":true}'));
    pt.end();
    const result = await bodyPromise;
    assert.strictEqual(result, '{"ok":true}');
  });

  test('rejects with statusCode 413 for body over 12 MB', async () => {
    const pt = new PassThrough();
    const bodyPromise = readBody(pt as any);

    // Push just over 12 MB in small chunks to avoid large single allocation
    const chunkSize = 64 * 1024; // 64 KB
    const totalTarget = 12 * 1024 * 1024 + 1; // 12 MB + 1 byte
    let sent = 0;
    const chunk = Buffer.alloc(chunkSize, 0x41); // fill with 'A'
    while (sent < totalTarget) {
      const toSend = Math.min(chunkSize, totalTarget - sent);
      pt.write(chunk.subarray(0, toSend));
      sent += toSend;
    }
    pt.end();

    await assert.rejects(bodyPromise, (err: any) => {
      assert.strictEqual(err.statusCode, 413);
      return true;
    });
  });
});
