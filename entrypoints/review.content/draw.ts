/**
 * stikfix annotation-drawing mode — frozen-background canvas editor + toolbar.
 *
 * Wave 2 module. Self-contained: NOT wired into card.ts / index.ts yet (Wave 3).
 *
 * ===========================================================================
 * INTEGRATION CONTRACT for Wave 3 (how card.ts must call enterDrawMode)
 * ===========================================================================
 * enterDrawMode consumes an ALREADY-CAPTURED, full-viewport background image.
 * It does NOT capture the screen itself. Before calling, the caller MUST:
 *
 *   1. Hide stikfix's own UI (chip / FAB / card / pins / toasts) so none of it
 *      bleeds into the frozen background — mirror the marquee.ts T-06-07
 *      ordering (remove/hide own UI → waitTwoRafs → capture).
 *   2. captureVisibleTab (via lib/capture.ts captureTab(tabId)) to get a PNG
 *      data URL of the clean visible viewport, at NATIVE pixels
 *      (naturalWidth === innerWidth * dpr, naturalHeight === innerHeight * dpr).
 *   3. Pass that data URL AND the dpr used to capture it:
 *        const out = await enterDrawMode({
 *          background: { dataUrl, dpr: window.devicePixelRatio },
 *          mountRoot: container,   // the same shadow-root container from index.ts onMount
 *        });
 *   4. Re-show stikfix's own UI after the promise settles.
 *
 * RESOLUTION:
 *   - Resolves to a flattened annotated PNG data URL (bg + shapes) on Save.
 *   - Resolves to `null` on Cancel / Esc (user abandoned — treat as no-op).
 *   - REJECTS only if the final composite step fails (canvas/Image error) —
 *     Wave 3 MUST surface that via a toast (no silent failure, REL-01). A
 *     rejection is NOT a cancel.
 *
 * The returned dataUrl is intended to become a screenshot entry on the note
 * payload (§9.1 screenshots[]), exactly like a marquee capture.
 *
 * Coordinate model: shape coords are CSS px relative to the viewport (== the
 * displayed background). compositeAnnotations scales them by `dpr` to native
 * px. The live canvas uses the SAME `dpr` scale via the shared drawShapeToCtx
 * renderer, so the on-screen preview matches the saved PNG pixel-for-pixel.
 *
 * Security invariants (match chip.ts / marquee.ts):
 *  - DOM via createElement / textContent / createElementNS only — no innerHTML
 *  - sfx-* namespace (.sfx-draw-*)
 *  - No page-derived strings injected into DOM
 * ===========================================================================
 */

import {
  compositeAnnotations,
  drawShapeToCtx,
  hitTest,
  moveShape,
  makeId,
  shapeBounds,
  type DrawShape,
  type DrawTool,
  type Point,
} from '../../lib/draw-model.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DrawBackground {
  /** Full-viewport PNG data URL, captured at native px by the caller (Wave 3). */
  dataUrl: string;
  /** Device pixel ratio the background was captured at. */
  dpr: number;
}

export interface EnterDrawModeOptions {
  background: DrawBackground;
  /** The shadow-root mounting container from index.ts onMount (createShadowRootUi). */
  mountRoot: HTMLElement;
}

/** Editor tool set = draw-model tools + the editor-only 'select' cursor. */
type EditorTool = DrawTool | 'select';

/** Ignore drags shorter than this (CSS px) — no zero-size / accidental shapes. */
const MIN_DRAG_PX = 3;

/** Colour swatches — red/orange lead (high contrast on screenshots). */
const SWATCHES = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#111827', '#ffffff'];

/** Thickness presets (S / M / L). */
const THICKNESS_PRESETS: { label: string; value: number }[] = [
  { label: 'S', value: 2 },
  { label: 'M', value: 4 },
  { label: 'L', value: 8 },
];

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Enter annotation-drawing mode. See the file-header contract for the exact
 * Wave 3 call requirements. Returns a promise (Save → PNG, Cancel/Esc → null,
 * composite failure → reject).
 */
export function enterDrawMode(opts: EnterDrawModeOptions): Promise<string | null> {
  return new Promise<string | null>((resolve, reject) => {
    const { mountRoot } = opts;
    const bgDataUrl = opts.background.dataUrl;
    // dpr drives BOTH the canvas backing store and the final composite so the
    // live preview and the saved PNG are pixel-identical. Guard against a bad
    // value (0 / NaN) collapsing the canvas.
    const dpr = opts.background.dpr > 0 ? opts.background.dpr : (window.devicePixelRatio || 1);

    // ---- editor state -----------------------------------------------------
    const shapes: DrawShape[] = [];
    let tool: EditorTool = 'arrow';
    let color = SWATCHES[0];
    let thickness = THICKNESS_PRESETS[1].value; // M
    let selectedId: string | null = null;

    // in-progress drawing / dragging
    let drawing = false;
    let start: Point = { x: 0, y: 0 };
    let previewShape: DrawShape | null = null;
    let penPoints: Point[] = [];
    let movingId: string | null = null;
    let moveLast: Point = { x: 0, y: 0 };

    let settled = false;
    let cleaned = false;
    let rafPending = false;

    // ---- overlay + frozen background + canvas -----------------------------
    const overlay = document.createElement('div');
    overlay.className = 'sfx-draw-overlay';

    const bgImg = document.createElement('img');
    bgImg.className = 'sfx-draw-bg';
    bgImg.alt = '';
    bgImg.src = bgDataUrl;
    overlay.appendChild(bgImg);

    const canvas = document.createElement('canvas');
    canvas.className = 'sfx-draw-canvas';
    overlay.appendChild(canvas);

    mountRoot.appendChild(overlay);

    const ctx = canvas.getContext('2d');

    /** Size the canvas backing store to viewport*dpr; CSS size stays viewport px. */
    function sizeCanvas(): void {
      canvas.width = Math.max(1, Math.round(window.innerWidth * dpr));
      canvas.height = Math.max(1, Math.round(window.innerHeight * dpr));
    }
    sizeCanvas();

    // ---- render pipeline --------------------------------------------------
    function redrawNow(): void {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const s of shapes) drawShapeToCtx(ctx, s, dpr);
      if (previewShape) drawShapeToCtx(ctx, previewShape, dpr);
      if (selectedId) {
        const sel = shapes.find(s => s.id === selectedId);
        if (sel) drawSelectionHighlight(ctx, sel, dpr);
      }
    }

    /** rAF-throttled redraw — coalesces rapid pointermove redraws to one/frame. */
    function scheduleRedraw(): void {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        redrawNow();
      });
    }

    /** Editor-only dashed selection outline + corner handles (never composited). */
    function drawSelectionHighlight(c: CanvasRenderingContext2D, shape: DrawShape, scale: number): void {
      const b = shapeBounds(shape);
      const pad = 4;
      const x = Math.round((b.x - pad) * scale);
      const y = Math.round((b.y - pad) * scale);
      const w = Math.round((b.width + pad * 2) * scale);
      const h = Math.round((b.height + pad * 2) * scale);
      c.save();
      c.strokeStyle = '#3b82f6';
      c.lineWidth = Math.max(1, Math.round(1.5 * scale));
      c.setLineDash([Math.round(6 * scale), Math.round(4 * scale)]);
      c.strokeRect(x, y, w, h);
      c.setLineDash([]);
      const hs = Math.max(2, Math.round(3 * scale));
      c.fillStyle = '#3b82f6';
      for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
        c.fillRect(cx - hs, cy - hs, hs * 2, hs * 2);
      }
      c.restore();
    }

    // ---- geometry helpers -------------------------------------------------
    /** Pointer clientX/clientY → CSS-px point in our (viewport-origin) space. */
    function toPoint(e: PointerEvent): Point {
      return { x: e.clientX, y: e.clientY };
    }

    function buildTwoPoint(type: Exclude<DrawTool, 'pen'>, from: Point, to: Point): DrawShape {
      return { id: makeId(), type, from, to, color, thickness };
    }

    // ---- canvas pointer interaction --------------------------------------
    function onCanvasPointerDown(e: PointerEvent): void {
      if (e.button !== 0) return;
      const p = toPoint(e);
      canvas.setPointerCapture(e.pointerId);

      if (tool === 'select') {
        const hit = hitTest(shapes, p);
        selectedId = hit ? hit.id : null;
        if (hit) {
          movingId = hit.id;
          moveLast = p;
        }
        scheduleRedraw();
        return;
      }

      drawing = true;
      start = p;
      if (tool === 'pen') {
        penPoints = [p];
        previewShape = { id: '__preview__', type: 'pen', points: penPoints.slice(), color, thickness };
      } else {
        previewShape = buildTwoPoint(tool, start, p);
      }
      scheduleRedraw();
    }

    function onCanvasPointerMove(e: PointerEvent): void {
      const p = toPoint(e);

      if (tool === 'select') {
        if (movingId && canvas.hasPointerCapture(e.pointerId)) {
          const dx = p.x - moveLast.x;
          const dy = p.y - moveLast.y;
          moveLast = p;
          const idx = shapes.findIndex(s => s.id === movingId);
          if (idx !== -1) {
            shapes[idx] = { ...moveShape(shapes[idx], dx, dy), id: shapes[idx].id };
            scheduleRedraw();
          }
        }
        return;
      }

      if (!drawing) return;
      if (tool === 'pen') {
        penPoints.push(p);
        previewShape = { id: '__preview__', type: 'pen', points: penPoints.slice(), color, thickness };
      } else {
        previewShape = buildTwoPoint(tool, start, p);
      }
      scheduleRedraw();
    }

    function onCanvasPointerUp(e: PointerEvent): void {
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }

      if (tool === 'select') {
        movingId = null;
        return;
      }

      if (!drawing) return;
      drawing = false;
      previewShape = null;
      const end = toPoint(e);

      if (tool === 'pen') {
        // Need real movement: >=2 distinct points and some travelled distance.
        const travelled = penPoints.length > 1 &&
          penPoints.some(pt => Math.hypot(pt.x - penPoints[0].x, pt.y - penPoints[0].y) >= MIN_DRAG_PX);
        if (travelled) {
          shapes.push({ id: makeId(), type: 'pen', points: penPoints.slice(), color, thickness });
        }
        penPoints = [];
      } else {
        const dist = Math.hypot(end.x - start.x, end.y - start.y);
        if (dist >= MIN_DRAG_PX) {
          shapes.push(buildTwoPoint(tool, start, end));
        }
      }
      scheduleRedraw();
    }

    canvas.addEventListener('pointerdown', onCanvasPointerDown);
    canvas.addEventListener('pointermove', onCanvasPointerMove);
    canvas.addEventListener('pointerup', onCanvasPointerUp);
    canvas.addEventListener('pointercancel', onCanvasPointerUp);

    // ---- actions ----------------------------------------------------------
    function setTool(t: EditorTool): void {
      tool = t;
      // Leaving select clears the selection highlight.
      if (t !== 'select') selectedId = null;
      canvas.classList.toggle('sfx-draw-select', t === 'select');
      updateToolButtons();
      scheduleRedraw();
    }

    function undo(): void {
      const removed = shapes.pop();
      if (removed && removed.id === selectedId) selectedId = null;
      scheduleRedraw();
    }

    function deleteSelected(): void {
      if (!selectedId) return;
      const idx = shapes.findIndex(s => s.id === selectedId);
      if (idx !== -1) shapes.splice(idx, 1);
      selectedId = null;
      scheduleRedraw();
    }

    function clearAll(): void {
      shapes.length = 0;
      selectedId = null;
      previewShape = null;
      scheduleRedraw();
    }

    async function save(): Promise<void> {
      // Drop selection chrome so the flatten sees only real shapes.
      selectedId = null;
      previewShape = null;
      try {
        const out = await compositeAnnotations(bgDataUrl, shapes, dpr);
        settle(out);
      } catch (err) {
        // No silent failure — reject so Wave 3 surfaces a toast (REL-01).
        if (settled) return;
        settled = true;
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    }

    // ---- keyboard ---------------------------------------------------------
    function isTypingTarget(e: KeyboardEvent): boolean {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
    }

    const keyHandler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        settle(null);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isTypingTarget(e) && selectedId) {
        e.preventDefault();
        deleteSelected();
      }
    };
    document.addEventListener('keydown', keyHandler, true);

    // ---- viewport resize --------------------------------------------------
    const resizeHandler = (): void => {
      sizeCanvas();
      redrawNow();
    };
    window.addEventListener('resize', resizeHandler);

    // ---- toolbar ----------------------------------------------------------
    const toolButtons = new Map<EditorTool, HTMLButtonElement>();
    const swatchButtons = new Map<string, HTMLButtonElement>();
    const thicknessButtons = new Map<number, HTMLButtonElement>();

    function updateToolButtons(): void {
      for (const [t, btn] of toolButtons) {
        btn.classList.toggle('sfx-draw-active', t === tool);
        btn.setAttribute('aria-pressed', String(t === tool));
      }
    }
    function updateColorButtons(): void {
      for (const [c, btn] of swatchButtons) {
        btn.classList.toggle('sfx-draw-active', c.toLowerCase() === color.toLowerCase());
      }
    }
    function updateThicknessButtons(): void {
      for (const [v, btn] of thicknessButtons) {
        btn.classList.toggle('sfx-draw-active', v === thickness);
        btn.setAttribute('aria-pressed', String(v === thickness));
      }
    }

    const toolbar = buildToolbar();
    overlay.appendChild(toolbar);
    updateToolButtons();
    updateColorButtons();
    updateThicknessButtons();

    // Build the frozen-first frame once the bg image is ready (canvas is
    // transparent until first draw; shapes list is empty so this is a no-op
    // paint, but it guarantees a clean initial state after any pre-seeding).
    redrawNow();

    // -----------------------------------------------------------------------
    // Toolbar construction (all createElement / createElementNS — no innerHTML)
    // -----------------------------------------------------------------------
    function buildToolbar(): HTMLElement {
      const bar = document.createElement('div');
      bar.className = 'sfx-draw-toolbar';
      bar.setAttribute('role', 'toolbar');
      bar.setAttribute('aria-label', 'Drawing tools');

      // --- tools group ---
      const tools: { tool: EditorTool; label: string; icon: SVGSVGElement }[] = [
        { tool: 'select', label: 'Select / move', icon: iconSelect() },
        { tool: 'arrow', label: 'Arrow', icon: iconArrow() },
        { tool: 'line', label: 'Line', icon: iconLine() },
        { tool: 'rect', label: 'Rectangle', icon: iconRect() },
        { tool: 'circle', label: 'Ellipse', icon: iconCircle() },
        { tool: 'pen', label: 'Marker (freehand)', icon: iconPen() },
      ];
      const toolGroup = document.createElement('div');
      toolGroup.className = 'sfx-draw-group';
      for (const t of tools) {
        const btn = iconButton(t.icon, t.label);
        btn.addEventListener('click', () => setTool(t.tool));
        toolButtons.set(t.tool, btn);
        toolGroup.appendChild(btn);
      }
      bar.appendChild(toolGroup);
      bar.appendChild(divider());

      // --- colour group ---
      const colorGroup = document.createElement('div');
      colorGroup.className = 'sfx-draw-group';
      for (const c of SWATCHES) {
        const sw = document.createElement('button');
        sw.type = 'button';
        sw.className = 'sfx-draw-swatch';
        sw.style.background = c;
        sw.title = c;
        sw.setAttribute('aria-label', `Colour ${c}`);
        sw.addEventListener('click', () => {
          color = c;
          colorInput.value = c;
          updateColorButtons();
        });
        swatchButtons.set(c, sw);
        colorGroup.appendChild(sw);
      }
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.className = 'sfx-draw-colorinput';
      colorInput.value = color;
      colorInput.title = 'Custom colour';
      colorInput.setAttribute('aria-label', 'Custom colour');
      colorInput.addEventListener('input', () => {
        color = colorInput.value;
        updateColorButtons();
      });
      colorGroup.appendChild(colorInput);
      bar.appendChild(colorGroup);
      bar.appendChild(divider());

      // --- thickness group ---
      const thickGroup = document.createElement('div');
      thickGroup.className = 'sfx-draw-group';
      for (const preset of THICKNESS_PRESETS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sfx-draw-btn sfx-draw-thick';
        btn.textContent = preset.label;
        btn.title = `Thickness ${preset.label} (${preset.value}px)`;
        btn.setAttribute('aria-label', `Thickness ${preset.label}`);
        btn.addEventListener('click', () => {
          thickness = preset.value;
          updateThicknessButtons();
        });
        thicknessButtons.set(preset.value, btn);
        thickGroup.appendChild(btn);
      }
      bar.appendChild(thickGroup);
      bar.appendChild(divider());

      // --- actions group ---
      const actionGroup = document.createElement('div');
      actionGroup.className = 'sfx-draw-group';

      const undoBtn = iconButton(iconUndo(), 'Undo (Ctrl+Z)');
      undoBtn.addEventListener('click', undo);
      actionGroup.appendChild(undoBtn);

      const delBtn = iconButton(iconTrash(), 'Delete selected (Del)');
      delBtn.addEventListener('click', deleteSelected);
      actionGroup.appendChild(delBtn);

      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'sfx-draw-btn sfx-draw-text';
      clearBtn.textContent = 'Clear';
      clearBtn.title = 'Clear all annotations';
      clearBtn.addEventListener('click', clearAll);
      actionGroup.appendChild(clearBtn);

      bar.appendChild(actionGroup);
      bar.appendChild(divider());

      // --- save / cancel ---
      const finalGroup = document.createElement('div');
      finalGroup.className = 'sfx-draw-group';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'sfx-draw-btn sfx-draw-text sfx-draw-cancel';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.title = 'Cancel (Esc)';
      cancelBtn.addEventListener('click', () => settle(null));
      finalGroup.appendChild(cancelBtn);

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'sfx-draw-btn sfx-draw-text sfx-draw-save';
      saveBtn.textContent = 'Save';
      saveBtn.title = 'Save annotation';
      saveBtn.addEventListener('click', () => { void save(); });
      finalGroup.appendChild(saveBtn);

      bar.appendChild(finalGroup);

      makeToolbarDraggable(bar);
      return bar;
    }

    // -----------------------------------------------------------------------
    // Settle + cleanup
    // -----------------------------------------------------------------------
    function settle(result: string | null): void {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    }

    function cleanup(): void {
      if (cleaned) return;
      cleaned = true;
      document.removeEventListener('keydown', keyHandler, true);
      window.removeEventListener('resize', resizeHandler);
      canvas.removeEventListener('pointerdown', onCanvasPointerDown);
      canvas.removeEventListener('pointermove', onCanvasPointerMove);
      canvas.removeEventListener('pointerup', onCanvasPointerUp);
      canvas.removeEventListener('pointercancel', onCanvasPointerUp);
      overlay.remove();
    }
  });
}

// ---------------------------------------------------------------------------
// Toolbar drag — hand-rolled pointer drag (NOT interactjs; it swallows button
// clicks). Replicates chip.ts makeDraggable (which is not exported): yields to
// interactive controls, viewport-clamps, ephemeral position.
// ---------------------------------------------------------------------------
function makeToolbarDraggable(el: HTMLElement): void {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let origLeft = 0;
  let origTop = 0;

  el.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return;
    // Do not start a drag from any interactive control — let its own
    // click/input fire (interactjs-style click-swallow is exactly what we avoid).
    const target = e.target as HTMLElement | null;
    if (target && target.closest('button, input, select, textarea, a, svg')) return;

    el.setPointerCapture(e.pointerId);
    dragging = true;
    const rect = el.getBoundingClientRect();
    origLeft = rect.left;
    origTop = rect.top;
    startX = e.clientX;
    startY = e.clientY;

    // Switch from the centering transform to absolute left/top.
    el.style.transform = 'none';
    el.style.left = `${origLeft}px`;
    el.style.top = `${origTop}px`;
    e.preventDefault();
  });

  el.addEventListener('pointermove', (e: PointerEvent) => {
    if (!dragging || !el.hasPointerCapture(e.pointerId)) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const w = el.offsetWidth || el.getBoundingClientRect().width || 0;
    const h = el.offsetHeight || el.getBoundingClientRect().height || 0;
    const newLeft = Math.max(0, Math.min(Math.max(0, window.innerWidth - w), origLeft + dx));
    const newTop = Math.max(0, Math.min(Math.max(0, window.innerHeight - h), origTop + dy));
    el.style.left = `${newLeft}px`;
    el.style.top = `${newTop}px`;
  });

  const endDrag = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);
}

// ---------------------------------------------------------------------------
// Small DOM helpers
// ---------------------------------------------------------------------------
function divider(): HTMLElement {
  const d = document.createElement('span');
  d.className = 'sfx-draw-divider';
  d.setAttribute('aria-hidden', 'true');
  return d;
}

function iconButton(icon: SVGSVGElement, label: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sfx-draw-btn sfx-draw-icon';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.appendChild(icon);
  return btn;
}

// ---------------------------------------------------------------------------
// Inline outline SVG icons — createElementNS only, stroke-width 2, no innerHTML
// ---------------------------------------------------------------------------
function svgEl(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function iconFrame(children: SVGElement[]): SVGSVGElement {
  const svg = svgEl('svg', {
    viewBox: '0 0 24 24',
    width: '18',
    height: '18',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  }) as SVGSVGElement;
  for (const c of children) svg.appendChild(c);
  return svg;
}

function iconSelect(): SVGSVGElement {
  // Classic cursor arrow.
  return iconFrame([
    svgEl('path', { d: 'M5 3l6 15 2.2-6.2L20 9.5z', fill: 'currentColor', stroke: 'none' }),
  ]);
}
function iconArrow(): SVGSVGElement {
  return iconFrame([
    svgEl('line', { x1: '5', y1: '19', x2: '19', y2: '5' }),
    svgEl('path', { d: 'M11 5h8v8' }),
  ]);
}
function iconLine(): SVGSVGElement {
  return iconFrame([svgEl('line', { x1: '5', y1: '19', x2: '19', y2: '5' })]);
}
function iconRect(): SVGSVGElement {
  return iconFrame([svgEl('rect', { x: '4', y: '6', width: '16', height: '12', rx: '1' })]);
}
function iconCircle(): SVGSVGElement {
  return iconFrame([svgEl('ellipse', { cx: '12', cy: '12', rx: '9', ry: '7' })]);
}
function iconPen(): SVGSVGElement {
  return iconFrame([
    svgEl('path', { d: 'M4 20l1.5-4.5L16 5l3 3L8.5 18.5z' }),
    svgEl('line', { x1: '14', y1: '7', x2: '17', y2: '10' }),
  ]);
}
function iconUndo(): SVGSVGElement {
  return iconFrame([
    svgEl('path', { d: 'M9 7L4 12l5 5' }),
    svgEl('path', { d: 'M4 12h11a5 5 0 0 1 5 5' }),
  ]);
}
function iconTrash(): SVGSVGElement {
  return iconFrame([
    svgEl('line', { x1: '4', y1: '7', x2: '20', y2: '7' }),
    svgEl('path', { d: 'M9 7V4h6v3' }),
    svgEl('path', { d: 'M6 7l1 13h10l1-13' }),
  ]);
}
