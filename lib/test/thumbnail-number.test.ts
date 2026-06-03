/**
 * node:test unit tests for lib/thumbnail-number.ts
 *
 * Asserts offset-aware renumbering:
 *   - Free path  (baseOffset 0): kinds start at +1 — correct for free notes.
 *   - Element path (baseOffset 1): kinds start at +2 — reserves +1 for the
 *     element auto-highlight that _doElementSend injects at send time.
 * Zero chrome/DOM surface — pure transform, no mocks required.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renumberThumbnailKinds } from '../thumbnail-number.js';

// ---------------------------------------------------------------------------
// Free path (baseOffset = 0)
// ---------------------------------------------------------------------------

describe('renumberThumbnailKinds — free path (baseOffset = 0)', () => {
  test('delete middle element: [+1,+2,+3] → splice(1) → renumber → [+1,+2]', () => {
    const items = [
      { kind: '+1' },
      { kind: '+2' },
      { kind: '+3' },
    ];
    items.splice(1, 1);
    renumberThumbnailKinds(items, 0);
    assert.deepStrictEqual(
      items.map(it => it.kind),
      ['+1', '+2'],
    );
  });

  test('delete first element: [+1,+2,+3] → splice(0) → renumber → [+1,+2]', () => {
    const items = [
      { kind: '+1' },
      { kind: '+2' },
      { kind: '+3' },
    ];
    items.splice(0, 1);
    renumberThumbnailKinds(items, 0);
    assert.deepStrictEqual(
      items.map(it => it.kind),
      ['+1', '+2'],
    );
  });

  test('delete last element: [+1,+2] → splice(1) → renumber → [+1]', () => {
    const items = [
      { kind: '+1' },
      { kind: '+2' },
    ];
    items.splice(1, 1);
    renumberThumbnailKinds(items, 0);
    assert.deepStrictEqual(
      items.map(it => it.kind),
      ['+1'],
    );
  });
});

// ---------------------------------------------------------------------------
// Element path (baseOffset = 1)
// ---------------------------------------------------------------------------

describe('renumberThumbnailKinds — element path (baseOffset = 1)', () => {
  test('delete middle element: [+2,+3,+4] → splice(1) → renumber → [+2,+3], none equals +1', () => {
    const items = [
      { kind: '+2' },
      { kind: '+3' },
      { kind: '+4' },
    ];
    items.splice(1, 1);
    renumberThumbnailKinds(items, 1);
    const kinds = items.map(it => it.kind);
    assert.deepStrictEqual(kinds, ['+2', '+3']);

    // Simulate the full payload: auto-highlight +1 plus remaining thumbnails.
    // No duplicates — +1 must remain exclusively owned by the element auto-highlight.
    const allKinds = ['+1', ...kinds];
    const uniqueKinds = new Set(allKinds);
    assert.strictEqual(
      uniqueKinds.size,
      allKinds.length,
      'collision: a thumbnail kind duplicates the +1 element auto-highlight slot',
    );
  });

  test('single item element path: [+2] → renumber → [+2]', () => {
    const items = [{ kind: '+2' }];
    renumberThumbnailKinds(items, 1);
    assert.deepStrictEqual(items.map(it => it.kind), ['+2']);
  });

  test('no thumbnail collides with +1 after multiple deletes', () => {
    // Start with four region thumbnails (+2,+3,+4,+5), delete first and last.
    const items = [
      { kind: '+2' },
      { kind: '+3' },
      { kind: '+4' },
      { kind: '+5' },
    ];
    // Delete first (+2 slot)
    items.splice(0, 1);
    renumberThumbnailKinds(items, 1);
    // Delete last (was +4, renumbered to +4 → now index 2 = +4)
    items.splice(items.length - 1, 1);
    renumberThumbnailKinds(items, 1);

    const kinds = items.map(it => it.kind);
    assert.ok(!kinds.includes('+1'), `thumbnail kind +1 collides with auto-highlight: ${kinds}`);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('renumberThumbnailKinds — edge cases', () => {
  test('empty array does not throw', () => {
    assert.doesNotThrow(() => renumberThumbnailKinds([], 0));
    assert.doesNotThrow(() => renumberThumbnailKinds([], 1));
  });

  test('default baseOffset is 0 (free path)', () => {
    const items = [{ kind: '+3' }, { kind: '+1' }];
    renumberThumbnailKinds(items); // no second arg
    assert.deepStrictEqual(items.map(it => it.kind), ['+1', '+2']);
  });
});
