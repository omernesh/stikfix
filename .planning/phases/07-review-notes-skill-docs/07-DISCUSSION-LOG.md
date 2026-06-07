# Phase 7: review-notes Skill + Docs - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-03
**Phase:** 7-review-notes-skill-docs
**Areas discussed:** Skill format & portability, Skill autonomy (the fix), Mark-read & edge cases, Docs (README + GIF + CLEAN-ROOM)

---

## Skill format & portability

| Option | Description | Selected |
|--------|-------------|----------|
| Portable skill/ dir, agent-agnostic | Self-contained markdown any agent reads | |
| Claude-native SKILL.md only | Frontmatter skill in .claude/skills/ | |
| Both: portable + Claude wrapper | Portable skill/SKILL.md + thin .claude/skills wrapper | ✓ |

**User's choice:** Both: portable + Claude wrapper (D-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Convention ./notes, override by arg | Default ./notes; explicit path overrides | ✓ |
| Explicit path always | Agent must supply path | |
| Auto-detect / search | Glob upward for notes/ | |

**User's choice:** Convention ./notes, override by arg (D-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Reference paths, agent opens as needed | Open +N.png via vision when text insufficient | ✓ |
| Always require viewing screenshots | Mandate opening every image | |
| Text-only, ignore screenshots | Never look at images | |

**User's choice:** Reference paths, agent opens as needed (D-03)

---

## Skill autonomy (the fix)

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-fix then mark read | Apply change directly, then rename | ✓ |
| Propose fix, confirm, then apply | Draft + confirm each | |
| Triage only, no code changes | Summarize into task list | |

**User's choice:** Auto-fix then mark read (D-04)

| Option | Description | Selected |
|--------|-------------|----------|
| All in serial order, one pass | Walk 0001→0002→… in one run | ✓ |
| One note, then stop | Single note per invocation | |

**User's choice:** All in serial order, one pass (D-05)

| Option | Description | Selected |
|--------|-------------|----------|
| After fix succeeds | Rename only once applied/flagged | ✓ |
| Before fixing (claim-then-fix) | Rename first to avoid double-processing | |

**User's choice:** After fix succeeds (D-06)

---

## Mark-read & edge cases

| Option | Description | Selected |
|--------|-------------|----------|
| Set status: flagged in frontmatter | Rewrite status + append reason, keep name | ✓ |
| Sidecar .flagged file | Separate flagged sidecar | |
| Leave untouched, report in summary | Ephemeral, run-only flag | |

**User's choice:** Set status: flagged in frontmatter (D-08)

| Option | Description | Selected |
|--------|-------------|----------|
| Rename file + set status: read | *.read.md AND status: read | ✓ |
| Rename only | *.read.md, leave status unread | |
| Set status only, no rename | Not viable (breaks SKILL-04) | |

**User's choice:** Rename file + set status: read (D-07)

| Option | Description | Selected |
|--------|-------------|----------|
| Warn once, proceed text-only | Log warning, fix from text/context | ✓ |
| Flag as ambiguous | Treat missing image as ambiguous | |

**User's choice:** Warn once, proceed text-only (D-09)

---

## Docs (README + GIF + CLEAN-ROOM)

| Option | Description | Selected |
|--------|-------------|----------|
| Placeholder + capture instructions | Placeholder image + how-to-record steps | ✓ |
| Defer GIF to Phase 8/9 | Add GIF at release polish | |
| I'll record it now | User records this phase | |

**User's choice:** Placeholder + capture instructions (D-10)

| Option | Description | Selected |
|--------|-------------|----------|
| Quickstart-first, full reference below | 5-step quickstart, then reference | ✓ |
| Narrative / feature-tour | Lead with what/why | |
| Minimal install-only | Just commands | |

**User's choice:** Quickstart-first, full reference below (D-11)

| Option | Description | Selected |
|--------|-------------|----------|
| Provenance + live grep result now | MIT story + actual audit output this phase | ✓ |
| Provenance narrative only | Defer grep audit to Phase 8 | |

**User's choice:** Provenance + live grep result now (D-12)

---

## Claude's Discretion

- Exact wording of skill steps, README prose, CLEAN-ROOM narrative.
- Terse warning/summary format the skill emits.
- Placeholder image asset for the GIF slot.

## Deferred Ideas

- Release-gate GPL grep audit (full upstream selector set) — Phase 8.
- Error-path toast hardening, concurrent-Send stress, idle-eviction — Phase 8.
- Installer / token pairing / host auto-start / cross-browser — Phase 9.
- Real recorded demo GIF — recorded post-phase by Omer.
