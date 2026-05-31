/**
 * node:test unit tests for lib/capture.ts
 *
 * Covers DPR=1/1.25/2 math for computeCropCoords (Success Criterion 4).
 * Zero chrome API surface — runs with plain node:test.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeCropCoords } from '../capture.js';   // .js extension — ESM node resolution

const rect = { x: 10, y: 20, width: 100, height: 50 };

describe('computeCropCoords', () => {
  test('DPR=1 identity — no rounding needed', () => {
    const c = computeCropCoords(rect, 1);
    assert.deepStrictEqual(c, { sx: 10, sy: 20, sw: 100, sh: 50 });
  });

  test('DPR=1.25 (Windows 125% fractional DPR) — Math.round required', () => {
    const c = computeCropCoords(rect, 1.25);
    assert.deepStrictEqual(c, {
      sx: Math.round(10 * 1.25),   // 13 (raw: 12.5)
      sy: Math.round(20 * 1.25),   // 25
      sw: Math.round(100 * 1.25),  // 125
      sh: Math.round(50 * 1.25),   // 63 (raw: 62.5)
    });
  });

  test('DPR=2 (HiDPI) — exact doubles', () => {
    const c = computeCropCoords(rect, 2);
    assert.deepStrictEqual(c, { sx: 20, sy: 40, sw: 200, sh: 100 });
  });
});
