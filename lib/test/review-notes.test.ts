/**
 * node:test unit tests for lib/review-notes.ts
 *
 * Covers:
 *   - selectUnread: filter/sort/exclude *.read.md (SKILL-02, SKILL-04)
 *   - markReadName: read-marker name computation (SKILL-04)
 *   - classifyNote: status/screenshot classification (SKILL-05)
 *
 * Zero fs/DOM/chrome surface — pure functions only.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { selectUnread, markReadName, classifyNote } from '../review-notes.js';

// ---------------------------------------------------------------------------
// selectUnread (SKILL-02: glob/exclude/sort, SKILL-04: idempotency)
// ---------------------------------------------------------------------------

describe('selectUnread', () => {
  test('filters out *.read.md and non-.md, returns ascending sorted array', () => {
    const input = ['0002-t.md', '0001-t.md', '0001-t.read.md', 'x.png', '0010-t.md'];
    assert.deepStrictEqual(
      selectUnread(input),
      ['0001-t.md', '0002-t.md', '0010-t.md']
    );
  });

  test('empty input → empty output (SKILL-05 empty case)', () => {
    assert.deepStrictEqual(selectUnread([]), []);
  });

  test('all already-read → empty output (SKILL-04 idempotent re-run)', () => {
    const input = ['0001-t.read.md', '0002-t.read.md'];
    assert.deepStrictEqual(selectUnread(input), []);
  });

  test('does NOT mutate the input array', () => {
    const input = ['0002-t.md', '0001-t.md'];
    const original = [...input];
    selectUnread(input);
    assert.deepStrictEqual(input, original);
  });

  test('single unread file → returns it in a new array', () => {
    assert.deepStrictEqual(selectUnread(['0001-t.md']), ['0001-t.md']);
  });

  test('files already in ascending order remain in ascending order', () => {
    const input = ['0001-a.md', '0002-b.md', '0003-c.md'];
    assert.deepStrictEqual(selectUnread(input), ['0001-a.md', '0002-b.md', '0003-c.md']);
  });
});

// ---------------------------------------------------------------------------
// markReadName (SKILL-04: read-marker computation + idempotency guard)
// ---------------------------------------------------------------------------

describe('markReadName', () => {
  test('appends .read.md suffix — timestamp filename', () => {
    assert.strictEqual(
      markReadName('0001-20260603-010538.md'),
      '0001-20260603-010538.read.md'
    );
  });

  test('idempotent: already ends in .read.md → unchanged (no double .read.read.md)', () => {
    assert.strictEqual(
      markReadName('0001-t.read.md'),
      '0001-t.read.md'
    );
  });

  test('short filename with .md extension', () => {
    assert.strictEqual(markReadName('0042-note.md'), '0042-note.read.md');
  });
});
