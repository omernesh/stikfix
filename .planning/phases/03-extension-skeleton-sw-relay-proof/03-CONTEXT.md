# Phase 3: Extension Skeleton + SW Relay Proof - Context

**Gathered:** 2026-05-31
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase wires the MV3 extension's nervous system and proves the hardest architectural seam — **the service worker is the only thing that talks HTTP to the host** — before any real note UI exists. Deliverables: the action popup (lists SW-discovered hosts, per-host token entry, Enter/Exit Review Mode toggle); on-demand content-script injection; a draggable connection chip; host discovery + routing-by-tab-origin; `chrome.storage.local` persistence that survives SW eviction; and a **dummy `SEND_ANNOTATION`** that travels content-script → service-worker → host and lands a stub `.md` in the notes dir.

In scope: `manifest` (permissions/host_permissions/optional_host_permissions, MV3 action+background, no static content_scripts), `background.ts` (discovery, message router, the single `fetch` to 127.0.0.1, storage reconciliation), `popup/` (host list + token entry + toggle), `review.content/` skeleton (mount/unmount, connection chip, a stub Send), routing logic (origin→host resolution order), and the storage schema.

Out of scope (later phases): the `+` free-note FAB + post-it card (Phase 4), the 🎯 element picker + rich capture (Phase 5), the 📷 region capture + genuine post-it/paper visual design (Phase 6). The connection chip here is **functional, not final-polished** — real sticky-note aesthetics land in Phase 6.
</domain>

<decisions>
## Implementation Decisions

### SW-as-HTTP-Client Relay (the seam this phase proves)
- **D-01:** All localhost traffic goes through the **service worker**, never the content script. The content script sends `chrome.runtime.sendMessage({type:'SEND_ANNOTATION', payload})`; the SW resolves the active tab's origin → host, attaches that host's token, and does the single `fetch('http://127.0.0.1:<port>/annotation', …)`. This dodges Chrome-142 Local Network Access + the content-script same-origin/CORS block (research-critical finding). The dummy Send proves a stub `.md` lands on disk (Success Criterion 3). `captureVisibleTab` (later phases) also lives in the SW for the same reason.
- **D-02:** Define a small, explicit **message protocol** between content script ↔ SW: at minimum `ENTER_REVIEW`/`EXIT_REVIEW`, `GET_ROUTE` (resolve project for current tab), `SEND_ANNOTATION`, and discovery refresh. Responses carry `{ok,...}` / `{ok:false,error}` so the content script can surface failures as toasts (REL-01 lands fully in Phase 8, but the error-return shape starts here).

### Host Discovery
- **D-03:** The SW probes **all** of ports 39240–39260 on `127.0.0.1` in parallel via `GET /status`, collecting every responder with `{app:'stickyfix'}` into a registry `{project,port,token,origins}`. Runs on Review-Mode entry and on SW wake. Short per-probe timeout so dead ports fail fast.

### On-Demand Injection & Permissions
- **D-04:** **No static `content_scripts`.** Inject the review UI with `chrome.scripting.executeScript` only when Review Mode is entered. Manifest: `permissions: [activeTab, scripting, storage, tabs]`, `host_permissions: [http://127.0.0.1/*, http://localhost/*]`, `optional_host_permissions: [<all_urls>]` requested on demand per-origin at Review-Mode entry (don't hold blanket all-urls).

### Storage Schema & Persistence
- **D-05:** Everything persists in **`chrome.storage.local`** (never SW memory — MV3 recycles the worker ~30s idle). Stored: host registry (last-seen port/name/origins), per-host **tokens**, the `origin → host` map, and review-mode prefs. The SW **re-reads storage at the start of every handler** and re-discovers live hosts on wake, reconciling by **project `name` + origin (not port)** so a host that restarted on a new port re-binds automatically (Success Criterion 4; §7.6).

### Routing Resolution Order
- **D-06:** For each note, resolve the active tab's origin → host in this order: **(1)** a discovered host advertising this origin; else **(2)** a persisted `origin → host` mapping; else **(3)** page self-id (`<meta name="stickyfix-project">` / `window.__stickyfix_project`, read via an injected probe); else **(4)** ask **once** via a host dropdown and persist. Never per-note after that (Success Criterion 5; §6.1).

### Popup UI
- **D-07:** Popup is **vanilla DOM/HTML** (no framework, per project stack). Lists every discovered host with project name + connection state + a **per-host token field** (also accepts a shared token), and an **Enter/Exit Review Mode** toggle for the active tab. Token edits persist to `chrome.storage.local`.

### Connection Chip (functional this phase)
- **D-08:** The injected connection chip mounts in a **Shadow DOM** via WXT `createShadowRootUi` (so page CSS can't collide), `z-index: 2147483647`, top-right default, **draggable + viewport-clamped** (pointer events), shows the **project this tab routes to** + notes dir, and has an **Exit** button. It carries a stub **Send** that emits the dummy `SEND_ANNOTATION`. Use `px` units (WXT `all:initial` shadow note). Genuine paper/post-it styling is **Phase 6** — keep it clean but minimal here.

### Dummy Relay Payload
- **D-09:** The stub Send constructs a **minimal valid §9.1 free-note payload** (`mode:'free'`, a fixed `comment`, real `page.url/title`, `viewport`) so the host writes a stub `.md`. This is the end-to-end relay proof, not a real note (free-note UI is Phase 4).

### Claude's Discretion
- Exact message-type names/casing, the popup's DOM structure, the chip's drag implementation (interact.js vs pointer events — interact.js is the eventual choice but a lightweight pointer-events chip is acceptable here), per-probe timeout value, and how the one-time dropdown is rendered — left to the planner. Keep `sfx-*`/`stickyfix` namespace; clean-room gate green.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Extension spec & contracts
- `PRD.md` §6.1 — Multi-project routing (auto by tab origin, one-time map, `<meta>` self-id)
- `PRD.md` §7.1 — Manifest (permissions, no static content_scripts, on-demand injection, popup)
- `PRD.md` §7.4 — Host discovery, routing & auth (probe range, resolution order, `X-Stickyfix-Token`)
- `PRD.md` §7.6 — Persistence (chrome.storage.local survives restart + SW recycling; re-bind by name+origin)
- `PRD.md` §9.1 — Annotation payload shape (for the dummy free-note payload)
- `PRD.md` §14 — Acceptance criteria #3 (chip shows correct notes dir), #12 (multi-project routing survives Chrome restart)

### Research & prior phases
- `.planning/research/ARCHITECTURE.md` — **SW-as-single-HTTP-client** correction (content scripts can't fetch 127.0.0.1; route via SW), message topology, storage-on-wake reconciliation
- `.planning/research/PITFALLS.md` — Chrome-142 LNA blocking content-script fetches, SW recycling wiping memory, shadow-DOM CSS isolation, z-index, optional-permission UX
- `.planning/research/STACK.md` — WXT `createShadowRootUi`, on-demand scripting injection, `interactjs@1.10.x` (drag), TS6 `types:["chrome"]`
- `.planning/research/SUMMARY.md` — cross-cutting: route ALL localhost via SW
- `.planning/REQUIREMENTS.md` — EXT-01..EXT-11 (this phase)
- `.planning/phases/02-host-mvp/02-CONTEXT.md` + `02-SUMMARY.md` — the host's `/status` (discovery handshake) + `/annotation` (token-gated) contracts the extension consumes; `X-Stickyfix-Token` header
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `host/src/server.ts` — `GET /status` returns `{app,version,name,root,notesDir,origins}` (the exact discovery payload the SW parses) and `POST /annotation` is token-gated with `X-Stickyfix-Token` + CORS echo-Origin. The extension is the client of these contracts — match them precisely.
- `entrypoints/background.ts` + `entrypoints/popup/` — Phase 1 placeholder shells to fill in.
- `wxt.config.ts` — Phase 1 manifest (name + icons); extend with the §7.1 permissions/host_permissions/optional_host_permissions and action popup.
- WXT is already configured (vanilla TS, shadow-root capable).

### Established Patterns
- `npm run check` is the verification harness (tsc ×2 + clean-room + host tests + smoke). Extension code is type-checked by `tsc --noEmit` (extension tsconfig with `types:["chrome"]`). Add extension-side unit tests where logic is testable (routing resolution, storage reconciliation) — consider `node:test` against pure functions, or WXT's test setup; the planner decides the least-fragile approach (much extension code needs the chrome API and is only verifiable manually in Chrome).
- sfx-*/stickyfix namespace; clean-room gate must stay green.

### Integration Points
- SW `fetch` → host `POST /annotation` with `X-Stickyfix-Token` (this is the relay the phase proves).
- SW discovery `fetch` → host `GET /status` (no token).
- The chip's project label ← routing resolution ← `/status` origins + persisted origin→host map.
</code_context>

<specifics>
## Specific Ideas

- The dummy Send must produce a **visibly distinct** stub note (e.g. comment "stickyfix relay proof") so it's obvious in the notes dir during verification and easy to delete.
- Routing must work on an **HTTPS-origin page** (e.g. a real site), not just `localhost` — the relay proof should be demonstrated cross-origin (Success Criterion 3 explicitly says "HTTPS-origin page").
- Pure routing/reconciliation logic should be factored so it's unit-testable without the chrome API (helps Nyquist coverage on an otherwise manual-heavy phase).
</specifics>

<deferred>
## Deferred Ideas

- `+` free-note FAB + post-it card — Phase 4.
- 🎯 element picker + rich element capture — Phase 5.
- 📷 region capture + genuine post-it/paper visual design + mode color-coding — Phase 6.
- Full no-silent-failure toast coverage + multi-note session stability — Phase 8 (the error-return message shape starts here, but exhaustive coverage is later).

None block Phase 3.
</deferred>

---

*Phase: 3-Extension Skeleton + SW Relay Proof*
*Context gathered: 2026-05-31*
