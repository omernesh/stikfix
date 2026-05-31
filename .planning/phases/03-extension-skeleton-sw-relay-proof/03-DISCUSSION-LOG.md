# Phase 3: Extension Skeleton + SW Relay Proof - Discussion Log

> **Audit trail only.** Decisions are in CONTEXT.md.

**Date:** 2026-05-31
**Phase:** 3-Extension Skeleton + SW Relay Proof
**Mode:** --auto (recommended defaults, single pass)
**Areas discussed:** SW relay boundary, Host discovery, On-demand injection, Storage schema, Routing resolution, Popup UI, Connection chip scope, Optional permissions, Dummy relay payload

---

## SW Relay Boundary
Selected: content script → `chrome.runtime.sendMessage(SEND_ANNOTATION)` → SW resolves routing+token → SW `fetch` to 127.0.0.1. Alt: content-script direct fetch (REJECTED — Chrome-142 LNA + CORS block it; research-critical).

## Host Discovery
Selected: SW probes all 39240–39260 in parallel (GET /status), registry {project,port,token,origins}, on entry + on wake.

## On-Demand Injection & Permissions
Selected: `chrome.scripting.executeScript` on toggle, no static content_scripts; optional `<all_urls>` requested per-origin at entry.

## Storage Schema
Selected: chrome.storage.local (registry, tokens, origin→host map, prefs); re-bind by name+origin not port; SW re-reads storage each handler.

## Routing Resolution
Selected: (1) host advertising origin → (2) persisted map → (3) page self-id meta/window → (4) one-time dropdown, persist.

## Popup UI
Selected: vanilla DOM/HTML; host list + per-host token fields + Enter/Exit toggle.

## Connection Chip Scope
Selected: functional chip now (shadow-root, draggable, clamped, z-index max, project label + Exit, stub Send); genuine paper styling deferred to Phase 6.

## Optional Permissions
Selected: request `<all_urls>` per-origin at Review-Mode entry (no blanket all-urls).

## Dummy Relay Payload
Selected: minimal valid §9.1 free-note payload ("stickyfix relay proof") → stub .md on disk, proving CS→SW→host on an HTTPS-origin page.

## Claude's Discretion
- Message-type names, popup DOM, chip drag impl (interact.js vs pointer events), probe timeout, dropdown rendering.

## Deferred Ideas
- Free-note FAB (P4), element picker+capture (P5), region capture+visual design (P6), exhaustive toast coverage (P8).
