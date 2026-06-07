# Phase 5: Element-Note Mode + Rich Context Capture - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-02
**Phase:** 5-element-note-mode-rich-context-capture
**Areas discussed:** Picker lifecycle, +1 screenshot framing, Pre-filled summary, Computed-styles set

---

## Picker Lifecycle (ELEM-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Single-shot → post-it | Click exits pick mode and opens the one pre-filled post-it; Esc cancels with no card | ✓ |
| Sticky picker | Stay in pick mode for rapid multi-element capture; card queue | |

**User's choice:** Single-shot → post-it (D-01)
**Notes:** Matches Phase-4 single-active-card model; avoids multi-card/queue state this phase doesn't need.

---

## +1 Screenshot Framing (ELEM-08)

| Option | Description | Selected |
|--------|-------------|----------|
| Full viewport + box | Whole visible tab with highlight box at element rect (DevTools-style); captureTab + canvas box at rect×dpr | ✓ |
| Element-crop + box | Cropped to element rect + padding with box; uses cropToRect/computeCropCoords | |

**User's choice:** Full viewport + box (D-02)
**Notes:** Shows where on the page the element sits — the review signal. Box drawn onto the captured canvas, not the live DOM outline (D-02a), so own-UI never appears in the shot.

---

## Pre-Filled Summary (ELEM-07)

| Option | Description | Selected |
|--------|-------------|----------|
| Read-only header + empty textarea | Compact context chip above an empty textarea; comment field stays clean | ✓ |
| Pre-filled editable textarea | Summary typed into the textarea as starting text | |

**User's choice:** Read-only header + empty textarea (D-03)
**Notes:** Keeps the on-disk `comment` free of auto-summary noise; full element detail still goes to the `.md`.

---

## Computed-Styles Set (ELEM-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Layout + box + type/color ~25 | display/position/box-model/flex/grid/z-index/overflow + color/background/font/line-height/opacity/visibility | ✓ |
| Layout/box-model only ~15 | Structural props only | |
| Let me specify the list | User dictates exact props | |

**User's choice:** Layout + box + type/color ~25 (D-04)
**Notes:** Broad UI-review signal in every element note; planner may fine-tune membership but keep it one config constant.

---

## Claude's Discretion

- `@medv/finder@4.0.2` config (attr filters, data-testid/stable-attr preference, hashed-class de-prioritization).
- Hover-highlight overlay rendering technique + how it's hidden before capture (finder needs the page document, not the shadow root).
- React fiber-walk internals + graceful omission (ELEM-05).
- Picker-entry 🎯 affordance placement; context-header markup; truncation specifics (text ~1000, outerHTML ~2000).
- Whether any new message type is needed (existing `SFX_CAPTURE_TAB` likely sufficient).

## Deferred Ideas

- Region marquee capture / `+N` thumbnails — Phase 6.
- Warm post-it aesthetics + animations + mode color-coding — Phase 6.
- Sticky multi-element capture / card queue — rejected for v1.
- Exhaustive screenshot + error-toast failure matrix — Phase 8.
