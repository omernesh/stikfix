# Phase 9: Turnkey Onboarding & Cross-Browser Distribution - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn the clone-and-run developer tool into a one-step product: a fresh machine
goes from zero to a note-on-disk via a single bootstrap command — host installed
and discoverable, extension loaded, token paired with **no manual copy-paste** —
without weakening the `127.0.0.1`-bind + token + origin-trust security model.

Delivers ONB-01..06. Clarifies HOW to package, pair, run, and uninstall the host;
does NOT add new note-taking capabilities (those are done in Phases 1–8).
</domain>

<decisions>
## Implementation Decisions

### Install mechanism (ONB-01)
- **D-01:** Cross-platform **`npx stikfix init` bootstrapper** — one command, no
  per-OS native installer to build/sign/maintain, reuses the Node toolchain a
  developer already has. This is ONB-01's "single bootstrap command" (not a
  Windows-only double-click installer). The bootstrapper: installs/links the host,
  registers the native-messaging manifest (see D-03), and guides loading the
  extension. MUST stay cross-platform (no `sips`, no Bun, no Windows-only steps).

### Token pairing (ONB-02 / ONB-03)
- **D-02:** **Native messaging** is the pairing channel. The bootstrapper registers
  a native-messaging host manifest; the service worker obtains the token over the
  OS-level native-messaging channel. An arbitrary web origin **structurally cannot
  reach** native messaging, so the token never travels over a web-reachable surface
  — preserving the security model with no copy-paste. No HTTP `/pair` endpoint and
  no token exposure window on loopback.

### Host lifecycle + project-root learning (ONB-04 / ONB-05)
- **D-03:** Host is **native-messaging-spawned on demand** — the browser launches
  the host via the registered native-messaging manifest. No persistent tray app or
  OS service to install, so uninstall is clean (remove the manifest + host files,
  no orphan daemon). Keeps the host within the Node-built-ins-only ethos (no GUI/tray
  dependency).
- **D-04:** **Origin → folder mapping via an OS folder dialog on first note.** With
  no `--root` flag, the first note dropped on an unmapped origin makes the native
  host open a native OS "choose folder" dialog; the resulting `origin → folder`
  mapping is persisted and reused silently thereafter. This mirrors the existing
  one-time `origin → host` dropdown (Phase 3 routing) — zero standing config.

### Cross-browser scope (ONB-06)
- **D-05:** **Edge now + documented Firefox/Safari path, no build.** Edge is a
  Chromium drop-in and is treated as supported as-is. Firefox/Safari get a
  *documented* packaging path only (WebExtension API gaps, native-messaging
  manifest differences, Safari converter) — not built or tested in v1.0. Satisfies
  ONB-06 as documentation; actual FF/Safari builds remain FUT-01 (v2).

### Claude's Discretion
- Exact native-messaging message protocol (framing, message types for
  pair/spawn/route), manifest install locations per OS, and how the bootstrapper
  detects/links Node — all implementation detail for research + planning.

## ⚠ Architectural tension to resolve in RESEARCH (not yet decided)
The current architecture is **host-per-project**: each project runs its own
`127.0.0.1` HTTP server on a port in 39240–39260, and the SW is the sole HTTP
client, auto-routing by tab origin (Phases 2–3). **Native messaging spawns a
single stdio host bound to the extension, not per-project HTTP servers.** The
researcher MUST resolve how these reconcile, e.g.:
  - native host acts as a **broker** holding the `origin → folder` registry (D-04)
    and writing notes to the mapped folder directly (notes flow over native
    messaging instead of HTTP); OR
  - native messaging is used **only** for secure bootstrap/pairing (token + port
    handoff) and the existing per-project HTTP relay is retained; OR
  - the native host manages/spawns per-project HTTP servers under the hood.
This choice determines whether the SW-as-sole-HTTP-client invariant is preserved
as-is, extended, or replaced. It is the central research question for this phase.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 9: Turnkey Onboarding & Cross-Browser
  Distribution" — goal, success criteria, the four open design questions.
- `.planning/REQUIREMENTS.md` — ONB-01..06 (lines ~116–121) and FUT-01 (Firefox/
  Safari port, may be promoted by ONB-06).
- `.planning/PROJECT.md` §Constraints + §Key Decisions — security model, host
  zero-dep ethos, cross-platform constraint, host-per-project + auto-route.

### Security model (MUST preserve — sacred invariants)
- `host/src/security.ts` — `checkToken` (timing-safe `X-Stikfix-Token`), path
  confinement, 12 MB body cap.
- `host/src/server.ts` / `host/src/index.ts` — `127.0.0.1`-only bind, port scan
  39240–39260, CORS, token-gated routes.
- `entrypoints/background.ts` — SW is the sole HTTP client to `127.0.0.1`; origin
  derived from `chrome.tabs.get(tabId).url` (never message body).
- `.planning/phases/08-hardening-pre-release-audit/08-SECURITY.md` — Phase 8 threat
  model + accepted risks (origin-trust, dev-only tool posture).

### Routing / pairing precedents to mirror
- `lib/routing.ts` — `resolveRoute` (origin→host) + `reconcileRegistry`; the
  origin→folder mapping (D-04) should follow this shape.
- `entrypoints/popup/main.ts` + `lib/storage.ts` (`sfxRegistry`/`sfxTokens`/
  `sfxOriginMap`/`sfxPrefs`) — current host registry, token store, origin map.

No external (non-repo) specs — requirements fully captured above.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/routing.ts` `resolveRoute`/`reconcileRegistry`: the origin→folder mapping
  and "first note prompts a one-time choice" pattern already exists for origin→host
  — extend, don't reinvent.
- `lib/storage.ts` storage items (`sfxRegistry`, `sfxTokens`, `sfxOriginMap`,
  `sfxPrefs`): persistence layer for any new pairing/mapping state.
- `host/src/*` (config, server, security, write-note): the note-writing core is
  done and tested — Phase 9 changes how it's *launched, paired, and addressed*,
  not how it writes.

### Established Patterns
- Host = Node built-ins + `yaml` only; cross-platform (no Bun/sips/Windows-only).
  The bootstrapper/native-messaging layer should respect this where feasible.
- SW-as-sole-HTTP-client + origin-from-tab (anti-spoof). Any new pairing/transport
  must keep web origins unable to obtain the token or write notes.
- One-time origin→X resolution then silent reuse (Phase 3 dropdown) — D-04 mirrors it.

### Integration Points
- New: native-messaging host manifest registration (bootstrapper) + a native-
  messaging client in the SW (`entrypoints/background.ts`).
- New: `npx stikfix init` CLI entry (host side) — install, register manifest,
  print extension-load guidance.
- Changed: token acquisition path in the SW moves from manual popup entry to
  native-messaging handoff (popup token field may become a fallback/diagnostic).
</code_context>

<specifics>
## Specific Ideas

- Pairing must be invisible: clicking the extension icon (or first note) "just
  works" — no token field in the happy path.
- Uninstall must leave nothing behind: native-messaging manifest + host files
  removed, no orphan process, no stray config (ONB-05).
- Edge is "free" (Chromium drop-in); FF/Safari are docs-only for v1.0.
</specifics>

<deferred>
## Deferred Ideas

- **Firefox / Safari actual builds** — FUT-01; v2. Phase 9 documents the path only.
- **pkg/SEA single-binary host** (no-Node distribution) — reconsider for a v1.x
  non-developer audience; out of scope for the developer-first v1.0.
- **Tray/menubar app + GUI registry** — rejected for v1.0 (adds a GUI dependency,
  heavier uninstall); revisit if native-messaging-on-demand proves insufficient.

None of the above block Phase 9.
</deferred>

---

*Phase: 9-Turnkey Onboarding & Cross-Browser Distribution*
*Context gathered: 2026-06-05*
