/**
 * node:test unit tests for entrypoints/review.content/card-state.ts
 *
 * Covers FREE-02: single-active-card enforcement.
 * Zero DOM/chrome/window surface — runs with plain node:test.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { tryOpenCard, closeCardState, isCardActive } from '../../entrypoints/review.content/card-state.js';

describe('card-state single-active-card guard', () => {
  // Reset module state before each test
  beforeEach(() => {
    closeCardState();
  });

  test('fresh state: isCardActive() is false', () => {
    assert.strictEqual(isCardActive(), false);
  });

  test('tryOpenCard() when inactive returns "opened" and isCardActive becomes true', () => {
    const result = tryOpenCard();
    assert.strictEqual(result, 'opened');
    assert.strictEqual(isCardActive(), true);
  });

  test('tryOpenCard() when already active returns "focus-existing" (does NOT open second)', () => {
    const first = tryOpenCard();
    assert.strictEqual(first, 'opened');
    const second = tryOpenCard();
    assert.strictEqual(second, 'focus-existing');
    // State remains active
    assert.strictEqual(isCardActive(), true);
  });

  test('closeCardState() resets active flag; next tryOpenCard returns "opened"', () => {
    tryOpenCard();
    assert.strictEqual(isCardActive(), true);
    closeCardState();
    assert.strictEqual(isCardActive(), false);
    const result = tryOpenCard();
    assert.strictEqual(result, 'opened');
  });
});
