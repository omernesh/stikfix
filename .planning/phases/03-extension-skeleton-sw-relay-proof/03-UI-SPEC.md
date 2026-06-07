---
phase: 3
slug: extension-skeleton-sw-relay-proof
type: UI-SPEC
status: draft
scope: functional-minimal
created: 2026-05-31
---

# Phase 3 — UI Design Contract (functional-minimal)

> **Scope note:** This phase delivers *functional* UI only — the popup and the connection chip. Genuine sticky-note/paper aesthetics, mode color-coding, and the post-it card are **Phase 6 (Region Capture + Visual Design Pass)**. This contract specifies behavior, structure, and a clean baseline look — not the final brand styling. Keep it legible and unobtrusive; do not invest in decorative polish here.

## Surfaces

### 1. Action Popup (`entrypoints/popup/`)
**Purpose:** discover/manage hosts, enter tokens, toggle Review Mode for the active tab.

**Layout (vanilla DOM, ~320px wide):**
- Header: `stickyfix` wordmark + a small connection summary ("2 hosts").
- **Host list** — one row per discovered host:
  - Project `name` (bold) + bound `port` + a connection dot (green = reachable, grey = stale).
  - A **token input** (type=password-ish, monospace) pre-filled if stored; edits persist to `chrome.storage.local` on blur/change. A shared-token hint when one token covers multiple hosts.
- **Empty state:** "No hosts found on 39240–39260. Start one with `npm run host -- --root <dir>`." + a Refresh button.
- **Review Mode toggle** (primary control): a clear Enter/Exit button reflecting the active tab's state. The toggle click is the user gesture that requests `<all_urls>` optional permission.
- **Routing line** for the active tab: "→ <project> · <notesDir>" or "unmapped — pick on page".

**States:** loading (probing), populated, empty, permission-denied (toggle shows "grant access").

### 2. Connection Chip (injected, shadow root)
**Purpose:** on-page indicator of Review Mode + the host this tab routes to; carries the stub Send (relay proof).

**Appearance (functional baseline — px units, `all:initial` shadow):**
- Small rounded pill, top-right default, `z-index: 2147483647`, subtle shadow, high-contrast text. Neutral palette (NOT the final post-it colors).
- Content: a status dot + "→ <project> · <notesDir>" label.
- Controls: a **stub Send** button (emits the dummy `SEND_ANNOTATION`) and an **Exit** (×) button that unmounts the UI.
- If the tab origin is unmapped: the chip shows a one-time **project dropdown** instead of the label; selecting persists `origin → host`.

**Interaction:**
- **Draggable** anywhere via pointer events; **viewport-clamped** so it can't leave the screen. Position is ephemeral (not persisted this phase).
- Exit unmounts the shadow-root UI and exits Review Mode.
- On a successful stub Send: a brief inline confirmation on the chip (e.g. the dot flashes / "sent ✓" for ~1.5s). On failure: an inline error text on the chip (full toast system is Phase 8) — never silent.

## Quality bar for this phase
- Shadow-DOM isolation verified (host page CSS does not alter the chip; chip CSS does not leak).
- Legible at default zoom; does not block page interaction except the chip's own footprint.
- Keyboard: Exit reachable; dropdown operable.
- No layout shift on the host page when the chip mounts.

## Explicitly deferred to Phase 6
- Warm paper color, peel/shadow texture, mode color-coding (free vs element headers), the post-it note card, smooth animated drag via interact.js, lightbox, thumbnails. Do not build these now.

---
*Functional-minimal UI contract. Full visual design: Phase 6.*
