/**
 * node:test unit tests for lib/highlight-draw.ts
 *
 * Covers ELEM-08: DPR-scaled canvas highlight box draw.
 *   - DPR=1/1.25/2 produce correct Math.round-ed fillRect+strokeRect args
 *   - fill recorded before stroke (fill-then-stroke ordering)
 *   - zero-dim rect (w<=0 or h<=0) records no fillRect or strokeRect
 *   - null ctx (getContext returning null) is a safe no-op
 *   - fillStyle rgba(255,107,0,0.15) + strokeStyle #ff6b00 + lineWidth 2*dpr
 *
 * Zero chrome/DOM surface — mock canvas ctx captures calls via Proxy.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { drawHighlightBox } from '../highlight-draw.js';

// ---------------------------------------------------------------------------
// Mock canvas / ctx helpers
// ---------------------------------------------------------------------------

type Call = { method: string; args: unknown[] };

function makeRecordingCanvas(): { calls: Call[]; canvas: HTMLCanvasElement } {
  const calls: Call[] = [];

  const mockCtx = new Proxy({} as CanvasRenderingContext2D, {
    get(_t, prop) {
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args });
      };
    },
    set(_t, prop, value) {
      calls.push({ method: `set:${String(prop)}`, args: [value] });
      return true;
    },
  });

  const canvas = {
    getContext: (type: string) => (type === '2d' ? mockCtx : null),
  } as unknown as HTMLCanvasElement;

  return { calls, canvas };
}

const BASE_RECT = { x: 10, y: 20, width: 100, height: 50 };

// ---------------------------------------------------------------------------
// Helper assertions
// ---------------------------------------------------------------------------

function getFillRectCall(calls: Call[]): Call | undefined {
  return calls.find(c => c.method === 'fillRect');
}

function getStrokeRectCall(calls: Call[]): Call | undefined {
  return calls.find(c => c.method === 'strokeRect');
}

function getSetCall(calls: Call[], prop: string): Call | undefined {
  return calls.find(c => c.method === `set:${prop}`);
}

// ---------------------------------------------------------------------------
// DPR=1
// ---------------------------------------------------------------------------

describe('drawHighlightBox DPR=1', () => {
  let calls: Call[];
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    const r = makeRecordingCanvas();
    calls = r.calls;
    canvas = r.canvas;
  });

  test('fillRect called with unscaled coords at DPR=1', () => {
    drawHighlightBox(canvas, BASE_RECT, 1);
    const fillCall = getFillRectCall(calls);
    assert.ok(fillCall, 'fillRect should be called');
    assert.deepStrictEqual(fillCall.args, [10, 20, 100, 50]);
  });

  test('strokeRect called with unscaled coords at DPR=1', () => {
    drawHighlightBox(canvas, BASE_RECT, 1);
    const strokeCall = getStrokeRectCall(calls);
    assert.ok(strokeCall, 'strokeRect should be called');
    assert.deepStrictEqual(strokeCall.args, [10, 20, 100, 50]);
  });

  test('fillStyle set to rgba(255, 107, 0, 0.15)', () => {
    drawHighlightBox(canvas, BASE_RECT, 1);
    const setFill = getSetCall(calls, 'fillStyle');
    assert.ok(setFill, 'fillStyle should be set');
    assert.strictEqual(setFill.args[0], 'rgba(255, 107, 0, 0.15)');
  });

  test('strokeStyle set to #ff6b00', () => {
    drawHighlightBox(canvas, BASE_RECT, 1);
    const setStroke = getSetCall(calls, 'strokeStyle');
    assert.ok(setStroke, 'strokeStyle should be set');
    assert.strictEqual(setStroke.args[0], '#ff6b00');
  });

  test('lineWidth set to 2*dpr = 2 at DPR=1', () => {
    drawHighlightBox(canvas, BASE_RECT, 1);
    const setLw = getSetCall(calls, 'lineWidth');
    assert.ok(setLw, 'lineWidth should be set');
    assert.strictEqual(setLw.args[0], 2);
  });

  test('fill is recorded BEFORE stroke', () => {
    drawHighlightBox(canvas, BASE_RECT, 1);
    const fillIdx = calls.findIndex(c => c.method === 'fillRect');
    const strokeIdx = calls.findIndex(c => c.method === 'strokeRect');
    assert.ok(fillIdx !== -1, 'fillRect must be called');
    assert.ok(strokeIdx !== -1, 'strokeRect must be called');
    assert.ok(fillIdx < strokeIdx, 'fillRect must come before strokeRect');
  });
});

// ---------------------------------------------------------------------------
// DPR=2
// ---------------------------------------------------------------------------

describe('drawHighlightBox DPR=2', () => {
  let calls: Call[];
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    const r = makeRecordingCanvas();
    calls = r.calls;
    canvas = r.canvas;
  });

  test('fillRect called with 2x scaled coords at DPR=2', () => {
    drawHighlightBox(canvas, BASE_RECT, 2);
    const fillCall = getFillRectCall(calls);
    assert.ok(fillCall, 'fillRect should be called');
    // x:10*2=20, y:20*2=40, w:100*2=200, h:50*2=100
    assert.deepStrictEqual(fillCall.args, [20, 40, 200, 100]);
  });

  test('strokeRect called with 2x scaled coords at DPR=2', () => {
    drawHighlightBox(canvas, BASE_RECT, 2);
    const strokeCall = getStrokeRectCall(calls);
    assert.ok(strokeCall, 'strokeRect should be called');
    assert.deepStrictEqual(strokeCall.args, [20, 40, 200, 100]);
  });

  test('lineWidth set to 2*dpr = 4 at DPR=2', () => {
    drawHighlightBox(canvas, BASE_RECT, 2);
    const setLw = getSetCall(calls, 'lineWidth');
    assert.ok(setLw, 'lineWidth should be set');
    assert.strictEqual(setLw.args[0], 4);
  });
});

// ---------------------------------------------------------------------------
// DPR=1.25 (fractional Windows DPR)
// ---------------------------------------------------------------------------

describe('drawHighlightBox DPR=1.25', () => {
  let calls: Call[];
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    const r = makeRecordingCanvas();
    calls = r.calls;
    canvas = r.canvas;
  });

  test('fillRect coords are Math.round-ed at DPR=1.25', () => {
    drawHighlightBox(canvas, BASE_RECT, 1.25);
    const fillCall = getFillRectCall(calls);
    assert.ok(fillCall, 'fillRect should be called');
    assert.deepStrictEqual(fillCall.args, [
      Math.round(10 * 1.25),   // 13 (raw 12.5)
      Math.round(20 * 1.25),   // 25
      Math.round(100 * 1.25),  // 125
      Math.round(50 * 1.25),   // 63 (raw 62.5)
    ]);
  });

  test('strokeRect coords are Math.round-ed at DPR=1.25', () => {
    drawHighlightBox(canvas, BASE_RECT, 1.25);
    const strokeCall = getStrokeRectCall(calls);
    assert.ok(strokeCall, 'strokeRect should be called');
    assert.deepStrictEqual(strokeCall.args, [
      Math.round(10 * 1.25),
      Math.round(20 * 1.25),
      Math.round(100 * 1.25),
      Math.round(50 * 1.25),
    ]);
  });
});

// ---------------------------------------------------------------------------
// Zero-dimension guard
// ---------------------------------------------------------------------------

describe('drawHighlightBox zero-dim guard', () => {
  test('no fillRect or strokeRect when width=0', () => {
    const { calls, canvas } = makeRecordingCanvas();
    drawHighlightBox(canvas, { x: 0, y: 0, width: 0, height: 50 }, 1);
    const fillCall = getFillRectCall(calls);
    const strokeCall = getStrokeRectCall(calls);
    assert.strictEqual(fillCall, undefined, 'fillRect should NOT be called on zero-width');
    assert.strictEqual(strokeCall, undefined, 'strokeRect should NOT be called on zero-width');
  });

  test('no fillRect or strokeRect when height=0', () => {
    const { calls, canvas } = makeRecordingCanvas();
    drawHighlightBox(canvas, { x: 0, y: 0, width: 100, height: 0 }, 1);
    const fillCall = getFillRectCall(calls);
    const strokeCall = getStrokeRectCall(calls);
    assert.strictEqual(fillCall, undefined, 'fillRect should NOT be called on zero-height');
    assert.strictEqual(strokeCall, undefined, 'strokeRect should NOT be called on zero-height');
  });

  test('no draw when width and height both 0', () => {
    const { calls, canvas } = makeRecordingCanvas();
    drawHighlightBox(canvas, { x: 10, y: 10, width: 0, height: 0 }, 2);
    const fillCall = getFillRectCall(calls);
    const strokeCall = getStrokeRectCall(calls);
    assert.strictEqual(fillCall, undefined);
    assert.strictEqual(strokeCall, undefined);
  });

  test('no draw when DPR makes width round to 0', () => {
    // width=0.4, dpr=1 → Math.round(0.4)=0 → should not draw
    const { calls, canvas } = makeRecordingCanvas();
    drawHighlightBox(canvas, { x: 0, y: 0, width: 0.4, height: 50 }, 1);
    const fillCall = getFillRectCall(calls);
    assert.strictEqual(fillCall, undefined, 'Should not draw when rounded width = 0');
  });
});

// ---------------------------------------------------------------------------
// Null ctx guard
// ---------------------------------------------------------------------------

describe('drawHighlightBox null ctx guard', () => {
  test('no throw when getContext returns null', () => {
    const nullCanvas = {
      getContext: () => null,
    } as unknown as HTMLCanvasElement;

    // Must not throw
    assert.doesNotThrow(() => {
      drawHighlightBox(nullCanvas, BASE_RECT, 1);
    });
  });
});
