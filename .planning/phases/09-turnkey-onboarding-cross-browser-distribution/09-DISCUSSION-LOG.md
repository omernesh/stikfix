# Phase 9: Turnkey Onboarding & Cross-Browser Distribution - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-05
**Phase:** 9-Turnkey Onboarding & Cross-Browser Distribution
**Areas discussed:** Install mechanism, Token pairing, Host lifecycle, Root mapping, Cross-browser scope

---

## Install mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| npx bootstrapper | `npx stickyfix init` one command; cross-platform; reuses dev's Node; no per-OS installer | ✓ |
| pkg/SEA single binary | Self-contained host binary per OS; no Node needed; bigger build matrix | |
| Per-OS native installers | .exe/.pkg/.deb double-click; best UX, most build/sign overhead | |

**User's choice:** npx bootstrapper
**Notes:** Satisfies ONB-01's "single bootstrap command"; keeps the cross-platform / no-Windows-only constraint.

---

## Token pairing

| Option | Description | Selected |
|--------|-------------|----------|
| Native messaging | Installer registers native-messaging manifest; SW gets token over OS channel; web origins can't reach it | ✓ |
| Time-boxed loopback /pair | Host exposes token on 127.0.0.1 for N seconds; SW fetches; small exposure window | |
| Managed storage policy | chrome.storage.managed via enterprise policy; clunky for individuals | |

**User's choice:** Native messaging
**Notes:** Strongest security; no token on a web-reachable surface; can also spawn the host on demand.

---

## Host lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Native-msg spawned on demand | Browser launches host per session; no persistent process; cleanest uninstall | ✓ |
| Tray/menubar app + registry | Background app + origin→root registry; most product-like; needs a GUI helper | |
| OS service/daemon | Auto-start at login as a service; robust uptime; heaviest uninstall | |

**User's choice:** Native-msg spawned on demand
**Notes:** Avoids a GUI/tray dependency; aligns with the host's Node-built-ins ethos and clean teardown (ONB-05).

---

## Root mapping (how host learns each project's folder)

| Option | Description | Selected |
|--------|-------------|----------|
| OS folder dialog on first note | First note on an unmapped origin opens an OS folder picker; origin→folder persisted + reused | ✓ |
| Register folder in popup | User explicitly adds origin+folder in the popup before reviewing | |
| Project marker file autodetect | Host resolves folder from a committed marker; needs a convention; ambiguous | |

**User's choice:** OS folder dialog on first note
**Notes:** Mirrors the existing one-time origin→host dropdown (Phase 3); zero standing config.

---

## Cross-browser scope

| Option | Description | Selected |
|--------|-------------|----------|
| Edge now + documented FF/Safari | Edge is a Chromium drop-in; FF/Safari documented path only, no build | ✓ |
| Promote Firefox/Safari into scope | Build + test FF/Safari packaging this phase; significant effort | |
| Chromium only | Defer all FF/Safari docs to v2 | |

**User's choice:** Edge now + documented FF/Safari
**Notes:** Satisfies ONB-06 as documentation; actual FF/Safari builds stay FUT-01 (v2).

## Claude's Discretion

- Native-messaging message protocol, per-OS manifest locations, Node detection in the bootstrapper.

## Deferred Ideas

- Firefox/Safari actual builds (FUT-01, v2).
- pkg/SEA single-binary host for a non-developer audience (v1.x).
- Tray/menubar GUI app (rejected for v1.0; revisit if on-demand spawn is insufficient).
