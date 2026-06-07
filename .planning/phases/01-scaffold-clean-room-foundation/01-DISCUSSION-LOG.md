# Phase 1: Scaffold & Clean-Room Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-31
**Phase:** 1-Scaffold & Clean-Room Foundation
**Mode:** --auto (recommended defaults selected autonomously, single pass)
**Areas discussed:** Repo/package structure, WXT scaffold template, Host build tool, Icon strategy, Clean-room enforcement, TS config, Smoke test scope

---

## Repo / Package Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Single root package.json | One package, scripts drive both halves; host in host/ built separately | ✓ |
| npm workspaces | Separate workspace packages for extension + host | |

**Auto choice:** Single root package.json (recommended; matches PRD §11 layout).
**Notes:** Avoids workspace complexity for a two-half v1.

---

## WXT Scaffold Template

| Option | Description | Selected |
|--------|-------------|----------|
| Vanilla TypeScript | No framework; UI is vanilla DOM in a shadow root | ✓ |
| React/Vue template | Framework-driven extension UI | |

**Auto choice:** Vanilla TypeScript (recommended; PRD §11 mandates vanilla DOM).

---

## Host Build Tool

| Option | Description | Selected |
|--------|-------------|----------|
| tsc → dist/host/ (ESM) | No bundler; host is built-ins + yaml only | ✓ |
| esbuild bundle | Single-file bundle | |

**Auto choice:** tsc (recommended; keeps toolchain dependency-light). esbuild noted as future swap.

---

## Icon Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-sized committed PNGs | Commit 16/32/48/128; skip sharp/auto-icons | ✓ |
| @wxt-dev/auto-icons | Generate sizes from one source via sharp | |

**Auto choice:** Pre-sized PNGs (recommended; STACK.md flags sharp as a Windows native-dep risk; BUILD-03).

---

## Clean-Room Enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| sfx-* namespace + grep gate in npm run check | Structural, runs every check | ✓ |
| Manual one-time review | Audit once before release | |

**Auto choice:** sfx-* namespace + grep audit gate (recommended; makes BUILD-04 continuously verifiable).

---

## TypeScript Config

| Option | Description | Selected |
|--------|-------------|----------|
| strict + explicit types + split host tsconfig | types:["chrome"] for ext, NodeNext for host | ✓ |
| Loose / single tsconfig | Shared config, implicit types | |

**Auto choice:** Strict with explicit `types` and a separate host tsconfig (recommended; STACK.md TS6 breaking-changes note).

---

## Smoke Test Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Spawn host on tmp root, assert startup/status | Asserts app==stickyfix, exit 0 | ✓ |
| No smoke test | tsc-only check | |

**Auto choice:** Spawn-and-assert smoke test (recommended; satisfies BUILD-05).

---

## Claude's Discretion

- Exact `entrypoints/` nesting, optional hyperscript helper, tsconfig `target`/`lib`, precise icon file paths — left to the planner, kept WXT-idiomatic and Windows-safe.

## Deferred Ideas

- npm `bin` publish (FUT-04), esbuild host bundling, GitHub Actions CI for `npm run check` — none block Phase 1.
