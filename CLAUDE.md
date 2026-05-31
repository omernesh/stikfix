<!-- GSD:project-start source:PROJECT.md -->

## Project

**stickyfix**

A Chrome extension (MV3) + a tiny localhost host that let a developer pin **sticky notes** onto any web page — free-floating or anchored to a specific DOM element — and have each note written as a **markdown file** into the project's `notes/` folder, so an AI coding agent can read them, fix them, and iterate. It replaces the painful screenshot-paste-describe ping-pong of UI review with a durable, file-based, iterative review loop. Product-agnostic: works on any web page in Chrome.

**Core Value:** A note dropped on a page reliably becomes a precise, context-rich `.md` file on disk in the right project's `notes/` folder — never silently lost. Reliable capture is the whole point; a dropped note is a regression.

### Constraints

- **License**: Deliverable is MIT — must not copy any code/text from the GPL-3.0 upstream; write original code from spec (PRD §13).
- **Tech stack**: TypeScript ES modules both halves. Extension via **WXT** (Vite-based, cross-platform); vanilla DOM in a shadow root (`createShadowRootUi`); `@medv/finder` for selectors; `interact.js` for drag + marquee; native `chrome.tabs.captureVisibleTab` + canvas crop for screenshots. Host = Node built-ins only (`http`, `fs`, `crypto`, `path`, `util.parseArgs`) **plus one dep: `yaml`** for frontmatter.
- **Compatibility**: Cross-platform build (Windows/macOS/Linux) — no `sips`, no Bun, no macOS-only steps.
- **Security**: Host binds `127.0.0.1` only (never `0.0.0.0`); token auth required on `POST /annotation`; writes confined inside `--root`; no eval, no shelling out; body cap 12 MB (413 over).
- **Platform**: Chrome/Chromium MV3 only for v1.
- **Reliability**: No silent failures — every failed Send must surface a visible toast.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| WXT | 0.20.26 | MV3 extension framework (build, manifest, shadow-root UI, HMR) | Only MV3 framework that is cross-platform (Vite-based, no Bun/sips), actively maintained, best-in-class in 2025 comparison; Plasmo is in maintenance mode; CRXJS lacks runtime features |
| TypeScript | 6.0.3 | Language — extension + host | TS 6 ships new defaults (strict, esnext, bundler resolution); use it but note types:[] default (must list @types/chrome explicitly) |
| Vite | 8.0.14 | Bundler (via WXT — do not configure directly) | WXT owns Vite config; do not add a separate vite.config unless WXT docs say to |
| Node.js built-ins | N/A (Node 20+) | Host runtime: http, fs, crypto, path, util.parseArgs | Zero-dep approach; util.parseArgs is stable since Node 18.3 — no commander/yargs needed |

### Extension-Side Libraries

| Library | Version | Purpose | Why This One |
|---------|---------|---------|--------------|
| `@medv/finder` | 4.0.2 | Unique CSS selector generation for clicked elements | MIT, 1.5 kB gzipped, pure ESM, TypeScript-native (types bundled), actively maintained (last release Dec 2024); do not hand-roll fragile heuristics |
| `interactjs` | 1.10.27 | Drag for post-it, chip, FAB; drag-to-draw region marquee | Correct package name is `interactjs` (not `interact.js`, not `@interactjs/interact`); `@interactjs/interact` is an internal sub-package explicitly marked "not for independent use"; `interactjs` ships TS typings at `index.d.ts`; MIT; only mainstream drag lib with built-in gesture composition |

### Host-Side Libraries

| Library | Version | Purpose | Why This One |
|---------|---------|---------|--------------|
| `yaml` (eemeli) | 2.9.0 | Safe YAML frontmatter serialization | ISC license; v2 API: `import { stringify } from 'yaml'`; handles colons/quotes in URLs/titles that break hand-rolled YAML; only runtime dep the host needs |

### Build Tools

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| esbuild | 0.28.0 | Bundle host TypeScript to single runnable JS | 45x faster than tsc alone; use `--platform=node --format=esm --bundle`; does NOT type-check (keep `tsc --noEmit` as a separate check step) |
| `@wxt-dev/auto-icons` | 1.1.1 | Generate 16/32/48/128 PNG icons from one source | Ships `sharp` as a dependency — sharp downloads prebuilt WASM/native binaries on install (Windows x64 supported), but internet access required at `npm install` time. Alternative: skip this module and commit pre-sized PNGs manually via `manifest.icons` in `wxt.config.ts` — zero native dep risk, recommended for CI |

## WXT API Specifics for This Project

### Shadow-Root UI (createShadowRootUi)

### On-Demand Injection (No Static Content Scripts)

### Icon Strategy (Recommended: Manual, No `@wxt-dev/auto-icons`)

## Installation

# Extension framework

# Extension runtime deps (bundled into extension)

# Host runtime dep

# Host build tool

# TypeScript (both halves)

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| WXT | Plasmo | In maintenance mode (2025); lags on dependencies; React-focused |
| WXT | CRXJS | Minimal abstraction; lacks runtime features (storage, messaging helpers); smaller community |
| `interactjs` | Native Pointer Events | Pointer capture + viewport clamping is 60+ lines of boilerplate per draggable; interact.js handles all of it in 3 lines and adds inertia/snapping if needed later |
| `interactjs` | `@dnd-kit/core` | React-specific; we have vanilla DOM in shadow root |
| `@medv/finder` | Hand-rolled selector heuristic | Upstream (GPL) shows why this breaks: no outerHTML, text capped, no dataset; @medv/finder is proven, MIT, 1.5 kB |
| `yaml` (eemeli) | `js-yaml` | js-yaml is fine but yaml v2 has better TypeScript types and is the more active package |
| `yaml` (eemeli) | Hand-rolled YAML | A note title or URL containing `: ` or `"` breaks naively serialized YAML frontmatter silently |
| esbuild (host) | tsc emit | tsc emits one-file-per-source; esbuild bundles to a single `dist/host/index.js` with external `node:*` — easier to ship as a CLI bin |
| esbuild (host) | Bun | Bun not required; cross-platform constraint; Node 20 LTS is sufficient |
| `util.parseArgs` | commander / yargs | Host has a 5-flag CLI; `util.parseArgs` (Node stdlib, stable since 18.3) is sufficient and keeps zero runtime deps |
| `chrome.tabs.captureVisibleTab` + canvas | html2canvas | html2canvas DOM-renders to canvas — misses CSS custom properties, SVG, webfonts, shadows; also triggers CSP violations on some sites in MV3. Native API produces real rendered pixels at full DPR fidelity |
| `chrome.tabs.captureVisibleTab` + canvas | modern-screenshot | Same issues as html2canvas; additional bundle weight for no gain |
| Manual PNGs for icons | `@wxt-dev/auto-icons` | auto-icons pulls in `sharp` (native binary download); breaks offline CI; for 4 static icon files it is overkill |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `html2canvas` / `modern-screenshot` | Produces imperfect pixel output; CSP violations in MV3 on strict-CSP sites; large bundle | `chrome.tabs.captureVisibleTab` + canvas `drawImage` crop (native, real pixels) |
| `@interactjs/interact` (scoped) | Package README: "internal part of interactjs and is not meant to be used independently" — each update may introduce breaking changes | `interactjs@1.10.27` (the monorepo's public bundle) |
| `interact.js` (hyphenated npm pkg) | Only at version 1.2.8, last published years ago — stale | `interactjs@1.10.27` |
| Bun | macOS/Linux-friendly but the developer's primary OS is Windows; Bun on Windows is still second-class; `npm` + Node 20 LTS works everywhere | `npm` + Node 20 |
| `sips` for icon generation | macOS-only CLI tool; breaks Windows CI/dev | Commit pre-sized PNGs or use cross-platform image tooling once |
| commander / yargs (host CLI) | 5 flags do not justify a 50 kB dependency; adds install time and attack surface | `util.parseArgs` from `node:util` (stable since Node 18.3) |
| React/Vue in shadow root | Adds 40-100 kB to the injected content script; WXT is framework-agnostic; vanilla DOM + a tiny hyperscript helper is sufficient for a toolbar + post-it | Vanilla DOM with `document.createElement` helpers inside `createShadowRootUi` |
| Static `content_scripts` in manifest | Injects the review UI on every page load — zero footprint requirement violated | `registration: 'runtime'` + `chrome.scripting.executeScript` on Review Mode enter |
| TypeScript `moduleResolution: node` | Deprecated in TS 6 (was `node10`); will error | `moduleResolution: bundler` for extension (WXT sets this), `moduleResolution: nodenext` for host |
| TypeScript `moduleResolution: classic` | Removed in TS 6 | `moduleResolution: bundler` or `nodenext` |

## React Fiber Detection (Best-Effort Component Name)

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| wxt@0.20.26 | TypeScript 5.x and 6.x | WXT sets `moduleResolution: bundler` internally; TS 6 is fine |
| wxt@0.20.26 | Vite 8.x | WXT pins its own Vite version; do not add `vite` to `devDependencies` separately |
| interactjs@1.10.27 | TypeScript 6 | typings at `index.d.ts` work with bundler resolution; no `@types/interactjs` needed |
| @medv/finder@4.0.2 | ESM only | Package is `"type": "module"`; WXT/Vite handles this correctly; tsc with `nodenext` for host if host ever imports it (it won't — selectors run in the extension only) |
| yaml@2.9.0 | Node 20+, ESM + CJS | `import { stringify } from 'yaml'` works with `moduleResolution: nodenext` |
| esbuild@0.28.0 | Node 20+ | Use `--external:node:*` when bundling host to keep Node built-ins as externals |

## Sources

- npm registry (`registry.npmjs.org`) — versions verified 2026-05-31: wxt@0.20.26, @medv/finder@4.0.2, interactjs@1.10.27, yaml@2.9.0, esbuild@0.28.0, typescript@6.0.3, vite@8.0.14, @wxt-dev/auto-icons@1.1.1 (HIGH confidence)
- https://wxt.dev/guide/key-concepts/content-script-ui.html — createShadowRootUi API, cssInjectionMode, isolateEvents, overlay position (HIGH confidence)
- https://wxt.dev/guide/resources/faq.html — rem gotcha, CSS splitting, sharp/auto-icons (HIGH confidence)
- https://wxt.dev/guide/essentials/config/manifest — manual icon config, WXT auto-discovery patterns (HIGH confidence)
- https://github.com/antonmedv/finder — @medv/finder v4.0.2 API, no shadow DOM support (element must be in document, not shadow root — matching PRD §NG5 best-effort caveat) (HIGH confidence)
- https://redreamality.com/blog/the-2025-state-of-browser-extension-frameworks-a-comparative-analysis-of-plasmo-wxt-and-crxjs/ — WXT vs Plasmo vs CRXJS 2025 analysis (MEDIUM confidence, third-party)
- https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/ — TS 6 breaking changes: types:[], moduleResolution:classic removed, strict defaults (HIGH confidence)
- React fiber property names (`__reactFiber$`, `__reactInternalInstance$`) — confirmed from React DevTools source + community references (MEDIUM confidence — internal API, not documented officially)

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
