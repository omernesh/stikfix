/**
 * node:test unit tests for lib/draw-model.ts
 *
 * Covers the pure shape-model / geometry surface: arrowHeadPoints,
 * shapeBounds, hitTest, moveShape. compositeAnnotations (canvas/Image) is
 * intentionally NOT covered here — its per-shape path math is exercised
 * indirectly via arrowHeadPoints, which is separately unit-tested.
 *
 * Zero chrome/DOM surface — pure math functions, no mocks required.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  arrowHeadPoints,
  shapeBounds,
  hitTest,
  moveShape,
  drawShapeToCtx,
  HIT_TOLERANCE,
  type DrawShape,
  type TwoPointShape,
  type PenShape,
} from '../draw-model.js';

// ---------------------------------------------------------------------------
// arrowHeadPoints
// ---------------------------------------------------------------------------

describe('arrowHeadPoints', () => {
  test('normal horizontal shaft produces two distinct barbs behind the tip', () => {
    const { tip, left, right } = arrowHeadPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 2);
    assert.deepStrictEqual(tip, { x: 100, y: 0 });
    // Barbs sit behind the tip (smaller x, since the shaft points +x).
    assert.ok(left.x < tip.x, 'left barb must be behind the tip');
    assert.ok(right.x < tip.x, 'right barb must be behind the tip');
    // Barbs are distinct from each other (not collapsed to one point).
    assert.notDeepStrictEqual(left, right);
    // Symmetric around the shaft (y mirrored).
    assert.ok(Math.abs(left.y + right.y) < 1e-9);
  });

  test('degenerate from===to does not produce NaN, collapses to the point', () => {
    const p = { x: 5, y: 5 };
    const { tip, left, right } = arrowHeadPoints(p, p, 3);
    assert.deepStrictEqual(tip, p);
    assert.deepStrictEqual(left, p);
    assert.deepStrictEqual(right, p);
    assert.ok(!Number.isNaN(tip.x) && !Number.isNaN(tip.y));
  });

  test('thickness scales head size (thicker shaft -> longer barbs)', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 100, y: 0 };
    const thin = arrowHeadPoints(from, to, 1); // headLen = max(12, 4) = 12
    const thick = arrowHeadPoints(from, to, 10); // headLen = max(12, 40) = 40

    const distThin = Math.hypot(thin.left.x - to.x, thin.left.y - to.y);
    const distThick = Math.hypot(thick.left.x - to.x, thick.left.y - to.y);

    assert.ok(distThick > distThin, 'thicker shaft must produce a larger arrowhead');
    assert.strictEqual(Math.round(distThin), 12);
    assert.strictEqual(Math.round(distThick), 40);
  });
});

// ---------------------------------------------------------------------------
// shapeBounds
// ---------------------------------------------------------------------------

function twoPointShape(
  type: TwoPointShape['type'],
  from: { x: number; y: number },
  to: { x: number; y: number },
  thickness = 4
): TwoPointShape {
  return { id: 't-' + type, type, from, to, color: '#000', thickness };
}

function penShape(points: { x: number; y: number }[], thickness = 4): PenShape {
  return { id: 'p-pen', type: 'pen', points, color: '#000', thickness };
}

describe('shapeBounds', () => {
  test('rect: normalized bbox padded by thickness/2', () => {
    const shape = twoPointShape('rect', { x: 10, y: 10 }, { x: 50, y: 40 }, 4);
    assert.deepStrictEqual(shapeBounds(shape), { x: 8, y: 8, width: 44, height: 34 });
  });

  test('rect: reversed from/to (to left/above from) normalizes to the same bbox', () => {
    const forward = twoPointShape('rect', { x: 10, y: 10 }, { x: 50, y: 40 }, 4);
    const reversed = twoPointShape('rect', { x: 50, y: 40 }, { x: 10, y: 10 }, 4);
    assert.deepStrictEqual(shapeBounds(reversed), shapeBounds(forward));
  });

  test('circle: bbox is the from/to bounding box, padded by thickness/2', () => {
    const shape = twoPointShape('circle', { x: 0, y: 0 }, { x: 20, y: 10 }, 2);
    assert.deepStrictEqual(shapeBounds(shape), { x: -1, y: -1, width: 22, height: 12 });
  });

  test('line: bbox is the from/to bounding box, padded by thickness/2', () => {
    const shape = twoPointShape('line', { x: 5, y: 5 }, { x: 5, y: 25 }, 6);
    assert.deepStrictEqual(shapeBounds(shape), { x: 2, y: 2, width: 6, height: 26 });
  });

  test('arrow: bbox is the from/to bounding box, padded by thickness/2', () => {
    const shape = twoPointShape('arrow', { x: 0, y: 0 }, { x: 30, y: 0 }, 4);
    assert.deepStrictEqual(shapeBounds(shape), { x: -2, y: -2, width: 34, height: 4 });
  });

  test('pen: bbox is min/max over all points, padded by thickness/2', () => {
    const shape = penShape(
      [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }],
      4
    );
    assert.deepStrictEqual(shapeBounds(shape), { x: -2, y: -2, width: 14, height: 14 });
  });

  test('pen: empty points array does not throw, returns a zero-size box', () => {
    const shape = penShape([], 4);
    assert.deepStrictEqual(shapeBounds(shape), { x: 0, y: 0, width: 0, height: 0 });
  });
});

// ---------------------------------------------------------------------------
// hitTest
// ---------------------------------------------------------------------------

describe('hitTest', () => {
  test('returns the top-most (last) shape when shapes overlap', () => {
    const bottom = twoPointShape('rect', { x: 0, y: 0 }, { x: 100, y: 100 }, 2);
    const top = twoPointShape('rect', { x: 10, y: 10 }, { x: 50, y: 50 }, 2);
    const shapes: DrawShape[] = [bottom, top];
    const hit = hitTest(shapes, { x: 30, y: 30 });
    assert.strictEqual(hit, top);
  });

  test('returns null when the point is outside all shapes', () => {
    const shapes: DrawShape[] = [
      twoPointShape('rect', { x: 0, y: 0 }, { x: 10, y: 10 }, 2),
    ];
    assert.strictEqual(hitTest(shapes, { x: 1000, y: 1000 }), null);
  });

  test('empty shape list returns null', () => {
    assert.strictEqual(hitTest([], { x: 0, y: 0 }), null);
  });

  test('respects HIT_TOLERANCE padding near edges', () => {
    // bounds for this rect (thickness 2, pad=1): x:-1..101, y:-1..101
    const shape = twoPointShape('rect', { x: 0, y: 0 }, { x: 100, y: 100 }, 2);
    const shapes: DrawShape[] = [shape];

    // Just outside the padded bbox but within HIT_TOLERANCE beyond it.
    const justInsideTolerance = { x: 100 + 1 + HIT_TOLERANCE - 1, y: 50 };
    assert.strictEqual(hitTest(shapes, justInsideTolerance), shape);

    // Beyond bbox + HIT_TOLERANCE entirely.
    const beyondTolerance = { x: 100 + 1 + HIT_TOLERANCE + 5, y: 50 };
    assert.strictEqual(hitTest(shapes, beyondTolerance), null);
  });
});

// ---------------------------------------------------------------------------
// moveShape
// ---------------------------------------------------------------------------

describe('moveShape', () => {
  test('translates a two-point shape immutably', () => {
    const original = twoPointShape('line', { x: 10, y: 10 }, { x: 20, y: 20 }, 2);
    const moved = moveShape(original, 5, -5) as TwoPointShape;

    assert.deepStrictEqual(moved.from, { x: 15, y: 5 });
    assert.deepStrictEqual(moved.to, { x: 25, y: 15 });
    // Original unchanged.
    assert.deepStrictEqual(original.from, { x: 10, y: 10 });
    assert.deepStrictEqual(original.to, { x: 20, y: 20 });
    assert.notStrictEqual(moved, original);
  });

  test('translates a pen shape immutably', () => {
    const original = penShape([{ x: 0, y: 0 }, { x: 10, y: 10 }], 2);
    const moved = moveShape(original, 3, 4) as PenShape;

    assert.deepStrictEqual(moved.points, [{ x: 3, y: 4 }, { x: 13, y: 14 }]);
    // Original unchanged.
    assert.deepStrictEqual(original.points, [{ x: 0, y: 0 }, { x: 10, y: 10 }]);
    assert.notStrictEqual(moved, original);
    assert.notStrictEqual(moved.points, original.points);
  });
});

// ---------------------------------------------------------------------------
// drawShapeToCtx — shared per-shape renderer (preview == flattened output)
// ---------------------------------------------------------------------------

/**
 * Minimal recording stand-in for CanvasRenderingContext2D. Captures method
 * calls and settable-property assignments as [name, ...args] tuples so we can
 * assert the exact scaled geometry the shared renderer emits — no real canvas
 * (node:test has no DOM). Cast at the call site via the function's own
 * parameter type so the DOM type name is never spelled out here.
 */
function makeRecorder(): { ctx: Parameters<typeof drawShapeToCtx>[0]; calls: unknown[][] } {
  const calls: unknown[][] = [];
  const rec = (name: string) => (...args: unknown[]) => { calls.push([name, ...args]); };
  const obj: Record<string, unknown> = {
    beginPath: rec('beginPath'),
    moveTo: rec('moveTo'),
    lineTo: rec('lineTo'),
    closePath: rec('closePath'),
    stroke: rec('stroke'),
    fill: rec('fill'),
    strokeRect: rec('strokeRect'),
    ellipse: rec('ellipse'),
  };
  for (const prop of ['strokeStyle', 'fillStyle', 'lineWidth', 'lineCap', 'lineJoin']) {
    let v: unknown;
    Object.defineProperty(obj, prop, {
      get: () => v,
      set: (nv: unknown) => { v = nv; calls.push(['set:' + prop, nv]); },
      enumerable: true,
      configurable: true,
    });
  }
  return { ctx: obj as unknown as Parameters<typeof drawShapeToCtx>[0], calls };
}

describe('drawShapeToCtx', () => {
  test('rect: strokeRect uses coords + thickness scaled by `scale`', () => {
    const { ctx, calls } = makeRecorder();
    drawShapeToCtx(ctx, twoPointShape('rect', { x: 10, y: 10 }, { x: 50, y: 40 }, 4), 2);
    assert.ok(calls.some(c => c[0] === 'set:lineWidth' && c[1] === 8), 'thickness 4*2 = 8');
    // from (10,10)->(20,20), to (50,40)->(100,80): x=20 y=20 w=80 h=60
    assert.deepStrictEqual(
      calls.find(c => c[0] === 'strokeRect'),
      ['strokeRect', 20, 20, 80, 60]
    );
  });

  test('line: moveTo/lineTo use scaled endpoints', () => {
    const { ctx, calls } = makeRecorder();
    drawShapeToCtx(ctx, twoPointShape('line', { x: 5, y: 5 }, { x: 5, y: 25 }, 6), 2);
    assert.deepStrictEqual(calls.find(c => c[0] === 'moveTo'), ['moveTo', 10, 10]);
    assert.deepStrictEqual(calls.find(c => c[0] === 'lineTo'), ['lineTo', 10, 50]);
    assert.ok(calls.some(c => c[0] === 'stroke'));
  });

  test('pen: replays every scaled point as a polyline', () => {
    const { ctx, calls } = makeRecorder();
    drawShapeToCtx(
      ctx,
      penShape([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }], 4),
      2
    );
    const moves = calls.filter(c => c[0] === 'moveTo' || c[0] === 'lineTo');
    assert.deepStrictEqual(moves, [
      ['moveTo', 0, 0],
      ['lineTo', 20, 0],
      ['lineTo', 10, 20],
    ]);
  });

  test('scale=1 leaves CSS-px coords unchanged (editor at DPR 1)', () => {
    const { ctx, calls } = makeRecorder();
    drawShapeToCtx(ctx, twoPointShape('rect', { x: 3, y: 4 }, { x: 7, y: 9 }, 2), 1);
    assert.deepStrictEqual(
      calls.find(c => c[0] === 'strokeRect'),
      ['strokeRect', 3, 4, 4, 5]
    );
  });
});
