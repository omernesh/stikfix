# Phase 5: Element-Note Mode + Rich Context Capture — Research

**Researched:** 2026-06-02
**Domain:** Chrome MV3 content-script — element picker, CSS selector generation, React fiber introspection, canvas highlight drawing
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01** Single-shot picker: clicking an element exits pick mode and opens ONE pre-filled post-it. Esc cancels with no card. Matches Phase-4 single-active-card model.
- **D-02** `+1.png` = full visible viewport + highlight box drawn at element rect (DevTools-style); NOT an element-crop. Own-UI must be hidden via `waitTwoRafs` before `captureTab`. Box drawn ONTO the captured canvas (D-02a).
- **D-02a** Box drawn onto the captured canvas after the shot — never the live hover outline. Resolves "box on element, no own-UI visible" requirement.
- **D-03** Read-only context header (`tag.class · "text" · <Component> · WxH`) above an EMPTY textarea. Keeps `.md` `comment` field clean. Full element context still lands in `.md` frontmatter + element-context section.
- **D-04** ~25 curated computed-style props in ONE config constant (`CURATED_STYLE_PROPS`): `display, position, top, right, bottom, left, width, height, margin, padding, border, box-sizing, flex-direction, justify-content, align-items, gap, grid-template-columns, z-index, overflow, color, background-color, font-size, font-weight, font-family, line-height, opacity, visibility`.

### Claude's Discretion

- `@medv/finder@4.0.2` configuration (attr filters, data-testid/stable-attr preference, hashed-class de-prioritization).
- Hover-highlight overlay rendering technique and how it's hidden before capture.
- React fiber-walk internals and graceful omission when undetectable.
- New message-type name if any capture variant is needed.
- Picker-entry 🎯 affordance placement; context-header markup; truncation specifics.

### Deferred Ideas (OUT OF SCOPE)

- Region marquee capture (Phase 6).
- Warm post-it/paper aesthetics + animations + mode color-coding (Phase 6).
- Multi-element rapid capture / card queue (rejected v1 — D-01).
- Exhaustive screenshot/error-toast failure matrix (Phase 8).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ELEM-01 | Picker enters pick mode; hover highlights element with outline + `tag · WxH` label; Esc cancels | Hover-highlight overlay pattern + event lifecycle — see Architecture Patterns |
| ELEM-02 | Click captures robust unique selector via `@medv/finder` | `@medv/finder@4.0.2` API + attr config — see Standard Stack + Code Examples |
| ELEM-03 | Capture includes tag, id, classList, name, type, href, role, ariaLabel + aria-*, collapsed text (~1000 char trunc) | `captureElementContext` pure function shape — see Architecture Patterns |
| ELEM-04 | Capture includes rect, curated computedStyles, truncated outerHTML (~2000 chars), full dataset | `CURATED_STYLE_PROPS` constant + `getComputedStyle` + `outerHTML` slicing — see Code Examples |
| ELEM-05 | Best-effort React fiber detection, walk to nearest named component, omit if undetectable | React fiber-walk pattern — see Architecture Patterns + Code Examples |
| ELEM-06 | Capture includes `nearestTestId` (closest ancestor-or-self `data-testid`) | DOM walk helper pattern — see Code Examples |
| ELEM-07 | Post-it pre-filled with compact context summary; full detail in `.md` | `buildContextSummary` function pattern — see Code Examples |
| ELEM-08 | On Send, auto element-highlight `+1` captured with box drawn on element | `drawHighlightBox` + `waitTwoRafs` + `captureTab` pipeline — see Architecture Patterns |
| ELEM-09 | Element note `.md` has selector + react_component frontmatter, computed-styles table, truncated outerHTML | Host pipeline already built (Phase 2); extension produces matching `ElementContext` payload |
</phase_requirements>

---

## Summary

Phase 5 is pure extension-side work. The host's element-note pipeline (`ElementContext`, `Screenshot`, `mode:'element'` payload, `+N.png` decoding, element-context section + styles table + outerHTML rendering) was fully built in Phase 2 and has not changed. The capture trio (`captureTab`, `waitTwoRafs`, `computeCropCoords`, `cropToRect`) was built and unit-tested in Phase 4. Phase 5 wires the missing consumer side: an element picker, hover-highlight overlay, selector/context extraction library, React fiber walk, and the canvas box-draw that produces `+1.png`.

The primary new runtime dependency is `@medv/finder@4.0.2`, which is NOT yet installed (confirmed: it is absent from `package.json` `dependencies`). It must be added. The library's `finder()` function accepts an `Element` and returns a unique CSS selector string. Because `finder` searches the document (not a shadow root) and our picker targets PAGE elements, there is no shadow-DOM conflict: the picker's target element lives in the page document, while the hover-highlight overlay lives in the shadow root. These are correctly separated.

Three new pure files are planned (`picker.ts`, `lib/element-context.ts`, `lib/highlight-draw.ts`). The pure functions in those files (context capture, highlight box draw math) are testable under `node:test` without a browser — following the established Phase-4 pattern. The card extension and chip extension touch existing files as specified in the UI-SPEC Component Extension Map.

**Primary recommendation:** Install `@medv/finder@4.0.2`, extend `lib/types.ts` with no new message types (existing `SFX_CAPTURE_TAB` and `SFX_SEND_ANNOTATION` are sufficient), and factor all DOM-free logic (element-context extraction, highlight-box math, context-summary builder, curated-styles constant) into `lib/element-context.ts` and `lib/highlight-draw.ts` for `node:test` coverage, mirroring Phase 4's `computeCropCoords` pattern.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Hover-highlight overlay (live DOM outline) | Browser / Content Script | — | Must follow cursor in real-time; lives inside shadow root for z-index isolation |
| Element picking (click → capture) | Browser / Content Script | — | Needs DOM access to read element properties; content-side only |
| CSS selector generation (`@medv/finder`) | Browser / Content Script | — | Runs against page document; needs live DOM to verify uniqueness |
| React fiber walk | Browser / Content Script | — | Reads internal `__reactFiber$` property on page DOM elements |
| `+1.png` capture (`captureTab`) | Service Worker | — | `captureVisibleTab` is privileged; SW is the only caller (Phase-4 invariant) |
| Canvas box-draw (post-capture) | Browser / Content Script | — | Applied to the returned canvas object after SW returns dataUrl; pure DOM canvas |
| Element-context assembly | Browser / Content Script | — | Reads `getComputedStyle`, `getBoundingClientRect`, `dataset`, `outerHTML` |
| `mode:'element'` payload relay | Service Worker | — | `SFX_SEND_ANNOTATION` existing relay unchanged |
| `.md` + `+1.png` file writing | Host (Node.js) | — | Already built Phase 2; unchanged by Phase 5 |

---

## Standard Stack

### Core (Phase 5 new addition)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@medv/finder` | 4.0.2 | Unique CSS selector generation for clicked page elements | MIT, 1.5 kB gzipped, pure ESM, TypeScript-native; wordLike filter excludes hashed Tailwind/CSS-module classes by default; preferred by CLAUDE.md stack table |

**Version verification:** `npm view @medv/finder version` → `4.0.2` (published 2024-12-13). [VERIFIED: npm registry]

### Already Installed (consumed by Phase 5, no reinstall)

| Library | Version | Purpose | Phase Introduced |
|---------|---------|---------|-----------------|
| `interactjs` | 1.10.27 | Drag for element post-it card (card header) | Phase 4 |
| `yaml` | 2.9.0 | Host frontmatter (unchanged) | Phase 2 |

### Supporting (browser built-ins, no install)

| API | Purpose | Notes |
|-----|---------|-------|
| `Element.getBoundingClientRect()` | Page-absolute rect for hover overlay + capture box | Returns CSS-pixel coords; multiply by `window.devicePixelRatio` for canvas |
| `window.getComputedStyle(el)` | Curated CSS props snapshot | Called once per click; filter by `CURATED_STYLE_PROPS` array |
| `CanvasRenderingContext2D.fillRect` / `strokeRect` | Draw highlight box on canvas | Applied to canvas from decoded `captureTab` dataUrl |
| `Element.outerHTML` | Raw HTML snapshot | Sliced to ~2000 chars after capture |
| `HTMLElement.dataset` | All `data-*` attributes | `Record<string, string>` from `el.dataset` |

### Installation

```bash
npm install @medv/finder
```

No other new dependencies. All other building blocks are already installed or browser built-ins.

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@medv/finder` | npm | ~2 yrs (v4: Dec 2024) | >100k/wk [ASSUMED] | github.com/antonmedv/finder | [OK] | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

slopcheck reported `[OK]` for `@medv/finder`. Package is also explicitly listed in `CLAUDE.md` recommended stack table with MIT license and version 4.0.2.

No `postinstall` script found: `npm view @medv/finder scripts.postinstall` returned empty. [VERIFIED: npm registry]

---

## Architecture Patterns

### System Architecture Diagram

```
[Developer mouse over page element]
        |
        v
[content script: mousemove listener on document]
        |
        v
[picker.ts: getBoundingClientRect(target)]
        |
        v
[shadow-root div.sfx-hover-highlight: position:fixed, pointer-events:none]
  (live overlay — orange border + near-transparent fill)
        |
[Developer clicks element]
        |
        v
[picker.ts: exitPickMode() → hide overlay → call onElementClick(el)]
        |
        v
[lib/element-context.ts: captureElementContext(el)]
  ├─ @medv/finder → selector
  ├─ tag/id/classList/role/aria-* from element attributes
  ├─ innerText collapsed + truncated (~1000 chars)
  ├─ getBoundingClientRect() → page-absolute rect
  ├─ getComputedStyle → filter by CURATED_STYLE_PROPS
  ├─ outerHTML slice (~2000 chars)
  ├─ dataset object
  ├─ React fiber walk → reactComponent name (or undefined)
  └─ nearestTestId (ancestor-or-self data-testid walk)
        |
        v
[card.ts: openElementCard(container, tabId, elementCtx, ...)]
  context header rendered above textarea (read-only)
        |
[Developer types comment → clicks Send]
        |
        v
[Send in-flight sequence:]
  1. Disable controls, set "Sending…"
  2. Hide all sfx UI (card, chip, FAB, hover overlay)
  3. waitTwoRafs() — double rAF flush
  4. captureTab(tabId) → full-viewport dataUrl (SW relay)
  5. lib/highlight-draw.ts: drawHighlightBox(canvas, rect, dpr)
     - fill: rgba(255,107,0,0.15); stroke: #ff6b00; lineWidth: 2*dpr
  6. canvas.toDataURL('image/png') → +1 dataUrl
  7. Restore UI visibility
  8. Assemble mode:'element' AnnotationPayload with ElementContext + screenshots:[{kind:'+1',...}]
  9. chrome.runtime.sendMessage(SFX_SEND_ANNOTATION) → SW relay → host POST /annotation
  10. toast: success (resp.file) or error (resp.error / capture-fail)

[SW: handleSendAnnotation — UNCHANGED from Phase 4]
  └─ fetch http://127.0.0.1:<port>/annotation

[Host: writeNote — ALREADY BUILT Phase 2]
  ├─ buildFrontmatter: selector + react_component in frontmatter
  ├─ buildNoteBody: element context section + styles table + outerHTML + Screenshots
  └─ decodePngDataUrl → +1.png on disk
```

### Recommended Project Structure

```
entrypoints/review.content/
├─ picker.ts          [NEW] Picker lifecycle: enterPickMode/exitPickMode/onElementClick
├─ card.ts            [EXTEND] Add openElementCard() parallel to openCard()
├─ chip.ts            [EXTEND] Add 🎯 picker button; mount/unmount pick mode
├─ index.ts           [EXTEND] Wire picker → openElementCard; pass tabId/toast
└─ styles.css         [EXTEND] Add picker/hover/ctx-header/card-element CSS tokens

lib/
├─ element-context.ts [NEW] captureElementContext(el) — pure, node:test-safe
├─ highlight-draw.ts  [NEW] drawHighlightBox(canvas, rect, dpr) — pure, node:test-safe
├─ capture.ts         [UNCHANGED] captureTab, waitTwoRafs, computeCropCoords (consumed)
└─ types.ts           [MINOR] No new message types needed; may add CURATED_STYLE_PROPS here or in element-context.ts
```

### Pattern 1: `@medv/finder` Configuration for Robust Selectors

**What:** Configure `finder` to prefer stable attributes (`data-testid`, `aria-label`) and to accept any `data-*` attribute regardless of wordLike heuristic, while still de-prioritizing hashed classes.

**When to use:** Called once per element click in `captureElementContext`.

**Key facts about `@medv/finder@4.0.2`:**
- Default `className` filter uses `wordLike()` — rejects identifiers under 3 chars or containing 4+ consecutive consonants. This naturally de-prioritizes Tailwind utilities (`px-4`) and CSS-module hashes.
- Default `attr` filter: accepts `role`, `name`, `aria-label`, `rel`, `href`, and any `data-*` attribute where the name AND value are `wordLike`. `data-testid` has value `"login-btn"` (word-like) → accepted by default. However, to guarantee `data-testid` is always considered (even with non-word-like values), override `attr`.
- `finder` throws `"Selector was not found."` if no unique selector can be generated (extremely rare — should be caught and replaced with a positional fallback like `el.tagName.toLowerCase()`).
- `finder` throws a timeout error (`"Timeout: Can't find a unique selector after ${timeoutMs}ms"`) with the default 1000ms limit. On slow or extremely complex pages, this may fire. Catch and fallback.
- `root` option: defaults to `document.body`. For content-script use, `document.body` is correct — the picked element is always in the page document, NOT in the shadow root. No override needed. [VERIFIED: github.com/antonmedv/finder]

```typescript
// Source: github.com/antonmedv/finder + CLAUDE.md §finder
import { finder, attr as defaultAttr } from '@medv/finder';

// In lib/element-context.ts
function buildSelector(el: Element): string {
  try {
    return finder(el, {
      // Extend attr to always accept data-testid regardless of value wordLike check
      attr: (name: string, value: string) =>
        name === 'data-testid' ||
        name === 'data-cy' ||
        name === 'data-qa' ||
        defaultAttr(name, value),
      // root defaults to document.body — correct for page elements
      timeoutMs: 1000,
    });
  } catch {
    // Fallback: positional tag selector (always unique at capture time)
    return el.tagName.toLowerCase();
  }
}
```

**Why `attr` re-export:** `@medv/finder@4.0.2` exports both `finder` and `attr` (the default attr function) as named exports from `finder.js`. The `attr` re-export allows wrapping the default without duplicating its logic. [VERIFIED: github.com/antonmedv/finder source]

### Pattern 2: React Fiber Walk

**What:** Best-effort introspection of the React fiber tree attached to a DOM element to extract the nearest named component.

**When to use:** Called after element capture in `captureElementContext`; result stored as `ElementContext.reactComponent`. Omitted (field absent) when React is not present or fiber is inaccessible.

**Internals (MEDIUM confidence — internal React API, not documented officially):**
- React attaches a fiber reference to every managed DOM element under a key that starts with `__reactFiber$` (React 17+) or `__reactInternalInstance$` (React 16). The suffix is a random hash per React instance.
- Detection: iterate `Object.keys(element)` and find the key starting with `__reactFiber$`. If not found, try `__reactInternalInstance$`. If neither found, React is absent or element is not managed → gracefully return `undefined`.
- Walk: traverse `fiber.return` (parent in fiber tree) until finding a fiber where `fiber.type` is a function (not a string like `"div"`). The component name is `fiber.type.displayName ?? fiber.type.name ?? undefined`. Stop at the root (`fiber.return === null`).
- React DevTools uses this same `__reactFiber$` + `fiber.return` walk to display component names. [CITED: github.com/reactjs/react.dev/issues/288]

```typescript
// Source: community + React DevTools (MEDIUM confidence — internal API)
// In lib/element-context.ts — pure function (no DOM/chrome at module level)

interface Fiber {
  type?: unknown;
  return?: Fiber | null;
  stateNode?: unknown;
}

function getReactComponentName(el: Element): string | undefined {
  // Step 1: Find the fiber key on the element
  const fiberKey = Object.keys(el).find(
    k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
  );
  if (!fiberKey) return undefined;

  // Step 2: Walk fiber.return chain to find nearest named component
  let fiber: Fiber | undefined = (el as unknown as Record<string, unknown>)[fiberKey] as Fiber;
  while (fiber) {
    if (typeof fiber.type === 'function') {
      const fn = fiber.type as { displayName?: string; name?: string };
      const name = fn.displayName ?? fn.name;
      if (name && name !== 'Object') return name;
    }
    if (!fiber.return) break;
    fiber = fiber.return;
  }
  return undefined;
}
```

**Graceful omission:** If `fiberKey` is not found, or if the entire walk finds no named component, return `undefined`. The field is simply absent from `ElementContext` — the `.md` will omit the `react_component` frontmatter line (host `buildFrontmatter` already handles this: `if (element.reactComponent)`).

### Pattern 3: Hover-Highlight Overlay Lifecycle

**What:** A `pointer-events:none` `<div>` in the shadow root that tracks the hovered page element.

**Implementation (extension-side only):**

```typescript
// In entrypoints/review.content/picker.ts

let hoverOverlay: HTMLDivElement | null = null;
let hoverLabel: HTMLSpanElement | null = null;
let currentTarget: Element | null = null;

function enterPickMode(container: HTMLElement, onElementClick: (el: Element) => void, onEsc: () => void): void {
  // Create overlay once, reuse for all hovers
  hoverOverlay = document.createElement('div');
  hoverOverlay.className = 'sfx-hover-highlight';
  hoverOverlay.style.display = 'none';
  hoverLabel = document.createElement('span');
  hoverLabel.className = 'sfx-hover-label';
  hoverOverlay.appendChild(hoverLabel);
  container.appendChild(hoverOverlay);

  // throttle to rAF
  let rafPending = false;
  const onMouseMove = (e: MouseEvent) => {
    const target = e.target as Element;
    if (target === currentTarget) return;
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        updateOverlay(target);
        currentTarget = target;
      });
    }
  };

  const onClick = (e: MouseEvent) => {
    const target = e.target as Element;
    exitPickMode();
    onElementClick(target);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { exitPickMode(); onEsc(); }
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKeyDown);
  // Store for cleanup
  _cleanupFns = [
    () => document.removeEventListener('mousemove', onMouseMove),
    () => document.removeEventListener('click', onClick),
    () => document.removeEventListener('keydown', onKeyDown),
  ];
}

function updateOverlay(el: Element): void {
  if (!hoverOverlay || !hoverLabel) return;
  const rect = el.getBoundingClientRect();
  hoverOverlay.style.display = 'block';
  hoverOverlay.style.left = `${rect.left}px`;
  hoverOverlay.style.top = `${rect.top}px`;
  hoverOverlay.style.width = `${rect.width}px`;
  hoverOverlay.style.height = `${rect.height}px`;
  // Label format: tag#id · WxH or tag.class · WxH
  const prefix = buildLabelPrefix(el);
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  hoverLabel.textContent = `${prefix} · ${w}×${h}`;
  // Flip label above if near bottom edge
  const nearBottom = rect.bottom > window.innerHeight - 24;
  hoverLabel.style.bottom = nearBottom ? 'auto' : 'calc(100% + 4px)';
  hoverLabel.style.top = nearBottom ? 'calc(100% + 4px)' : 'auto';
}
```

**Hiding before capture:** Set `hoverOverlay.style.display = 'none'` synchronously before `waitTwoRafs()`. Restore to `'none'` after capture (it stays hidden — pick mode exited at click time).

### Pattern 4: Canvas Highlight Box Draw

**What:** Pure function drawing a DevTools-style highlight box onto the canvas returned by `captureTab`.

**Why pure function:** Testable under `node:test` without a browser (with a mock canvas). Mirrors `computeCropCoords` pattern.

```typescript
// Source: UI-SPEC §4 Canvas Highlight Box spec
// In lib/highlight-draw.ts

export function drawHighlightBox(
  canvas: HTMLCanvasElement,
  rect: { x: number; y: number; width: number; height: number },
  dpr: number
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const x = Math.round(rect.x * dpr);
  const y = Math.round(rect.y * dpr);
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (w <= 0 || h <= 0) return; // zero-dim guard
  // Fill first (transparent interior), then stroke (opaque border)
  ctx.fillStyle = 'rgba(255, 107, 0, 0.15)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#ff6b00';
  ctx.lineWidth = 2 * dpr;
  ctx.strokeRect(x, y, w, h);
}
```

**Usage in Send flow (in `openElementCard` `_doElementSend`):**

```typescript
// After captureTab returns dataUrl:
const img = new Image();
img.src = dataUrl;
await new Promise(resolve => { img.onload = resolve; });
const canvas = document.createElement('canvas');
canvas.width = img.width;
canvas.height = img.height;
const ctx2d = canvas.getContext('2d')!;
ctx2d.drawImage(img, 0, 0);
drawHighlightBox(canvas, frozenRect, window.devicePixelRatio);
const plus1DataUrl = canvas.toDataURL('image/png');
```

Note: `frozenRect` is the rect captured AT CLICK TIME (when the element was picked), not re-measured at Send time. This is important — the element may have scrolled or reflowed between click and Send.

### Pattern 5: `ElementContext` Assembly

**What:** All context captured from a page element at click time, assembled into the `ElementContext` type defined in `host/src/types.ts`.

**Key field contracts (must match host `types.ts` exactly):**

```typescript
// From host/src/types.ts (already built):
export interface ElementContext {
  selector: string;
  tag: string;
  id?: string;
  classList?: string[];
  role?: string;
  ariaLabel?: string;
  text?: string;
  rect?: { x: number; y: number; width: number; height: number };
  computedStyles?: Record<string, string>;
  outerHTML?: string;
  dataset?: Record<string, string>;
  reactComponent?: string;
  nearestTestId?: string;
}
```

**Note on aria-* capture (ELEM-03):** The ElementContext type has `ariaLabel` (the `aria-label` attribute) as a named field, but NOT a generic `aria-*` map. Additional aria attributes (e.g. `aria-expanded`, `aria-checked`, `aria-role`) should be captured through the existing fields (role → `role` attribute, ariaLabel → `aria-label`) and potentially folded into `dataset` or a text summary. The `text` field holds collapsed `innerText`. The host `buildNoteBody` renders `ariaLabel` as a named field — there is no `ariaAttributes` record in `ElementContext`. **Decision for planner:** ELEM-03 says "ariaLabel + aria-*" but `ElementContext` only has `ariaLabel`. The most practical approach: capture all `aria-*` attributes into a computed summary appended to `text`, OR add them to `dataset` (since `dataset` is `Record<string,string>` and the host writes all dataset entries). Confirm with codebase that `ariaLabel` = the `aria-label` attribute value, and `role` = the `role` attribute. Any remaining `aria-*` attrs can fold into `dataset` (they appear as `el.dataset` only if prefixed `data-` — aria-* is NOT in dataset). **Recommendation:** Capture `ariaLabel` from `el.getAttribute('aria-label')`, `role` from `el.getAttribute('role')`, and any remaining `aria-*` attributes as an additional display-only string in the `text` field suffix (e.g. `[aria-expanded=true aria-checked=false]`) — this satisfies ELEM-03 without adding a new field to `ElementContext`.

### Pattern 6: nearestTestId Walk

**What:** Walk element and ancestors to find nearest `data-testid` attribute.

```typescript
// In lib/element-context.ts
function nearestTestId(el: Element): string | undefined {
  let node: Element | null = el;
  while (node) {
    const tid = node.getAttribute('data-testid');
    if (tid) return tid;
    node = node.parentElement;
  }
  return undefined;
}
```

### Pattern 7: Payload Assembly

The `mode:'element'` payload is assembled in `openElementCard`'s Send path:

```typescript
// In card.ts openElementCard _doElementSend
const payload: AnnotationPayload = {
  mode: 'element',
  comment: textarea.value.trim(),
  page: { url: window.location.href, title: document.title },
  viewport: {
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
  },
  element: elementCtx,  // ElementContext captured at pick time
  screenshots: [{
    kind: '+1',
    mime: 'image/png',
    dataUrl: plus1DataUrl,
    rect: {
      x: Math.round(frozenRect.x),
      y: Math.round(frozenRect.y),
      width: Math.round(frozenRect.width),
      height: Math.round(frozenRect.height),
    },
  }],
};
```

### Anti-Patterns to Avoid

- **Re-measuring rect at Send time:** The element's rect must be captured at click time (frozen), not at Send time. Between click and Send the user may scroll the page, changing `getBoundingClientRect()`. Store the rect in the `ElementContext` at click time.
- **innerHTML with element-derived strings:** ALL page-controlled strings (outerHTML, text, attrs, selector) must be set via `textContent`, never `innerHTML`. This is a hard invariant (CLAUDE.md INVARIANT C).
- **Importing from `background.ts`:** Never import `SFX_CAPTURE_TAB` from `background.ts` in content scripts — it crashes the CS bundle. Import from `lib/types.ts` only. This invariant is documented in the existing code.
- **Calling `captureVisibleTab` from a content script:** Content scripts cannot call `captureVisibleTab`. Always relay via `captureTab()` from `lib/capture.ts` which uses the SW relay.
- **`@medv/finder` on shadow-root elements:** `finder` searches `document.body` by default. If called with an element that lives inside a shadow root, it searches the shadow root as its document. The picker targets PAGE elements (not shadow root elements) — this is correct by design. Never call `finder` on the hover overlay div or any sfx UI element.
- **No try/catch around `finder()`:** `finder` throws on timeout or if no unique selector is found. Always wrap in try/catch with a fallback.
- **Picker button in wrong file:** The picker button lives in `chip.ts` (appended inside `#sfx-chip`). The pick-mode event listeners (mousemove, click, keydown on `document`) live in `picker.ts`. The `card.ts` extension (`openElementCard`) must NOT import `picker.ts` — picker exits BEFORE calling `onElementClick`, so by the time `openElementCard` runs, pick mode is already off.
- **Not hiding own UI before capture:** The hover overlay div, the chip, the FAB, and the card must ALL be hidden synchronously before `waitTwoRafs()` + `captureTab()`. Failure to hide the card (which just opened) means the card appears in the `+1.png`. See UI-SPEC §Send Interaction In-flight sequence.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Unique CSS selector from DOM element | Custom heuristic (outerHTML grep, attribute guessing) | `@medv/finder@4.0.2` | wordLike filter, timeout, uniqueness verification against document, proven algorithm; custom heuristics break on dynamic classes, duplicate ids, etc. |
| Dragging the element post-it card | Native pointer events drag from scratch | `interactjs` (already installed) | Same drag setup as free-note card (`openCard`); reuse the identical `interact(card).draggable({...})` block with `allowFrom: '.sfx-card-header'` |
| Shadow-root host overlay z-ordering | Per-element z-index calculation | `:host` popover + existing shadow root at `z-index: 2147483647` | Already in place; hover overlay uses `position:fixed` inside the shadow root and stacks correctly |

**Key insight:** CSS selector generation is deceptively hard. `@medv/finder` handles hashed classes, duplicate IDs, selector uniqueness verification, timeout, and fallback to positional selectors. Any custom heuristic will produce either non-unique or unstable selectors on real apps.

---

## Runtime State Inventory

This is a greenfield feature phase (no rename/refactor). Omit runtime state inventory.

---

## Common Pitfalls

### Pitfall 1: `finder` Throws — Unhandled Rejection Crashes Capture

**What goes wrong:** `captureElementContext` calls `finder(el)` which throws `"Selector was not found."` or a timeout. Uncaught, this propagates out of the click handler and leaves pick mode in an undefined state with no card.

**Why it happens:** Very deep or shadow-DOM-heavy pages may exhaust the 1000ms timeout. Some synthetic elements (e.g. custom elements with `is=""`) may have no unique path to `document.body`.

**How to avoid:** Wrap `finder()` in try/catch. Return `el.tagName.toLowerCase()` as a positional fallback (e.g. `"button"` or `"div:nth-of-type(3)"`). Log the error to console in DEV builds only.

**Warning signs:** Console errors containing `"Selector was not found"` or `"Timeout: Can't find a unique selector"`.

### Pitfall 2: Frozen Rect vs Live Rect Mismatch

**What goes wrong:** `getBoundingClientRect()` called at Send time (after the user has scrolled) returns different coordinates than at click time. The `+1.png` box is drawn at the wrong position.

**Why it happens:** Time gap between picker click and Send button click. Developer picks an element, types a long note, page scrolls.

**How to avoid:** Capture `rect = el.getBoundingClientRect()` inside `captureElementContext` (at click time). Store as `ElementContext.rect` (rounded integers). Use THAT rect for both the box draw and the payload. NEVER re-call `getBoundingClientRect()` at Send time.

**Warning signs:** Highlight box visible in `+1.png` but not at the element's visual position.

### Pitfall 3: Own UI Visible in `+1.png`

**What goes wrong:** The element card, chip, FAB, or hover overlay appears in the `+1.png` screenshot.

**Why it happens:** `waitTwoRafs` was not called after setting `display:none`, or only SOME elements were hidden (e.g. hover overlay hidden but card not hidden yet).

**How to avoid:** Follow the UI-SPEC §Send Interaction In-flight sequence exactly: (1) disable controls → (2) set `display:none` on ALL sfx surfaces (card, chip, FAB, hover overlay if present) → (3) `await waitTwoRafs()` → (4) `await captureTab(tabId)`. The order is strict. The hiding must be synchronous before the `await`.

**Warning signs:** The `+1.png` shows the stickyfix card or chip overlaid on the page.

### Pitfall 4: React Fiber Walk Throws or Loops

**What goes wrong:** Walking `fiber.return` encounters a circular reference or throws accessing an internal property. Or the walk runs indefinitely.

**Why it happens:** React's fiber structure is an internal API. Different React versions have different fiber shapes. React in production build may strip `displayName`.

**How to avoid:** (a) Wrap the entire fiber walk in try/catch. (b) Add a `maxSteps` guard (e.g. 50 iterations max) on the `while` loop. (c) If `fiber.return === fiber` (circular), break. (d) In production React builds, `fiber.type.name` is the minified function name (often `'t'` or `'r'`) — these are useless. Only emit a component name if its length > 2 and it matches `/^[A-Z]/` (React component naming convention: PascalCase). [ASSUMED — internal API behavior in prod builds]

**Warning signs:** Infinite hang during element pick on React production apps.

### Pitfall 5: `@medv/finder` Called on Shadow-Root Element

**What goes wrong:** `finder` is accidentally called on an element inside the shadow root (e.g. the hover overlay itself when the page's own mousemove fires on the shadow host). Returns a selector valid only within the shadow root, not the page.

**Why it happens:** `e.target` during page `mousemove` can return the shadow host element (not a page element) when the cursor is over the sfx overlay.

**How to avoid:** In the mousemove handler, check `if (target === container || container.contains(target)) return;` where `container` is the shadow-root container element. Skip sfx-internal targets. [VERIFIED by reading existing `chip.ts` pattern for event guards]

### Pitfall 6: `outerHTML` Contains Sensitive Data

**What goes wrong:** The captured `outerHTML` includes sensitive content (API keys in data attributes, personally identifiable info in form fields).

**Why it happens:** Phase 5 captures `el.outerHTML.slice(0, 2000)` unconditionally.

**How to avoid:** This is a developer-tool-only extension (not a public product). The CLAUDE.md security note does not specifically prohibit outerHTML capture for developer use. Accept this as in-scope and note it in the `.md` as a "curated snapshot". Out of scope for Phase 5 (exhaustive security hardening is Phase 8). [ASSUMED — no explicit CLAUDE.md restriction, consistent with PRD §9.2]

### Pitfall 7: `textContent` Truncation Counts Collapsed Whitespace

**What goes wrong:** `el.innerText` includes visible rendered text with whitespace normalization. `el.textContent` includes all text nodes including script/style text content.

**Why it happens:** Using `textContent` instead of `innerText` for the `text` field.

**How to avoid:** Use `(el.innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 1000)` — `innerText` for visible rendered text (respects CSS `display:none`), `textContent` as fallback, then collapse whitespace, then slice.

---

## Code Examples

### captureElementContext — Full Shape

```typescript
// Source: ElementContext from host/src/types.ts + ELEM-01..ELEM-06 requirements
// In lib/element-context.ts

import { finder, attr as defaultAttr } from '@medv/finder';

export const CURATED_STYLE_PROPS = [
  'display', 'position', 'top', 'right', 'bottom', 'left',
  'width', 'height', 'margin', 'padding', 'border', 'box-sizing',
  'flex-direction', 'justify-content', 'align-items', 'gap',
  'grid-template-columns', 'z-index', 'overflow',
  'color', 'background-color', 'font-size', 'font-weight',
  'font-family', 'line-height', 'opacity', 'visibility',
] as const;

export function captureElementContext(el: Element): import('../host/src/types.js').ElementContext {
  const tag = el.tagName.toLowerCase();
  const id = el.id || undefined;
  const classList = el.classList.length > 0
    ? Array.from(el.classList)
    : undefined;

  // Attributes
  const role = el.getAttribute('role') ?? undefined;
  const ariaLabel = el.getAttribute('aria-label') ?? undefined;

  // Collapsed inner text (innerText for visible text, textContent fallback)
  const rawText = ((el as HTMLElement).innerText ?? el.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const text = rawText.length > 0 ? rawText.slice(0, 1000) : undefined;

  // Page-absolute rect, rounded integers
  const domRect = el.getBoundingClientRect();
  const rect = {
    x: Math.round(domRect.x),
    y: Math.round(domRect.y),
    width: Math.round(domRect.width),
    height: Math.round(domRect.height),
  };

  // Curated computed styles
  const cs = window.getComputedStyle(el);
  const computedStyles: Record<string, string> = {};
  for (const prop of CURATED_STYLE_PROPS) {
    const val = cs.getPropertyValue(prop);
    if (val) computedStyles[prop] = val;
  }

  // Truncated outerHTML
  const outerHTML = el.outerHTML.slice(0, 2000);

  // Full dataset
  const dataset = Object.keys((el as HTMLElement).dataset ?? {}).length > 0
    ? { ...(el as HTMLElement).dataset }
    : undefined;

  // React fiber walk
  const reactComponent = getReactComponentName(el);

  // Nearest data-testid
  const nearestTestIdVal = nearestTestId(el);

  // Selector — must come after all DOM reads so we don't invalidate anything
  const selector = buildSelector(el);

  return {
    selector,
    tag,
    ...(id ? { id } : {}),
    ...(classList ? { classList } : {}),
    ...(role ? { role } : {}),
    ...(ariaLabel ? { ariaLabel } : {}),
    ...(text ? { text } : {}),
    rect,
    computedStyles,
    outerHTML,
    ...(dataset ? { dataset } : {}),
    ...(reactComponent ? { reactComponent } : {}),
    ...(nearestTestIdVal ? { nearestTestId: nearestTestIdVal } : {}),
  };
}
```

### buildContextSummary — Context Header String (ELEM-07 / D-03)

```typescript
// In lib/element-context.ts (or card.ts)
// Pure function — testable without DOM (takes pre-assembled ElementContext)

export function buildContextSummary(ctx: ElementContext): string {
  // Short selector: tag, tag#id, or tag.firstMeaningfulClass (≤20 chars before · WxH)
  let shortSelector = ctx.tag;
  if (ctx.id) {
    shortSelector = `${ctx.tag}#${ctx.id}`.slice(0, 20);
  } else if (ctx.classList?.[0]) {
    shortSelector = `${ctx.tag}.${ctx.classList[0]}`.slice(0, 20);
  }

  const parts: string[] = [shortSelector];

  if (ctx.text) {
    parts.push(`"${ctx.text.slice(0, 40)}"`);
  }
  if (ctx.reactComponent) {
    parts.push(`<${ctx.reactComponent}>`);
  }
  if (ctx.rect) {
    parts.push(`${ctx.rect.width}×${ctx.rect.height}`);
  }

  return parts.join(' · ');
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `__reactInternalInstance$` key | `__reactFiber$` key (React 17+) | React 17 (2020) | Must probe both key prefixes for cross-version compat |
| `finder@1.x` (old API) | `@medv/finder@4.0.2` with named exports (`finder`, `attr`) | Late 2024 | Can import and wrap `attr` default to extend attr logic |
| `captureVisibleTab` in content script | SW relay (`SFX_CAPTURE_TAB`) | Chrome LNA (2024) | Established in Phase 4 — do not change |

**Deprecated/outdated:**
- `interact.js` (hyphenated, npm): only at v1.2.8, years stale → use `interactjs@1.10.27` (already installed)
- `@interactjs/interact` (scoped): internal sub-package, not for independent use → use `interactjs@1.10.27`
- `element.computedStyleMap()` (typed OM): experimental, not universally available in Chrome content scripts → use `getComputedStyle(el).getPropertyValue(prop)` [ASSUMED]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@medv/finder@4.0.2` exports both `finder` and `attr` as named exports from `finder.js` | Code Examples §Pattern 1 | If `attr` is not re-exported, cannot wrap it; fallback: inline the wordLike check or simply `return name === 'data-testid' || name.startsWith('data-')` |
| A2 | React production builds have minified function names (single letter), making `reactComponent` unreliable on prod React apps | Common Pitfalls §Pitfall 4 | Developer reviews `.md` and sees `reactComponent: "t"` — not useful; low-impact since field is best-effort |
| A3 | `@medv/finder` weekly downloads >100k/wk | Package Legitimacy Audit | Low impact — package legitimacy confirmed via slopcheck [OK] and CLAUDE.md listing |
| A4 | `element.computedStyleMap()` is not universally available in Chrome content scripts | State of the Art | Low — fallback `getComputedStyle` is always available |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

---

## Open Questions (RESOLVED)

1. **aria-* beyond ariaLabel**
   - What we know: `ElementContext` has `ariaLabel` and `role` named fields. No `ariaAttributes: Record<string,string>` field.
   - What's unclear: ELEM-03 says "ariaLabel + aria-*" — should other `aria-*` attributes (aria-expanded, aria-checked, aria-selected) be captured?
   - Recommendation: Capture all `aria-*` attributes as a suffix appended to the `text` field (`[aria-expanded=true]`), OR fold them into `dataset` by converting to `data-aria-*` convention. The simplest approach that satisfies ELEM-03 without a host-side change: include them in `text` as a bracketed suffix. Note: they are NOT in `el.dataset` (aria-* are not `data-*` attributes). The planner should pick one approach and be explicit in the task.
   - **RESOLVED:** Append remaining `aria-*` attributes as a bracketed suffix on the `text` field (e.g. `[aria-expanded=true]`). No host-side change. Locked in Plan 05-01 Task 2 action.

2. **`findRootDocument` and shadow DOM in `@medv/finder@4.0.2`**
   - What we know: The source has some shadow-root detection code (`getRootNode()` check).
   - What's unclear: Whether v4.0.2 fully supports element-in-shadow-root selector generation. However, Phase 5 only calls `finder` on PAGE elements (not shadow-root elements) — so this is moot for Phase 5.
   - Recommendation: Confirm in implementation that `finder` is never called on shadow-root elements. Document as FUT-03 (full shadow-DOM traversal is already a v2 deferred item).
   - **RESOLVED:** Moot for Phase 5 — `finder` runs only on page elements (the picked target is in the page document, never the shadow root). Full shadow-DOM traversal stays deferred as FUT-03.

3. **Pick mode intercepts page click events**
   - What we know: The click listener on `document` captures page clicks during pick mode. UI-SPEC recommends NOT calling `e.preventDefault()` or `e.stopPropagation()`.
   - What's unclear: On pages with aggressive click capture (e.g. React portals, document-level event delegation), NOT calling stopPropagation means the page also handles the click (e.g. navigates away or opens a modal).
   - Recommendation: Accept this behavior for v1 — the picker is a developer tool and momentary page interaction is acceptable. Document it. If page navigation occurs on click, the content script unmounts and the card is lost — this is a Phase 8 edge case.
   - **RESOLVED:** Accepted for v1 — picker click does not call `stopPropagation`; momentary page interaction is acceptable for a developer tool. Aggressive-click-capture pages (navigation on click) are a Phase 8 edge case. Disposition recorded as `accept` in the Plan 05-02 `<threat_model>`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build (tsc, esbuild) | ✓ | (existing from Phase 1) | — |
| npm | Package install | ✓ | (existing) | — |
| `@medv/finder` | ELEM-02 selector generation | ✗ (not installed) | 4.0.2 (target) | None — must install; Wave 0 task |
| Chrome DevTools (manual test) | ELEM-08 screenshot verification | ✓ | Bundled with Chrome | — |

**Missing dependencies with no fallback:**
- `@medv/finder@4.0.2` — must be installed as Wave 0 task before any selector code can compile.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` (Node.js built-in, no install) |
| Config file | `tsconfig.lib.json` — `include` must be extended to cover new lib files |
| Quick run command | `npm run test:lib` |
| Full suite command | `npm run check` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ELEM-02 | `buildSelector` wraps `finder` + fallback on throw | unit (`node:test`) | `npm run test:lib` | ❌ Wave 0: `lib/test/element-context.test.ts` |
| ELEM-03 | `captureElementContext` returns correct tag/id/classList/role/ariaLabel/text truncation | unit (`node:test`) | `npm run test:lib` | ❌ Wave 0: `lib/test/element-context.test.ts` |
| ELEM-04 | `CURATED_STYLE_PROPS` constant has expected length (~25-27 props); `outerHTML` slice at 2000 | unit (`node:test`) | `npm run test:lib` | ❌ Wave 0: `lib/test/element-context.test.ts` |
| ELEM-05 | `getReactComponentName` returns name from mock fiber; returns `undefined` when no `__reactFiber$` key; max-steps guard prevents infinite loop | unit (`node:test`) | `npm run test:lib` | ❌ Wave 0: `lib/test/element-context.test.ts` |
| ELEM-06 | `nearestTestId` returns own `data-testid`, ancestor `data-testid`, `undefined` if none | unit (`node:test`) | `npm run test:lib` | ❌ Wave 0: `lib/test/element-context.test.ts` |
| ELEM-07 | `buildContextSummary` formats correct string variants (no text, no component, no id) | unit (`node:test`) | `npm run test:lib` | ❌ Wave 0: `lib/test/element-context.test.ts` |
| ELEM-08 | `drawHighlightBox` calls fill+stroke with correct DPR-scaled coords | unit (`node:test`, mock canvas ctx) | `npm run test:lib` | ❌ Wave 0: `lib/test/highlight-draw.test.ts` |
| ELEM-01 | Hover overlay appears / moves / hides; pick mode state machine; Esc exits | manual-only | — (Chrome runtime bound) | manual test |
| ELEM-08 | `+1.png` contains page content + box (no sfx UI visible) | manual-only | — (requires Chrome runtime) | manual test |
| ELEM-09 | `.md` on disk has correct frontmatter + element section + styles table + outerHTML | manual-only | — (end-to-end host integration) | manual test |

**Unit-testable without browser** (mirrors Phase-4 `computeCropCoords` precedent):
- `buildSelector` (with a mock element object — NOT calling real `finder`, testing the try/catch wrapper and fallback)
- `captureElementContext` field extraction from a mock DOM element (pass a plain object implementing `Element` interface partially)
- `getReactComponentName` (pass a mock element with `__reactFiber$` key set to a mock fiber object)
- `nearestTestId` (pass a mock element tree)
- `buildContextSummary` (pure string function)
- `drawHighlightBox` (pass a mock canvas with a recorded-call ctx)
- `CURATED_STYLE_PROPS` constant correctness

**Note on tsconfig.lib.json:** The `include` array in `tsconfig.lib.json` must be extended to add `lib/element-context.ts` and `lib/highlight-draw.ts`. The `test:lib` script runs tests from `dist/lib/lib/test/*.test.js` — new test files follow the same pattern.

### Sampling Rate

- **Per task commit:** `npm run test:lib` (pure unit tests, < 5s)
- **Per wave merge:** `npm run check` (full: tsc × 2 + clean-room grep + host tests + lib tests)
- **Phase gate:** Full suite green + manual smoke test of picker → card → Send → `.md` + `+1.png` on disk before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `lib/test/element-context.test.ts` — covers ELEM-02, ELEM-03, ELEM-04, ELEM-05, ELEM-06, ELEM-07
- [ ] `lib/test/highlight-draw.test.ts` — covers ELEM-08 canvas math
- [ ] `tsconfig.lib.json` include update — add `lib/element-context.ts`, `lib/highlight-draw.ts`
- [ ] `npm install @medv/finder` — must run before any import of the package compiles

---

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1`.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | no user auth in extension |
| V3 Session Management | no | not applicable |
| V4 Access Control | partial | SW IDOR guard already in place (SFX_CAPTURE_TAB sender-binding, commit 6736413) — reused unchanged |
| V5 Input Validation | yes | All page-derived strings (outerHTML, text, attr values) go through `textContent` or are stored as JSON data — never injected as HTML. Truncation guards prevent oversized payloads. |
| V6 Cryptography | no | no crypto in Phase 5 |

### Known Threat Patterns for this Phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via `innerHTML` with page-controlled element text/outerHTML | Tampering | INVARIANT C: all element-derived strings via `textContent` only; context header uses `textContent`; no `innerHTML` in picker/card |
| IDOR: content script captures tab for foreign tab | Tampering | Existing SW IDOR guard (sender.tab.id === reqTabId check in `handleCaptureTab`) — no change needed |
| Oversized `outerHTML` or `text` exhausting payload limit | DoS | `outerHTML.slice(0, 2000)`, `innerText.slice(0, 1000)` guards; host 12 MB body cap (HOST-11) |
| Page script forges picker click event | Spoofing | Picker listens via `document.addEventListener` in the content script world (MAIN world for MV3 content scripts); page script cannot directly forge a `MouseEvent` to `document` that sets `e.target` to an arbitrary element — `e.target` is set by the browser's event dispatch. Low risk. |
| `reactComponent` name containing injection attempt | Tampering | `reactComponent` is stored as YAML string value via `yamlStringify` on the host; YAML library handles quoting. On extension side it is set via `textContent` in context header. Safe. |

---

## Sources

### Primary (HIGH confidence)

- `host/src/types.ts` — `ElementContext`, `AnnotationPayload`, `Screenshot` field names (verified by file read)
- `host/src/write-note.ts` — confirms host renders `selector`, `react_component`, element-context section, styles table, outerHTML, `+N.png` (verified by file read)
- `lib/capture.ts` — `captureTab`, `waitTwoRafs`, `computeCropCoords` signatures and invariants (verified by file read)
- `lib/types.ts` — `SFX_CAPTURE_TAB`, `SFX_MSG.SEND_ANNOTATION` — no new message types needed (verified by file read)
- `entrypoints/background.ts` — `handleCaptureTab` IDOR guard (sender.tab.id === reqTabId), SFX_CAPTURE_TAB handler (verified by file read)
- `entrypoints/review.content/card.ts` — `openCard`, `_doSend`, interactjs drag pattern to extend (verified by file read)
- `entrypoints/review.content/index.ts` — shadow root mount, `getTabId`, `toast` adapter wiring (verified by file read)
- `entrypoints/review.content/styles.css` — existing CSS tokens and class names (verified by file read)
- `.planning/phases/05-element-note-mode-rich-context-capture/05-CONTEXT.md` — locked decisions D-01..D-04 (verified by file read)
- `.planning/phases/05-element-note-mode-rich-context-capture/05-UI-SPEC.md` — approved visual + interaction contract (verified by file read)
- `github.com/antonmedv/finder` — `finder` function signature, `attr` default, `wordLike` filter, throw behavior, shadow-root handling [VERIFIED: github.com/antonmedv/finder]
- npm registry — `@medv/finder@4.0.2` version, publish date 2024-12-13, MIT, no postinstall script [VERIFIED: npm registry]
- slopcheck — `@medv/finder` scanned `[OK]` [VERIFIED: slopcheck]

### Secondary (MEDIUM confidence)

- React fiber walk pattern (`__reactFiber$`, `fiber.return`, `type.displayName`) — [CITED: github.com/reactjs/react.dev/issues/288; community references]
- `@medv/finder` `attr` wrapping pattern — [CITED: github.com/antonmedv/finder README]

### Tertiary (LOW confidence)

- React production build minifies component names — [ASSUMED based on general React knowledge]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `@medv/finder` version/API verified from official GitHub source + npm registry
- Architecture: HIGH — existing codebase read; host pipeline verified; capture trio verified; all integration points confirmed
- Pitfalls: HIGH — derived from code reading and API analysis; pitfalls 1, 2, 3, 5 are directly observable from the code
- React fiber walk: MEDIUM — internal API, not officially documented; community-sourced pattern

**Research date:** 2026-06-02
**Valid until:** 2026-07-02 (30 days for stable APIs; React fiber internals may shift but are unlikely to change without a major React version bump)
