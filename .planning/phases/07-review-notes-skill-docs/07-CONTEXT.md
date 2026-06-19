# Phase 7: review-notes Skill + Docs - Context

**Gathered:** 2026-06-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver two artifacts, no new extension/host capabilities:

1. **A portable `review-notes` skill** — any folder-reading AI agent points it at a `notes/` dir; it processes unread notes in serial order (`0001` before `0002`), performs the requested fix per note, and renames each handled note to `*.read.md` (idempotent re-run reports "no unread notes").
2. **Docs** — root `README.md` (install + usage, working in <5 min, with a demo GIF) and `CLEAN-ROOM.md` (MIT provenance + GPL grep audit result).

Out of scope (other phases): error-path toast hardening + concurrent-Send stress + the *release-gate* GPL audit (Phase 8); installer/onboarding/cross-browser (Phase 9). No changes to the host or extension runtime — the skill is a pure consumer of the on-disk note format.
</domain>

<decisions>
## Implementation Decisions

### Skill format & portability (SKILL-01)
- **D-01:** Ship **both** a portable, agent-agnostic `skill/SKILL.md` at the repo root (self-contained markdown: prose + numbered steps, readable by Claude Code / Cursor / Codex / any folder-reading agent — no Claude-only frontmatter required to function) **and** a thin `.claude/skills/review-notes/` wrapper that points at it for native Claude Code use. The portable file is the source of truth; the wrapper must not duplicate logic.
- **D-02:** Notes dir resolution = **convention `./notes` (relative to project root), overridable by an explicit path argument**. Zero-config for the common case.
- **D-03:** Screenshots (`+N.png`) are **referenced by path**; the skill instructs the agent to open them (vision) when text + element-context is insufficient. Must not hard-require vision (ties into D-09 missing-screenshot tolerance).

### Skill autonomy / processing model (SKILL-02, SKILL-03)
- **D-04:** **Auto-fix then mark read.** For each unread note the skill applies the code change directly using the note's instruction + element context, then renames to `*.read.md`. This is the core value — kills the screenshot-paste-describe ping-pong.
- **D-05:** **One pass, all unread notes in serial order** (glob `notes/*.md`, exclude `*.read.md`, sort by leading 4-digit serial ascending). Resumable because handled notes are renamed as it goes.
- **D-06:** **Rename only AFTER the fix succeeds** (or is consciously flagged/deferred). A crash mid-fix leaves the note unread → re-runnable, never silently lost. (Reliability invariant: a dropped/forgotten note is a regression.)

### Mark-read mechanism & edge cases (SKILL-04, SKILL-05)
- **D-07:** **Read marker = rename to `*.read.md` AND set frontmatter `status: read`.** Belt-and-suspenders: the rename satisfies SKILL-04 idempotency/exclusion; the `status: read` keeps the on-page pin showing a read dot. (Host globs `<serial>-*.md`, so `0001-….read.md` still rehydrates as a read pin — see RESEARCH-FLAG-1.)
- **D-08:** **Ambiguous note → set frontmatter `status: flagged`, append a `> flagged: <reason>` line to the body, and LEAVE the filename unchanged** (stays out of `*.read.md` so it's visible + skippable on re-run). Reuses the existing `status` key rather than inventing a sidecar.
- **D-09:** **Missing screenshot file → warn once (one line), proceed text-only**, fix from note text + element context, mark read normally. Never blocks the queue. (Distinct from ambiguous — a missing image does not by itself make a note ambiguous.)

### Docs (DOC-01, DOC-02)
- **D-10:** **Demo GIF = placeholder image + documented "how to record" steps** committed this phase; Omer records the real GIF manually later (requires a live browser session the agent can't drive). Unblocks DOC-01 without faking the artifact.
- **D-11:** **README = quickstart-first.** Top: 5-step quickstart (run host with `--root`, build + load unpacked extension, set token, enter Review Mode + drop a note, run the `review-notes` skill). Below: per-component reference, the 127.0.0.1 + token + origin-trust security model, and troubleshooting.
- **D-12:** **CLEAN-ROOM.md = MIT provenance + clean-room method narrative + the actual grep audit output run THIS phase** (`__opc_`, `opencode`, `JodusNodus`, upstream selector constants → expected 0 matches). Phase 8 re-runs the same audit as a release gate; this phase establishes the doc and the baseline result.

### Claude's Discretion
- Exact wording/headings of `skill/SKILL.md` steps, README prose, and CLEAN-ROOM narrative.
- The precise one-line warning/summary format the skill emits (no strong preference captured) — keep it terse, machine-greppable if cheap.
- Placeholder image asset choice for the demo GIF slot.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Note on-disk format (the skill's input contract)
- `host/src/write-note.ts` — `buildFrontmatter()` is the authoritative producer of note frontmatter/body the skill consumes: keys `id`, `created`, `mode` (`free`|`element`), `url`, `title`, `viewport`, `selector`/`rect` (element only), `note_position` (free only), `screenshots[]`, `status` (`unread`). Body = comment + `## Element context` + curated computed-styles table + truncated `outerHTML` + `### Screenshots`.
- `.planning/PROJECT.md` — PRD §9.2 (note file format), §13 (MIT/clean-room license constraint), core-value statement (a note must never be silently lost).
- `.planning/REQUIREMENTS.md` — SKILL-01..05, DOC-01/02 acceptance criteria.

### Persistent-pin interaction (read-state must not break pins)
- `host/src/server.ts` / the `listAnnotations` / `GET /annotations` handler — verify its glob includes `*.read.md` and how it surfaces `status` to the extension. The skill's D-07 read marker depends on this.
- `.planning/phases/06-region-capture-visual-design/06-CONTEXT.md` — locked pin decisions (files = source of truth; id = leading serial; host globs `<serial>-*.md`; read/unread dot).

### Clean-room audit identifiers
- `.planning/phases/01-scaffold-clean-room-foundation/` SC-5 (grep for `__opc_`, `opencode`, `JodusNodus` = 0) — CLEAN-ROOM.md formalizes this; Phase 8 SC-4 adds upstream selector constants to the grep set.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `host/src/write-note.ts` `buildFrontmatter()` — defines every field the skill parses; the skill is the read-side mirror of this write-side contract.
- Existing UAT notes (`D:\docker\stikfix-uat\notes\*.md`) — real fixtures for skill SC-1/SC-2/SC-3 testing (serial order, element + free modes, multi-screenshot, missing-image cases).
- The repo already has a 56-line `README.md` to expand (not greenfield) — preserve any accurate existing content (regression guard).

### Established Patterns
- Note id = leading 4-digit serial; filename `<serial>-<YYYYMMDD-HHmmss>.md`; screenshots `<serial>-<ts>+N.png` siblings. Serial ordering is lexicographic on the zero-padded prefix.
- `status` frontmatter key already drives read/unread pins — the skill mutates this key rather than introducing new state.
- Clean-room hygiene (sfx-* namespace, zero upstream text) is enforced from Phase 1; CLEAN-ROOM.md documents the already-true state, it doesn't retrofit it.

### Integration Points
- Skill ↔ disk only (no network, no host calls) — it reads/renames/rewrites `.md` files in `notes/`. The host and extension are untouched.
- Read-state written by the skill (`status: read` + `.read.md` rename) is read back by the extension's pin rehydration on next Review Mode entry.

## RESEARCH-FLAG-1 (for gsd-phase-researcher)
Confirm `listAnnotations` (host `GET /annotations`) globs `<serial>-*.md` such that a `0001-….read.md` file is still listed and its `status: read` surfaces to the extension as a read pin. If the glob excludes `.read.md` or read state isn't surfaced, D-07 needs adjustment (e.g., keep filename, rely on `status` only — but that conflicts with SKILL-04's rename requirement, so the host glob is the thing to verify, not the decision to change).
</code_context>

<specifics>
## Specific Ideas

- The skill's whole reason to exist: replace screenshot-paste-describe ping-pong with a durable, file-based, iterative loop. The skill should read like instructions an agent follows autonomously, not a CLI tool spec.
- "<5 minutes to working" is the README's success bar — the quickstart must be copy-pasteable end to end.
</specifics>

<deferred>
## Deferred Ideas

- Release-gate GPL grep audit (full upstream selector-constant set) — Phase 8 SC-4.
- All error-path toast hardening, concurrent-Send stress, idle-eviction regression — Phase 8.
- Installer / one-click token pairing / host auto-start / cross-browser packaging — Phase 9.
- Real recorded demo GIF asset — Omer records post-phase; this phase ships the placeholder + instructions only.

None — discussion stayed within phase scope.
</deferred>

---

*Phase: 7-review-notes-skill-docs*
*Context gathered: 2026-06-03*
