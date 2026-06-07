---
phase: 08-hardening-pre-release-audit
plan: 04
subsystem: clean-room-audit + manual-uat
tags: [clean-room, provenance, GPL, D-03, REL-01, REL-02, REL-03, UAT, runbook]
dependency_graph:
  requires: [08-01]
  provides: [D-03-complete, SC-4-pass, 08-UAT-runbook]
  affects: [CLEAN-ROOM.md, scripts/clean-room-check.mjs]
tech_stack:
  added: []
  patterns: [fragment-construction, no-peek-self-audit, manual-runbook]
key_files:
  created:
    - .planning/phases/08-hardening-pre-release-audit/08-UAT.md
  modified:
    - scripts/clean-room-check.mjs
    - CLEAN-ROOM.md
decisions:
  - "D-03 no-peek self-audit found no new tokens beyond the three known (opencode, __opc_, JodusNodus): CURATED_STYLE_PROPS are W3C CSS names, __stickyfix_ is our own namespace, annot/* is our domain vocabulary"
  - "Phase 8 SC-4 release gate PASS recorded in CLEAN-ROOM.md §6 with per-file disposition table"
  - "08-UAT.md mirrors 07-HUMAN-UAT.md structure: header + scenario table + Before You Begin + numbered Steps"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-04"
  tasks: 2
  files: 3
---

# Phase 8 Plan 04: Clean-Room Audit + Manual UAT Runbook Summary

**One-liner:** Phase 8 SC-4 GPL clean-room gate PASS via no-peek self-audit (no new tokens); full manual Chrome UAT runbook covering all five REL-01 failure paths + D-05 regression + D-04 oversize.

## What Was Built

### Task 1: Extend clean-room-check.mjs + record CLEAN-ROOM.md (D-03, SC-4)

Performed a NO-PEEK self-audit of our own repository WITHOUT opening the GPL-3.0 upstream. Files inspected: `lib/element-context.ts`, `entrypoints/review.content/card.ts`, `chip.ts`, `index.ts`, `fab.ts`, `picker.ts`, `entrypoints/background.ts`, `host/src/server.ts`, `host/src/security.ts`.

Findings:
- `CURATED_STYLE_PROPS` in `element-context.ts` — standard W3C CSS property names, not upstream identifiers. Clean.
- `__stickyfix_` in `background.ts` — our own project namespace (`window.__stickyfix_project`). Clean.
- `annot`/`ANNOT` substrings throughout — substring of `annotation`, our domain vocabulary from PRD §7. Clean.

Result: **no new banned tokens required**. The three original tokens are the complete banned set.

Added a Phase 8 D-03 audit narrative comment block to `scripts/clean-room-check.mjs` documenting the self-audit method and finding. Every banned token remains fragment-constructed (e.g. `'open' + 'code'`) so the scanner never self-trips. Script exits 0 repo-wide.

Updated `CLEAN-ROOM.md` §6 with:
- Full per-file disposition table (9 files audited)
- Extended banned set table (3 tokens, fragment-construction shown)
- Live audit result: `node scripts/clean-room-check.mjs` → exit 0, 2026-06-04

### Task 2: Author 08-UAT.md manual Chrome runbook (D-01/D-04/D-05)

Created `.planning/phases/08-hardening-pre-release-audit/08-UAT.md` mirroring the 07-HUMAN-UAT.md structure (title, Purpose/Who/Time header, scenario table, Before You Begin, numbered Steps with cross-platform bash + PowerShell commands).

All five REL-01 failure paths enumerated with repro steps and expected verbatim toasts:

| Path | Verbatim toast |
|------|---------------|
| 1 Host unreachable | `Host unreachable: …` |
| 2 401 wrong token | `unauthorized` |
| 2b No token set | `No token set for host "…" — enter it in the popup` |
| 3 413 too large | `Payload Too Large` or `Host unreachable: …` (pre-flight: `over 12 MB`) |
| 4 SW evicted mid-flight | `Extension error: …` |
| 5 Unmapped origin | `No host mapped for origin: …` |

D-05 regression section:
- (a) SW idle-eviction state survival + subsequent Send routes correctly (stop SW via chrome://extensions → Send → note appears on disk)
- (b) Multi-note serial increment 0001 → 0002 (clear dir → send 2 notes → verify)

D-04 manual: near-12-MB send shows pre-flight toast before any network request (verified via DevTools Network tab — no request to host 127.0.0.1:39240).

D-02a: rapid multi-Send spot-check (3 notes, serials 0001–0003, non-blocking).

Coverage verify command confirmed:

```
node --input-type=module -e "... required strings check ..."
08-UAT.md covers all required scenarios
```

## Verification Results

```
node scripts/clean-room-check.mjs
clean-room audit: PASS — no banned identifiers found
Exit code: 0
```

`npm run check` result: 97/98 tests pass. The single failure is the pre-existing WR-06 EADDRINUSE environmental flake (port 39240 occupied by a running dev host — `host/test/index.test.js:14`). This flake is documented in the plan critical_reminders and is NOT introduced by this phase. All other gates green: tsc ×2, clean-room, host smoke, test:lib (11 test files), host integration (concurrent serial + payload boundary).

## Deviations from Plan

None — plan executed exactly as written. The self-audit finding (no new tokens beyond the three known) was explicitly anticipated as "a valid PASS" in PATTERNS.md Pitfall 5 and CONTEXT D-03.

## Known Stubs

None. This plan produces documentation artifacts only; no UI-rendering stubs.

## Threat Flags

None. No new network endpoints, auth paths, or file-access patterns introduced. The UAT runbook documents existing shipped toast strings only (T-08-01 accepted per plan threat model).

## Self-Check: PASSED

- [x] `scripts/clean-room-check.mjs` exists and exits 0 — FOUND
- [x] `CLEAN-ROOM.md` updated with §6 Phase 8 release gate record — FOUND
- [x] `.planning/phases/08-hardening-pre-release-audit/08-UAT.md` created — FOUND
- [x] Commit a5753aa exists (Task 1) — FOUND
- [x] Commit 908635a exists (Task 2) — FOUND
- [x] UAT coverage verify exits 0 — CONFIRMED
