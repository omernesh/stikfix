---
phase: 3
slug: extension-skeleton-sw-relay-proof
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-31
---

# Phase 3 — Validation Strategy

> Per-phase validation contract. Much extension code needs the live Chrome API and is verifiable only manually in Chrome; pure routing/discovery logic is unit-tested.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` + `node:assert` for pure extension logic (lib/routing, lib/discovery), compiled/run alongside host tests; manual Chrome for the rest |
| **Config file** | extension `tsconfig` (`tsc --noEmit`, `types:["chrome"]`); host tsconfig for the node:test runner |
| **Quick run command** | `npm run check` (tsc ×2 + clean-room + all node:test + smoke) |
| **Full suite command** | `npm run build && npm run check` |
| **Estimated runtime** | ~20–40 seconds (WXT build dominates) |

---

## Sampling Rate

- **After every task commit:** `npm run check` (type-check catches most extension errors; node:test covers pure logic)
- **After every plan wave:** `npm run build && npm run check`
- **Before `/gsd:verify-work`:** both exit 0; then manual Chrome UAT (Success Criteria 1–5)
- **Max feedback latency:** 40 seconds

---

## Per-Task Verification Map

| Task | Wave | Requirement | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|------|------|-------------|-----------------|-----------|-------------------|-----------|--------|
| lib/routing resolution | 1 | EXT-06,07,08 | routes by origin; one-time map | unit | `node --test` routing.test | ❌ W0 | ⬜ |
| lib/discovery reconcile | 1 | EXT-04,10 | re-bind by name+origin not port | unit | `node --test` discovery.test | ❌ W0 | ⬜ |
| manifest (perms, no static CS) | 1 | EXT-01,02 | least-privilege; on-demand inject | build | `wxt build` + assert manifest has no content_scripts, has optional_host_permissions | ❌ W0 | ⬜ |
| background SW relay + discovery | 2 | EXT-04,05,06,09,10 | SW is only HTTP client (LNA-safe) | tsc + manual | `tsc --noEmit`; Chrome: dummy Send → stub .md on disk | ❌ W0 | ⬜ |
| popup host list + token + toggle | 2 | EXT-03,07 | per-host token in storage.local | tsc + manual | `tsc --noEmit`; Chrome: popup lists hosts, token persists | ❌ W0 | ⬜ |
| review.content chip + stub Send | 2 | EXT-02,11 | shadow-root isolation; draggable | tsc + manual | `tsc --noEmit`; Chrome: chip appears, draggable, Exit works | ❌ W0 | ⬜ |
| storage persistence | 2 | EXT-09 | survives SW eviction | manual | Chrome: idle 5min, Send still routes | ❌ W0 | ⬜ |

*Status: ⬜ pending · ✅ green · ❌ red. Exact task IDs by the planner.*

---

## Wave 0 Requirements

- [ ] `lib/routing.test.ts` (or `.mjs`) — origin→host resolution order + one-time map persistence (EXT-06,07,08)
- [ ] `lib/discovery.test.ts` — registry reconciliation by name+origin across port change (EXT-04,10)
- [ ] node:test runner wired so these run under `npm run check`
- [ ] Wave-0 build check: confirm WXT emits a runtime-injected content script + (CSS auto-inject? — RESEARCH open question A4) in `.output/chrome-mv3/`

*Pure logic is unit-tested; chrome-API-bound code is manual Chrome UAT.*

---

## Manual-Only Verifications (Chrome UAT — Success Criteria 1–5)

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Popup lists discovered hosts + per-host token entry | EXT-03,04 | Needs the running extension + a live host | With a host running, open the popup on any tab — the host appears with a token field |
| Review Mode injects chip on demand | EXT-02,11 | Requires Chrome page injection | Toggle Review Mode → connection chip appears, is draggable, shows the routed project + notes dir, Exit removes it |
| CS→SW→host relay on an HTTPS page | EXT-05 | Cross-origin Chrome behavior (LNA) | On a real HTTPS site, click the chip's stub Send → a stub `.md` ("stickyfix relay proof") appears in the host's notes dir |
| State survives SW eviction | EXT-09 | Requires SW idle eviction (~5 min or chrome://serviceworker-internals Stop) | Stop the SW, then Send again — still routes correctly (no re-discovery prompt for the mapped origin) |
| Unknown origin → one-time dropdown | EXT-06,07,08 | Requires an unmapped origin tab | Visit an unmapped origin → dropdown asks once; revisit → never re-asked |

---

## Validation Sign-Off

- [ ] Pure routing + discovery logic has node:test coverage
- [ ] Type-check (`tsc --noEmit`) green for extension + host
- [ ] Manual Chrome UAT items recorded as HUMAN-UAT after execution
- [ ] No watch-mode flags
- [ ] `nyquist_compliant: true` flipped by execute-phase once test files exist + pass

> Note: `nyquist_compliant`/`wave_0_complete` stay `false` during planning by design; execute-phase flips them once the test files exist and pass. This phase is intentionally manual-heavy (MV3 + Chrome) — the pure logic is the automatable surface.

**Approval:** pending
