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
import { nextThumbnailKind } from '../thumbnail-number.js';

// ---------------------------------------------------------------------------
// nextThumbnailKind — basic values
// ---------------------------------------------------------------------------

describe('nextThumbnailKind — basic values', () => {
  test('nextThumbnailKind(0, 0) = "+1" (first free push onto empty array)', () => {
    assert.strictEqual(nextThumbnailKind(0, 0), '+1');
  });

  test('nextThumbnailKind(2, 0) = "+3" (third free push onto 2-item array)', () => {
    assert.strictEqual(nextThumbnailKind(2, 0), '+3');
  });

  test('nextThumbnailKind(0, 1) = "+2" (first element push onto empty array — reserves +1)', () => {
    assert.strictEqual(nextThumbnailKind(0, 1), '+2');
  });

  test('nextThumbnailKind(2, 1) = "+4" (third element push onto 2-item array)', () => {
    assert.strictEqual(nextThumbnailKind(2, 1), '+4');
  });

  test('default baseOffset is 0 (free path)', () => {
    assert.strictEqual(nextThumbnailKind(0), '+1');
    assert.strictEqual(nextThumbnailKind(3), '+4');
  });
});

// ---------------------------------------------------------------------------
// nextThumbnailKind — consistency with renumberThumbnailKinds
// ---------------------------------------------------------------------------

describe('nextThumbnailKind — consistency with renumberThumbnailKinds', () => {
  test('free path: next-kind after N items == renumber would assign to index N', () => {
    // After renumbering N items with baseOffset=0, indices 0…N-1 get +1…+N.
    // A new push at index N should get +(N+1) = nextThumbnailKind(N, 0).
    for (const n of [0, 1, 2, 5]) {
      const items = Array.from({ length: n }, (_, i) => ({ kind: `+${i + 1}` }));
      renumberThumbnailKinds(items, 0);
      const expected = `+${n + 1}`;
      assert.strictEqual(
        nextThumbnailKind(n, 0),
        expected,
        `free path n=${n}: expected ${expected}`,
      );
    }
  });

  test('element path: next-kind after N items == renumber would assign to index N', () => {
    // After renumbering N items with baseOffset=1, indices 0…N-1 get +2…+(N+1).
    // A new push at index N should get +(N+2) = nextThumbnailKind(N, 1).
    for (const n of [0, 1, 2, 5]) {
      const items = Array.from({ length: n }, (_, i) => ({ kind: `+${i + 2}` }));
      renumberThumbnailKinds(items, 1);
      const expected = `+${n + 2}`;
      assert.strictEqual(
        nextThumbnailKind(n, 1),
        expected,
        `element path n=${n}: expected ${expected}`,
      );
    }
  });
});
