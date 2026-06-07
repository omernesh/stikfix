# Phase 1: Scaffold & Clean-Room Foundation - Context

**Gathered:** 2026-05-31
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers a **cross-platform-buildable skeleton**: a WXT-based MV3 extension that loads empty-but-valid in Chrome, plus a runnable host bundle — with the `sfx-*` identifier namespace, committed pre-sized PNG icons, and a clean-room audit gate established from the first commit. No annotation features, no host endpoints beyond what scaffolding requires, no UI. Just: `clone → npm install → npm run build → load unpacked` works on Windows, and `npm run check` passes.

In scope: repo layout, `package.json` + scripts, `wxt.config.ts`, tsconfig(s), placeholder background/popup entrypoints, host entry stub, pre-sized icons, `.gitignore`, MIT `LICENSE`, clean-room grep gate.

Out of scope (later phases): host HTTP server/endpoints (Phase 2), extension routing/discovery/popup logic (Phase 3), any note UI (Phase 4+).
</domain>

<decisions>
## Implementation Decisions

### Repo & Package Structure
- **D-01:** Single root `package.json` (no npm workspaces) with scripts driving both halves — matches PRD §11 layout. Extension lives at repo root per WXT conventions; host lives in `host/` and builds separately to `dist/host/`.
- **D-02:** Scripts: `dev` (WXT dev w/ HMR), `build` (extension `wxt build` + host build), `host` (`node dist/host/index.js -- ...` or ts runner), `check` (`tsc --noEmit` across both + host smoke test).

### Extension Framework / Scaffold
- **D-03:** WXT **vanilla TypeScript** template (no React/Vue) — the injected review UI is vanilla DOM inside a shadow root (PRD §11). Pin WXT `0.20.x` (per STACK.md).
- **D-04:** Placeholder entrypoints only this phase: `entrypoints/background.ts` (empty service worker, `type: module`) and `entrypoints/popup/` (minimal HTML+main.ts shell). No `review.content/` logic yet — directory may be stubbed but not wired.

### Host Build
- **D-05:** Build the host with **`tsc`** (not esbuild) to `dist/host/` as ESM — host runtime is Node built-ins + the single `yaml` dep, so no bundler is needed. Keeps the toolchain dependency-light. (esbuild remains an acceptable future swap if startup speed matters.)
- **D-06:** Host this phase is a **stub** — an `index.ts` that parses `--root` via `util.parseArgs` and prints a startup line, enough for the smoke test. Real server is Phase 2.

### Icons
- **D-07:** Commit **pre-sized PNG icons** at 16/32/48/128 under `public/` (e.g. `public/icon/16.png` …) and reference them in `wxt.config.ts` manifest. **Do NOT** use `@wxt-dev/auto-icons`/`sharp` — STACK.md flags it as a Windows native-binary CI risk. (BUILD-03)

### Clean-Room Enforcement (hard invariant from commit one)
- **D-08:** Establish the **`sfx-*` / `stickyfix`** identifier namespace now (DOM ids `sfx-*`, package name `stickyfix`, host id `stickyfix`). Never reuse upstream identifiers (`__opc_*`, `opencode`, `JodusNodus`).
- **D-09:** Wire a **clean-room grep audit** into `npm run check` (or a `clean-room` script it calls): grep the tree for `__opc_`, `opencode`, `JodusNodus` (case-insensitive) and fail non-zero on any match. This is the structural mechanism that makes BUILD-04 verifiable on every run, not a one-time manual check.

### TypeScript Config
- **D-10:** `strict: true`; for the extension tsconfig set **`types: ["chrome"]`** explicitly (TS6 no longer infers `@types/*`) and `moduleResolution: "bundler"` (WXT/Vite). For the host, a separate `tsconfig.host.json` with `module: "NodeNext"`, `moduleResolution: "nodenext"`, `types: ["node"]`. (STACK.md TS6 breaking-changes note.)

### Smoke Test (for `npm run check`)
- **D-11:** Host smoke test = spawn the host stub against a temp `--root`, read its stdout startup line (and, once Phase 2 lands, GET `/status` and assert `app === "stickyfix"`), assert exit/health, return 0. This phase: assert the stub starts and prints expected fields.

### Claude's Discretion
- Exact directory nesting under `entrypoints/`, the hyperscript helper choice (if any), tsconfig `target`/`lib` levels, and the precise icon file paths are left to the planner — keep them WXT-idiomatic and Windows-safe.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product spec
- `PRD.md` §11 — Tech stack & build (WXT, vanilla DOM, host built-ins + `yaml`, repo layout, build commands, outputs)
- `PRD.md` §13 — Clean-room notice (MIT vs GPL upstream; what may/may not be reused — **hard legal invariant**)
- `PRD.md` §14 — Acceptance criteria #1, #9 (Windows build, MIT/no-GPL)
- `PRD.md` Appendix A — Architecture blueprint (reference only; do not copy)

### Planning artifacts
- `.planning/PROJECT.md` — Constraints (cross-platform build, MIT, tech stack) and Key Decisions
- `.planning/REQUIREMENTS.md` — BUILD-01..BUILD-05 (this phase's requirements)
- `.planning/research/STACK.md` — Pinned versions (WXT 0.20.x, `@medv/finder@4.0.2`, `interactjs@1.10.x`, `yaml`), TS6 breaking changes, why-not `@wxt-dev/auto-icons`/`sharp`, WXT shadow-root/`all: initial` notes
- `.planning/research/PITFALLS.md` — Clean-room hygiene pitfall, Windows cross-platform build traps
- `.planning/research/SUMMARY.md` — Roadmap-critical cross-cutting findings
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield. Repo currently contains only `PRD.md`, `notes/.gitkeep`, and the `.planning/` tree.

### Established Patterns
- None yet. This phase *establishes* the conventions (sfx-* namespace, single-package layout, tsconfig posture) that all later phases inherit.

### Integration Points
- The host stub's CLI arg parsing (`util.parseArgs` for `--root`) is the seam Phase 2 extends into the real server.
- `wxt.config.ts` manifest is the seam Phase 3 extends with permissions/host_permissions.
</code_context>

<specifics>
## Specific Ideas

- PRD §11 gives an explicit target repo layout (`entrypoints/`, `host/src/{index,server,...}.ts`, `skill/`, `public/icon.png`) — follow it, but use **pre-sized** icons instead of the single-source `public/icon.png` shown there (overridden by D-07 / STACK.md Windows risk).
- `.output/` (WXT) and `dist/host/` are gitignored build outputs.
</specifics>

<deferred>
## Deferred Ideas

- Publishing `stickyfix-host` as an npm `bin` — v2 (FUT-04).
- esbuild for host bundling — only if `tsc` output/startup proves insufficient.
- CI workflow (GitHub Actions) to run `npm run check` on push — valuable but not in BUILD-* scope; note for a later hardening/infra pass.

None of these block Phase 1.
</deferred>

---

*Phase: 1-Scaffold & Clean-Room Foundation*
*Context gathered: 2026-05-31*
