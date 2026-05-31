---
phase: 1
slug: scaffold-clean-room-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-31
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node built-in (`node` scripts) — no test framework this phase; verification is build + smoke + grep gate |
| **Config file** | none — `npm run check` orchestrates `tsc --noEmit` (both tsconfigs) + clean-room grep + host smoke test |
| **Quick run command** | `npm run check` |
| **Full suite command** | `npm run build && npm run check` |
| **Estimated runtime** | ~30–60 seconds (cold WXT build dominates) |

---

## Sampling Rate

- **After every task commit:** Run `npm run check`
- **After every plan wave:** Run `npm run build && npm run check`
- **Before `/gsd:verify-work`:** `npm run build` and `npm run check` must both exit 0
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-xx | 01 | 1 | BUILD-02 | — | N/A | build | `npx wxt build` (Task 3 verify; also via `npm run build`) + manifest icon assertion | ❌ W0 | ⬜ pending |
| 1-01-xx | 01 | 1 | BUILD-03 | — | N/A | asset | grep manifest for `icon/16.png`..`icon/128.png`; files exist in `public/icon/` and `.output/chrome-mv3/icon/` | ❌ W0 | ⬜ pending |
| 1-02-xx | 02 | 1 | BUILD-01 | — | N/A | build | `npm run build` exits 0 on Windows (no sips/Bun) | ❌ W0 | ⬜ pending |
| 1-02-xx | 02 | 1 | BUILD-05 | — | N/A | smoke | host smoke test spawns stub, asserts `app==stickyfix`, exit 0 | ❌ W0 | ⬜ pending |
| 1-03-xx | 03 | 2 | BUILD-04 | — | clean-room: zero GPL artifacts | grep-gate | clean-room script exits non-zero on `__opc_`/`opencode`/`JodusNodus` match (RED), exit 0 on clean tree (GREEN) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. Exact task IDs assigned by the planner.*

---

## Wave 0 Requirements

- [ ] `scripts/clean-room-check.mjs` — Node ESM grep gate (skips `.output/`, `dist/`, `node_modules/`, `.wxt/`, `.planning/`)
- [ ] `scripts/host-smoke.mjs` — Node ESM smoke test (`spawnSync(process.execPath, ...)`, 5s timeout, asserts startup JSON)
- [ ] No third-party test framework installed this phase — verification is build/smoke/grep only

*All Phase 1 verification is command-based; no unit-test framework required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Built extension loads in Chrome without manifest errors | BUILD-02 | Requires Chrome `chrome://extensions` Load-unpacked UI; not automatable in this phase | Run `npm run build`, open `chrome://extensions`, enable Developer mode, Load unpacked `.output/chrome-mv3`, confirm no errors and icons render |
| Icons appear in the loaded extension | BUILD-03 | Visual confirmation in Chrome toolbar/extensions page | After load, confirm 16/48/128 icons render in extensions list and toolbar |

> Note: BUILD-02's *structural* half (a valid MV3 manifest is emitted with correct icon refs) is proven automatically by plan 01-01 Task 3 (`npx wxt build` + manifest assertion). Only the visual Chrome-load confirmation remains manual.

---

## Validation Sign-Off

- [ ] All tasks have an automated `npm run check` / `npm run build` verify or a Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers the clean-room and smoke-test scripts
- [ ] No watch-mode flags (`wxt build`, not `wxt dev`, in check path)
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter (set by planner/checker)

> Note on `nyquist_compliant` / `wave_0_complete` flags: these remain `false` during planning by design. They are flipped to `true` by **execute-phase** once the Wave 1 scripts (`scripts/clean-room-check.mjs`, `scripts/host-smoke-test.mjs`) and the host stub actually exist on disk and their automated verifies are green — not during planning. A `false` value here at plan time is expected and is not a checker defect.

**Approval:** pending
