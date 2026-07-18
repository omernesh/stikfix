---
name: review-notes
description: |
  Process unread stikfix review notes in the notes/ directory. Use when the
  user says "read my notes", "process review notes", "fix sticky notes", "run
  review-notes", or "what notes do I have". Reads each unread *.md note in
  serial order, applies the requested code fix, then sets status:resolved and
  writes a reply: field so the extension shows a green ✓ pin on the page.
  Flagged (ambiguous) notes get status:flagged plus a reply: clarification
  question shown as an amber pin. Archive/dismiss (status:read + *.read.md
  rename) is a separate step done only after developer acknowledgement.
  Idempotent — re-running on an already-processed directory reports "no unread
  notes".
---

Read and follow the instructions in `skill/SKILL.md` in this repository.
The notes directory defaults to `./notes` relative to the project root.
Opt-in **git-sync mode** (pull-before-read, commit+push after resolving) is
also covered there — see "Git-sync mode (optional)" in `skill/SKILL.md`.
