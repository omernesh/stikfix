# Phase 5: Element-Note Mode + Rich Context Capture - Context

**Gathered:** 2026-06-02
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers **Element-Note Mode**: a developer activates a 🎯 element picker, hovers to highlight any element under the cursor (outline + `tag · WxH` label following the cursor, `Esc` cancels), clicks to capture that element's **rich context** (a `@medv/finder` unique selector, React component name, curated computed styles, truncated `outerHTML`, dataset, aria-*, nearestTestId, page-absolute rect), gets a **pre-filled post-it**, writes a comment, and on Send the host writes an `element`-mode `.md` **plus an auto-highlight `+1.png`** screenshot with the selection box drawn on the element.

**This is the first real consumer of the Phase-4 capture trio** (`captureTab` / `waitTwoRafs` / `cropToRect` / `computeCropCoords` in `lib/capture.ts`).

**In scope (extension-side only):**
- 🎯 picker entry/exit + hover highlight (ELEM-01).
- `@medv/finder` install + robust unique-selector generation on click (ELEM-02).
- Rich element-context capture: tag/id/classList/name/type/href/role/aria-*/collapsed text (~1000-char trunc) (ELEM-03); rounded page-absolute rect + curated `computedStyles` (single config constant) + truncated `outerHTML` (~2000 chars) + full `dataset` (ELEM-04); best-effort React fiber walk to nearest named component (ELEM-05); `nearestTestId` (ELEM-06).
- Pre-filled post-it with a compact context summary (ELEM-07).
- Auto-highlight `+1.png` on Send, box drawn on the element, no own-UI in the shot (ELEM-08).
- `mode:'element'` payload assembled and relayed through the **existing** `SFX_SEND_ANNOTATION` SW relay → host writes `.md` + `+1.png` (ELEM-09).

**Out of scope (already built or later phases):**
- **Host-side element handling** — ALREADY BUILT (Phase 2): `host/src/types.ts` `ElementContext`, `write-note.ts` decodes `+N.png` and writes the element-context section + styles table + outerHTML. Phase 5 only produces the payload the host already accepts.
- **Capture trio** — ALREADY BUILT + unit-tested (Phase 4). Phase 5 consumes it, does not rebuild it.
- Region marquee crop / `+N` thumbnails — Phase 6 (second trio consumer).
- Warm post-it/paper aesthetics, animations, mode color-coding — Phase 6 (UI-02/UI-03).
- Multi-element rapid capture / card queue — explicitly rejected this phase (D-01 single-shot).
- Exhaustive screenshot/error-toast failure matrix — Phase 8.
</domain>

<decisions>
## Implementation Decisions

### Picker Lifecycle (ELEM-01)
- **D-01:** **Single-shot picker.** Clicking an element **exits pick mode** and immediately opens the **one** pre-filled post-it for that element. No sticky/multi-pick mode, no card queue (consistent with Phase-4 D-02 single-active-card). `Esc` cancels pick mode cleanly with no card. Rationale: writing the note is the point; multi-card state is unneeded complexity this phase.

### +1 Auto-Highlight Screenshot (ELEM-08)
- **D-02:** The `+1.png` is the **full visible viewport** with a **highlight box drawn at the element's page-absolute rect** (DevTools-style), NOT an element-crop. Shows *where on the page* the element sits — the review signal. Implementation: `captureTab` (full visible tab via SW) → draw the box onto the canvas at `rect × devicePixelRatio` (reuse the DPR-correct math pattern from `computeCropCoords`) → `+1.png`. The element-crop path (`cropToRect`) is **not** used for the `+1` this phase. Own-UI must be hidden via `waitTwoRafs` before capture (no stikfix UI, no live hover outline, in the shot).
- **D-02a:** The highlight box is **drawn onto the captured canvas after the shot**, never the live hover outline (the live outline lives in the shadow UI and is hidden before capture). This resolves the "box on element but no own-UI visible" requirement.

### Pre-Filled Post-It (ELEM-07)
- **D-03:** **Read-only context header + empty textarea.** A compact read-only context chip renders **above** the textarea (e.g. `button.primary · "Save" · <LoginForm> · 120×40`); the textarea stays **empty** for the developer's actual comment. Rationale: keeps the `.md` `comment` field clean (no auto-summary pollution) — the full element context still lands in the `.md` frontmatter + element-context section regardless. Summary line composed from: short selector/tag.class · collapsed text (truncated) · `<ReactComponent>` (omitted if undetectable) · `WxH`.

### Curated Computed-Styles Set (ELEM-04)
- **D-04:** Curated `computedStyles` set = **~25 props: layout + box-model + core typography/color**, baked into a **single config constant** (e.g. `CURATED_STYLE_PROPS` in `lib/`): `display, position, top, right, bottom, left, width, height, margin, padding, border, box-sizing, flex-direction, justify-content, align-items, gap, grid-template-columns, z-index, overflow, color, background-color, font-size, font-weight, font-family, line-height, opacity, visibility`. Broad enough to be the UI-review signal in every element note; planner may fine-tune exact membership but keep it one constant.

### Claude's Discretion
- `@medv/finder@4.0.2` configuration (idName/className/tagName/attr filters; whether to prefer `data-testid`/stable attrs and de-prioritize hashed Tailwind/CSS-module classes for selector robustness — ELEM-02 "robust unique selector").
- Hover-highlight overlay rendering technique (pointer-events:none overlay box following `mousemove` vs outline on target) and how it's hidden before the `+1` capture. **Caveat (from CLAUDE.md):** `@medv/finder` needs the element in the **document**, not a shadow root — picker targets the page, the UI stays in the shadow root.
- React fiber-walk internals (`__reactFiber$` / `__reactInternalInstance$` property probing, walk-up to nearest `type.displayName`/`type.name`), graceful omission when undetectable (ELEM-05).
- New message-type name if any capture variant is needed (the existing `SFX_CAPTURE_TAB` from Phase 4 already returns the full-viewport dataURL — likely sufficient; box-drawing happens content-side on the returned canvas).
- Exact picker-entry affordance (🎯 button placement on the chip/FAB cluster) and DOM/markup for the context header, within the existing single `createShadowRootUi` mount.
- Truncation specifics (text ~1000, outerHTML ~2000) per ELEM-03/04.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase spec & contracts
- `PRD.md` §7.3 — Capture mechanics: `captureVisibleTab` + canvas `drawImage`, multiply CSS rect by `devicePixelRatio`, hide own UI before capture / restore after (the `+1` box-draw + own-UI flush source).
- `PRD.md` §9.1 — Annotation payload shape (`mode:'element'` + `element` ElementContext + `screenshots[]` the extension must produce).
- `PRD.md` §9.2 — Note file format on disk (frontmatter incl. `selector`/`react_component`, element-context section, computed-styles table, truncated outerHTML, `+1.png` Screenshots section).
- `PRD.md` §6.x — Element picker UX (🎯 pick mode, hover outline + `tag·WxH` label, Esc cancel, one active post-it).
- `PRD.md` React Fiber Detection section — best-effort component-name probing (ELEM-05).
- `.planning/ROADMAP.md` — Phase 5 goal + 4 Success Criteria.
- `.planning/REQUIREMENTS.md` — **ELEM-01..ELEM-09** (this phase's requirements).

### Prior phase context (must read — this phase extends them)
- `.planning/phases/04-free-note-mode-capture-utilities/04-CONTEXT.md` — the capture-trio decisions (D-05/D-06), the single shadow-root mount, the post-it/toast surfaces, `SFX_SEND_ANNOTATION` relay reuse, `SFX_CAPTURE_TAB` SW handler (the trio Phase 5 now consumes).
- `.planning/phases/03-extension-skeleton-sw-relay-proof/03-CONTEXT.md` — SW-as-sole-privileged-caller boundary, shadow-root mount pattern, routing/token relay.

### Code the planner MUST read (extend, don't rewrite)
- `lib/capture.ts` — `captureTab(tabId)` (full-viewport dataURL via SW), `waitTwoRafs()` (own-UI flush), `cropToRect`, `computeCropCoords` (DPR-correct math to reuse for the box-draw). **Consume these; do not rebuild.**
- `entrypoints/review.content/card.ts` — `openCard(...)` (free-note post-it); add the `mode:'element'` variant with the read-only context header (D-03) and the `+1` capture-on-Send (D-02).
- `entrypoints/review.content/index.ts` — the single `createShadowRootUi` mount; add the 🎯 picker entry + hover-highlight overlay into this same mount.
- `entrypoints/review.content/chip.ts` — established `createElement`/`textContent`-only (no innerHTML) XSS-safe DOM pattern; `getTabId()` helper for `captureTab`.
- `entrypoints/background.ts` — `SFX_CAPTURE_TAB` handler (Phase 4) + `SFX_SEND_ANNOTATION` relay; sender-binding IDOR guard pattern (commit 6736413) to follow for any new privileged message.
- `lib/types.ts` — `SFX_MSG` map (add any new message type HERE, never imported from background.ts into the CS — documented crash hazard).
- `host/src/types.ts` — `ElementContext` + `Screenshot` + `AnnotationPayload` — the element payload must match these field names **exactly** (host already consumes them).
- `host/src/write-note.ts` — confirms how the host renders element context, styles table, outerHTML, and `+N.png` from the payload (the contract Phase 5 feeds).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Capture trio** (`lib/capture.ts`): `captureTab` returns the full visible-tab dataURL via the `SFX_CAPTURE_TAB` SW relay; `waitTwoRafs` flushes own-UI before capture; `computeCropCoords`/`cropToRect` give DPR-correct canvas math. Phase 5 is the first consumer — full-viewport shot + canvas box-draw at `rect×dpr`.
- **Host element pipeline** (`host/src/types.ts`, `write-note.ts`): `ElementContext`, `Screenshot`, `mode:'element'` payload, `+N.png` decode/write, element-context section + styles table + outerHTML rendering — **all already built**. Phase 5 produces; host consumes unchanged.
- **`openCard` + toast** (`card.ts`): the post-it card + Send→`SFX_SEND_ANNOTATION`→toast flow from Phase 4; extend with the element variant + read-only header.
- **`SFX_CAPTURE_TAB` SW handler** (`background.ts`): full-viewport capture relay with sender-binding IDOR guard — reused as-is for the `+1`.
- **`getTabId()`** (`chip.ts`): content-script tabId lookup for `captureTab`.

### Established Patterns
- DOM via `createElement`/`textContent` only — no `innerHTML` with element-derived strings (outerHTML, text, attrs are page-controlled → must be `textContent` in the UI; host stores them as data). XSS-safe pattern from `chip.ts`/`card.ts`.
- SW owns all privileged calls; content scripts relay (`SFX_CAPTURE_TAB`, `SFX_SEND_ANNOTATION`) and never touch `captureVisibleTab`/127.0.0.1 directly.
- Message types live in `lib/types.ts` (side-effect-free).
- Pure, chrome-API-free math factored for `node:test` (the box-draw rect math, selector/summary helpers, fiber-walk, style curation should be unit-testable without a browser — mirrors Phase-4 `computeCropCoords` testing).

### Integration Points
- Picker click → `@medv/finder` selector + context capture (content-side) → pre-filled card.
- Send → assemble `mode:'element'` payload → `captureTab` + canvas box-draw → `screenshots:[{kind:'+1', dataUrl, rect}]` → `SFX_SEND_ANNOTATION` → host writes `.md` + `+1.png` → toast names the file.
- `@medv/finder` runs on the **page** element (document scope), while the picker UI lives in the shadow root (finder has no shadow-DOM support — CLAUDE.md §finder caveat).

</code_context>

<specifics>
## Specific Ideas

- `+1.png` = full viewport with a box at the element rect — "where is this on the page" beats a tight crop for UI review (D-02).
- Highlight box is drawn onto the **captured canvas**, not the live DOM outline — so the shot shows the box but never stikfix's own UI (D-02a).
- Context summary is a **read-only header**, textarea stays empty — keeps the on-disk `comment` clean while full context lands in the `.md` element section (D-03).
- One curated style constant (~25 props, layout+box+type/color) is the per-note UI-review signal (D-04).
- Match `host/src/types.ts` `ElementContext` field names exactly — the host pipeline is already built and waiting.
</specifics>

<deferred>
## Deferred Ideas

- **Region marquee capture** (📷 camera, scrim, drag-rect, `+N` thumbnails) — Phase 6 (second capture-trio consumer).
- **Warm post-it/paper aesthetics + animations + mode color-coding** — Phase 6 (UI-02/UI-03); element notes ship functional-minimal this phase.
- **Sticky multi-element capture / card queue** — rejected for v1 (D-01); revisit only if a real workflow demands it.
- **Exhaustive screenshot + error-toast failure matrix** (capture timeout, oversized PNG → 413, partial off-screen element) — Phase 8.

### Reviewed Todos (not folded)
None — discussion stayed within phase scope.

</deferred>

---

*Phase: 5-Element-Note Mode + Rich Context Capture*
*Context gathered: 2026-06-02*
