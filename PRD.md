# stickyfix — Product Requirements Document

> **For the AI session executing this:** This PRD is written to be run **autonomously**. It contains everything you need — background, full architecture, exact specs, and an appendix with a verified architecture blueprint. Build the product described here. It is a **clean-room MIT implementation** — read §13 (Clean-room notice) before you start: you may use the blueprint in Appendix A for architectural knowledge, but you must **write original code and copy nothing** from the GPL upstream.

**Version:** 1.0 (initial)
**Owner:** Omer Nesher
**License of deliverable:** MIT
**Repo:** `omernesh/stickyfix` (public)
**Status:** Approved for build.

---

## 1. One-liner

A Chrome extension + tiny local host that let you pin **sticky notes** onto any web page — free-floating or anchored to a specific DOM element — and have each note written as a **markdown file** into your project's `notes/` folder, so an AI coding agent can read them, fix them, and iterate.

## 2. Background — why this exists

Today the UI review loop with an AI coding agent is painful **ping-pong**:

1. Developer runs the app in Chrome.
2. Takes a screenshot.
3. Pastes it into the AI chat.
4. Describes, in prose, which element is wrong and what to change.
5. AI guesses which element, makes a change.
6. Repeat — re-screenshot, re-describe.

The friction is: **the developer is the rendering pipeline and the context-transfer mechanism.** Every note requires a manual screenshot + a manual, error-prone description of *which thing* on screen they mean.

**stickyfix removes the human from that pipe.** The developer annotates *directly on the page*. When they click an element, the tool captures the exact selector, computed styles, outerHTML, bounding box, and a screenshot — so the AI knows precisely which element and in what state. Notes accumulate as markdown files in the repo. The AI reads the queue, fixes, and marks each note read. The developer reviews again and drops new notes. It's a **durable, file-based, iterative review loop** instead of ephemeral chat ping-pong.

This was conceived while iterating on a React admin panel (the `chatlytics.ai` project), but the tool is **product-agnostic** — it works on any web page in Chrome.

## 3. Goals & non-goals

### Goals
- G1. One-click **Review Mode** toggle on any page via a Chrome extension (MV3).
- G2. **Two note modes:** (a) free-floating note via a draggable `+` button; (b) element-anchored note via an element picker that auto-captures rich context.
- G3. Notes are written to disk as **`.md` files** in a user-chosen project folder, by a **localhost host** (Chrome extensions cannot write to arbitrary disk paths — the host is the bridge).
- G4. **Distinct, sortable file naming** (running serial + timestamp) so an AI agent can process notes in order and an unread/read distinction is trivial.
- G5. A shipped **`review-notes` AI skill** that reads unread notes, then renames each to `*.read.md` so re-runs skip processed notes.
- G6. **Local-only, private, zero-account.** No data leaves the machine. Host binds `127.0.0.1` only.
- G7. **Cross-platform build** (Windows/macOS/Linux) — no macOS-only build steps.
- G8. **Design-conscious sticky-note UI** — this is a visual tool; the post-it notes must look and feel polished (real styling, smooth drag, sensible z-index, no layout-breaking).

### Non-goals (v1)
- NG1. No cloud sync, no multi-user, no accounts, no remote backend.
- NG2. No deep integration with a specific AI agent's API — the contract is **files on disk**. Any agent that can read a folder works.
- NG3. No full-page (scrolling) screenshot in v1 — visible-viewport capture is enough.
- NG4. No Firefox/Safari port in v1 (Chrome/Chromium MV3 only). Keep the code port-friendly but don't build it.
- NG5. No shadow-DOM deep traversal in v1 (capture best-effort; note the limitation).

## 4. Users
- **Primary:** a developer using an AI coding agent (Claude Code, etc.) to build/refine a web UI, who wants to flag visual issues precisely and iteratively.
- **Secondary:** designers/QA doing visual review who want their feedback to land as structured, actionable files in the repo.

## 5. How it works (UX walkthrough)

### 5.1 Setup (once)
1. `npm run host -- --root <path-to-project>` starts the local host. It prints: the **port** it bound, a **pairing token**, and the **notes directory** (defaults to `<root>/notes`).
2. Load the unpacked extension in Chrome (`chrome://extensions` → Load unpacked → `dist/`).
3. Click the extension icon → paste the **pairing token** (and confirm the detected host). This is stored in `chrome.storage.local`.

### 5.2 Review session
1. Navigate to the page you want to review (e.g. `http://localhost:5173` or `https://app.chatlytics.ai`).
2. Click the extension icon → **Enter Review Mode**. A small connection chip appears confirming "Connected → saving to `<notesDir>`". The chip is **draggable** (so it never blocks what you need to click).
3. The review toolbar shows two tools:
   - **`+` (Free note):** click it → a **post-it note** opens wherever convenient. Type your note. **Send.** Captures: url, page title, timestamp, viewport, and a visible-tab screenshot. The `+` button itself is **draggable** so it can be moved out of the way.
   - **🎯 (Element note):** click it → cursor enters **pick mode**; hovering highlights the element under the cursor with an outline + a small label (tag + size). Click an element → a post-it opens **pre-populated** with the captured element context (shown as a compact summary; full detail goes into the file). Type your note. **Send.**
4. Each **Send** POSTs the note to the host, which writes a `.md` file (and a screenshot `.png` if present) into the notes folder. A brief toast confirms the filename.
5. Keep dropping notes. Exit Review Mode when done (toggle off, or close the tab).

### 5.3 The fix loop
1. In your AI coding session, say **"read my notes"** (or run the `review-notes` skill).
2. The agent reads every unread note (`notes/*.md` excluding `*.read.md`), in serial order, fixes each, and **renames** each processed file to `*.read.md`.
3. You re-review the app, drop new notes — only the new ones are unread, so the next "read my notes" picks up exactly where you left off.

## 6. Architecture

Two components + the filesystem as the contract.

```
┌─────────────────────────────┐         POST /annotation              ┌──────────────────────────┐
│  Chrome Extension (MV3)      │   (token-authed, JSON over HTTP)      │  stickyfix-host          │
│  - service worker (bg)       │ ───────────────────────────────────► │  Node HTTP server        │
│  - injected review UI        │                                       │  binds 127.0.0.1 only    │
│    · connection chip (drag)  │   GET /status  (discovery + notesDir) │  port range 39240-39260  │
│    · `+` free-note (drag)    │ ◄──────────────────────────────────── │                          │
│    · 🎯 element picker        │                                       │  writes:                 │
│  - capture: selector,        │                                       │   notes/NNNN-<ts>.md     │
│    computed styles, outerHTML│                                       │   notes/<base>+N.png     │
│    rect, react fiber, a11y   │                                       │  assigns running serial  │
└─────────────────────────────┘                                       └──────────────────────────┘
                                                                                    │
                                                                       AI agent reads notes/*.md
                                                                       (review-notes skill) →
                                                                       renames processed → *.read.md
```

**Why a host?** MV3 extensions are sandboxed and cannot write to arbitrary filesystem paths. The File System Access API requires a per-session permission re-grant (friction in an iterative loop) and can't target an exact server path silently. A tiny localhost host owns the notes directory, assigns serials atomically, validates paths, and writes files — this is the chosen approach (path "A" from design discussion).

## 7. Component spec — Chrome Extension (MV3)

### 7.1 Manifest
- `manifest_version: 3`.
- `permissions`: `["activeTab", "scripting", "storage", "tabs"]`.
- `host_permissions`: `["http://127.0.0.1/*", "http://localhost/*"]`.
- `optional_host_permissions`: `["<all_urls>"]` — request page access on demand per-origin when the user enters Review Mode (don't hold blanket all-urls).
- `background`: `{ service_worker, type: "module" }`.
- **No static `content_scripts`** — inject the review UI dynamically with `chrome.scripting.executeScript` only when Review Mode is entered, to keep zero footprint on pages otherwise.
- Action (toolbar) popup: small panel for token entry, host status, and the Enter/Exit Review Mode toggle.
- Commit **PNG icons** (16/32/48/128) to the repo. **Do not** generate icons with a macOS-only tool (`sips`) — that breaks cross-platform builds.

### 7.2 Review-mode UI (injected)
- **Connection chip:** small pill, top-right by default, `z-index: 2147483647`, shows connection state + target notes dir. **Draggable** (pointer events, viewport-clamped). Has an Exit button.
- **`+` free-note tool:** a draggable floating action button. Click → opens a **post-it note card** (textarea + Send/Cancel). The post-it itself is draggable. Multiple can't be open at once (keep it simple: one active note card).
- **🎯 element-picker tool:** toggles pick mode. While active: a highlight overlay follows the cursor (outline + label `tag · WxH`). `Esc` cancels pick mode. Click selects → opens the post-it pre-filled with a context summary.
- **📷 camera tool (in the post-it toolbar):** manual region capture, available on **every** note (free and element). Clicking it **dims the page** with a translucent scrim and switches the cursor to a **crosshair (`+`)**. The user **drags a rectangle** over the relevant area; on release, stickyfix **hides its own UI** (scrim, note card, chip, highlight), captures the visible tab, **crops to the dragged rect (DPR-corrected)**, restores the UI, and **attaches the crop to the note as a small thumbnail**. Each thumbnail has an **`×`** to delete it before Send. Multiple captures stack as thumbnails. **`Esc`** (or a sub-threshold drag, < ~6px) cancels without capturing. Optional nicety: clicking a thumbnail opens a lightbox preview. See §7.3 for capture mechanics + naming.
- **Post-it visual design (G8):** genuine sticky-note aesthetic — warm paper color, subtle shadow/peel, legible type, a colored header strip indicating mode (free = one color, element = another). Smooth drag. This is a design-conscious tool; invest in the look. Use the `frontend-design` skill's principles. Avoid generic "AI slop" styling.

### 7.3 Element capture (the differentiator)
On element click, capture into a structured object:
- `selector` — a **robust, unique CSS selector**. Use **[`@medv/finder`](https://github.com/antonmedv/finder)** (MIT) — do not hand-roll a fragile heuristic. (`@medv/finder` is the chosen lib; bundle it.)
- `tag`, `id`, `classList` (array), `name`, `type`, `href` (where present).
- `role` (explicit `role` attr, else inferred from tag), `ariaLabel`, other `aria-*`.
- `text` — `innerText` collapsed, truncated to ~1000 chars (note truncation in the file).
- `rect` — `getBoundingClientRect()` rounded `{x,y,width,height}` + page-absolute coords.
- `computedStyles` — a **curated set** captured via `getComputedStyle` (NOT all ~350 props). Curated list: `display, position, width, height, margin, padding, border, color, backgroundColor, font (family/size/weight/lineHeight), textAlign, flex/grid essentials (flexDirection, justifyContent, alignItems, gap), zIndex, opacity, overflow, boxShadow, borderRadius`. Make the list a single config constant so it's easy to extend.
- `outerHTML` — truncated to ~2000 chars (note truncation).
- `dataset` — all `data-*` attributes.
- `reactComponent` — best-effort: detect the React fiber on the DOM node (`__reactFiber$*` / `_reactInternals`) and walk up to the nearest **named** component; record its display name. If not React or undetectable, omit. (This is high-value on React apps — a note can say "the EditBotDrawer save button" not just a selector.)
- `nearestTestId` — closest ancestor-or-self `data-testid` if any.

Also capture per-note: `url`, `title`, `viewport {width,height,devicePixelRatio}`, `timestamp` (ISO), `mode` (`free|element`).

**Screenshots (zero or more per note).** Every image for a note shares the note's base name with a `+<N>` suffix — `<serial>-<YYYYMMDD-HHmmss>+<N>.png` — saved in the **same folder as the `.md`** (the notes dir). Two sources:
- **Auto element-highlight (element mode only):** on Send, capture the visible tab (`chrome.tabs.captureVisibleTab`, real PNG pixels) **with the picker's highlight box drawn on the selected element**, so the image shows *which* element in context. This is `+1`. (Free notes have no auto shot.)
- **Manual region captures (📷 camera tool, any mode):** each user-dragged crop is the next `+<N>`. So an element note's manual shots are `+2`, `+3`…; a free note's are `+1`, `+2`…

**Capture mechanics (there is no native 'capture region' API):** grab the full visible viewport with `chrome.tabs.captureVisibleTab` (a real screenshot — higher fidelity than DOM-to-canvas libs like html2canvas, which is why we don't use them here), then **crop to the target rectangle with a canvas `drawImage(img, sx,sy,sw,sh, 0,0,dw,dh)`** in the extension (keeps the host dependency-light). **Multiply the CSS-pixel rect by `devicePixelRatio`** before cropping — the captured bitmap is at device pixels, or HiDPI crops misalign. **Before every capture, hide stickyfix's own UI** (scrim, note card, chip, highlight) so the shot is clean page pixels, then restore.

### 7.4 Host discovery & auth
- On entering Review Mode, the service worker probes ports `39240..39260` on `127.0.0.1`, calling `GET /status`; accept the first that returns `{ app: "stickyfix", ... }`.
- Store the discovered port + the user-entered **token** in `chrome.storage.local`.
- Every `POST /annotation` includes header `X-Stickyfix-Token: <token>`. If missing/wrong, the host rejects (see §8.4). Surface auth failures as a visible toast, not a silent console log.

### 7.5 Error handling (no silent failures)
- Connection lost / host down / 4xx-5xx / token rejected → **visible toast** in the page UI with the reason. Never swallow a failed Send. (The whole point is reliability of capture; a dropped note is a regression.)

## 8. Component spec — `stickyfix-host`

A small Node program. Prefer **zero runtime dependencies** (use built-in `http`, `fs`, `crypto`, `path`). TypeScript, built to a runnable JS entry.

### 8.1 CLI
```
stickyfix-host --root <projectRoot> [--notes-dir <dir>] [--port <preferred>] [--token <token>]
```
- `--root` (required): the project root. Writes are confined to it.
- `--notes-dir` (default `<root>/notes`): where `.md` files land. Must resolve **inside** `--root` (reject otherwise).
- `--port`: preferred port; else first free in `39240..39260`.
- `--token`: fixed token; else generate a random one (`crypto.randomUUID()` or 24-char base64url) and **print it** on startup.
- On startup print, clearly: bound port, token, absolute notes dir. Also write the token to `<root>/.stickyfix-token` (gitignored) for convenience.

### 8.2 Endpoints
- `GET /status` → `{ app: "stickyfix", version, notesDir, root }`. **No token required** (discovery handshake; returns no secrets).
- `OPTIONS *` → CORS preflight (see §8.4).
- `POST /annotation` → **token required**. Body = annotation JSON (§9.1 shape). Writes the `.md` (+ screenshot). Returns `{ ok: true, file: "0007-20260531-143022.md", serial: 7 }`. On error `400/401/500` with `{ ok:false, error }`.

### 8.3 File writing
- **Serial:** on each write, scan `notesDir` for existing `NNNN-*.md` (and `*.read.md`), take `max(serial)+1`, zero-pad to 4 (`0001`). Do this under a simple in-process mutex/queue so concurrent POSTs don't collide.
- **Filename:** `<serial>-<YYYYMMDD-HHmmss>.md`, e.g. `0007-20260531-143022.md`. Timestamp is local time.
- **Screenshots:** the payload carries zero or more **already-cropped** PNG data-URLs (extension-side crop keeps the host light). Decode each and write it **next to the note** as `<serial>-<YYYYMMDD-HHmmss>+<N>.png`, `N` starting at 1 in payload order. Write each relative path into the note's `screenshots:` frontmatter list and inline in the body. No separate `assets/` dir — images live in the notes dir alongside the `.md`.
- Create `notesDir` if missing. Add a `.gitkeep` so the folder exists in fresh clones, but **note files + images are user content** (the consuming project decides whether to commit them).
- Body size cap: 12 MB (screenshots are base64). Reject larger with 413.

### 8.4 Security (must-have)
- Bind **`127.0.0.1` only** (never `0.0.0.0`).
- **Token auth** on `POST /annotation`. This matters more than in the upstream (which only forwarded to an agent) because **we write files to disk** — any local webpage that guessed the port could otherwise write arbitrary notes. Reject missing/incorrect token with `401`.
- **Path safety:** if a note ever carries a target subpath (future), `path.resolve` it and assert it stays within `--root`; reject traversal. v1 writes only to the fixed `notesDir`.
- **CORS:** the page origin (e.g. `https://app.chatlytics.ai`, `http://localhost:5173`) must be allowed to POST to the localhost host. Echo the request `Origin` in `Access-Control-Allow-Origin` and allow `X-Stickyfix-Token`. (Token is the real gate; CORS is permissive by necessity.)
- No eval, no shelling out, no writing outside `notesDir`.

## 9. Data contracts

### 9.1 Annotation payload (extension → host, `POST /annotation`)
```jsonc
{
  "mode": "element",                 // "free" | "element"
  "comment": "this button is too small on mobile",
  "page":   { "url": "https://app.chatlytics.ai/", "title": "Chatlytics Admin" },
  "viewport": { "width": 1440, "height": 900, "devicePixelRatio": 2 },
  "element": {                        // present only when mode = "element"
    "selector": "#root .tab-header button.bot-select",
    "tag": "button", "id": null, "classList": ["bot-select","primary"],
    "name": null, "type": "button", "href": null,
    "role": "button", "ariaLabel": "Configuring bot",
    "text": "All bots — global",
    "rect": { "x": 280, "y": 64, "width": 180, "height": 36, "pageX": 280, "pageY": 64 },
    "computedStyles": { "display": "inline-flex", "fontSize": "14px", "padding": "8px 12px", "...": "..." },
    "outerHTML": "<button class=\"bot-select primary\" aria-label=\"Configuring bot\">…</button>",
    "dataset": { "testid": "bot-selector" },
    "reactComponent": "TabHeader",
    "nearestTestId": "bot-selector"
  },
  "screenshots": [
    { "kind": "element-highlight", "mime": "image/png", "dataUrl": "data:image/png;base64,iVBOR…" },
    { "kind": "region", "mime": "image/png", "dataUrl": "data:image/png;base64,iVBOR…",
      "rect": { "x": 120, "y": 200, "width": 320, "height": 180 } }
  ]                                  // already-cropped PNGs; host writes them in payload order as +1, +2, …
}
```

### 9.2 Note file format (host → disk)
Filename `0007-20260531-143022.md`:
```markdown
---
id: 7
created: 2026-05-31T14:30:22+03:00
mode: element
url: https://app.chatlytics.ai/
title: Chatlytics Admin
viewport: { width: 1440, height: 900, dpr: 2 }
selector: "#root .tab-header button.bot-select"
react_component: TabHeader
screenshots:
  - 0007-20260531-143022+1.png    # auto element-highlight
  - 0007-20260531-143022+2.png    # manual region capture
status: unread
---

this button is too small on mobile

## Element context

- **Selector:** `#root .tab-header button.bot-select`
- **React component:** `TabHeader`
- **Tag / role:** `button` / `button`  ·  **aria-label:** `Configuring bot`
- **Text:** All bots — global
- **Rect:** x=280 y=64 w=180 h=36

### Computed styles (curated)
| prop | value |
|------|-------|
| display | inline-flex |
| fontSize | 14px |
| padding | 8px 12px |
| … | … |

### outerHTML (truncated)
```html
<button class="bot-select primary" aria-label="Configuring bot">…</button>
```

### Screenshots
![+1 element highlight](0007-20260531-143022+1.png)
![+2 region capture](0007-20260531-143022+2.png)
```
For **free** notes, omit the element section; keep frontmatter (no `selector`/`react_component`) + comment + screenshot.

## 10. The `review-notes` AI skill (shipped in this repo)

Ship a portable skill (a `SKILL.md` + a short README on how to install it into a Claude Code project's `.claude/skills/`, plus mention it works for any agent that can read files). Behavior:

1. Glob `notes/*.md`; **exclude** anything matching `*.read.md`.
2. Sort by leading serial ascending.
3. For each unread note: read it (frontmatter + body + element context + screenshot path), perform the requested fix in the codebase.
4. After handling a note, **rename** it: insert `.read` before `.md` → `0007-20260531-143022.read.md`. (This is the queue marker; the glob's exclusion of `*.read.md` makes re-runs idempotent.)
5. Report a concise summary: which notes were processed, what changed, any that need clarification (leave those **unread**).

Edge cases to handle: empty queue ("no unread notes"); a note that's ambiguous (don't rename it — flag it); screenshot referenced but missing (proceed with text context).

> Naming/exclusion rationale: serial+timestamp gives chronological order and a unique key; the `.read.md` rename is the "already processed" signal, so "read my notes" always means "the unread ones." Filenames stay `.md` so they remain human-readable in the repo.

## 11. Tech stack & build

> **Use ready-made libraries — do not reinvent the wheel.** The picks below are the current best-in-class; the build session should confirm latest versions but default to these.

- **Language:** TypeScript, ES modules, both halves.
- **Extension framework: [WXT](https://wxt.dev)** (MIT) — the leading MV3 framework (2026). Generates the manifest, builds via **Vite** (fast, **cross-platform — no Bun/`sips`/macOS-only steps**), handles on-demand content-script injection, `storage`, and messaging, and **generates all icon sizes from one source image**. Use WXT's **`createShadowRootUi`** to mount the injected review UI inside a **Shadow DOM** so our post-it CSS can't collide with the host page.
- **Extension UI:** **vanilla DOM** inside the shadow root (WXT is framework-agnostic; keep it light — a tiny hyperscript helper is fine). No React/Vue.
- **Selectors:** **[`@medv/finder`](https://github.com/antonmedv/finder)** (MIT) — robust unique CSS selectors. Don't hand-roll.
- **Dragging + region marquee:** **[`interact.js`](https://interactjs.io)** (MIT, TS-native) — for the draggable post-it, connection chip, `+` FAB, and the camera's drag-to-draw rectangle. (Native Pointer Events are an acceptable fallback, but prefer the lib.)
- **Screenshot:** native `chrome.tabs.captureVisibleTab` + canvas crop (see §7.3). **Not** html2canvas/modern-screenshot — real pixels matter for visual review.
- **Host:** Node + TypeScript. **Runtime = built-ins only** (`http`, `fs`, `crypto`, `path`, and **`util.parseArgs`** for CLI — no commander/yargs), **plus one dep: [`yaml`](https://eemeli.org/yaml/)** (ISC) for safe frontmatter serialization (URLs/titles with colons & quotes are exactly where hand-rolled YAML breaks). Build with esbuild or tsc. Runnable via `npm run host -- --root <dir>`; publishable later as an npm `bin`.
- **Repo layout (WXT conventions):**
```
stickyfix/
├── PRD.md  README.md  LICENSE  .gitignore
├── package.json
├── wxt.config.ts                    # manifest + build config (WXT)
├── entrypoints/
│   ├── background.ts                # service worker
│   ├── popup/{index.html,main.ts}   # token entry + Review Mode toggle
│   └── review.content/              # on-demand injected review UI (shadow root)
│       ├── index.ts                 # mount/unmount, mode switching
│       ├── connection-chip.ts  postit.ts  toolbar.ts
│       ├── element-picker.ts  region-capture.ts  capture.ts  host-client.ts
├── components/  lib/                 # shared helpers (capture, selectors, types)
├── public/icon.png                  # single source; WXT generates sized icons
├── host/
│   └── src/{index,server,write-note,serial,config,security}.ts
├── skill/{SKILL.md,README.md}        # the review-notes skill + install guide
└── docs/ (optional screenshots/gif)
```
- **Outputs:** `.output/` (WXT build → load-unpacked dir) + `dist/host/` — gitignored.
- **Build commands:** `npm run dev` (WXT dev w/ HMR), `npm run build` (extension + host), `npm run host -- --root <dir>`, `npm run check` (`tsc --noEmit` + host smoke test).

## 12. Milestones (suggested phase breakdown for GSD)

Order them so there's an end-to-end vertical slice early.

- **M1 — Repo scaffold (WXT):** `npm create wxt`, `wxt.config.ts`, tsconfig, folder layout, single `public/icon.png` (WXT generates sizes), MIT license already present. `npm run build` produces an empty-but-loadable extension + host bundle.
- **M2 — Host MVP:** HTTP server, port discovery (39240-39260), `GET /status`, `POST /annotation` → writes a minimal `.md` with serial naming, token auth, CORS, path/size guards. Unit-test serial assignment + path safety.
- **M3 — Extension skeleton + connection:** MV3 manifest, popup with token entry + Review Mode toggle, dynamic injection, draggable connection chip, host discovery. **Vertical slice:** entering review mode connects and shows the notes dir.
- **M4 — Free-note mode:** draggable `+` FAB → post-it card → Send → screenshot capture → POST → file on disk. End-to-end works for free notes.
- **M5 — Element-note mode:** picker overlay + hover highlight + `Esc` cancel; capture (selector via `@medv/finder`, computed styles, outerHTML, rect, dataset, react fiber, a11y); post-it pre-filled; on Send, **auto element-highlight screenshot (`+1`)** → richer `.md`.
- **M6 — Region capture + visual design pass (G8):** the **📷 camera tool** (dim scrim, crosshair, `interact.js` drag-rectangle, DPR-correct extension-side crop, hide-own-UI, deletable `×` thumbnails, `+N` naming, multiple per note); plus the sticky-note aesthetic — real paper look, smooth drag, mode color-coding, success/error toasts. Use `frontend-design` principles.
- **M7 — `review-notes` skill + docs:** ship `skill/SKILL.md` + install README; flesh out the root README with install/usage + a demo GIF. Idempotent read/rename verified.
- **M8 — Hardening:** error-path toasts (no silent failures), multi-note session stability, large-screenshot handling, README polish.

## 13. Clean-room notice (READ THIS)

The architecture in this PRD (and Appendix A) was derived by **studying** the open-source project `JodusNodus/opencode-chrome-annotation`, which is licensed **GPL-3.0**. Because this deliverable is **MIT-licensed**, you must treat that project as a **reference for ideas and architecture only**:

- ✅ You **may** use the architectural facts in Appendix A (that MV3 + dynamic injection works, the localhost port-range discovery pattern, the `/annotation` request shape, that `captureVisibleTab` is the screenshot path, that a single sink function is the seam).
- ❌ You **must not** copy, paste, or closely paraphrase any source code, comments, identifiers, file structure, or text from that project.
- Write **original** code from this spec. Use **`@medv/finder`** (MIT) for selectors rather than reproducing the upstream's selector heuristic. Choose our own identifiers (`stickyfix`, `sfx-*` DOM ids — not `__opc_*`), our own file names, our own UI copy.
- The result is an independent MIT work that happens to solve the same problem.

## 14. Acceptance criteria (definition of done)

1. `npm run build` succeeds on Windows (the dev's primary OS) with no macOS-only steps.
2. `npm run host -- --root <somedir>` prints port + token + notes dir and serves `GET /status` as `{ app: "stickyfix" }`.
3. Loading `dist/` unpacked in Chrome, pasting the token, and entering Review Mode on a real page shows the connection chip with the correct notes dir.
4. A **free note** Send produces `notes/0001-<ts>.md` with frontmatter + comment + screenshot, and a toast naming the file.
5. An **element note** on a React app produces a `.md` whose frontmatter includes a working `selector` and (when detectable) `react_component`, plus a computed-styles table and truncated `outerHTML`.
6. A second note increments the serial to `0002`.
7. Token mismatch yields a visible error toast, not a silent drop.
8. Running the `review-notes` skill reads unread notes in order and renames each to `*.read.md`; a re-run reports "no unread notes."
9. Repo is public, MIT, README has install + usage; no GPL code present (clean-room §13 honored).
10. Host binds only `127.0.0.1` (verify it is NOT reachable from another LAN host).
11. The **📷 camera tool** dims the page, region-drag yields a **DPR-correct cropped** PNG named `<noteBase>+<N>.png` in the notes folder **with stickyfix's own UI excluded** from the shot, shows as a deletable `×` thumbnail in the post-it, and its path is written into the `.md`. Multiple captures increment `+2`, `+3`.

## 15. Open decisions (safe defaults chosen; change only with reason)
- **Serial scope:** per-notes-dir (per project). ✔ default.
- **One active post-it at a time** (vs. many). ✔ default for v1 simplicity.
- **Screenshot = visible viewport only.** ✔ v1.
- **Token transport = custom header `X-Stickyfix-Token`.** ✔.
- **Notes committed to the consuming repo?** Left to that repo; stickyfix's own `.gitignore` ignores `notes/`. ✔.
- **Screenshot location/format:** images live **in the notes dir** alongside the `.md`, named `<noteBase>+<N>.png` (no `assets/` subdir). ✔.
- **Cropping side:** done **extension-side** (canvas), so the host stays near-zero-dep. ✔.
- **Libraries (don't reinvent):** WXT (framework), `@medv/finder` (selectors), `interact.js` (drag + marquee), `yaml` (host frontmatter), native `captureVisibleTab` + canvas (screenshots). ✔.

---

## Appendix A — Architecture blueprint (reference only; from a verified study of the GPL upstream)

> **Reference only — do not copy code.** This is the distilled, factual architecture from auditing `JodusNodus/opencode-chrome-annotation` @ HEAD (manifest v1.0.1). Use it to de-risk decisions, not as a source to copy. All facts verified against the cloned tree.

**Stack:** 100% TypeScript, ES modules, **vanilla DOM** (no framework), ~2,267 LOC. Two deliverables: the MV3 extension and a local host. **No telemetry, no analytics, localhost-only** — confirmed zero outbound hosts beyond localhost.

**Manifest (MV3):** `manifest_version: 3`; `permissions: [tabs, activeTab, scripting, storage]`; `host_permissions: [http://127.0.0.1/*, http://localhost/*]`; `optional_host_permissions: [<all_urls>]` requested on demand; **no static content_scripts** — page injection via `chrome.scripting.executeScript` (ISOLATED world); background is an ES-module service worker; `web_accessible_resources` exposes an injected DOM helper.

**Element capture:** a `describeElement()` returns `{ selector, tag, role, text(≤500c), ariaLabel, id, className, rect }`; viewport captured separately `{width,height,devicePixelRatio}`. Selector is an **id-anchored heuristic CSS path** (≤5 levels, `:nth-of-type`, ≤2 classes/level). **Gaps we are fixing:** no `outerHTML`, no computed styles, no `data-*`, text capped at 500, no shadow DOM. (We use `@medv/finder` + capture computed styles + outerHTML + dataset + react fiber.)

**Overlay UI:** an injected connection FAB ("Annotate" pill, `z-index 2147483647`) and an annotation panel (textarea + Send/Cancel) with a cursor-following highlight box. **Draggable dock** implemented with pointer capture + viewport clamping + top/bottom snap. (We replicate the *capability* — draggable, clamped — with original code, and add a `+` free-note mode the upstream lacks.)

**Local host / transport (the seam):** the host boots an HTTP server scanning ports **39240–39260** on **127.0.0.1**, taking the first free one. Extension-side discovery probes the same range and accepts a port only if `GET /status` reports the app id. Endpoints: `GET /status`, `GET /sessions`, `POST /claim`, `POST /annotation` (the data sink), `POST /unclaim`. CORS echoes the request origin; methods `GET,POST,OPTIONS`; JSON body cap 10 MB. **We keep only `/status` + `/annotation`** — `/sessions`, `/claim`, `/unclaim` exist for OpenCode session binding we don't need. **We add token auth** (upstream had none, because it forwarded to an agent rather than writing files).

**The sink to replace:** `POST /annotation` calls a single `queueAnnotationPrompt()` that (1) renders the annotation as a text prompt, (2) decodes any screenshot data-URL and writes it to a runtime dir, (3) hands the prompt to OpenCode via `client.session.prompt*`/`tui` calls. **The OpenCode coupling is ~37 lines and isolated** — in our clean-room build, the equivalent function simply writes a `.md` (and the screenshot png) to the notes dir and assigns a serial. The file-writing primitives (mkdir/writeFile, filename sanitize) are standard Node.

**Screenshot:** `chrome.tabs.captureVisibleTab(windowId, { format: "png" })` — native Chrome API, **no third-party lib**, visible viewport only, taken on Send. We use the same native approach.

**Build (what we deliberately differ on):** upstream uses **Bun** to bundle and **`sips` (macOS-only)** to render icons — this **breaks on Windows/Linux**. We use **WXT** (Vite-based, cross-platform) with a single source icon WXT resizes, so the build runs anywhere (the dev's primary OS is Windows).

**Payload shape upstream POSTs to `/annotation`** (for reference — our shape is §9.1, richer):
```jsonc
{ "tabId", "sessionId", "extensionVersion",
  "annotation": { "comment", "page": {url,title},
    "element": { selector, tag, role, text, ariaLabel, id, className, rect },
    "viewport": { width, height, devicePixelRatio },
    "screenshot": { mime, dataUrl } } }
```
We drop `tabId/sessionId/extensionVersion` session-binding fields, flatten, and enrich `element` (computed styles, outerHTML, dataset, reactComponent).

**License of upstream:** GPL-3.0-only (author Benjamin Shafii). This is why we do a clean-room MIT build — see §13.
