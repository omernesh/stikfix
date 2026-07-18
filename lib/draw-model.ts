/**
 * Annotation-drawing shape model + flatten-to-PNG compositor for stikfix.
 *
 * Section 1 (types), Section 2 (geometry helpers), and makeId — pure,
 * node:test-safe (no DOM/chrome at module level, no canvas dependency).
 * Section 3 (compositeAnnotations) — browser canvas, not node:test-safe.
 * drawShapeToCtx is exported and shared with the live draw editor; it takes a
 * ctx by argument and touches no top-level browser API, so it stays importable
 * (and mock-ctx unit-testable) under node:test.
 *
 * INVARIANT: No top-level browser API access — all canvas/Image/crypto use
 * is inside function bodies so the pure exports (arrowHeadPoints, shapeBounds,
 * hitTest, moveShape, makeId) import cleanly under node:test. Mirrors the
 * capture.ts / highlight-draw.ts split: DPR scaling always uses Math.round
 * after multiply (Windows 125%-DPR fractional-pixel bug — RESEARCH.md
 * Pitfall 4).
 */

// ---------------------------------------------------------------------------
// 1. Shape data model
// ---------------------------------------------------------------------------

export type DrawTool = 'arrow' | 'line' | 'rect' | 'circle' | 'pen';

export interface Point {
  x: number;
  y: number;
}

export interface BaseShape {
  id: string;
  color: string;
  thickness: number;
}

export interface TwoPointShape extends BaseShape {
  type: 'arrow' | 'line' | 'rect' | 'circle';
  from: Point;
  to: Point;
}

export interface PenShape extends BaseShape {
  type: 'pen';
  points: Point[];
}

/** Coordinates are CSS px relative to the frozen background image's displayed
 *  size; compositeAnnotations scales to native px via dpr (mirrors cropToRect). */
export type DrawShape = TwoPointShape | PenShape;

// ---------------------------------------------------------------------------
// 2. Pure geometry helpers — no canvas needed
// ---------------------------------------------------------------------------

/** Bounding-box hit-test tolerance (CSS px) — forgiving click target near edges. */
export const HIT_TOLERANCE = 8;

/**
 * Compute the two barb points of an arrowhead pointing at `to`.
 * Head length scales with thickness (min 12px, else thickness*4); barbs are
 * at 30° from the shaft. Degenerate from===to (zero-length shaft) returns
 * tip=left=right=to without producing NaN.
 */
export function arrowHeadPoints(
  from: Point,
  to: Point,
  thickness: number
): { tip: Point; left: Point; right: Point } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);

  if (dist === 0) {
    return { tip: { ...to }, left: { ...to }, right: { ...to } };
  }

  const headLen = Math.max(12, thickness * 4);
  const angle = Math.atan2(dy, dx);
  const barbAngle = Math.PI / 6; // 30 degrees

  const left: Point = {
    x: to.x - headLen * Math.cos(angle - barbAngle),
    y: to.y - headLen * Math.sin(angle - barbAngle),
  };
  const right: Point = {
    x: to.x - headLen * Math.cos(angle + barbAngle),
    y: to.y - headLen * Math.sin(angle + barbAngle),
  };

  return { tip: { ...to }, left, right };
}

/**
 * Axis-aligned bounding box for a shape, padded by thickness/2 in every
 * direction. For pen shapes, the box is the min/max over all points. For
 * two-point shapes, from/to are normalized (handles reversed drags).
 */
export function shapeBounds(shape: DrawShape): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const pad = shape.thickness / 2;

  if (shape.type === 'pen') {
    if (shape.points.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    let minX = shape.points[0].x;
    let maxX = shape.points[0].x;
    let minY = shape.points[0].y;
    let maxY = shape.points[0].y;
    for (const p of shape.points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return {
      x: minX - pad,
      y: minY - pad,
      width: maxX - minX + pad * 2,
      height: maxY - minY + pad * 2,
    };
  }

  const minX = Math.min(shape.from.x, shape.to.x);
  const maxX = Math.max(shape.from.x, shape.to.x);
  const minY = Math.min(shape.from.y, shape.to.y);
  const maxY = Math.max(shape.from.y, shape.to.y);

  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}

/**
 * Return the top-most shape (highest z — last in the array, drawn last)
 * whose padded bounds (shapeBounds + HIT_TOLERANCE) contain `p`. Returns
 * null when no shape is hit. Bounding-box hit test only — no per-pixel
 * geometry.
 */
export function hitTest(shapes: DrawShape[], p: Point): DrawShape | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const b = shapeBounds(shapes[i]);
    const x0 = b.x - HIT_TOLERANCE;
    const y0 = b.y - HIT_TOLERANCE;
    const x1 = b.x + b.width + HIT_TOLERANCE;
    const y1 = b.y + b.height + HIT_TOLERANCE;
    if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) {
      return shapes[i];
    }
  }
  return null;
}

/** Return a new shape translated by (dx, dy). Immutable — does not mutate `shape`. */
export function moveShape(shape: DrawShape, dx: number, dy: number): DrawShape {
  if (shape.type === 'pen') {
    return {
      ...shape,
      points: shape.points.map(p => ({ x: p.x + dx, y: p.y + dy })),
    };
  }
  return {
    ...shape,
    from: { x: shape.from.x + dx, y: shape.from.y + dy },
    to: { x: shape.to.x + dx, y: shape.to.y + dy },
  };
}

/** New shape id. crypto.randomUUID() is available in the extension content-script context. */
export function makeId(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// 3. Compositor — browser canvas, not node:test-safe
// ---------------------------------------------------------------------------

/** DPR-scale a point, Math.round-ed (MANDATORY — see module header). */
function scalePoint(p: Point, scale: number): Point {
  return { x: Math.round(p.x * scale), y: Math.round(p.y * scale) };
}

/**
 * Draw one shape onto `ctx`, scaling every coordinate + thickness by `scale`
 * (Math.round-ed — mirrors cropToRect's DPR handling; see module header).
 *
 * SHARED renderer: `compositeAnnotations` calls this with scale=dpr to flatten
 * to native px, and the live draw editor (entrypoints/review.content/draw.ts)
 * calls it with the SAME scale so the on-screen preview matches the flattened
 * output pixel-for-pixel. Keep this the single source of per-shape draw math.
 *
 * Only geometry — never sets globalAlpha / dash / selection chrome (the editor
 * layers its selection highlight separately so it never leaks into the PNG).
 */
export function drawShapeToCtx(
  ctx: CanvasRenderingContext2D,
  shape: DrawShape,
  scale: number
): void {
  const thickness = Math.max(1, Math.round(shape.thickness * scale));
  ctx.strokeStyle = shape.color;
  ctx.fillStyle = shape.color;
  ctx.lineWidth = thickness;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (shape.type) {
    case 'rect': {
      const from = scalePoint(shape.from, scale);
      const to = scalePoint(shape.to, scale);
      const x = Math.min(from.x, to.x);
      const y = Math.min(from.y, to.y);
      ctx.strokeRect(x, y, Math.abs(to.x - from.x), Math.abs(to.y - from.y));
      break;
    }
    case 'circle': {
      const from = scalePoint(shape.from, scale);
      const to = scalePoint(shape.to, scale);
      const cx = (from.x + to.x) / 2;
      const cy = (from.y + to.y) / 2;
      const rx = Math.abs(to.x - from.x) / 2;
      const ry = Math.abs(to.y - from.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'line': {
      const from = scalePoint(shape.from, scale);
      const to = scalePoint(shape.to, scale);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      break;
    }
    case 'arrow': {
      const from = scalePoint(shape.from, scale);
      const to = scalePoint(shape.to, scale);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();

      const head = arrowHeadPoints(from, to, thickness);
      ctx.beginPath();
      ctx.moveTo(head.tip.x, head.tip.y);
      ctx.lineTo(head.left.x, head.left.y);
      ctx.lineTo(head.right.x, head.right.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'pen': {
      if (shape.points.length === 0) break;
      const pts = shape.points.map(p => scalePoint(p, scale));
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      break;
    }
  }
}

/**
 * Flatten a background screenshot data URL + shape list into a single
 * annotated PNG data URL, at native pixel size (img.naturalWidth/Height).
 * Every shape coordinate + thickness is scaled by `dpr` (Math.round-ed —
 * mirrors cropToRect's DPR handling) before being drawn.
 */
export function compositeAnnotations(
  bgDataUrl: string,
  shapes: DrawShape[],
  dpr: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('No 2D context')); return; }
      ctx.drawImage(img, 0, 0);
      for (const shape of shapes) {
        drawShapeToCtx(ctx, shape, dpr);
      }
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = bgDataUrl;
  });
}
