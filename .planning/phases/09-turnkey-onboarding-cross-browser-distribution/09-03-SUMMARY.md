---
phase: 09-turnkey-onboarding-cross-browser-distribution
plan: "03"
subsystem: documentation
tags: [cross-browser, edge, firefox, safari, docs, onboarding]
dependency_graph:
  requires: []
  provides: [D-05, ONB-06]
  affects: [README.md, docs/cross-browser.md, scripts/cross-browser-doc-check.mjs]
tech_stack:
  added: []
  patterns:
    - node:fs-based assertion script (section-presence check, exit-code convention)
    - Clean-room original documentation prose
key_files:
  created:
    - docs/cross-browser.md
    - scripts/cross-browser-doc-check.mjs
  modified:
    - README.md
decisions:
  - "Edge is documented as a full Chromium drop-in; bootstrapper writes both Chrome and Edge HKCU registry keys on Windows"
  - "Firefox and Safari are explicitly tagged FUT-01 in the doc and in the section headings — no code change, docs only"
  - "Doc-check script mirrors clean-room-check.mjs exit convention (exits 0 on pass, exits 1 with descriptive message per missing token)"
  - "README Browser support section added above Architecture (one-liner) — additive, no existing content restructured"
metrics:
  duration: "8 minutes"
  completed: "2026-06-05"
  tasks: 2
  files: 3
---

# Phase 9 Plan 03: Cross-Browser Packaging Documentation Summary

Original markdown doc + automated section-presence gate satisfying ONB-06 (D-05): Edge supported now (Chromium drop-in), Firefox and Safari documented as FUT-01 (v2 scope).

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | docs/cross-browser.md — Edge/Firefox/Safari packaging paths | 18a928e | docs/cross-browser.md (211 lines) |
| 2 | doc-assertion check script + README link | f2f5054 | scripts/cross-browser-doc-check.mjs, README.md |

## What Was Built

### docs/cross-browser.md

Three-section original-prose document covering:

1. **Microsoft Edge — supported now**: Edge is a Chromium drop-in requiring no separate build. Bootstrapper writes both `HKCU\Software\Google\Chrome\NativeMessagingHosts` and `HKCU\Software\Microsoft\Edge\NativeMessagingHosts` on Windows; macOS/Linux equivalent paths documented. Dual-store extension ID caveat documented (both Chrome Web Store and Edge Add-ons IDs must appear in `allowed_origins`).

2. **Firefox (FUT-01, not built in v1.0)**: `allowed_extensions` manifest key (vs Chrome's `allowed_origins`), manifest format with Firefox addon ID, per-OS manifest locations (macOS/Linux/Windows HKCU), `browser_specific_settings.gecko.id` requirement, JSON manifest example.

3. **Safari (FUT-01, not built in v1.0)**: App-bundle architecture, `xcrun safari-web-extension-converter` as starting point, key architecture differences (no sideloading, App Store review, `SFSafariApplication.dispatchMessage` vs stdio), developer prerequisites (Xcode, Apple Developer Program).

### scripts/cross-browser-doc-check.mjs

Node ESM assertion script (node:fs only) that checks for six required tokens:
- `## Microsoft Edge` heading
- `## Firefox` heading
- `## Safari` heading
- `allowed_extensions` (Firefox manifest key)
- `safari-web-extension-converter` (Safari path)
- `Microsoft\Edge\NativeMessagingHosts` (Edge Windows registry path)

Exits 0 on pass, exits 1 with a `cross-browser-doc-check: MISSING — <description>` message per missing token. Mirrors `clean-room-check.mjs` structure and exit convention.

### README.md

Added a `## Browser support` section (one paragraph + link) immediately before `## Architecture (one-liner)`. Additive only — all existing Quickstart, Running the host, review-notes Skill, Security model, Troubleshooting, Demo, and Architecture content is unchanged.

## Verification Results

- `node scripts/cross-browser-doc-check.mjs`: **PASS** (exits 0)
- `node scripts/clean-room-check.mjs`: **PASS** (no banned identifiers)
- README `grep cross-browser.md` count: **2** (Browser support section + link text)
- Existing README sections preserved: Quickstart, Running the host, review-notes Skill, Security model, Troubleshooting, Demo, Architecture — **all present, unchanged**

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. This plan is documentation only; no runtime data sources or components.

## Threat Flags

None. Documentation plan only — no new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Self-Check: PASSED

- `docs/cross-browser.md` exists and contains all required tokens
- `scripts/cross-browser-doc-check.mjs` exists and exits 0
- `README.md` contains `cross-browser.md` link
- Commits 18a928e and f2f5054 confirmed in git log
