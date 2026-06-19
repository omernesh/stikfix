# Phase 6: Region Capture + Visual Design + Persistent Pins — Research

**Researched:** 2026-06-03
**Domain:** Chrome MV3 extension — interactjs drag-marquee, shadow-DOM CSS, host CRUD, on-page pin rehydration
**Confidence:** HIGH (all critical claims verified against live codebase or official sources)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Pins sourced from disk — new `GET /annotations?url=<page-url>` reads `selector`, `rect`, `mode`, `status`, `text`, screenshot paths from each `.md`'s YAML frontmatter. Files are the single source of truth.
- **D-02:** Pin scoping by exact URL path, query string ignored (`/admin/users` matches regardless of `?tab=`).
- **D-03:** Note frontmatter must carry `url`, `mode`, `status`, and for element notes `selector` + page-absolute `rect`, and for free notes the stored viewport coords. Planner must confirm/extend frontmatter written by HOST-07/ELEM-09.
- **D-04:** Edit = overwrite in place. `PUT /annotation/<serial>` rewrites body, preserves frontmatter + screenshots, re-marks status `unread`.
- **D-05:** Delete = hard delete. `DELETE /annotation/<serial>` removes the `<serial>-*.md` AND its `+N.png` screenshots. Behind a confirm dialog. No soft-delete.
- **D-06:** Note id = leading serial (e.g. `0003`). Routes `PUT`/`DELETE /annotation/<serial>` resolve serial → file via glob `<serial>-*.md`. Both verbs token-gated and path-confined. 12 MB cap on PUT bodies. 404 when serial not found.
- **D-07:** Orphaned pin (selector matches nothing) → rendered greyed/dashed at last-known page-absolute rect. Never hidden. No heuristic re-anchoring.
- **D-08:** Both element-notes AND free-notes get persistent pins. Element pins anchor to stored selector, reposition on scroll/resize. Free pins float at stored viewport coords.
- **D-09:** Pins color-coded by mode + unread/read dot + hover preview. Exact styling is Claude's discretion.

### Claude's Discretion
- Exact pin glyph/size/badge treatment, scrim opacity, marquee min-drag threshold (CAM-03 already names ~6px), thumbnail strip layout, reposition throttling.
- Whether pin rehydration fetches once on review-entry or also re-syncs after each Send (must at minimum reflect a just-sent note as a new pin).

### Deferred Ideas (OUT OF SCOPE)
- Full-page scrolling region capture (FUT-02).
- Lightbox preview on thumbnail/pin click (FUT-05).
- Heuristic re-anchoring of orphaned pins.
- Pin clustering / off-screen indicators.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CAM-01 | Camera tool available on every note (free and element) | Add 📷 button to both card UIs; wire into existing card header |
| CAM-02 | Activating dims page with scrim, cursor = crosshair | Full-page div inside shadow root; `:host(.sfx-cam-mode) { cursor: crosshair }` pattern |
| CAM-03 | Drag rect via interact.js; sub-6px or Esc cancels | `interact(scrim).draggable()` with `pointerMoveTolerance(6)` |
| CAM-04 | On release: hide UI → waitTwoRafs → captureTab → cropToRect → restore | Exact same sequence as element-note `+1.png` path in `card.ts:587-609` |
| CAM-05 | Each crop = deletable thumbnail; multiple crops stack as +2, +3 | Thumbnail array state per card; × button per thumbnail |
| CAM-06 | Crops sent as PNG data-URLs; host writes `<base>+<N>.png` | Already implemented in `write-note.ts:174-185`; planner just must wire new screenshots into payload |
| UI-01 | Shadow DOM CSS isolation; px units | Already done; Phase 6 adds paper aesthetic without regressing isolation |
| UI-02 | Paper aesthetic: warm color, subtle shadow, legible type, smooth drag | CSS variables for paper tones in `styles.css`; no rem |
| UI-03 | Colored header strip per mode (free vs element) | `.sfx-card-header` background change per mode modifier class |
| UI-04 | Styled success/error toasts | `toast.ts` + `styles.css` already functional; Phase 6 upgrades aesthetics |
| PIN-01 | On Review Mode entry, fetch pins via `GET /annotations`, render one per note | New SW relay `SFX_LIST_ANNOTATIONS` → `GET /annotations?url=...` |
| PIN-02 | Element pins anchor to selector; free pins float at viewport coords | `document.querySelector(selector)` → `getBoundingClientRect()` for anchoring; scroll/resize listeners |
| PIN-03 | Orphaned pin greyed/dashed at last-known page-absolute rect | Try selector → fallback to stored rect if null; CSS `opacity:0.5; border-style:dashed` |
| PIN-04 | Mode color + unread/read dot; hover = note text preview | CSS modifier classes on pin element; tooltip via `textContent` |
| PIN-05 | Click pin opens card (view/edit/delete) | Re-use `openCard`/`openElementCard` entry points with a pre-populated read-only view state |
| PIN-06 | Edit via PUT, delete via DELETE; pin updates/disappears | New SW relays `SFX_EDIT_ANNOTATION`/`SFX_DELETE_ANNOTATION` |
| HOST-14 | `GET /annotations?url=...` — list notes by URL path match, read frontmatter | New `handleListAnnotations` route in `server.ts` |
| HOST-15 | `PUT /annotation/<serial>` — overwrite body in place, preserve frontmatter+screenshots | New `handleEditAnnotation` route; serial→glob resolution |
| HOST-16 | `DELETE /annotation/<serial>` — rm .md + +N.png; path-confined; 404 if not found | New `handleDeleteAnnotation` route |
</phase_requirements>

---

## Summary

Phase 6 is a three-axis enhancement that layers on top of a fully functional Phase 5 codebase. The three axes are independent in their host changes but converge at the extension's `review.content/index.ts` `onMount` lifecycle.

**Axis 1 — Region Capture (CAM-01→06):** The marquee workflow is mechanically identical to the element-note `+1.png` path already implemented in `card.ts:587-609`. The difference is that instead of a `captureElementContext` rect, the user drags a rectangle using `interact.js` on a full-page scrim. The scrim lives inside the shadow root; `interact(scrim).draggable()` with `pointerMoveTolerance(6)` plus a `dragend` handler triggers the existing `hide → waitTwoRafs → captureTab → cropToRect` trio. The marquee rect is computed in viewport-CSS coords (not page-absolute), matching the `cropToRect` input contract exactly. Resulting PNG data-URLs are appended to the card's screenshot array and displayed as deletable thumbnails.

**Axis 2 — Visual Design (UI-01→04):** The shadow-DOM isolation is already correct (`:host { all: initial; }`, `pointer-events: none`, px units throughout). Phase 6 replaces the neutral palette in `styles.css` with a warm paper aesthetic: cream background (`#fefce8`), colored header strips per mode, subtle shadow upgrades. No architecture changes — purely CSS. The critical constraint is that `rem` must never be introduced (host page `font-size` leaks in through `rem`), and the `all: initial` / popover UA override rules must be preserved exactly.

**Axis 3 — Persistent Pins (PIN-01→06, HOST-14/15/16):** Three new host routes are added to `createHostServer`. Three new `SFX_MSG` relay types are added to `background.ts`. On `onMount`, `index.ts` calls the list relay, receives pin descriptors, and mounts a `pin.ts` module that creates DOM elements inside the shadow root. Element pins call `document.querySelector(storedSelector)`, convert the live element's `getBoundingClientRect()` to page-absolute coords, and listen to `scroll`/`resize` to reposition. Free pins use stored viewport coords directly. Orphaned pins use stored page-absolute rect with visual differentiation.

**Critical frontmatter gap (D-03):** The current `buildFrontmatter` in `write-note.ts` does NOT persist viewport coords for free notes or page-absolute rect for element notes. Both are needed for pin reconstruction. The planner must add these to the frontmatter AND backfill the guard in `server.ts`'s payload validation.

**Primary recommendation:** Implement in four sequential waves: (0) frontmatter extension + new host CRUD routes + tests, (1) camera tool / marquee on existing cards, (2) visual design CSS pass, (3) pin rehydration + rendering. Waves 0 and 1 can be planned in parallel streams; wave 3 depends on wave 0.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Marquee rect drawing | Browser / Content Script | — | interact.js on a DOM scrim element inside shadow root |
| Tab capture + crop | Service Worker | — | `chrome.tabs.captureVisibleTab` is privileged; relay via SW (established invariant) |
| Thumbnail management | Browser / Content Script | — | In-memory state per card; no persistence until Send |
| Host CRUD (GET/PUT/DELETE) | Service Worker | Node.js Host | SW is sole HTTP client; host performs disk I/O |
| Frontmatter serialization | API / Backend (Node host) | — | `write-note.ts` owns this; `yaml` stringify |
| Frontmatter parsing (GET) | API / Backend (Node host) | — | New `read-note.ts` or inline in handler; `yaml.parse` |
| Pin rehydration fetch | Service Worker | — | SW relay; content script never fetches 127.0.0.1 |
| Pin DOM rendering | Browser / Content Script | — | Shadow root; vanilla DOM |
| Element pin anchoring | Browser / Content Script | — | `document.querySelector` + `getBoundingClientRect`; scroll/resize listeners |
| Pin view/edit/delete card | Browser / Content Script | Service Worker | Card DOM in content script; CRUD via SW relay |
| Shadow-DOM CSS isolation | Browser / Content Script | — | `:host { all: initial }` + `px` units; no leakage by design |

---

## Standard Stack

### Core (No New Packages)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `interactjs` | 1.10.27 (installed) | Drag-to-draw marquee on scrim + card drag | Already installed; `context: shadowRoot` option wires it into shadow DOM |
| `yaml` | 2.9.0 (installed) | Frontmatter parse (`yaml.parse`) for GET /annotations + existing stringify | `yaml.parse` verified working in Node: returns plain object |
| `@medv/finder` | 4.0.2 (installed) | Selector re-query for element pin anchoring | Already installed; `document.querySelector(selector)` in CS |
| `node:fs/promises` | Node built-in | readFile, readdir, rm (for DELETE) | No new imports |
| `node:path` | Node built-in | glob-like serial→file resolution via `readdirSync` + filter | Existing pattern in `serial.ts` |

**No new packages are required for Phase 6.** [VERIFIED: live package.json + node_modules inspection]

### Package Legitimacy Audit

> All packages used in Phase 6 are already installed and were audited in prior phases.

| Package | Registry | Age | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|
| interactjs@1.10.27 | npm | 10+ yrs | OK (Phase 4 audit) | Approved |
| yaml@2.9.0 | npm | 8+ yrs | OK (Phase 2 audit) | Approved |
| @medv/finder@4.0.2 | npm | 6+ yrs | OK (Phase 5 audit) | Approved |

**No new packages to audit.**

---

## Architecture Patterns

### System Architecture Diagram

```
User drag on page
        |
        v
[scrim div in shadow root]
        |  interact.js dragend
        v
[marquee.ts] -- rect (CSS viewport coords) -->
        |
        v
[setSfxVisibility(false)]
        |  waitTwoRafs
        v
[captureTab(tabId)] ---SFX_CAPTURE_TAB--> [SW: handleCaptureTab]
                                                    |
                                              captureVisibleTab
                                                    |
                                            <-- dataUrl --
        |
        v
[cropToRect(dataUrl, rect, dpr)] -- PNG data-URL -->
        |
        v
[card thumbnail strip]  { screenshots[]: [{kind:'+2', dataUrl}...] }
        |
        |  Send button
        v
[SFX_SEND_ANNOTATION] --> [SW: handleSendAnnotation] --> [POST /annotation]
                                                                    |
                                                            [write-note.ts]
                                                         buildFrontmatter (url, mode, rect, selector, viewport)
                                                         writeFile(.md + +N.png)
                                                                    |
                              <-- { ok, file, serial } ----------- +
        |
        v
[index.ts onMount: SFX_LIST_ANNOTATIONS]  ← also after each Send
        |
        v
[SW: handleListAnnotations] --> [GET /annotations?url=...]
                                            |
                                [host: glob notesDir, yaml.parse frontmatter]
                                            |
                             <-- [{serial, mode, status, selector, rect, text, screenshots}...]
        |
        v
[pin.ts: mountPins(container, pins)]
        ├─ element pin → document.querySelector(selector) → getBoundingClientRect() → position
        ├─ free pin → stored viewport coords
        └─ orphaned → stored page-absolute rect, greyed/dashed
        |
        | click pin
        v
[openPinCard(container, tabId, pin, showToastFn)]
        ├─ Edit → SFX_EDIT_ANNOTATION → SW → PUT /annotation/<serial>
        └─ Delete → confirm → SFX_DELETE_ANNOTATION → SW → DELETE /annotation/<serial>
```

### Recommended Project Structure (New Files Only)

```
lib/
├── marquee.ts           # Marquee draw + interact.js scrim setup (pure: coords only)
├── pin-position.ts      # computePinPosition(), matchesUrlPath() — pure, node:test-safe
├── test/
│   ├── marquee.test.ts       # rect math, DPR, threshold
│   ├── pin-position.test.ts  # URL matcher, pos math, orphaned fallback
│   └── url-match.test.ts     # (or inline in pin-position.test.ts)

host/src/
├── read-note.ts         # parseFrontmatter(), listAnnotations() — pure I/O helpers
├── test/
│   ├── read-note.test.ts     # URL path match, frontmatter round-trip
│   └── server.test.ts        # (extend) PUT, DELETE, GET /annotations routes

entrypoints/review.content/
├── marquee.ts           # Scrim UI + interact.js wiring (browser-bound)
├── pin.ts               # mountPins(), teardownPins(), openPinCard()
└── styles.css           # (extend) paper aesthetic + pin styles + scrim + cam-mode
```

### Pattern 1: Marquee Drag with interact.js inside Shadow Root

**What:** A full-page scrim element inside the shadow root hosts an `interact.js` draggable. The drag start position + drag end position give the viewport-CSS rect. `pointerMoveTolerance(6)` cancels sub-6px drags.

**Key insight:** `interact(element).draggable({ ... })` takes a direct element reference, not a CSS selector — this is the established pattern in `card.ts:195` and `fab.ts`. The `context` option (`interact(el, { context: shadowRoot })` for selector-based Interactables) is NOT needed when a direct element reference is used. [VERIFIED: live codebase `card.ts:195`, interactjs typings `index.d.ts:1005`]

**Why NOT `.resizable()` for the marquee:** `resizable` requires an existing element to resize. A marquee draws a new rect from scratch — `draggable` on the scrim with tracked `startX/startY` + `dx/dy` accumulation is cleaner and maps directly to `rect = { x: min(sx,ex), y: min(sy,ey), width: |dx|, height: |dy| }`.

**Scrim + marquee rect:**

```typescript
// Source: interactjs typings index.d.ts:1005 + card.ts:195 pattern [VERIFIED: live codebase]
// lib/marquee.ts — pure coordinate helpers

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

export const MARQUEE_MIN_PX = 6; // CAM-03 threshold

export function isBelowThreshold(rect: { width: number; height: number }): boolean {
  return rect.width < MARQUEE_MIN_PX && rect.height < MARQUEE_MIN_PX;
}
```

```typescript
// Source: card.ts:195 draggable pattern + picker.ts:75 container.classList pattern
// entrypoints/review.content/marquee.ts — browser-bound

import interact from 'interactjs';
import { buildMarqueeRect, isBelowThreshold } from '../../lib/marquee.js';

export function enterMarqueeMode(
  container: HTMLElement,
  onCapture: (rect: { x: number; y: number; width: number; height: number }) => void,
  onCancel: () => void
): () => void {
  const scrim = document.createElement('div');
  scrim.className = 'sfx-cam-scrim';
  const rectEl = document.createElement('div');
  rectEl.className = 'sfx-cam-rect';
  scrim.appendChild(rectEl);
  container.appendChild(scrim);
  container.classList.add('sfx-cam-mode');  // crosshair cursor on :host

  let startX = 0, startY = 0;

  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); cleanup(); onCancel(); }
  };
  document.addEventListener('keydown', escHandler, true);

  // Direct element reference — no context: shadowRoot needed [VERIFIED: card.ts:195]
  const interactable = interact(scrim).draggable({
    inertia: false,
    listeners: {
      start(event: Interact.DragEvent) {
        startX = event.clientX;
        startY = event.clientY;
        rectEl.style.display = 'block';
        rectEl.style.left = startX + 'px';
        rectEl.style.top = startY + 'px';
        rectEl.style.width = '0px';
        rectEl.style.height = '0px';
      },
      move(event: Interact.DragEvent) {
        const r = buildMarqueeRect(startX, startY, event.clientX, event.clientY);
        rectEl.style.left = r.x + 'px';
        rectEl.style.top = r.y + 'px';
        rectEl.style.width = r.width + 'px';
        rectEl.style.height = r.height + 'px';
      },
      end(event: Interact.DragEvent) {
        const r = buildMarqueeRect(startX, startY, event.clientX, event.clientY);
        cleanup();
        if (isBelowThreshold(r)) { onCancel(); return; }
        onCapture(r);
      },
    },
  });

  function cleanup() {
    document.removeEventListener('keydown', escHandler, true);
    interactable.unset();
    scrim.remove();
    container.classList.remove('sfx-cam-mode');
  }

  return cleanup;
}
```

**Coordinate contract:** The `event.clientX/Y` values from interact.js are viewport-CSS coordinates. `cropToRect` accepts CSS viewport coords (same as `getBoundingClientRect()` output). `computeCropCoords` applies DPR scaling. This is consistent with the existing element-note capture path. [VERIFIED: `lib/capture.ts:25-35`, `card.ts:587-609`]

**Scrim CSS:**

```css
/* Source: styles.css pattern; picker.ts crosshair precedent [VERIFIED: live styles.css:430] */
.sfx-cam-scrim {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);   /* Claude's discretion: opacity */
  pointer-events: auto;
  cursor: crosshair;
  z-index: 2;                         /* above shadow-root children, below chip at z-index:2147483647 */
}

.sfx-cam-rect {
  position: absolute;
  border: 2px solid #1d6ed8;
  background: rgba(29, 110, 216, 0.12);
  display: none;
  box-sizing: border-box;
  pointer-events: none;
}
```

### Pattern 2: Multi-Thumbnail Strip on Note Cards

**What:** A `screenshots` array lives in a card-scoped variable. Each camera capture appends to it. The thumbnail strip re-renders on mutation. Each thumbnail has a `×` delete button.

```typescript
// Source: existing card.ts screenshots: [] pattern [VERIFIED: card.ts:291]
// Thumbnail state (card-scoped, not module-level)
interface ThumbnailEntry { kind: string; dataUrl: string; }
const thumbnails: ThumbnailEntry[] = [];

// Append after successful crop:
thumbnails.push({ kind: `+${thumbnails.length + 1}`, dataUrl: croppedDataUrl });
renderThumbnails(thumbnailContainer, thumbnails);

// renderThumbnails — rebuild strip via createElement/textContent (INVARIANT C)
function renderThumbnails(container: HTMLElement, items: ThumbnailEntry[]): void {
  container.replaceChildren();  // clear
  items.forEach((t, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'sfx-thumb-wrap';
    const img = document.createElement('img');
    img.src = t.dataUrl;   // data-URL, no XSS risk; no textContent needed for src
    img.className = 'sfx-thumb-img';
    img.alt = t.kind;
    const del = document.createElement('button');
    del.className = 'sfx-thumb-del';
    del.textContent = '×';
    del.setAttribute('aria-label', `Remove screenshot ${i + 1}`);
    del.addEventListener('click', () => {
      items.splice(i, 1);
      // Re-number kinds
      items.forEach((item, j) => { item.kind = `+${j + 1}`; });
      renderThumbnails(container, items);
    });
    wrap.appendChild(img);
    wrap.appendChild(del);
    container.appendChild(wrap);
  });
}
```

**Send payload mapping (CAM-06):** The existing `write-note.ts` already decodes PNG data-URLs and writes `+N.png` files. [VERIFIED: `write-note.ts:171-185`] The only change needed is to pass the thumbnails array as `screenshots`:

```typescript
// card.ts _doSend: change screenshots field
screenshots: thumbnails.map(t => ({ kind: t.kind, mime: 'image/png', dataUrl: t.dataUrl }))
```

### Pattern 3: Host CRUD — Three New Routes

**What:** Three new async handler functions added to `server.ts`; three new `path.match` branches in `createHostServer`. All reuse existing `setCorsHeaders`, `checkToken`, `readBody`, `isInsideDir`.

**CORS extension required:** `setPreflightHeaders` currently allows `'GET, POST, OPTIONS'` and `'Content-Type, X-Stikfix-Token'`. Must add `PUT, DELETE` to the methods list. [VERIFIED: `server.ts:38`]

```typescript
// Source: server.ts:38 pattern [VERIFIED: live codebase]
// In setPreflightHeaders:
res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
```

**Serial → file resolution (HOST-14/15/16):** Glob pattern `<serial>-*.md` — read dir, filter by prefix:

```typescript
// Source: serial.ts:27-33 readdirSync pattern [VERIFIED: live codebase]
// host/src/read-note.ts
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export function resolveSerialFile(notesDir: string, serial: string): string | null {
  // serial is 4-digit zero-padded string from the URL path (e.g. '0003')
  // match both *.md and *.read.md (renames from the skill)
  const files = readdirSync(notesDir);
  const match = files.find(f => f.startsWith(serial + '-'));
  return match ? join(notesDir, match) : null;
}
```

**Path confinement (HOST-15/16):** The resolved absolute path must pass `isInsideDir(cfg.notesDir, resolvedPath)` before any read/write/rm. [VERIFIED: `security.ts:78-83`]

**GET /annotations — frontmatter parsing:**

```typescript
// Source: yaml 2.9.0 verified working [VERIFIED: live node -e test]
// host/src/read-note.ts
import { readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parse as yamlParse } from 'yaml';

export interface PinDescriptor {
  serial: string;
  mode: 'free' | 'element';
  status: string;
  url: string;
  text: string;
  selector?: string;
  rect?: { x: number; y: number; width: number; height: number };
  viewportCoords?: { x: number; y: number };
  screenshots: string[];
}

export function matchesUrlPath(noteUrl: string, pageUrl: string): boolean {
  try {
    const notePath = new URL(noteUrl).pathname;
    const pagePath = new URL(pageUrl).pathname;
    return notePath === pagePath;
  } catch {
    return false;
  }
}

export function listAnnotations(notesDir: string, pageUrl: string): PinDescriptor[] {
  const files = readdirSync(notesDir).filter(f => f.endsWith('.md'));
  const pins: PinDescriptor[] = [];
  for (const file of files) {
    const serial = file.slice(0, 4);  // leading 4-digit serial
    const content = readFileSync(join(notesDir, file), 'utf8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) continue;
    const fm = yamlParse(fmMatch[1]) as Record<string, unknown>;
    if (typeof fm['url'] !== 'string') continue;
    if (!matchesUrlPath(fm['url'], pageUrl)) continue;
    // Extract body text (everything after closing ---)
    const bodyStart = content.indexOf('---', 3) + 3;
    const text = content.slice(bodyStart).trim().split('\n')[0] ?? '';
    pins.push({
      serial,
      mode: (fm['mode'] as 'free' | 'element') ?? 'free',
      status: (fm['status'] as string) ?? 'unread',
      url: fm['url'],
      text,
      selector: fm['selector'] as string | undefined,
      rect: fm['rect'] as PinDescriptor['rect'],
      viewportCoords: fm['note_position'] as PinDescriptor['viewportCoords'], // canonical key: note_position (NOT viewport_coords)
      screenshots: (fm['screenshots'] as string[]) ?? [],
    });
  }
  return pins;
}
```

**PUT /annotation/<serial> — overwrite body in place:**

```typescript
// Source: write-note.ts readFile/writeFile pattern [VERIFIED: live codebase]
// The operation: read the existing file, keep the YAML frontmatter block, replace body.
// Re-mark status: unread in frontmatter (D-04).
export async function editNote(
  notesDir: string,
  serial: string,
  newComment: string,
  cfg: Config
): Promise<void> {
  const mdPath = resolveSerialFile(notesDir, serial);
  if (!mdPath) throw Object.assign(new Error('not found'), { statusCode: 404 });
  if (!isInsideDir(notesDir, mdPath)) throw Object.assign(new Error('forbidden'), { statusCode: 403 });

  const content = await readFile(mdPath, 'utf8');
  const fmMatch = content.match(/^(---\n[\s\S]*?\n---)\n/);
  if (!fmMatch) throw Object.assign(new Error('malformed note'), { statusCode: 400 });

  // Re-parse + update status
  const fm = yamlParse(fmMatch[1].replace(/^---\n/, '').replace(/\n---$/, '')) as Record<string, unknown>;
  fm['status'] = 'unread';
  const newFm = '---\n' + yamlStringify(fm) + '---\n';
  // Preserve screenshots section from existing body (screenshots lines start with ![)
  const bodyAfterFm = content.slice(fmMatch[0].length);
  const screenshotSection = bodyAfterFm.match(/(### Screenshots[\s\S]*)$/)?.[1] ?? '';
  const newBody = newComment + '\n' + (screenshotSection ? '\n' + screenshotSection : '');
  await writeFile(mdPath, newFm + newBody, 'utf8');
}
```

**DELETE /annotation/<serial>:**

```typescript
// Source: node:fs/promises rm [ASSUMED - standard Node API]
// Pattern: resolveSerialFile → isInsideDir → rm .md → glob +N.png → rm each
import { rm, readdir } from 'node:fs/promises';

export async function deleteNote(notesDir: string, serial: string): Promise<void> {
  const mdPath = resolveSerialFile(notesDir, serial);
  if (!mdPath) throw Object.assign(new Error('not found'), { statusCode: 404 });
  if (!isInsideDir(notesDir, mdPath)) throw Object.assign(new Error('forbidden'), { statusCode: 403 });

  const base = basename(mdPath, '.md').replace(/\.read$/, '');  // handle *.read.md
  const dir = await readdir(notesDir);
  const pngs = dir.filter(f => f.startsWith(base + '+') && f.endsWith('.png'));

  await rm(mdPath);
  for (const png of pngs) {
    const pngPath = join(notesDir, png);
    if (isInsideDir(notesDir, pngPath)) await rm(pngPath);
  }
}
```

### Pattern 4: Frontmatter Extension (D-03)

**Critical gap:** The existing `buildFrontmatter` in `write-note.ts` stores `url`, `mode`, `status`, `selector` (element only), but does NOT store:
- For element notes: page-absolute `rect` (needed for orphaned pin fallback)
- For free notes: viewport coords at Send time (needed for free pin floating position)

Both fields exist in the payload at Send time:
- `payload.element.rect` → page-absolute rect for element notes (already in `ElementContext.rect`) [VERIFIED: `host/src/types.ts:30-35`]
- For free notes: `payload.viewport.width` / `payload.viewport.height` are stored but not the actual note position. Free notes need their viewport coords stored. Since free notes have no element, the note's position defaults to the card's rendered position.

**Resolution (D-03 confirmed):**
- Element notes: add `rect` frontmatter field from `payload.element.rect` (already captured in ELEM-04, stored in `ElementContext.rect`)
- Free notes: the card doesn't know its own screen position at Send time (it's a fixed-position div, not tracked). Two options:
  1. Pass viewport offset from card's `getBoundingClientRect()` as part of payload (new payload field)
  2. Use a sensible default (e.g., center of viewport: `{ x: viewport.width/2, y: viewport.height/2 }`)

Option 1 is cleaner and aligns with D-03 ("stored viewport coords"). The `AnnotationPayload` needs a new optional field `notePosition?: { x: number; y: number }` for free notes. Planner must decide whether to add this field to the host's `types.ts` or derive a default.

**Updated frontmatter shape:**

```yaml
---
id: 3
created: 2026-06-03T10:00:00.000Z
mode: element          # or 'free'
url: https://example.com/admin/users
title: Admin - Users
viewport:
  width: 1440
  height: 900
  dpr: 2
selector: "#user-table > tbody > tr:nth-child(1)"   # element only
rect:                   # page-absolute rect (element) or null (free)
  x: 120
  y: 450
  width: 800
  height: 40
note_position:          # viewport coords of the note card (free only)
  x: 720
  y: 450
screenshots:
  - 0003-20260603-100000+1.png
status: unread
---
```

### Pattern 5: On-Page Pin Rendering

**What:** A `pin.ts` module creates one `div.sfx-pin` per note inside the shadow root. Element pins use `document.querySelector(selector)` (outside the shadow root, on the page) to get the anchor element, convert to page-absolute position. Free pins use stored viewport coords.

**Element pin positioning (scroll-aware):**

```typescript
// Source: picker.ts getBoundingClientRect pattern [VERIFIED: picker.ts]
function getElementPagePos(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return {
    x: r.left + window.scrollX,
    y: r.top + window.scrollY,
  };
}

function positionElementPin(pin: HTMLElement, el: Element): void {
  const pos = getElementPagePos(el);
  // Pins use position: absolute in the shadow root (which is position:fixed/full-screen)
  // Pin offset: top-left corner of element, offset by scroll
  pin.style.left = pos.x + 'px';
  pin.style.top = (pos.y - window.scrollY) + 'px';  // convert back to viewport for fixed positioning
  // Equivalently: use getBoundingClientRect directly for viewport-fixed position
}
```

**Simpler approach** (preferred): Since the shadow root host is `position: fixed; inset: 0` covering the full viewport, use `getBoundingClientRect()` directly for viewport-relative positioning and update on scroll:

```typescript
function repositionPin(pin: HTMLElement, el: Element): void {
  const r = el.getBoundingClientRect();
  pin.style.left = r.left + 'px';
  pin.style.top = r.top + 'px';
}

// Throttled scroll/resize handler
const onScrollResize = throttle(() => {
  for (const { pin, el } of elementPins) repositionPin(pin, el);
}, 100);  // ~10fps repositioning is sufficient
```

**Throttle helper (pure, inline):**

```typescript
function throttle<T extends unknown[]>(fn: (...args: T) => void, ms: number) {
  let last = 0;
  return (...args: T) => {
    const now = Date.now();
    if (now - last >= ms) { last = now; fn(...args); }
  };
}
```

**Orphaned pin (D-07):** When `document.querySelector(selector)` returns `null`, use stored `rect` (page-absolute) from frontmatter:

```typescript
if (!el) {
  // Orphaned: position at stored rect converted to viewport via scroll offset
  pin.style.left = (pin.data.rect.x - window.scrollX) + 'px';
  pin.style.top = (pin.data.rect.y - window.scrollY) + 'px';
  pin.classList.add('sfx-pin-orphaned');  // greyed/dashed CSS
}
```

**Hover preview (D-09):** Uses `textContent` on a tooltip child — note text is page-author-influenced, must never go through `innerHTML`. [VERIFIED: invariant from T-05-09]

### Pattern 6: New SW Relay Types

Three new message types added to `lib/types.ts` (side-effect-free module, same file as `SFX_CAPTURE_TAB`):

```typescript
// Source: lib/types.ts:78-86 SFX_CAPTURE_TAB pattern [VERIFIED: live codebase]
export const SFX_LIST_ANNOTATIONS  = 'SFX_LIST_ANNOTATIONS'  as const;
export const SFX_EDIT_ANNOTATION   = 'SFX_EDIT_ANNOTATION'   as const;
export const SFX_DELETE_ANNOTATION = 'SFX_DELETE_ANNOTATION' as const;

export interface MsgListAnnotations {
  type: typeof SFX_LIST_ANNOTATIONS;
  tabId: number;
  // pageUrl derived from chrome.tabs.get(tabId) in SW — NEVER from message body
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

**SW handler pattern (mirrors `handleSendAnnotation`):**

```typescript
// Source: background.ts:283-357 handleSendAnnotation [VERIFIED: live codebase]
async function handleListAnnotations(tabId: number): Promise<...> {
  const state = await loadStorageState();
  const tab = await chrome.tabs.get(tabId);   // derive URL, never trust message body
  if (!tab.url) return { ok: false, error: 'no tab url' };
  const origin = new URL(tab.url).origin;
  const host = resolveRoute(origin, state);
  if (!host || !host.token) return { ok: false, error: '...' };
  const resp = await fetch(
    `http://127.0.0.1:${host.port}/annotations?url=${encodeURIComponent(tab.url)}`,
    { headers: { 'X-Stikfix-Token': host.token } }
  );
  // ... parse + return pins
}
```

**IDOR guard for edit/delete:** The serial is passed from the content script but the URL (and therefore which host to route to) is derived from `chrome.tabs.get(tabId).url` in the SW — exactly the established anti-spoof pattern. The serial itself is not an IDOR risk because it only resolves within the path-confined `notesDir` of the legitimately routed host. [VERIFIED: `background.ts:541-556` IDOR guard pattern]

### Pattern 7: Visual Design (UI-01→04)

**Paper aesthetic CSS additions** (in `styles.css`, no new files):

```css
/* Source: styles.css existing patterns [VERIFIED: live codebase] */
/* Paper warm tones — free note */
#sfx-card { background: #fefce8; }  /* warm cream */
.sfx-card-header { background: #fde68a; border-bottom-color: #f59e0b; }  /* amber for free */

/* Element note — distinct color (UI-03) */
#sfx-card.sfx-card-element .sfx-card-header {
  background: #dbeafe;              /* light blue */
  border-bottom-color: #93c5fd;
}

/* Pin styles */
.sfx-pin { /* see Pin section below */ }
```

**No `rem` rule:** All units in `styles.css` are already `px`. Adding paper tones does not require `rem`. The `all: initial` on `:host` + `px` pattern is the hard constraint. [VERIFIED: live `styles.css` — zero `rem` occurrences]

**Shadow-DOM isolation verification method:** Load on a Tailwind-heavy page (`tailwindcss.com`) and a CSS-reset-heavy page (`meyerweb.com/eric/tools/css/reset/`). The `:host { all: initial }` rule already provides isolation — Phase 6 adds no new leakage risk. [ASSUMED — manual UAT step]

### Anti-Patterns to Avoid

- **`interact(selector, { context: shadowRoot })`** for scrim drag: using a CSS selector string would require the `context` option to scope into the shadow root. Using a **direct element reference** (`interact(scrimEl).draggable()`) avoids this entirely and is the established pattern in `card.ts:195`. [VERIFIED: card.ts:195]
- **`innerHTML` for pin tooltip/preview:** Note text is page-author-influenced. Must use `textContent` only — same invariant as picker label (T-05-05) and card ctx header (T-05-09). [VERIFIED: 05-SECURITY.md T-05-05]
- **`rm` without path confinement on DELETE:** The serial comes from a URL parameter — must resolve to absolute path and pass `isInsideDir(cfg.notesDir, resolvedPath)` before any `rm`. [VERIFIED: security.ts:78-83]
- **Trusting `pageUrl` from message body in SW:** For `handleListAnnotations`, `handleEditAnnotation`, `handleDeleteAnnotation`, the page URL MUST be derived from `chrome.tabs.get(tabId).url` — never from `msg.url`. Same anti-spoof invariant as `handleSendAnnotation`. [VERIFIED: background.ts:291]
- **Perturbing `getNextSerial` with PUT/DELETE:** `resolveSerialFile` uses `readdirSync` to find existing files — it does NOT call `getNextSerial` and does NOT need the serial lock. PUT/DELETE must not call `withSerialLock` / `getNextSerial`. [VERIFIED: serial.ts:27-36]
- **Scrim pointer-events blocking own UI:** The scrim must be inside the shadow root but below the chip/FAB in z-index, OR use `z-index` stacking within the shadow DOM carefully. The chip sits at `position: fixed` in the shadow root; the scrim should be behind it. [VERIFIED: styles.css z-index structure]
- **Free-note pin position at page center if no position persisted:** If `note_position` is missing from frontmatter (existing notes), default gracefully to a sensible position rather than crashing. The list endpoint should return `viewportCoords: undefined` (reading the canonical `fm['note_position']` key) and the pin renderer should fall back to a default corner position.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-to-draw marquee | Custom pointer event tracking | `interact(el).draggable()` (interactjs, already installed) | Handles pointer capture, touch, velocity; existing `card.ts` drag pattern is proven |
| DPR-correct crop | Custom canvas math | `computeCropCoords` + `cropToRect` from `lib/capture.ts` | Already unit-tested at DPR=1/1.25/2; Windows fractional DPR edge case handled |
| YAML frontmatter parse | String split heuristics | `yaml.parse` (already installed) | Handles colons in URLs and quotes in titles silently; proven in Phase 2 |
| Path traversal guard | Manual string check | `isInsideDir` from `security.ts` | Windows `path.sep` separator handled; regex bypass prevented |
| Token auth | HTTP basic / query param | `checkToken` from `security.ts` | Constant-time compare; already audited |
| Shadow-DOM CSS isolation | Manual attribute scoping | `:host { all: initial }` (already in `styles.css`) | Browser-native; zero leakage |
| Selector re-query for pin anchoring | Storing DOM refs | `document.querySelector(selector)` on each reposition | Stale DOM refs after navigation; fresh query is safer |

---

## Runtime State Inventory

> Omitted — Phase 6 is not a rename/refactor/migration phase.

---

## Common Pitfalls

### Pitfall 1: Scrim Captures Pointer Events from Existing UI

**What goes wrong:** The full-page scrim `pointer-events: auto` blocks all clicks to the chip, chip buttons, and connection indicator — user can't exit.

**Why it happens:** The scrim is `position: fixed; inset: 0` — it covers everything in the shadow root at the same z-level.

**How to avoid:** Either (a) the scrim is always behind the chip/FAB via explicit z-index layering, or (b) exit the marquee mode before any other interaction is processed. Option (a): give the scrim `z-index: 1` and chip/FAB `z-index: 2` within the shadow root. But since the shadow host is a single flat space, all fixed-position children paint in DOM order. Ensure scrim is appended to the container BEFORE chip/FAB, or give chip/FAB explicit `z-index` in CSS.

**Warning signs:** Chip Exit button stops responding during camera mode.

### Pitfall 2: interact.js `dragend` Not Firing on Esc Key Cancel

**What goes wrong:** Pressing Esc key during a drag leaves interact.js in an active state, no `end` event fires, scrim stays on screen.

**Why it happens:** Esc is a keyboard event; interact.js's `dragend` fires on pointer release, not keyboard.

**How to avoid:** Register a `keydown` listener on `document` with `capture: true` for `Escape`. In the handler: call `interactable.unset()` to stop interact.js, then clean up scrim and call `onCancel()`. [ASSUMED — browser behavior pattern]

### Pitfall 3: Frontmatter Not Extended for Existing Notes

**What goes wrong:** GET /annotations on existing Phase-4/5 notes returns `rect: undefined` and `note_position: undefined`. Orphaned pins have no fallback rect to render at.

**Why it happens:** `buildFrontmatter` doesn't persist `rect` or `note_position` yet.

**How to avoid:** Wave 0 plan MUST modify `buildFrontmatter` and the payload validation in `server.ts`. Planner must audit all frontmatter fields against the pin reconstruction spec. For existing notes without these fields, `listAnnotations` returns `null` for missing fields, and the pin renderer renders a best-effort pin at `{ x: 0, y: 0 }` or skips it.

### Pitfall 4: CORS not Extended for PUT/DELETE

**What goes wrong:** `PUT /annotation/<serial>` and `DELETE /annotation/<serial>` from the SW get CORS rejection on the OPTIONS preflight because `Access-Control-Allow-Methods` only lists `GET, POST, OPTIONS`.

**Why it happens:** The `setPreflightHeaders` function hardcodes the methods list.

**How to avoid:** Update `setPreflightHeaders` in `server.ts` to include `PUT, DELETE`. Also add `X-Stikfix-Token` to `Access-Control-Allow-Headers` (already there, keep it). [VERIFIED: server.ts:38]

### Pitfall 5: Serial → File Resolution Failing for `*.read.md` Files

**What goes wrong:** `resolveSerialFile(notesDir, '0001')` fails to find `0001-20260531-155402.read.md` because the glob `f.startsWith(serial + '-')` doesn't see the `.read.md` extension as a problem — it still matches.

**Correction:** `f.startsWith('0001-')` DOES match both `0001-ts.md` and `0001-ts.read.md` — no issue. The `basename(mdPath, '.md')` call in `deleteNote` strips `.md` but not `.read.md` — must use `basename(mdPath).replace(/\.read\.md$|\.md$/, '')` to get the base name for PNG glob. [ASSUMED — fs behavior]

### Pitfall 6: Pin Scroll Listener Leaking After Review Mode Exit

**What goes wrong:** Scroll/resize event listeners added by `pin.ts` continue firing after `ui.remove()` is called, causing TypeError on null container references.

**Why it happens:** `window.addEventListener` persists beyond component teardown.

**How to avoid:** `mountPins` returns a `teardown()` function that calls `window.removeEventListener` for scroll/resize. Call `teardown()` inside `onRemove` in `index.ts`. Mirror the `exitPickMode()` pattern. [VERIFIED: index.ts:96-103 onRemove pattern]

### Pitfall 7: `yaml.parse` Returns Unexpected Types for frontmatter Numbers

**What goes wrong:** `fm['id']` is a `number` in YAML (e.g., `id: 1`), but serial comparison uses zero-padded string (`'0001'`). If the pin descriptor uses `serial = String(fm['id'])` it gets `'1'` not `'0001'`.

**How to avoid:** Extract serial from filename, not from the `id` frontmatter field. `serial = file.slice(0, 4)` — the first 4 chars of the filename. [VERIFIED: write-note.ts:164-165 `padded = String(serial).padStart(4, '0')`]

### Pitfall 8: Card thumbnail `img.src = dataUrl` triggers CSP on some pages

**What goes wrong:** Setting `img.src` to a `data:image/png;base64,...` URL inside a shadow root on a page with `Content-Security-Policy: default-src 'self'` may be blocked.

**Why it happens:** Shadow DOM inherits the page's CSP (CSP applies to the document, not shadow roots). Data URLs may be blocked by strict `img-src` directives.

**How to avoid:** Use `img.src = URL.createObjectURL(blob)` with a Blob created from the base64 data — `object://` URLs are not governed by CSP `img-src`. Alternatively, accept the risk for v1 (dev tool, pages likely have permissive CSP). Flag as a Phase 8 hardening item. [ASSUMED — CSP behavior]

### Pitfall 9: `waitTwoRafs` During Marquee Capture Leaves Scrim Visible in Screenshot

**What goes wrong:** The sequence `setSfxVisibility(false) → waitTwoRafs → captureTab` is designed to hide the sfx UI before capture. But if the camera scrim is not explicitly hidden (it's part of the sfx UI), the scrim outline may appear in the screenshot.

**How to avoid:** `setSfxVisibility(false)` must also remove/hide the scrim before the rAF flush. Or: exit marquee mode (remove scrim) BEFORE hiding UI and capturing. The scrim teardown (`cleanup()`) in `enterMarqueeMode` already removes the scrim from the DOM. Sequence: `cleanup()` → `setSfxVisibility(false)` → `waitTwoRafs` → `captureTab` → `setSfxVisibility(true)`. [ASSUMED — same reasoning as T-05-13]

---

## Code Examples

### Existing Capture Trio (Composition Point for Region Capture)

```typescript
// Source: card.ts:587-609 element-note capture path [VERIFIED: live codebase]
// This EXACT sequence is reused for region capture, with marquee rect replacing elementCtx.rect

setSfxVisibility(false);           // hide all sfx UI
await waitTwoRafs();               // let browser composite
const dataUrl = await captureTab(tabId);  // SW relay → captureVisibleTab
const cropped = await cropToRect(dataUrl, marqueeRect, window.devicePixelRatio);
setSfxVisibility(true);            // restore
// cropped is the PNG data-URL to attach as a thumbnail
```

### URL Path Match (pure, node:test-able)

```typescript
// Source: new lib/pin-position.ts
// [ASSUMED - implementation pattern; URL.pathname is standard]
export function matchesUrlPath(noteUrl: string, pageUrl: string): boolean {
  try {
    return new URL(noteUrl).pathname === new URL(pageUrl).pathname;
  } catch { return false; }
}
// Tests: /foo matches /foo?bar=1, /foo does NOT match /foo/bar
```

### YAML Frontmatter Round-Trip

```typescript
// Source: write-note.ts:76-99 (write) + yaml.parse (read) [VERIFIED: live + node -e test]
import { stringify } from 'yaml';
import { parse } from 'yaml';

// Write: stringify(fm) → ---\n...\n---\n
// Read: parse(content between --- markers) → plain object

const raw = `id: 1\nurl: https://example.com/\nmode: free\nstatus: unread\n`;
const obj = parse(raw); // { id: 1, url: '...', mode: 'free', status: 'unread' }
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Static `content_scripts` | `registration: 'runtime'` (WXT) | Zero footprint on non-review pages |
| `html2canvas` | `captureVisibleTab` + canvas crop | Real pixels, CSP-safe |
| CSS in page context | Shadow DOM `:host { all: initial }` | Zero CSS bleed |
| Manual PNG file naming | `write-note.ts` serial + timestamp | Collision-free, chronological |

**Deprecated in this codebase:**
- Direct `fetch` from content script: forbidden by Chrome LNA; SW relay is the only path.
- `innerHTML` with page-derived content: zero occurrences enforced by T-05-01, T-05-05, T-05-09.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` + `node:assert/strict` (pure lib) + manual Chrome UAT (browser-bound) |
| Config file | `tsconfig.lib.json` (extend include) + `tsconfig.host.json` (extend include) |
| Quick run command | `npm run test:lib` |
| Full suite command | `npm run check` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File |
|--------|----------|-----------|-------------------|------|
| CAM-03 | `buildMarqueeRect` + `isBelowThreshold` — rect math, DPR, threshold | unit | `npm run test:lib` | ❌ Wave 0: `lib/test/marquee.test.ts` |
| PIN-01/02 | `matchesUrlPath` — exact path match, query ignored | unit | `npm run test:lib` | ❌ Wave 0: `lib/test/pin-position.test.ts` |
| PIN-02/03 | `computePinPosition(el, storedRect, orphaned)` — position math | unit | `npm run test:lib` | ❌ Wave 0: `lib/test/pin-position.test.ts` |
| HOST-14 | `listAnnotations` — reads frontmatter, path matches, serial extraction | unit | `npm test` | ❌ Wave 0: `host/test/read-note.test.ts` |
| HOST-15 | `editNote` — overwrites body, preserves frontmatter, re-marks unread | unit | `npm test` | ❌ Wave 0: `host/test/read-note.test.ts` |
| HOST-16 | `deleteNote` — removes .md + +N.png; 404 if not found; path-confined | unit | `npm test` | ❌ Wave 0: `host/test/read-note.test.ts` |
| HOST-14 | `GET /annotations?url=...` route — token gate, 200 + JSON, CORS | integration | `npm test` | ❌ Wave 0: extend `server.test.ts` |
| HOST-15 | `PUT /annotation/<serial>` route — 404 / 200 / 401 / path-confined | integration | `npm test` | ❌ Wave 0: extend `server.test.ts` |
| HOST-16 | `DELETE /annotation/<serial>` route — 404 / 200 / 401 | integration | `npm test` | ❌ Wave 0: extend `server.test.ts` |
| CAM-01..06 | Marquee UI, crop, thumbnail, Send with screenshot | manual | — Chrome runtime | Chrome UAT |
| UI-01..04 | Paper aesthetic, CSS isolation on Tailwind/reset page | manual | — visual | Chrome UAT |
| PIN-01..06 | Pin rendering, orphaned pin, click → card, edit, delete | manual | — Chrome runtime | Chrome UAT |

### Wave 0 Gaps

- [ ] `lib/marquee.ts` — `buildMarqueeRect`, `isBelowThreshold` (pure, node:test-safe)
- [ ] `lib/pin-position.ts` — `matchesUrlPath`, `computePinPosition` (pure, node:test-safe)
- [ ] `lib/test/marquee.test.ts` — rect math, sub-threshold, Esc scenario
- [ ] `lib/test/pin-position.test.ts` — URL path match (query ignored), element pin, free pin, orphaned fallback
- [ ] `host/src/read-note.ts` — `resolveSerialFile`, `listAnnotations`, `editNote`, `deleteNote`
- [ ] `host/test/read-note.test.ts` — unit tests for all four functions
- [ ] Extend `host/test/server.test.ts` — GET /annotations, PUT /annotation/:serial, DELETE /annotation/:serial routes
- [ ] Add `lib/marquee.ts` and `lib/pin-position.ts` to `tsconfig.lib.json` include + `npm run test:lib` invocation
- [ ] Add `host/test/read-note.test.ts` to `npm test` invocation

### Sampling Rate

- **After every task commit:** `npm run test:lib`
- **After every plan wave:** `npm run check`
- **Phase gate:** Full suite green + manual Chrome UAT (Success Criteria 1–6) before `/gsd:verify-work`

---

## Security Domain

### Applicable ASVS Categories (Level 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A (no user accounts) |
| V3 Session Management | no | N/A |
| V4 Access Control | yes | `checkToken` (timing-safe) for all mutating verbs |
| V5 Input Validation | yes | Serial format validation + `isInsideDir` path confinement |
| V6 Cryptography | no | Token already UUID; no new crypto surface |

### New Threat Register Seeds (extend 05-SECURITY.md invariants)

| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|-----------|
| T-06-01 | IDOR | `PUT`/`DELETE /annotation/<serial>` | mitigate | Serial resolves only inside `cfg.notesDir` (path-confinement via `isInsideDir`); SW derives URL from `chrome.tabs.get`, never message body |
| T-06-02 | Path traversal | Serial → file glob resolution | mitigate | `resolveSerialFile` returns only files in `notesDir`; absolute path confirmed via `isInsideDir` before any `rm`/`writeFile` |
| T-06-03 | DoS | `PUT /annotation/<serial>` body | mitigate | Existing `readBody` 12 MB cap reused verbatim (HOST-11 invariant) |
| T-06-04 | Info disclosure | `GET /annotations` lists all notes on a path | mitigate | Token-gated (same as POST); host only exposes to localhost; text field is user-authored (not page-scraped) |
| T-06-05 | Tampering (XSS) | Pin hover-preview `textContent` | mitigate | Pin text from frontmatter (user-authored); set via `textContent` only — never `innerHTML`; inherits T-05-05 invariant |
| T-06-06 | Spoofing | CS sends `serial` for wrong note to `SFX_EDIT_ANNOTATION` | mitigate | SW derives host from tab URL (not message body); serial resolves only within that host's `notesDir`; cannot reach another user's project |
| T-06-07 | Info disclosure | Marquee scrim captures own sfx UI in screenshot | mitigate | Exit marquee mode (remove scrim DOM) before `setSfxVisibility(false)` → `waitTwoRafs` → `captureTab` (Pitfall 9 / T-05-13 precedent) |
| T-06-08 | Supply chain | No new packages | accept | Phase 6 adds zero new npm dependencies |
| T-06-09 | DoS | Scrim pointer-events blocking exit | mitigate | Chip Exit button remains accessible (z-index layering within shadow root; scrim at z-index:1, chip at z-index:2 or DOM-order priority in top layer) |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Host build | ✓ | 25.8.1 (confirmed) | — |
| interactjs | Marquee drag | ✓ | 1.10.27 (installed) | Native pointer events fallback (Pitfall 2) |
| yaml | Frontmatter parse/write | ✓ | 2.9.0 (installed) | — |
| @medv/finder | Selector re-query | ✓ | 4.0.2 (installed) | `document.querySelector` with raw stored selector (it IS the raw selector) |

**No missing dependencies.**

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `interact(el).draggable()` on a direct element ref inside shadow root works without `context: shadowRoot` option | Marquee Pattern | If wrong: wrap with `interact(el, { context: shadowRoot })` — context is only needed for CSS selector strings per typings |
| A2 | Esc key during interact.js drag does not fire `dragend` — must handle via `keydown` listener | Pitfall 2 | If interact.js does fire `dragend` on Esc, cleanup runs twice — harmless due to idempotent `interactable.unset()` |
| A3 | `data:image/png;base64` src on `<img>` inside shadow DOM may be blocked by strict page CSP | Pitfall 8 | If blocked: switch to `URL.createObjectURL`; add to Phase 8 audit |
| A4 | `basename(mdPath).replace(/\.read\.md$|\.md$/, '')` correctly strips both extensions for PNG glob | Pitfall 5 | If wrong: PNG files not deleted on DELETE — easy to verify in `read-note.test.ts` |
| A5 | Free note viewport position must be explicitly persisted (new `note_position` payload field) vs. derived from viewport center | D-03 gap | If wrong: free pins always appear at viewport center — acceptable UX degradation, not a crash |
| A6 | The `setSfxVisibility` function already hides the entire shadow-root container | Pitfall 9 | Verify in `card.ts` — if it only hides the chip, must extend to also hide/remove scrim |

---

## Open Questions (RESOLVED)

1. **`setSfxVisibility` scope**
   - What we know: `card.ts:587` calls `setSfxVisibility(false)` before capture.
   - What was unclear: Whether this function sets `display:none` on the shadow host element (hiding everything) or just the card. If it hides only the card, the scrim would still be visible in the screenshot.
   - **RESOLVED:** The executor MUST exit marquee mode (remove the scrim DOM) FIRST, then call `setSfxVisibility(false)` → `waitTwoRafs` → `captureTab`, regardless of `setSfxVisibility`'s scope. Plan 06-02 Task 2 sequences `cleanup()` (scrim removal) before `setSfxVisibility`. This is also threat T-06-07 (own-UI leak) — the ordering is mandatory, not advisory.

2. **Free note pin position**
   - What we know: D-03 says "stored viewport coords" for free notes. The card has a CSS `position: fixed; bottom: 88px; right: 32px` initial position but is draggable.
   - What was unclear: Whether to read the card's actual drag-translated position at Send time, or use a fixed default.
   - **RESOLVED:** At Send time, read `card.getBoundingClientRect()` and include `{ x: rect.left, y: rect.top }` in the payload. **Canonical field name: `note_position`** (snake_case) in BOTH the payload, the YAML frontmatter written by `buildFrontmatter`, AND the field read by `listAnnotations` (`fm['note_position']`). Do NOT use `viewport_coords` anywhere — `note_position` is the single canonical name (resolves the prior write/read field-name mismatch).

3. **Pin rehydration timing: once on entry or also after each Send?**
   - What we know: CONTEXT.md says "must at minimum reflect a just-sent note as a new pin."
   - What was unclear: Whether to re-fetch all pins after each Send (simplest, one source of truth) or append just the new pin from the Send response.
   - **RESOLVED:** Re-fetch all pins after each Send (`teardownPins()` → `mountPins()`), guarded by `if (resolvedTabId !== null)`. One extra GET is negligible; it ensures pins reflect any external renames (*.read.md) between entry and Send.

---

## Sources

### Primary (HIGH confidence)
- Live codebase: `lib/capture.ts`, `lib/types.ts`, `host/src/server.ts`, `host/src/write-note.ts`, `host/src/security.ts`, `host/src/serial.ts`, `entrypoints/review.content/card.ts`, `entrypoints/review.content/index.ts`, `entrypoints/review.content/picker.ts`, `entrypoints/review.content/styles.css`, `lib/test/capture.test.ts` — all read directly
- `node_modules/interactjs/index.d.ts` + `node_modules/@interactjs/types/index.d.ts` — `context: Node` option verified at line 162; `(target: Target, options?: Options): Interactable` at line 1005
- `node_modules/interactjs/package.json` — version 1.10.27 confirmed
- `node_modules/yaml` — `yaml.parse` verified via `node -e` returning correct object from YAML string
- `.planning/phases/05-element-note-mode-rich-context-capture/05-SECURITY.md` — threat register style and invariants
- `.planning/phases/05-element-note-mode-rich-context-capture/05-VALIDATION.md` — node:test pattern
- `.planning/config.json` — `nyquist_validation: true` confirmed

### Secondary (MEDIUM confidence)
- `notes/0001-*.md`, `notes/0002-*.md` — real frontmatter inspected; confirmed `url`, `mode`, `status` present; confirmed `rect` and `note_position` ABSENT (D-03 gap verified)

### Tertiary (LOW / ASSUMED)
- Esc key during interact.js drag behavior (A2) — browser pointer event behavior, not verified in interact.js source
- CSP blocking data-URL img.src in shadow DOM (A3) — documented CSP behavior pattern
- `basename` extension stripping (A4) — standard Node.js path behavior

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified installed; no new deps required
- Architecture: HIGH — all patterns verified against live codebase
- Host CRUD routes: HIGH — direct code reading of server.ts, security.ts, serial.ts
- Marquee + shadow DOM: MEDIUM — interactjs typings verified; `context` option confirmed; actual runtime behavior in shadow root is ASSUMED to work with direct element ref (A1)
- Pitfalls: HIGH — sourced from direct code analysis + Phase 5 threat model
- Validation: HIGH — node:test pattern directly from existing test files

**Research date:** 2026-06-03
**Valid until:** 2026-07-03 (stable stack, 30-day horizon)
