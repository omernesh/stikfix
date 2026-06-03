---
phase: "07-review-notes-skill-docs"
plan: "02"
subsystem: "skill-docs"
status: "checkpoint-paused"
tags: [skill, docs, fixtures, uat]
dependency_graph:
  requires: ["07-01"]
  provides: ["skill/SKILL.md", "test/fixtures/notes/", "07-HUMAN-UAT.md"]
  affects: [".claude/skills/review-notes/SKILL.md"]
tech_stack:
  added: []
  patterns: ["portable-skill-prose", "fixture-set", "uat-runbook"]
key_files:
  created:
    - skill/SKILL.md
    - .claude/skills/review-notes/SKILL.md
    - test/fixtures/notes/0001-20260101-120000.md
    - test/fixtures/notes/0001-20260101-120000+1.png
    - test/fixtures/notes/0002-20260101-120001.md
    - test/fixtures/notes/0003-20260101-120002.md
    - test/fixtures/notes/0004-20260101-120003.md
    - test/fixtures/notes/0099-20260101-120099.read.md
    - .planning/phases/07-review-notes-skill-docs/07-HUMAN-UAT.md
  modified:
    - .gitignore
decisions:
  - ".claude/skills/review-notes/SKILL.md is gitignored per project policy (local agent artifact); skill/SKILL.md is the committed portable source of truth"
  - "test/fixtures/notes/ required .gitignore negation (!test/fixtures/notes/**) — the 'notes/' pattern matched any subdirectory named notes"
metrics:
  duration: "~15 minutes"
  completed_date: "2026-06-03"
  tasks_completed: 2
  tasks_total: 3
  checkpoint_task: 3
---

# Phase 07 Plan 02: Portable Skill + Fixtures Summary

**One-liner:** Portable review-notes skill prose (agent-agnostic, no frontmatter) with 6 fixture notes covering every processing path and a UAT runbook for human verification.

## Status

PAUSED at `checkpoint:human-verify` (Task 3 — Human UAT). Tasks 1 and 2 are committed.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Portable skill/SKILL.md + Claude Code wrapper | 9d224af | skill/SKILL.md, .claude/skills/review-notes/SKILL.md |
| 2 | 6 fixture notes + 07-HUMAN-UAT.md runbook | c6f1922 | test/fixtures/notes/ (6 files), 07-HUMAN-UAT.md, .gitignore |

## Checkpoint Pending

Task 3 requires human verification that the skill prose drives an end-to-end fix
against the fixture set. See `07-HUMAN-UAT.md` for the exact steps and pass criteria.

## What Was Built

### skill/SKILL.md (portable, no frontmatter)

A 238-line agent-agnostic skill document covering:
- Glob-exclude rule: `endsWith('.md') && !endsWith('.read.md')` (Pitfall 1)
- Serial from `filename.slice(0, 4)` — never from `id` frontmatter (Pitfall 2)
- Element context reading (`## Element context` section, selector/styles/outerHTML)
- Screenshot path resolution: join(notesDir, screenshotFilename)
- Missing screenshot: emit `WARN: <filename> not found — proceeding text-only`, continue (D-09)
- Ambiguous instruction: set `status: flagged`, append `> flagged: <reason>`, leave filename (D-08)
- After-fix rename + status:read: rename is the LAST action (D-06), status update via yaml.parse/stringify
- Forbidden patterns section: belt-and-suspenders against regressions
- No network/host calls — disk-only

### .claude/skills/review-notes/SKILL.md (thin wrapper)

Claude Code auto-invocation wrapper with `name: review-notes`, `description` block
listing trigger phrases, and exactly one pointer sentence to `skill/SKILL.md`.
No step logic duplicated (D-01).

Note: `.claude/` is gitignored per project policy. The wrapper file exists on disk
for Claude Code invocation but is not committed. `skill/SKILL.md` is the committed
portable source of truth that any agent can read.

### test/fixtures/notes/ (6 files)

| File | Scenario | Expected outcome |
|------|----------|-----------------|
| 0001-*.md | Element note, PNG present | → 0001-*.read.md, status:read |
| 0001-*+1.png | Real 1x1 transparent PNG | (consumed by 0001 scenario) |
| 0002-*.md | Free mode, no screenshots | → 0002-*.read.md, status:read |
| 0003-*.md | Element, PNG referenced but missing | → 0003-*.read.md, WARN emitted, text-only |
| 0004-*.md | Ambiguous "Make this better" | stays 0004-*.md, status:flagged |
| 0099-*.read.md | Pre-read (status:read) | unchanged, not processed |

### 07-HUMAN-UAT.md

Runbook covering: copy-first instruction, per-fixture verification commands,
idempotency re-run check, pass criteria table, and what to report on failure.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] .gitignore 'notes/' pattern blocked test/fixtures/notes/**

- **Found during:** Task 2 commit staging
- **Issue:** The project `.gitignore` contains `notes/` (to exclude runtime notes),
  which git interprets as matching any directory named `notes` in any subdirectory,
  including `test/fixtures/notes/`. All 6 fixture files were blocked from staging.
- **Fix:** Added `!test/fixtures/notes/` and `!test/fixtures/notes/**` negation
  patterns after the `notes/` line in `.gitignore`, allowing fixture tracking while
  keeping runtime `./notes/` excluded.
- **Files modified:** `.gitignore`
- **Commit:** c6f1922

**2. [Rule 2 - Policy] .claude/skills/review-notes/SKILL.md is gitignored**

- **Found during:** Task 1 commit staging
- **Issue:** `.claude/` is gitignored per project policy ("Editor / local agent
  config — never publish internal agent identity files"). The wrapper file was
  created on disk (for Claude Code auto-invocation) but cannot be committed.
- **Decision:** The wrapper is intentionally local-only. `skill/SKILL.md` is the
  committed portable source of truth. This matches the project's analog — the
  existing `.claude/skills/claudios.md` is also gitignored. Documented in SUMMARY.
- **Impact:** No functional impact. Any agent with access to the repository can
  read `skill/SKILL.md` directly. Claude Code users get auto-invocation via the
  local (untracked) wrapper.

## Known Stubs

None. The fixture notes are intentional test artifacts, not stubs.

## Threat Flags

None. Plan 02 produces prose and fixture files only. No new network endpoints, auth
paths, or schema changes. Threat model from plan frontmatter confirmed low surface.

## Self-Check: PARTIAL (checkpoint pending)

Tasks 1 and 2 verified and committed:
- skill/SKILL.md: exists, no frontmatter, covers all 5 rules (gate passed)
- test/fixtures/notes/: all 6 files exist with correct shapes (gate passed)
- 07-HUMAN-UAT.md: exists
- Commits 9d224af and c6f1922 both verified in git log

Task 3 (human UAT) is the remaining gate. Self-check will be updated to PASSED
after the checkpoint is approved.
