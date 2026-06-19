# Phase 6: Region Capture + Visual Design + Persistent Pins — Pattern Map

**Mapped:** 2026-06-03
**Files analyzed:** 16 new/modified files
**Analogs found:** 16 / 16

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `lib/marquee.ts` | utility | transform | `lib/highlight-draw.ts` | exact (pure coord math, same DPR pattern) |
| `lib/pin-position.ts` | utility | transform | `lib/routing.ts` + `lib/capture.ts` | exact (pure, node:test-safe) |
| `lib/test/marquee.test.ts` | test | batch | `lib/test/highlight-draw.test.ts` | exact (node:test, mock pattern) |
| `lib/test/pin-position.test.ts` | test | batch | `lib/test/element-context.test.ts` | exact (node:test, pure unit) |
| `host/src/read-note.ts` | service | file-I/O | `host/src/write-note.ts` + `host/src/serial.ts` | role-match (same host disk I/O pattern) |
| `host/test/read-note.test.ts` | test | batch | `host/test/write-note.test.ts` | exact (tmpdir pattern, yaml parse) |
| `host/src/server.ts` (MOD) | middleware | request-response | `host/src/server.ts` itself (existing handleAnnotation) | exact (extend, same router structure) |
| `host/src/write-note.ts` (MOD) | service | file-I/O | `host/src/write-note.ts` itself (buildFrontmatter) | exact (extend, same yaml shape) |
| `entrypoints/review.content/marquee.ts` | component | event-driven | `entrypoints/review.content/picker.ts` | exact (overlay lifecycle, container/host guard) |
| `entrypoints/review.content/pin.ts` | component | event-driven | `entrypoints/review.content/picker.ts` + `chip.ts` + `card.ts` | exact (mount/teardown, scroll listener cleanup) |
| `entrypoints/review.content/card.ts` (MOD) | component | request-response | `entrypoints/review.content/card.ts` itself | exact (extend: thumbnail strip, camera button) |
| `entrypoints/review.content/index.ts` (MOD) | controller | event-driven | `entrypoints/review.content/index.ts` itself | exact (extend onMount/onRemove) |
| `entrypoints/background.ts` (MOD) | middleware | request-response | `entrypoints/background.ts` itself (handleSendAnnotation + handleCaptureTab) | exact (extend: three new SW relay handlers) |
| `lib/types.ts` (MOD) | config | — | `lib/types.ts` itself (SFX_CAPTURE_TAB block) | exact (extend: three new const + interfaces) |
| `tsconfig.lib.json` (MOD) | config | — | `tsconfig.lib.json` itself | exact (extend include array) |
| `tsconfig.host.json` (MOD) | config | — | `tsconfig.host.json` itself | exact (host/src + host/test glob already covers new files) |

---

## Pattern Assignments

### `lib/marquee.ts` (utility, transform)

**Analog:** `lib/highlight-draw.ts`

**Module doc + invariant comment** (lines 1-12 of highlight-draw.ts):
```typescript
/**
 * Canvas highlight box draw utility for stikfix.
 *
 * drawHighlightBox — pure, node:test-safe (no DOM/chrome at module level).
 * Takes a canvas element reference (passed in) — no document.createElement calls.
 *
 * INVARIANT: No top-level browser API access — all canvas operations are inside
 * the function body so this module imports cleanly under node:test.
 */
```
Copy this header comment pattern verbatim; replace content with marquee description. The invariant note ("no top-level browser API access") is the critical conformance marker for node:test.

**DPR math pattern** (lib/capture.ts lines 25-35):
```typescript
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
`buildMarqueeRect` does NOT need DPR — it works in CSS viewport coords. But `isBelowThreshold` mirrors the zero-dim guard in `highlight-draw.ts:38` (`if (w <= 0 || h <= 0) return`). Apply the same guard: `rect.width < MARQUEE_MIN_PX && rect.height < MARQUEE_MIN_PX`.

**Core pattern** (from RESEARCH.md Pattern 1):
```typescript
// lib/marquee.ts — pure, node:test-safe

export const MARQUEE_MIN_PX = 6; // CAM-03

export function buildMarqueeRect(
  startX: number, startY: number,
  endX: number,   endY: number
): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };
}

export function isBelowThreshold(rect: { width: number; height: number }): boolean {
  return rect.width < MARQUEE_MIN_PX && rect.height < MARQUEE_MIN_PX;
}
```

**No imports needed** — pure math, no dependencies. Contrast with `highlight-draw.ts` which also has zero imports.

---

### `lib/pin-position.ts` (utility, transform)

**Analog:** `lib/routing.ts` (pure URL logic pattern) + `lib/capture.ts` (coord math pattern)

**Module doc** — same invariant comment shape as `highlight-draw.ts`/`capture.ts`: "pure, node:test-safe (no DOM/chrome at module level)". The critical note: `matchesUrlPath` and `computePinPosition` must have no top-level `window`/`document`/`chrome` access.

**URL matching pattern** (RESEARCH.md Pattern 3 + `lib/routing.ts` URL.pathname precedent):
```typescript
// lib/pin-position.ts — pure, node:test-safe

export function matchesUrlPath(noteUrl: string, pageUrl: string): boolean {
  try {
    return new URL(noteUrl).pathname === new URL(pageUrl).pathname;
  } catch {
    return false;
  }
}
```

> **⚠ OVERRIDE (post plan-check revision — AUTHORITATIVE):** The signature and placement below were superseded. `computePinPosition` is now a **pure, DOM-free** function in `lib/pin-position.ts` (so Wave-3 pin math gets node:test coverage — Nyquist sampling continuity). It does **not** read `window` — the **caller** (`pin.ts`) passes `scrollX`/`scrollY` and the anchor rect as parameters. The 06-01 interfaces block + 06-VALIDATION.md are authoritative; the code block below is retained only as historical context.

**Final (authoritative) signature:**
```typescript
// lib/pin-position.ts — PURE, DOM-free (no window/document/chrome)
export function computePinPosition(
  anchorRect: { x: number; y: number; width: number; height: number } | null, // el.getBoundingClientRect(), passed by caller
  storedRect: { x: number; y: number; width: number; height: number } | undefined,
  scrollX: number,        // window.scrollX, passed by caller
  scrollY: number,        // window.scrollY, passed by caller
  orphaned: boolean,      // true when the selector re-query found nothing
): { left: number; top: number; orphaned: boolean } { /* element-anchored / free-floating / orphaned-at-last-known-rect math */ }
```
`pin.ts` (06-04) is the thin DOM glue: it supplies `el.getBoundingClientRect()` + `window.scrollX/scrollY` and renders the result. Canonical free-note position key in frontmatter is **`note_position`** (never `viewport_coords`).

<details><summary>Historical (superseded) browser-bound draft — do NOT implement</summary>

```typescript
export function computePinPosition(
  el: Element | null,
  storedRect: { x: number; y: number; width: number; height: number } | undefined,
): { x: number; y: number; orphaned: boolean } {
  if (el !== null) {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, orphaned: false };
  }
  if (storedRect) {
    return { x: storedRect.x - window.scrollX, y: storedRect.y - window.scrollY, orphaned: true };
  }
  return { x: 0, y: 0, orphaned: true };
}
```
</details>

**Decision (revised):** `lib/pin-position.ts` contains BOTH `matchesUrlPath` AND the pure `computePinPosition` (scroll offsets as params). `host/src/read-note.ts` IMPORTS `matchesUrlPath` (does not redefine it). `pin.ts` IMPORTS `computePinPosition`. All three are unit-tested under `node:test` per 06-VALIDATION.md.

---

### `lib/test/marquee.test.ts` (test, batch)

**Analog:** `lib/test/highlight-draw.test.ts`

**Imports pattern** (lines 1-17 of highlight-draw.test.ts):
```typescript
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { drawHighlightBox } from '../highlight-draw.js';
```
Copy this import shape exactly. Replace with `buildMarqueeRect`, `isBelowThreshold`, `MARQUEE_MIN_PX` from `'../marquee.js'`. No `beforeEach` needed (no stateful canvas mock for pure math).

**Test structure** (describe/test blocks from highlight-draw.test.ts):
```typescript
describe('buildMarqueeRect', () => {
  test('top-left drag direction', () => { ... });
  test('bottom-right drag direction', () => { ... });
  test('normalizes negative deltas', () => { ... });
  test('zero-size drag', () => { ... });
});

describe('isBelowThreshold', () => {
  test('returns true when both dims < MARQUEE_MIN_PX (6)', () => { ... });
  test('returns false when width >= MARQUEE_MIN_PX', () => { ... });
  test('returns false when height >= MARQUEE_MIN_PX', () => { ... });
});
```

**Assert pattern:** `assert.deepStrictEqual(result, expected)` for rect objects (same as `assert.deepStrictEqual(fillCall.args, [20, 40, 200, 100])` in highlight-draw.test.ts line 143).

---

### `lib/test/pin-position.test.ts` (test, batch)

**Analog:** `lib/test/element-context.test.ts`

**Imports pattern** (lines 1-25 of element-context.test.ts):
```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { matchesUrlPath } from '../pin-position.js';
```
No `beforeEach` — each test is self-contained.

**Test structure** (from RESEARCH.md Validation Architecture / CONTEXT.md D-02):
```typescript
describe('matchesUrlPath', () => {
  test('same path, no query → true', () => { ... });
  test('same path, different query → true (D-02)', () => { ... });
  test('different path → false', () => { ... });
  test('subpath not matched', () => { ... });
  test('malformed URL returns false', () => { ... });
  test('empty strings return false', () => { ... });
});
```

**Note on computePinPosition:** If `computePinPosition` is extracted as a DOM-free helper (receiving raw scroll values as parameters), it can be tested here using literal coords. Pattern from `capture.test.ts` lines 1-40 (tests `computeCropCoords` with raw number params — no DOM).

---

### `host/src/read-note.ts` (service, file-I/O)

**Analog:** `host/src/write-note.ts` + `host/src/serial.ts`

**Imports pattern** (write-note.ts lines 1-11):
```typescript
import { writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { stringify as yamlStringify } from 'yaml';
import type { AnnotationPayload } from './types.js';
```
For read-note.ts, replace with:
```typescript
import { readFileSync, readdirSync } from 'node:fs';
import { readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';
import { isInsideDir } from './security.js';
```

**Serial → file resolution pattern** (serial.ts lines 27-36 — readdirSync + prefix filter):
```typescript
// serial.ts:27-36 pattern — adapated for read-note.ts
import { readdirSync } from 'node:fs';

export function resolveSerialFile(notesDir: string, serial: string): string | null {
  // serial is e.g. '0003' — matches both '0003-*.md' and '0003-*.read.md'
  const files = readdirSync(notesDir);
  const match = files.find(f => f.startsWith(serial + '-'));
  return match ? join(notesDir, match) : null;
}
```
The `readdirSync` + `.find(f => f.startsWith(serial + '-'))` is directly from serial.ts lines 28-32. Note: `getNextSerial` uses `.map(f => f.match(/^(\d{4})-/))` — `resolveSerialFile` uses a simpler `startsWith` filter.

**Frontmatter parsing pattern** (write-note.test.ts lines 48-52 — the parseFrontmatter helper):
```typescript
// From write-note.test.ts:48-52 — the regex + yamlParse round-trip
function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  return yamlParse(match[1]) as Record<string, unknown>;
}
```
Use this same regex in `listAnnotations`. Serial extraction from filename: `file.slice(0, 4)` (from RESEARCH.md Pitfall 7 — never `String(fm['id'])` which loses zero-padding).

**Error-with-statusCode pattern** (security.ts / write-note.ts — Object.assign):
```typescript
// write-note.ts:42-46 pattern
throw Object.assign(
  new Error('not found'),
  { statusCode: 404 }
);
```
Use for `resolveSerialFile` returning null in `editNote`/`deleteNote`.

**Path confinement pattern** (security.ts lines 78-83):
```typescript
export function isInsideDir(root: string, target: string): boolean {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  return resolvedTarget === resolvedRoot ||
    resolvedTarget.startsWith(resolvedRoot + sep);
}
```
Call `isInsideDir(notesDir, resolvedPath)` after every `resolveSerialFile` in `editNote` and `deleteNote`. This is non-negotiable per T-06-02.

**PNG deletion pattern** (RESEARCH.md Pattern 3 deleteNote):
```typescript
// Base name strip for PNG glob — handle both *.md and *.read.md
const base = basename(mdPath).replace(/\.read\.md$|\.md$/, '');
const dir = await readdir(notesDir);
const pngs = dir.filter(f => f.startsWith(base + '+') && f.endsWith('.png'));
for (const png of pngs) {
  const pngPath = join(notesDir, png);
  if (isInsideDir(notesDir, pngPath)) await rm(pngPath);
}
```

---

### `host/test/read-note.test.ts` (test, batch)

**Analog:** `host/test/write-note.test.ts`

**Imports + tmpdir pattern** (write-note.test.ts lines 1-13):
```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as yamlParse } from 'yaml';
import { resolveSerialFile, listAnnotations, editNote, deleteNote } from '../src/read-note.js';
```

**Test lifecycle pattern** (write-note.test.ts lines 57-61):
```typescript
describe('resolveSerialFile', () => {
  let dir: string;
  test.before(() => { dir = mkdtempSync(join(tmpdir(), 'sfx-read-')); });
  test.after(() => { rmSync(dir, { recursive: true }); });
  // ...
});
```
Repeat `test.before`/`test.after` per `describe` block — each block creates and tears down its own tmpdir.

**YAML frontmatter fixture** (write-note.test.ts lines 48-52 `parseFrontmatter` helper):
Create a minimal `.md` fixture in the tmpdir using `writeFileSync`, with the full frontmatter shape (including `url`, `mode`, `status`, `selector`, `rect`). Tests then call `listAnnotations`, `editNote`, `deleteNote` against real disk files.

---

### `host/src/server.ts` (MOD, middleware, request-response)

**Analog:** `host/src/server.ts` — `handleAnnotation` (lines 66-137), `createHostServer` route table (lines 147-182)

**CORS extension** (server.ts line 37 — setPreflightHeaders):
```typescript
// BEFORE (line 37):
res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
// AFTER:
res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
```
This is the only change to `setPreflightHeaders`. `Access-Control-Allow-Headers` already includes `X-Stikfix-Token` — preserve it.

**Handler skeleton pattern** (handleAnnotation lines 66-137):
```typescript
async function handleListAnnotations(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  cfg: Config
): Promise<void> {
  setCorsHeaders(req, res);           // Pitfall 6: FIRST on every path

  if (!checkToken(req, cfg.token)) {  // HOST-05 token gate
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
    return;
  }
  // ... logic ...
}
```
All three new handlers (`handleListAnnotations`, `handleEditAnnotation`, `handleDeleteAnnotation`) follow this exact skeleton: `setCorsHeaders` first, `checkToken` second, then logic.

**Route table extension pattern** (createHostServer lines 148-181):
```typescript
// Add AFTER existing POST /annotation block, BEFORE 404:
if (method === 'GET' && path === '/annotations') {
  handleListAnnotations(req, res, cfg).catch(/* last-resort handler same as handleAnnotation */);
  return;
}

if (method === 'PUT' && path.startsWith('/annotation/')) {
  const serial = path.slice('/annotation/'.length);
  handleEditAnnotation(req, res, cfg, serial).catch(/* ... */);
  return;
}

if (method === 'DELETE' && path.startsWith('/annotation/')) {
  const serial = path.slice('/annotation/'.length);
  handleDeleteAnnotation(req, res, cfg, serial).catch(/* ... */);
  return;
}
```
The `path` variable already strips query string (line 151: `const path = (req.url ?? '/').split('?', 1)[0]`). GET /annotations query parsing: `new URL(req.url ?? '/', 'http://x').searchParams.get('url')`.

**Last-resort catch pattern** (server.ts lines 164-170):
```typescript
.catch((e: unknown) => {
  if (!res.headersSent) {
    setCorsHeaders(req, res);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: String(e) }));
  }
});
```
Apply to all three new handler invocations.

**Error status propagation pattern** (server.ts lines 128-136):
```typescript
const err = e as { statusCode?: number; message?: string };
const status = (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600)
  ? err.statusCode
  : 500;
res.writeHead(status, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ ok: false, error: err.message ?? 'internal error' }));
```
Use in all three new handlers' try/catch blocks — propagates `{ statusCode: 404 }` from `resolveSerialFile` returning null.

---

### `host/src/write-note.ts` (MOD, service, file-I/O)

**Analog:** `host/src/write-note.ts` — `buildFrontmatter` (lines 71-100)

**Frontmatter extension pattern** (buildFrontmatter lines 71-100):
```typescript
export function buildFrontmatter(
  payload: AnnotationPayload,
  serial: number,
  screenshotRelPaths: string[]
): string {
  const { mode, page, viewport, element } = payload;

  const fm: Record<string, unknown> = {
    id: serial,
    created: new Date().toISOString(),
    mode,
    url: page.url,
    title: page.title,
    viewport: { width: viewport.width, height: viewport.height, dpr: viewport.devicePixelRatio },
  };

  if (mode === 'element' && element) {
    if (element.selector) fm['selector'] = element.selector;
    if (element.reactComponent) fm['react_component'] = element.reactComponent;
    // D-03 EXTENSION: add page-absolute rect for orphaned pin fallback
    if (element.rect) fm['rect'] = element.rect;
  }

  // D-03 EXTENSION: add note_position for free notes (viewport coords at Send time)
  if (mode === 'free' && payload.notePosition) {
    fm['note_position'] = payload.notePosition;
  }

  fm['screenshots'] = screenshotRelPaths;
  fm['status'] = 'unread';

  return '---\n' + yamlStringify(fm) + '---\n';
}
```
Only two additions: `fm['rect']` for element mode, `fm['note_position']` for free mode. All existing fields preserved exactly.

**AnnotationPayload type extension:** The `AnnotationPayload` in `host/src/types.ts` must add `notePosition?: { x: number; y: number }`. The `rect` field on `ElementContext` already exists (host/src/types.ts line 30-35 per RESEARCH.md). No new required field — both are optional for backward compatibility.

---

### `entrypoints/review.content/marquee.ts` (component, event-driven)

**Analog:** `entrypoints/review.content/picker.ts`

**Shadow-host exclusion pattern** (picker.ts lines 54-57):
```typescript
// Resolve shadow HOST (picker.ts:54-57)
const rootNode = container.getRootNode();
const sfxHost: Element | null =
  rootNode instanceof ShadowRoot ? rootNode.host : null;
```
The marquee scrim does NOT need this guard (the scrim captures ALL pointer events by design — the shadow host exclusion is for the picker's mousemove, not needed here). But it IS needed if any pin click handlers are wired in this file.

**Lifecycle pattern** (picker.ts enterPickMode/exitPickMode structure):
```typescript
// picker.ts — enterPickMode/exitPickMode pattern
export function enterPickMode(container, onElementClick, onEsc): void {
  // Build overlay
  const overlay = container.ownerDocument.createElement('div');
  overlay.className = 'sfx-hover-highlight';
  container.appendChild(overlay);
  container.classList.add('sfx-pick-mode');  // CSS cursor on :host

  // Register listeners + store cleanup refs
  const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') { exitPickMode(); onEsc(); } };
  document.addEventListener('keydown', onKeyDown);
  _cleanupFns = [() => document.removeEventListener('keydown', onKeyDown)];
}

export function exitPickMode(): void {
  for (const fn of _cleanupFns) { fn(); }
  _cleanupFns = [];
  if (hoverOverlay?.parentElement) hoverOverlay.parentElement.removeChild(hoverOverlay);
  if (_container) _container.classList.remove('sfx-pick-mode');
  hoverOverlay = null; _container = null;
}
```
The `enterMarqueeMode` function returns a `cleanup()` function (not a separate `exitMarqueeMode`) — a slightly different shape than picker.ts, but the same: cleanup removes DOM node, removes event listeners, removes class. The returned cleanup approach from RESEARCH.md Pattern 1 is preferred.

**interact.js drag pattern** (card.ts lines 194-227):
```typescript
// card.ts:194-231 — interact on a direct element reference
interact(card).draggable({
  inertia: false,
  allowFrom: '.sfx-card-header',
  listeners: {
    start(event: Interact.DragEvent) { /* read initial transform */ },
    move(event: Interact.DragEvent) { cx += event.dx; cy += event.dy; /* translate */ },
  },
});
```
For the scrim, use the same `interact(scrimEl).draggable()` with direct element ref — NOT a CSS selector string (no `context: shadowRoot` needed). Track `startX/startY` at `dragstart` event, update the rect div in `dragmove`, trigger capture in `dragend`.

**Imports pattern** (card.ts line 21):
```typescript
import interact from 'interactjs';
import { buildMarqueeRect, isBelowThreshold } from '../../lib/marquee.js';
```

**createElement/textContent pattern** (picker.ts line 62-68):
```typescript
// ALL DOM construction via createElement — INVARIANT C (no innerHTML)
const overlay = container.ownerDocument.createElement('div');
overlay.className = 'sfx-cam-scrim';
container.appendChild(overlay);
```

---

### `entrypoints/review.content/pin.ts` (component, event-driven)

**Analog:** `entrypoints/review.content/picker.ts` (overlay mount/teardown pattern) + `entrypoints/review.content/card.ts` (SW relay, showToastFn pattern) + `entrypoints/review.content/chip.ts` (teardown via cleanup array)

**Module state pattern** (picker.ts lines 19-23 — module-level mutable, single session):
```typescript
// picker.ts module-level state pattern — adapt for pins
let _pinEls: Array<{ pin: HTMLElement; el: Element | null }> = [];
let _cleanupScrollResize: (() => void) | null = null;
let _container: HTMLElement | null = null;
```

**Scroll/resize teardown pattern** (picker.ts lines 138-143 + index.ts lines 95-103):
```typescript
// picker.ts cleanup array pattern
_cleanupFns = [
  () => document.removeEventListener('mousemove', onMouseMove),
  () => document.removeEventListener('click', onClick),
  () => document.removeEventListener('keydown', onKeyDown),
];

// index.ts onRemove (lines 95-103)
onRemove(elements) {
  if (elements?.container) {
    teardownChip(elements.container);
    closeCard();
    exitPickMode();  // ← teardownPins() call goes here in Phase 6
  }
}
```
`mountPins()` must return a teardown function OR `teardownPins()` must be a module-level export using the module-level cleanup state.

**Shadow-host exclusion for pin clicks** (picker.ts lines 54-57 + 111-117):
```typescript
// Pin click handler — exclude sfx-internal targets
const rootNode = container.getRootNode();
const sfxHost: Element | null =
  rootNode instanceof ShadowRoot ? rootNode.host : null;

pin.addEventListener('click', (e: MouseEvent) => {
  e.stopPropagation();
  const target = e.currentTarget as Element;
  if (target === container || container.contains(target)) return;    // not needed for pin click
  if (sfxHost !== null && (target === sfxHost || sfxHost.contains(target))) return;
  openPinCard(container, tabId, pinData, showToastFn);
});
```

**textContent-only pattern** (picker.ts lines 196-201 + toast.ts line 48):
```typescript
// picker.ts: hoverLabel.textContent = `${prefix} · ${w}×${h}`;
// toast.ts: msgSpan.textContent = msg.slice(0, 200);
// pin.ts — hover preview text:
preview.textContent = pin.text.slice(0, 200);
// pin.ts — orphaned tooltip (title attr, not innerHTML):
pin.title = 'Element not found on this page — click to view or delete';
```

**SW relay pattern** (card.ts lines 295-328 — the `_doSend` function):
```typescript
// card.ts _doSend SW relay (lines 295-328) — adapted for edit/delete
chrome.runtime.sendMessage(
  { type: SFX_EDIT_ANNOTATION, tabId, serial: pinData.serial, comment: newText },
  (resp: { ok: boolean; error?: string } | undefined) => {
    if (chrome.runtime.lastError || !resp) {
      showToastFn('Extension error: ' + (chrome.runtime.lastError?.message ?? 'no response'), true);
      // Restore controls so user can retry
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
      return;
    }
    if (resp.ok) {
      showToastFn('Note saved', false);
      // Update pin dot + preview
    } else {
      showToastFn(resp.error ?? 'Unknown error', true);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  }
);
```

**throttle pattern** (UI-SPEC Scroll/Resize Repositioning):
```typescript
// Simple timestamp-delta throttle — no lodash (matches project zero-dep philosophy)
let _lastRepos = 0;
const onScrollResize = () => {
  const now = Date.now();
  if (now - _lastRepos < 100) return;
  _lastRepos = now;
  repositionAllElementPins();
};
window.addEventListener('scroll', onScrollResize, { passive: true });
window.addEventListener('resize', onScrollResize);
```

**Imports pattern:**
```typescript
import { SFX_LIST_ANNOTATIONS, SFX_EDIT_ANNOTATION, SFX_DELETE_ANNOTATION } from '../../lib/types.js';
import { matchesUrlPath } from '../../lib/pin-position.js';
```

---

### `entrypoints/review.content/card.ts` (MOD, component, request-response)

**Analog:** `entrypoints/review.content/card.ts` itself

**Camera button insertion** — append to `.sfx-card-header` after existing header children. Pattern from card.ts `openElementCard` header construction (lines ~340-380):
```typescript
const camBtn = document.createElement('button');
camBtn.className = 'sfx-cam-btn';
camBtn.setAttribute('aria-label', 'Capture region');
camBtn.textContent = '📷';
header.appendChild(camBtn);  // last child of header → margin-left: auto pushes it right
```

**Thumbnail strip pattern** — `renderThumbnails` from RESEARCH.md Pattern 2:
```typescript
// In _doElementSend / _doSend (photo capture path):
const thumbnails: { kind: string; dataUrl: string }[] = [];
// After successful crop:
thumbnails.push({ kind: `+${thumbnails.length + 1}`, dataUrl: croppedDataUrl });
renderThumbnails(thumbStrip, thumbnails);
```
`replaceChildren()` + `createElement/textContent` pattern mirrors `showToast` body construction (toast.ts lines 25-65).

**Capture sequence pattern** (card.ts lines 586-627 — the EXACT sequence to reuse):
```typescript
// card.ts:586-627 — setSfxVisibility(false) → waitTwoRafs → captureTab → cropToRect → setSfxVisibility(true)
setSfxVisibility(false);           // hide all sfx UI (includes scrim if present)
await waitTwoRafs();               // compositing delay
const dataUrl = await captureTab(tabId);
const cropped = await cropToRect(dataUrl, marqueeRect, window.devicePixelRatio);
setSfxVisibility(true);
// → append to thumbnails array, call renderThumbnails
```
Sequence for marquee capture: `cleanup()` (remove scrim) FIRST, then `setSfxVisibility(false)`, then the existing trio. This ensures scrim is not in the screenshot (Pitfall 9).

**`setSfxVisibility` coverage** (card.ts lines 571-584):
```typescript
function setSfxVisibility(visible: boolean): void {
  const display = visible ? '' : 'none';
  if (activeCard) activeCard.style.display = display;
  const chip = container.querySelector<HTMLElement>('#sfx-chip');
  if (chip) chip.style.display = display;
  const fab = container.querySelector<HTMLElement>('#sfx-fab');
  if (fab) fab.style.display = display;
  const hoverOverlay = container.querySelector<HTMLElement>('.sfx-hover-highlight');
  if (hoverOverlay) hoverOverlay.style.display = display;
}
```
Phase 6 must NOT add the scrim to this function — the scrim is removed by `cleanup()` before `setSfxVisibility` is called.

---

### `entrypoints/review.content/index.ts` (MOD, controller, event-driven)

**Analog:** `entrypoints/review.content/index.ts` itself

**onMount extension pattern** (index.ts lines 41-93):
```typescript
onMount(container: HTMLElement) {
  const toast = (msg: string, isError: boolean) => showToast(container, msg, isError);
  let resolvedTabId: number | null = null;

  mountChip(container, () => ui.remove(), (el, reArm) => {
    // ... existing picker handler ...
  });

  getTabId()
    .then(tabId => {
      resolvedTabId = tabId;
      // ... existing FAB mount ...

      // PHASE 6 ADDITION: mount pins after tabId resolves
      mountPins(container, tabId, toast)
        .catch((err: unknown) => toast(`Could not load pins — ${String(err)}`, true));
    })
    .catch(() => { /* FAB skip behavior preserved */ });

  return { container };
},
```

**onRemove extension pattern** (index.ts lines 95-103):
```typescript
onRemove(elements) {
  if (elements?.container) {
    teardownChip(elements.container);
    closeCard();
    exitPickMode();
    teardownPins();    // PHASE 6 ADDITION — removes scroll/resize listeners
  }
}
```

**After-Send re-fetch pattern** — per RESEARCH.md Open Question 3 decision (re-fetch all pins after each Send). The `onSent` callback in `openElementCard` (index.ts line 64) is the hook. Add `mountPins` re-call (teardown existing, then mount fresh) inside `onSent`.

---

### `entrypoints/background.ts` (MOD, middleware, request-response)

**Analog:** `entrypoints/background.ts` — `handleSendAnnotation` (lines 283-357) + `handleCaptureTab` (lines 433-444)

**New handler skeleton** (mirroring handleSendAnnotation lines 283-357):
```typescript
// background.ts — new handler, mirrors handleSendAnnotation structure
async function handleListAnnotations(
  tabId: number
): Promise<{ ok: true; pins: PinDescriptor[] } | { ok: false; error: string }> {
  const state = await loadStorageState();           // Pitfall 1: re-read storage every call

  const tab = await chrome.tabs.get(tabId);         // anti-spoof: derive URL from tab, not message
  if (!tab.url) return { ok: false, error: 'Cannot determine tab URL' };
  const origin = new URL(tab.url).origin;

  const host = resolveRoute(origin, state);
  if (!host) return { ok: false, error: `No host mapped for origin: ${origin}` };
  if (!host.token) return { ok: false, error: `No token set for host "${host.name}"` };

  let resp: Response;
  try {
    resp = await fetch(
      `http://127.0.0.1:${host.port}/annotations?url=${encodeURIComponent(tab.url)}`,
      { headers: { 'X-Stikfix-Token': host.token } }
    );
  } catch (e: unknown) {
    return { ok: false, error: `Host unreachable: ${String(e)}` };
  }
  // ... parse + return
}
```

**IDOR guard pattern** (background.ts lines 541-556 — SFX_CAPTURE_TAB handler):
```typescript
// background.ts:541-556 — sender-binding guard
const reqTabId = (msg as MsgCaptureTab).tabId;
if (sender.tab?.id == null || sender.tab.id !== reqTabId) {
  sendResponse({ ok: false, error: 'forbidden' });
  return true;
}
```
For `SFX_EDIT_ANNOTATION` and `SFX_DELETE_ANNOTATION`, the same sender-tab binding applies. The content script's `tabId` is validated against `sender.tab.id` before routing. Serial itself is not path-traversal-risky (isInsideDir guards at host level) but the tabId IDOR guard must still be applied.

**onMessage switch extension** (background.ts lines 482-577):
```typescript
// Add three new cases before the `default:` fallthrough
case SFX_LIST_ANNOTATIONS:
  handleListAnnotations((msg as MsgListAnnotations).tabId)
    .then(sendResponse)
    .catch((err: unknown) => sendResponse({ ok: false, error: String(err) }));
  return true;

case SFX_EDIT_ANNOTATION: {
  const m = msg as MsgEditAnnotation;
  if (sender.tab?.id == null || sender.tab.id !== m.tabId) {
    sendResponse({ ok: false, error: 'forbidden' });
    return true;
  }
  handleEditAnnotation(m.tabId, m.serial, m.comment)
    .then(sendResponse)
    .catch((err: unknown) => sendResponse({ ok: false, error: String(err) }));
  return true;
}
// (same pattern for SFX_DELETE_ANNOTATION)
```
Every async case MUST `return true` — this is the Pitfall 2 invariant from background.ts comment at line 480.

**Imports extension** (background.ts lines 19-37):
```typescript
// Add to existing imports:
import { SFX_LIST_ANNOTATIONS, SFX_EDIT_ANNOTATION, SFX_DELETE_ANNOTATION } from '../lib/types.js';
import type { MsgListAnnotations, MsgEditAnnotation, MsgDeleteAnnotation } from '../lib/types.js';
```

---

### `lib/types.ts` (MOD, config)

**Analog:** `lib/types.ts` — `SFX_CAPTURE_TAB` block (lines 78-87)

**New const + interface pattern** (lines 78-87):
```typescript
// lib/types.ts — SFX_CAPTURE_TAB addition pattern (lines 78-87)
export const SFX_CAPTURE_TAB = 'SFX_CAPTURE_TAB' as const;

export interface MsgCaptureTab {
  type: typeof SFX_CAPTURE_TAB;
  tabId: number;
}
```
Add AFTER the existing `SFX_CAPTURE_TAB` block, using the same `as const` pattern:
```typescript
// Phase 6 additions — same side-effect-free constraint (comment from line 71-77)
export const SFX_LIST_ANNOTATIONS  = 'SFX_LIST_ANNOTATIONS'  as const;
export const SFX_EDIT_ANNOTATION   = 'SFX_EDIT_ANNOTATION'   as const;
export const SFX_DELETE_ANNOTATION = 'SFX_DELETE_ANNOTATION' as const;

export interface MsgListAnnotations {
  type: typeof SFX_LIST_ANNOTATIONS;
  tabId: number;
  // pageUrl derived from chrome.tabs.get(tabId) in SW — never from message body
}

export interface MsgEditAnnotation {
  type: typeof SFX_EDIT_ANNOTATION;
  tabId: number;
  serial: string;
  comment: string;
}

export interface MsgDeleteAnnotation {
  type: typeof SFX_DELETE_ANNOTATION;
  tabId: number;
  serial: string;
}
```

**Discriminated union extension** (lib/types.ts lines 130-137):
```typescript
// Add MsgListAnnotations | MsgEditAnnotation | MsgDeleteAnnotation to SfxMessage union
export type SfxMessage =
  | MsgEnterReview | MsgExitReview | MsgGetRoute | MsgSendAnnotation
  | MsgRefreshHosts | MsgAddHost | MsgRemoveHost
  | MsgListAnnotations | MsgEditAnnotation | MsgDeleteAnnotation;  // Phase 6
```

**Side-effect-free invariant** — The comment at lines 71-77 explains why these constants live in `types.ts` not `background.ts`. That invariant applies to Phase 6 additions equally.

---

### `tsconfig.lib.json` (MOD, config)

**Analog:** `tsconfig.lib.json` itself — `include` array (lines 13-21)

**Extension pattern** (current include lines 14-21):
```json
"include": [
  "lib/types.ts",
  "lib/routing.ts",
  "lib/discovery.ts",
  "lib/capture.ts",
  "lib/element-context.ts",
  "lib/highlight-draw.ts",
  "lib/test/**/*.ts",
  "entrypoints/review.content/card-state.ts"
]
```
Add `lib/marquee.ts` and `lib/pin-position.ts` to this include. The `lib/test/**/*.ts` glob already covers `marquee.test.ts` and `pin-position.test.ts` — no change needed for tests. Exclude remains `lib/storage.ts`.

**Result:**
```json
"include": [
  "lib/types.ts",
  "lib/routing.ts",
  "lib/discovery.ts",
  "lib/capture.ts",
  "lib/element-context.ts",
  "lib/highlight-draw.ts",
  "lib/marquee.ts",
  "lib/pin-position.ts",
  "lib/test/**/*.ts",
  "entrypoints/review.content/card-state.ts"
]
```

### `tsconfig.host.json` (MOD, config)

**No change required.** The `include: ["host/src/**/*.ts", "host/test/**/*.ts"]` glob already covers `host/src/read-note.ts` and `host/test/read-note.test.ts`. Verify before planning.

---

## Shared Patterns

### Authentication (All New Host Routes)
**Source:** `host/src/security.ts` — `checkToken` (lines 22-32)
**Apply to:** `handleListAnnotations`, `handleEditAnnotation`, `handleDeleteAnnotation` in `server.ts`
```typescript
if (!checkToken(req, cfg.token)) {
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
  return;
}
```

### Path Confinement (All File Operations in read-note.ts)
**Source:** `host/src/security.ts` — `isInsideDir` (lines 78-83)
**Apply to:** Every `resolveSerialFile` result in `editNote`, `deleteNote`, `listAnnotations`
```typescript
if (!isInsideDir(notesDir, resolvedPath)) {
  throw Object.assign(new Error('forbidden'), { statusCode: 403 });
}
```

### CORS Headers (All Response Paths)
**Source:** `host/src/server.ts` — `setCorsHeaders` (lines 26-30)
**Apply to:** All new route handlers — FIRST call in every handler before any `writeHead`/`end`
```typescript
function setCorsHeaders(req: http.IncomingMessage, res: http.ServerResponse): void {
  const origin = req.headers.origin ?? '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}
```

### textContent-Only DOM (All Content Script Files)
**Source:** `entrypoints/review.content/picker.ts` lines 196-201 + `toast.ts` line 48
**Apply to:** `pin.ts` (hover preview, orphaned tooltip), `card.ts` (thumbnail labels), all new DOM in `marquee.ts`
- Never use `innerHTML` with any page-derived or host-derived string
- Truncate at 200 chars before assignment: `el.textContent = text.slice(0, 200)`
- Exception: `img.src = dataUrl` is safe (data: URI, no XSS risk)

### SW Relay Pattern (All New Message Types)
**Source:** `entrypoints/background.ts` lines 482-577 (onMessage switch) + `card.ts` lines 295-328 (_doSend)
**Apply to:** `SFX_LIST_ANNOTATIONS`, `SFX_EDIT_ANNOTATION`, `SFX_DELETE_ANNOTATION` in both background.ts and pin.ts
- Background: `handler().then(sendResponse).catch(err => sendResponse({ ok: false, error: String(err) })); return true;`
- Content script: `chrome.runtime.sendMessage({ type, tabId, ... }, (resp) => { if (chrome.runtime.lastError || !resp) { ... } })`

### Anti-Spoof URL Derivation (All New SW Handlers)
**Source:** `entrypoints/background.ts` lines 290-295 (handleSendAnnotation)
**Apply to:** `handleListAnnotations`, `handleEditAnnotation`, `handleDeleteAnnotation`
```typescript
const tab = await chrome.tabs.get(tabId);          // derive URL from tab object
if (!tab.url) return { ok: false, error: '...' };  // never trust msg.url
const origin = new URL(tab.url).origin;
```

### Error-with-StatusCode (All Throwing Functions in read-note.ts)
**Source:** `host/src/write-note.ts` lines 42-46 + `host/src/security.ts` (Object.assign pattern)
**Apply to:** `resolveSerialFile` returning null in `editNote`/`deleteNote`, `isInsideDir` failing
```typescript
throw Object.assign(new Error('not found'), { statusCode: 404 });
throw Object.assign(new Error('forbidden'), { statusCode: 403 });
```

### createElement/textContent DOM Construction (All New UI Files)
**Source:** `entrypoints/review.content/picker.ts` lines 62-68 + `toast.ts` lines 25-65
**Apply to:** `marquee.ts` (scrim, rect div), `pin.ts` (pin elements, preview div), `card.ts` additions (cam button, thumbnail strip)
```typescript
// INVARIANT C — no innerHTML
const el = document.createElement('div');
el.className = 'sfx-pin';
// Text content ONLY for user/page-derived strings
el.textContent = text.slice(0, 200);
container.appendChild(el);
```

---

## No Analog Found

All files in Phase 6 have strong analogs in the existing codebase. No files lack a pattern reference.

---

## Metadata

**Analog search scope:** `/d/docker/stikfix/lib/`, `/d/docker/stikfix/host/src/`, `/d/docker/stikfix/host/test/`, `/d/docker/stikfix/entrypoints/review.content/`, `/d/docker/stikfix/entrypoints/background.ts`
**Files scanned:** 24 source files + 9 test files
**Pattern extraction date:** 2026-06-03
