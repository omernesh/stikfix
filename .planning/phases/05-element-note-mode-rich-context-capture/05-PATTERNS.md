# Phase 5: Element-Note Mode + Rich Context Capture — Pattern Map

**Mapped:** 2026-06-02
**Files analyzed:** 8 (3 new, 2 new test, 3 extended)
**Analogs found:** 8 / 8

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `entrypoints/review.content/picker.ts` | component / lifecycle | event-driven | `entrypoints/review.content/fab.ts` | role-match |
| `lib/element-context.ts` | utility (pure) | transform | `lib/capture.ts` | exact |
| `lib/highlight-draw.ts` | utility (pure) | transform | `lib/capture.ts` (`computeCropCoords`) | exact |
| `lib/test/element-context.test.ts` | test | — | `lib/test/capture.test.ts` | exact |
| `lib/test/highlight-draw.test.ts` | test | — | `lib/test/capture.test.ts` | exact |
| `entrypoints/review.content/card.ts` | component | request-response | itself (extend `openCard`) | self-extend |
| `entrypoints/review.content/chip.ts` | component | event-driven | itself (extend `mountChip`) | self-extend |
| `entrypoints/review.content/index.ts` | wiring / orchestration | event-driven | itself (extend `onMount`) | self-extend |

---

## Pattern Assignments

### `entrypoints/review.content/picker.ts` (component, event-driven)

**Analog:** `entrypoints/review.content/fab.ts`

**Imports pattern** (`fab.ts` lines 1–15 — no external imports; relies on WXT globals):
```typescript
// fab.ts has no import block — WXT injects globals (createShadowRootUi, defineContentScript)
// picker.ts similarly needs no imports beyond types; captureElementContext is called from card.ts,
// not from picker.ts itself.
// Pattern: picker.ts is a pure DOM/event module with NO chrome.* calls of its own.
```

**Module-level mutable state pattern** (`fab.ts` lines 68–75 — module-scope variables for drag state):
```typescript
// fab.ts:
let dragging = false;
let startPtrX = 0;
let startPtrY = 0;
// ...

// picker.ts mirrors this for pick-mode state:
let hoverOverlay: HTMLDivElement | null = null;
let hoverLabel: HTMLSpanElement | null = null;
let currentTarget: Element | null = null;
let _cleanupFns: Array<() => void> = [];
```

**Core event-listener lifecycle with cleanup** (`fab.ts` lines 88–157):
```typescript
// fab.ts: addEventListener + pointercancel cleanup in same scope
fab.addEventListener('pointerdown', (e: PointerEvent) => { ... });
fab.addEventListener('pointermove', (e: PointerEvent) => { ... });
fab.addEventListener('pointerup', (e: PointerEvent) => { ... });
fab.addEventListener('pointercancel', (e: PointerEvent) => {
  if (!dragging) return;
  dragging = false;
  try { fab.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
});
```
Picker uses `document.addEventListener` with stored cleanup refs (same teardown-registry pattern as `chip.ts` `teardownMap`).

**DOM build via createElement/textContent only** (`fab.ts` lines 29–38):
```typescript
const fab = document.createElement('button');
fab.id = 'sfx-fab';
fab.setAttribute('aria-label', 'Add note');
fab.setAttribute('aria-expanded', 'false');
const icon = document.createElement('span');
icon.className = 'sfx-fab-icon';
icon.textContent = '+';
fab.appendChild(icon);
container.appendChild(fab);
```
Picker overlay div follows the same pattern — `textContent` for label, NEVER `innerHTML`.

**rAF throttle pattern** (research `05-RESEARCH.md` Pattern 3 — mirrors `waitTwoRafs` rAF usage in `lib/capture.ts`):
```typescript
// lib/capture.ts lines 45-49:
export function waitTwoRafs(): Promise<void> {
  return new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );
}
// picker.ts mousemove handler throttles with a single rAF pending flag (not a Promise):
let rafPending = false;
const onMouseMove = (e: MouseEvent) => {
  if (!rafPending) {
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; updateOverlay(e.target as Element); });
  }
};
```

**Shadow host guard for event target** (`chip.ts` lines 444–457 — skip interactive controls):
```typescript
// chip.ts: skip button/select/input targets on pointerdown
const target = e.target as HTMLElement | null;
if (target && target.closest('button, select, input, option, a, textarea, .sfx-label-routed, .sfx-chip-dropdown')) {
  return;
}
// picker.ts: skip if target is inside the shadow container itself
// if (target === container || container.contains(target)) return;
```

---

### `lib/element-context.ts` (utility, pure, transform)

**Analog:** `lib/capture.ts`

**File header invariant comment** (`lib/capture.ts` lines 1–10):
```typescript
/**
 * Capture utilities for stickyfix.
 *
 * computeCropCoords — pure, node:test-safe (no DOM/chrome at module level).
 * waitTwoRafs, cropToRect, captureTab — browser-only, exercised in 04-03.
 *
 * INVARIANT: No top-level chrome / document / window access — all browser
 * API use is inside function bodies so computeCropCoords imports cleanly
 * under node:test.
 */
```
`lib/element-context.ts` must carry the same invariant comment: "No top-level chrome / document / window access — all browser API use is inside function bodies so exported functions import cleanly under node:test."

**Import pattern** (`lib/capture.ts` line 12 — import only from `./types.js`):
```typescript
import { SFX_CAPTURE_TAB } from './types.js';
```
`lib/element-context.ts` imports:
```typescript
import { finder, attr as defaultAttr } from '@medv/finder';
import type { ElementContext } from '../host/src/types.js';
```
Note: `ElementContext` is re-exported from `lib/types.ts` (`export type { ..., ElementContext, ... } from '../host/src/types.js'`), so the import can go through `lib/types.js` to match the established pattern.

**Named export pattern** (`lib/capture.ts` lines 25–35 — `export function` with JSDoc):
```typescript
/**
 * Convert a CSS-space rect to pixel-space canvas crop coordinates...
 * Math.round after DPR multiply is MANDATORY...
 */
export function computeCropCoords(
  rect: { x: number; y: number; width: number; height: number },
  dpr: number
): { sx: number; sy: number; sw: number; sh: number } { ... }
```
All exports in `element-context.ts` follow `export function` / `export const` — no default exports (consistent across all lib files).

**Pure-function guard pattern** (`lib/capture.ts` lines 62–86 — all DOM use inside function body):
```typescript
export function cropToRect(...): Promise<string> {
  return new Promise((resolve, reject) => {
    // DOM/Image usage is entirely inside the function body
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // ...
    };
  });
}
```
`captureElementContext` likewise accesses `window.getComputedStyle`, `getBoundingClientRect`, `el.outerHTML` only inside the function body — never at module top level.

**`try/catch` with fallback pattern** (`lib/capture.ts` lines 67–70 — zero-dim guard):
```typescript
if (sw <= 0 || sh <= 0) {
  reject(new Error(`Zero-dimension crop rect: ${sw}x${sh}...`));
  return;
}
```
`buildSelector` wraps `finder()` in try/catch, returns `el.tagName.toLowerCase()` fallback.

**`CURATED_STYLE_PROPS` export** (no direct analog — closest is the `SFX_MSG` const object in `lib/types.ts` lines 56–62):
```typescript
// lib/types.ts:
export const SFX_MSG = {
  ENTER_REVIEW: 'SFX_ENTER_REVIEW',
  // ...
} as const;
// element-context.ts mirrors:
export const CURATED_STYLE_PROPS = [
  'display', 'position', ...
] as const;
```

---

### `lib/highlight-draw.ts` (utility, pure, transform)

**Analog:** `lib/capture.ts` (specifically `computeCropCoords`)

**File structure** — single exported pure function with JSDoc (`lib/capture.ts` lines 25–35):
```typescript
/**
 * Convert a CSS-space rect to pixel-space canvas crop coordinates at the
 * given device pixel ratio.
 *
 * Math.round after DPR multiply is MANDATORY — Windows 125% DPR=1.25 produces
 * fractional pixels without it (PRD §7.3 / RESEARCH.md Pitfall 4).
 */
export function computeCropCoords(
  rect: { x: number; y: number; width: number; height: number },
  dpr: number
): { sx: number; sy: number; sw: number; sh: number } {
  return {
    sx: Math.round(rect.x * dpr),
    sy: Math.round(rect.y * dpr),
    sw: Math.round(rect.width * dpr),
    sh: Math.round(rect.height * dpr),
  };
}
```
`drawHighlightBox` has the same shape: pure function, `Math.round(coord * dpr)`, zero-dim guard before drawing.

**Zero-dim guard pattern** (`lib/capture.ts` lines 67–70):
```typescript
if (sw <= 0 || sh <= 0) {
  reject(new Error(...));
  return;
}
```
`drawHighlightBox` mirrors: `if (w <= 0 || h <= 0) return;` (early return, not reject, since the function is void).

**Header invariant comment** (`lib/capture.ts` lines 1–10 — "no top-level chrome / document / window"):
```typescript
// highlight-draw.ts header:
/**
 * drawHighlightBox — pure, node:test-safe (no DOM/chrome at module level).
 * Takes a canvas element reference (passed in) — no document.createElement calls.
 * INVARIANT: No top-level browser API access.
 */
```

---

### `lib/test/element-context.test.ts` (test)

**Analog:** `lib/test/capture.test.ts`

**Exact test file header** (`lib/test/capture.test.ts` lines 1–8):
```typescript
/**
 * node:test unit tests for lib/capture.ts
 *
 * Covers DPR=1/1.25/2 math for computeCropCoords (Success Criterion 4).
 * Zero chrome API surface — runs with plain node:test.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeCropCoords } from '../capture.js';   // .js extension — ESM node resolution
```
`element-context.test.ts` uses identical imports, `.js` extension, `node:assert/strict`.

**Imports with `.js` extension** (`lib/test/capture.test.ts` line 10):
```typescript
import { computeCropCoords } from '../capture.js';   // .js extension — ESM node resolution
```
`element-context.test.ts` must use:
```typescript
import { captureElementContext, buildContextSummary, CURATED_STYLE_PROPS } from '../element-context.js';
```

**`describe` + `test` structure** (`lib/test/capture.test.ts` lines 14–52):
```typescript
describe('computeCropCoords', () => {
  test('DPR=1 identity — no rounding needed', () => {
    const c = computeCropCoords(rect, 1);
    assert.deepStrictEqual(c, { sx: 10, sy: 20, sw: 100, sh: 50 });
  });
  // ...
});
```
`element-context.test.ts` uses `describe` per exported function, `test` per case, `assert.deepStrictEqual` / `assert.strictEqual`.

**`beforeEach` reset pattern** (`lib/test/card-state.test.ts` lines 13–16):
```typescript
beforeEach(() => {
  closeCardState();
});
```
`element-context.test.ts` imports `beforeEach` when a shared mock element is reset between tests.

**Mock object pattern for DOM elements** — no existing analog in codebase (greenfield). Use plain object literals implementing partial `Element`-like interface:
```typescript
// No existing codebase pattern — use RESEARCH.md guidance:
const mockEl = {
  tagName: 'BUTTON',
  id: 'save-btn',
  classList: { length: 1, 0: 'primary', [Symbol.iterator]: function*() { yield 'primary'; } },
  getAttribute: (name: string) => ({ role: 'button', 'aria-label': 'Save' }[name] ?? null),
  getBoundingClientRect: () => ({ x: 100, y: 200, width: 120, height: 40 }),
  // ... etc
} as unknown as Element;
```

---

### `lib/test/highlight-draw.test.ts` (test)

**Analog:** `lib/test/capture.test.ts`

**Exact same imports** (`lib/test/capture.test.ts` lines 8–10):
```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { drawHighlightBox } from '../highlight-draw.js';
```

**Mock canvas ctx pattern** (no existing analog — research pattern):
```typescript
// Recorded-call mock canvas context
const calls: Array<{ method: string; args: unknown[] }> = [];
const mockCtx = new Proxy({} as CanvasRenderingContext2D, {
  get(_t, prop) {
    if (prop === 'fillStyle' || prop === 'strokeStyle' || prop === 'lineWidth') {
      return undefined; // settable
    }
    return (...args: unknown[]) => { calls.push({ method: String(prop), args }); };
  },
  set(_t, prop, value) {
    calls.push({ method: `set:${String(prop)}`, args: [value] });
    return true;
  },
});
const mockCanvas = { getContext: () => mockCtx } as unknown as HTMLCanvasElement;
```

---

### `entrypoints/review.content/card.ts` — add `openElementCard` (self-extend)

**Analog:** `openCard` in `card.ts` (lines 63–226) — add a parallel exported function

**New import additions** (extend existing import block at lines 20–23):
```typescript
// Existing:
import interact from 'interactjs';
import { SFX_MSG } from '../../lib/types.js';
import type { AnnotationPayload } from '../../lib/types.js';
import { tryOpenCard, closeCardState } from './card-state.js';

// Add:
import { captureTab, waitTwoRafs } from '../../lib/capture.js';
import { drawHighlightBox } from '../../lib/highlight-draw.js';
import { buildContextSummary } from '../../lib/element-context.js';
import type { ElementContext } from '../../lib/types.js';
```
Note: card.ts currently has invariant "card.ts MUST NOT import lib/capture.ts (T-04-04 / D-06)". This invariant is for the **free** card. `openElementCard` IS the first consumer of `captureTab` — it must import capture. The invariant comment must be updated to clarify it applies to `openCard` / `_doSend` only.

**Function signature pattern** (`card.ts` lines 63–68 — `openCard` signature):
```typescript
export function openCard(
  container: HTMLElement,
  tabId: number,
  onDismiss: () => void,
  showToastFn: (msg: string, isError: boolean) => void
): void {
```
`openElementCard` mirrors this, adding `elementCtx: ElementContext`:
```typescript
export function openElementCard(
  container: HTMLElement,
  tabId: number,
  elementCtx: ElementContext,
  onDismiss: () => void,
  showToastFn: (msg: string, isError: boolean) => void
): void {
```

**Single-card guard** (`card.ts` lines 74–88 — `tryOpenCard()` / stale-state reset):
```typescript
const decision = tryOpenCard();
if (decision === 'focus-existing') {
  if (activeCard === null) {
    closeCardState();
    tryOpenCard();
  } else {
    const existing = activeCard.querySelector<HTMLTextAreaElement>('#sfx-card-textarea');
    existing?.focus();
    return;
  }
}
```
`openElementCard` uses the same guard unchanged.

**Read-only context header** — new DOM block inserted between `header` and `body` in the element card. Uses `textContent` only (INVARIANT C):
```typescript
const ctxHeader = document.createElement('div');
ctxHeader.className = 'sfx-card-ctx-header';
const ctxSummary = document.createElement('span');
ctxSummary.className = 'sfx-card-ctx-summary';
ctxSummary.textContent = buildContextSummary(elementCtx); // textContent — INVARIANT C
ctxHeader.appendChild(ctxSummary);
card.appendChild(ctxHeader);
// card.appendChild(body) follows
```

**Send in-flight sequence** (`card.ts` lines 267–323 — `_doSend` structure):
```typescript
function _doSend(textarea, sendBtn, cancelBtn, tabId, onDismiss, showToastFn): void {
  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending…';
  cancelBtn.disabled = true;
  textarea.readOnly = true;
  // assemble payload
  // chrome.runtime.sendMessage(SFX_MSG.SEND_ANNOTATION, ...)
}
```
`_doElementSend` mirrors the same shape; the difference is the async capture sequence inserted between "disable controls" and `sendMessage`. The full pattern:
```
1. sendBtn.disabled = true; sendBtn.textContent = 'Sending…'; cancelBtn.disabled = true; textarea.readOnly = true;
2. Hide all sfx surfaces (set display:'none' synchronously on card, chip, fab, hover overlay)
3. await waitTwoRafs()
4. const dataUrl = await captureTab(tabId)  [SW relay — SFX_CAPTURE_TAB]
5. canvas box-draw via drawHighlightBox(canvas, frozenRect, window.devicePixelRatio)
6. const plus1DataUrl = canvas.toDataURL('image/png')
7. Restore sfx surface visibility
8. Assemble mode:'element' AnnotationPayload with elementCtx + screenshots:[{kind:'+1',...}]
9. chrome.runtime.sendMessage(SFX_MSG.SEND_ANNOTATION, ...) → toast on ok/err
```

**SW relay response guard** (`card.ts` lines 294–303):
```typescript
if (chrome.runtime.lastError || !resp) {
  showToastFn(
    'Extension error: ' + (chrome.runtime.lastError?.message ?? 'no response'),
    true
  );
  sendBtn.disabled = false;
  sendBtn.textContent = 'Send';
  cancelBtn.disabled = false;
  textarea.readOnly = false;
  return;
}
```
Exact same pattern in `_doElementSend`, plus capture-fail branch restoring controls before the sendMessage call.

**interactjs drag** (`card.ts` lines 190–225 — copy identical block, only `allowFrom` and selector IDs differ):
```typescript
interact(card).draggable({
  inertia: false,
  allowFrom: '.sfx-card-header',
  modifiers: [
    interact.modifiers.restrictRect({
      restriction: () => ({ left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }),
      endOnly: false,
    }),
  ],
  listeners: {
    start(event) { /* read existing transform */ },
    move(event)  { /* cx += dx; translate */ },
  },
});
```

**Toast text pattern** (`card.ts` line 309 — `textContent` only):
```typescript
showToastFn(`wrote notes\\${resp.file}`, false);
```
`_doElementSend` reuses the same string literal pattern.

---

### `entrypoints/review.content/chip.ts` — add 🎯 picker button (self-extend)

**Analog:** Existing `sendBtn` construction in `chip.ts` (lines 133–138).

**Button construction pattern** (`chip.ts` lines 133–144):
```typescript
const sendBtn = document.createElement('button');
sendBtn.className = 'sfx-chip-btn sfx-btn-send';
sendBtn.textContent = 'Send';
sendBtn.setAttribute('aria-label', 'Send stub annotation (relay proof)');
chip.appendChild(sendBtn);
```
Picker button mirrors:
```typescript
const pickerBtn = document.createElement('button');
pickerBtn.className = 'sfx-chip-btn sfx-btn-picker';
pickerBtn.textContent = '🎯';
pickerBtn.setAttribute('aria-label', 'Pick element to annotate');
chip.appendChild(pickerBtn);  // insert before exitBtn
```

**getTabId export pattern** (`chip.ts` lines 527–542 — exported helper used by index.ts):
```typescript
export async function getTabId(): Promise<number> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: SFX_GET_TAB_ID }, (resp: unknown) => {
      if (chrome.runtime.lastError) { reject(...); return; }
      const r = resp as { tabId?: number } | null;
      if (r && typeof r.tabId === 'number') resolve(r.tabId);
      else reject(new Error('SW did not return tabId'));
    });
  });
}
```
Picker button click handler calls `onPickerClick()` callback (passed in from `index.ts`) — no new chrome.* calls inside chip.ts for picker logic.

**Teardown registry pattern** (`chip.ts` lines 68–72, 209–215):
```typescript
const teardownMap = new WeakMap<HTMLElement, () => void>();
// ...
teardownMap.set(container, () => {
  if (chip.parentElement) chip.parentElement.removeChild(chip);
});
```
Extend teardown to also call `exitPickMode()` if pick mode is active when the chip is torn down.

---

### `entrypoints/review.content/index.ts` — wire picker → openElementCard (self-extend)

**Analog:** `index.ts` lines 39–68 (existing `onMount` block)

**Existing wiring pattern** (`index.ts` lines 50–67):
```typescript
getTabId()
  .then(tabId => {
    const fab = mountFab(container, () => {
      fab.setAttribute('aria-expanded', 'true');
      openCard(container, tabId, () => {
        fab.setAttribute('aria-expanded', 'false');
      }, toast);
    });
  })
  .catch(() => { /* silently skip FAB */ });
```
Picker wiring follows the same `getTabId().then(tabId => ...)` resolved-once pattern. Inside the same `.then` block, add:
```typescript
// Wire picker button in chip — chip must export a new onPickerClick param or setter
// Picker entry point: enterPickMode(container, onElementClick, onEsc)
mountChip(container, () => ui.remove(), (onPickerClick) => {
  // onPickerClick is called by chip's picker button
});
// ...or pass a setter after mountChip returns, matching the fab pattern:
// setPickerClickHandler(container, () => {
//   enterPickMode(container, (el) => {
//     openElementCard(container, tabId, captureElementContext(el), () => {}, toast);
//   }, () => {});
// });
```
The exact wiring shape is at planner's discretion (the pattern is: resolve tabId once, pass all callbacks in `.then`).

**Import extension** (`index.ts` lines 14–18):
```typescript
// Existing:
import { mountChip, teardownChip, getTabId } from './chip.js';
import { mountFab } from './fab.js';
import { openCard, closeCard } from './card.js';
import { showToast } from './toast.js';
import { SFX_MSG } from '../../lib/types.js';

// Add:
import { enterPickMode, exitPickMode } from './picker.js';
import { openElementCard } from './card.js';  // already imported; add to destructure
import { captureElementContext } from '../../lib/element-context.js';
```

**`onRemove` cleanup pattern** (`index.ts` lines 73–79):
```typescript
onRemove(elements: { container: HTMLElement } | undefined) {
  if (elements?.container) {
    teardownChip(elements.container);
    closeCard();
  }
},
```
Extend to also call `exitPickMode()` (or picker's teardown if it uses a container-keyed registry like `teardownChip`).

---

## Shared Patterns

### INVARIANT C: DOM via `createElement`/`textContent` Only — No `innerHTML` with Page-Derived Strings

**Source:** `entrypoints/review.content/chip.ts` (header comment lines 1–16) and `card.ts` (header lines 1–18)

**Apply to:** `picker.ts` (hover label text), `card.ts` `openElementCard` (context header summary), any place element attributes or text land in the DOM.

```typescript
// CORRECT — chip.ts line 250:
label.textContent = `→ ${host.name} · ${host.notesDir}`;
// CORRECT — card.ts line 103:
headerLabel.textContent = 'Free note';

// FORBIDDEN (never):
// ctxHeader.innerHTML = `<span>${ctx.tag}</span>`;  // ctx.tag is page-controlled
```

### SW Relay Pattern: Never `captureVisibleTab` / Never Fetch Directly from Content Script

**Source:** `lib/capture.ts` lines 92–110 (`captureTab` function)

**Apply to:** `card.ts` `_doElementSend`, any capture flow

```typescript
// lib/capture.ts lines 96-110:
export function captureTab(tabId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: SFX_CAPTURE_TAB, tabId },
      (resp: { ok: true; dataUrl: string } | { ok: false; error: string } | undefined) => {
        if (chrome.runtime.lastError || !resp) {
          reject(new Error(chrome.runtime.lastError?.message ?? 'no response'));
          return;
        }
        if (resp.ok) resolve(resp.dataUrl);
        else reject(new Error(resp.error));
      }
    );
  });
}
```

### Message Types from `lib/types.ts` Only (Never from `background.ts`)

**Source:** `lib/types.ts` lines 74–79 (comment + constants)

**Apply to:** `card.ts` (extends), `picker.ts`, `index.ts` (extends)

```typescript
// lib/types.ts lines 67-79:
// They live HERE (a side-effect-free module) and NOT in background.ts: the
// content script imports these strings, and importing from background.ts would
// drag its top-level SW registrations into the content-script bundle...
export const SFX_SET_ROUTE = 'SFX_SET_ROUTE' as const;
export const SFX_GET_TAB_ID = 'SFX_GET_TAB_ID' as const;
export const SFX_CAPTURE_TAB = 'SFX_CAPTURE_TAB' as const;
```
No new message types needed for Phase 5 — `SFX_CAPTURE_TAB` and `SFX_MSG.SEND_ANNOTATION` are sufficient.

### No Silent Failures (REL-01)

**Source:** `card.ts` lines 294–303 — guard `chrome.runtime.lastError || !resp`

**Apply to:** `_doElementSend`, any new `sendMessage` call

```typescript
// card.ts lines 294-303:
if (chrome.runtime.lastError || !resp) {
  showToastFn(
    'Extension error: ' + (chrome.runtime.lastError?.message ?? 'no response'),
    true
  );
  sendBtn.disabled = false;
  sendBtn.textContent = 'Send';
  cancelBtn.disabled = false;
  textarea.readOnly = false;
  return;
}
```

### `node:test` Pure-Function Test Convention

**Source:** `lib/test/capture.test.ts` lines 1–10

**Apply to:** `lib/test/element-context.test.ts`, `lib/test/highlight-draw.test.ts`

```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { functionUnderTest } from '../module-name.js';  // .js extension mandatory — ESM NodeNext
```

### `tsconfig.lib.json` Include Extension

**Source:** `tsconfig.lib.json` lines 13–20

**Apply to:** Both new lib files must be added to `include`

```json
"include": [
  "lib/types.ts",
  "lib/routing.ts",
  "lib/discovery.ts",
  "lib/capture.ts",
  "lib/element-context.ts",    // ADD
  "lib/highlight-draw.ts",     // ADD
  "lib/test/**/*.ts",
  "entrypoints/review.content/card-state.ts"
],
```

### DPR-Correct Canvas Math (`Math.round` after multiply)

**Source:** `lib/capture.ts` lines 29–34

**Apply to:** `lib/highlight-draw.ts` `drawHighlightBox`

```typescript
// lib/capture.ts lines 29-34:
return {
  sx: Math.round(rect.x * dpr),
  sy: Math.round(rect.y * dpr),
  sw: Math.round(rect.width * dpr),
  sh: Math.round(rect.height * dpr),
};
// highlight-draw.ts mirrors:
const x = Math.round(rect.x * dpr);
const y = Math.round(rect.y * dpr);
const w = Math.round(rect.width * dpr);
const h = Math.round(rect.height * dpr);
```

### `AnnotationPayload` Field Names (Match Host Exactly)

**Source:** `host/src/types.ts` lines 39–53 + `lib/types.ts` line 10 (re-export)

**Apply to:** `card.ts` `_doElementSend` payload assembly

```typescript
// host/src/types.ts (the contract):
export interface AnnotationPayload {
  mode: 'free' | 'element';
  comment: string;
  page: { url: string; title: string; };
  viewport: { width: number; height: number; devicePixelRatio: number; };
  element?: ElementContext;
  screenshots?: Screenshot[];
}
// Screenshot.kind for the highlight: '+1' (string literal, not enum)
```

---

## No Analog Found

No files fall into this category. All 8 files have a strong analog or are self-extensions of existing files.

---

## Metadata

**Analog search scope:** `lib/`, `lib/test/`, `entrypoints/review.content/`, `host/src/`
**Files scanned:** 9 (`lib/capture.ts`, `lib/types.ts`, `lib/test/capture.test.ts`, `lib/test/card-state.test.ts`, `host/src/types.ts`, `entrypoints/review.content/card.ts`, `entrypoints/review.content/chip.ts`, `entrypoints/review.content/fab.ts`, `entrypoints/review.content/index.ts`, `tsconfig.lib.json`, `entrypoints/review.content/card-state.ts`)
**Pattern extraction date:** 2026-06-02
