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

  // CR-01 regression: same UTF-16 length but different UTF-8 byte length must
  // return false (not throw RangeError → 500). An emoji is 1 UTF-16 code unit
  // on modern engines but 4 UTF-8 bytes; a token of length 3 UTF-16 chars
  // with an emoji has a different UTF-8 byte length than a plain 3-char ASCII token.
  test('CR-01: multibyte provided token with same UTF-16 length but different byte length returns false (never throws)', () => {
    // expected: 3 ASCII chars → 3 UTF-8 bytes
    const expected = 'abc';
    // provided: 'a' + emoji (4 UTF-8 bytes) + 'b' = 3 UTF-16 code units but 6 UTF-8 bytes
    // (The emoji \u{1F600} is a supplementary char = 2 UTF-16 code units, but \u{00E9}
    //  is 1 UTF-16 code unit and 2 UTF-8 bytes — use that for a clean same-UTF16-length mismatch.)
    // 'aéb' → UTF-16 length 3, UTF-8 bytes 4 (é = 2 bytes)
    const provided = 'aéb'; // length === 3, but 4 UTF-8 bytes
    const req = makeReq(provided);
    // Must not throw; must return false
    assert.doesNotThrow(() => {
      const result = checkToken(req as any, expected);
      assert.strictEqual(result, false);
    });
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
