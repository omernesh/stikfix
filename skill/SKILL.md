# review-notes

Process unread stickyfix review notes in serial order — read each note, apply the
requested code fix, then update the note's status so the extension can surface the
result on the page. This replaces the screenshot-paste-describe ping-pong of UI
review with a durable, file-based, iterative loop: a developer drops notes on a live
page, saves them to disk via the stickyfix host, then tells you to "read my notes" —
you fix the code and write a structured reply back into the note, idempotently,
without any manual copy-paste.

## When to use

- The user says "read my notes", "process review notes", "fix sticky notes", "run
  review-notes", or "what notes do I have"
- There is a `notes/` directory in the project (or an explicit path was given) that
  may contain unread `.md` note files written by the stickyfix extension

## When NOT to use

- The user wants to view notes without acting on them (read-only inspection)
- The user has not set up the stickyfix host and extension (no `notes/` directory)
- You are operating outside the project repository where notes live

## Preconditions

- Notes directory: `./notes` relative to the project root, unless the user supplies an
  explicit path argument (e.g. "read my notes in /path/to/project/notes")
- You must be able to read, write, and rename files inside that directory
- The `yaml` library (`yaml@2.9.0`) is available in the project if you need to
  programmatically parse or reserialize frontmatter; alternatively, parse the YAML
  block manually as described in the steps below

## Note frontmatter schema

Every note file starts with a YAML frontmatter block. The fields written by the
extension at creation time are:

```
---
id: 1
created: "2026-01-01T12:00:00.000Z"
mode: element          # or: free
url: "https://example.com/page"
title: "Page Title"
viewport:
  width: 1280
  height: 800
  dpr: 1
selector: "#submit-btn"         # element mode only
react_component: "SubmitButton" # element mode, optional
rect:
  x: 100
  y: 200
  width: 80
  height: 30
screenshots:
  - "0001-20260101-120000+1.png"
status: unread
---
```

Free-mode notes omit `selector`, `react_component`, and `rect`, and instead include
`note_position: {x, y}`.

The AI review loop may add or update the following fields. **Preserve every existing
field; only add or update `status`, `reply`, and `fixed_in`.**

| Field | Type | Who sets it | Meaning |
|-------|------|-------------|---------|
| `status` | string | AI | Lifecycle state — one of `unread`, `flagged`, `resolved`, `read` (see below) |
| `reply` | string | AI | One-line message shown to the developer in the extension UI on hover |
| `fixed_in` | string | AI | Optional commit hash or PR ref where the fix landed (set when `status: resolved`) |

### Status values and their meaning

| `status` | Set by | Visual in extension | File renamed? | Meaning |
|----------|--------|---------------------|---------------|---------|
| `unread` | Extension (at creation) | Default pin colour | No | Not yet processed |
| `flagged` | AI | Amber pin; `reply` text on hover | No | Ambiguous — needs developer clarification |
| `resolved` | AI | Green pin with ✓; `reply` text on hover | No | AI fixed the issue; developer should verify on page |
| `read` | AI (archive step) | Hidden — no pin shown | Yes → `*.read.md` | Archived / dismissed; developer has acknowledged |

## Steps

1. **Discover unread notes**

   List all files in the notes directory. Keep only filenames that end in `.md` AND
   do NOT end in `.read.md` — both patterns end with `.md`, so the exclusion must be
   explicit. In pseudocode:

   ```
   unread = files.filter(f => f.endsWith('.md') && !f.endsWith('.read.md'))
   unread.sort()   // ascending lexicographic
   ```

   The filename format is `<serial>-<YYYYMMDD-HHmmss>.md` where `<serial>` is a
   4-digit zero-padded integer (e.g. `0001`, `0042`). Because every serial is
   zero-padded to exactly 4 digits, ascending lexicographic sort equals serial order
   — process notes from lowest serial to highest.

   If there are no unread notes, report "no unread notes" and stop. Do not process
   `*.read.md` files — they are already done.

2. **Process each note in serial order**

   For each unread note filename (lowest serial first):

   a. **Read the file and parse frontmatter**

      First, short-circuit on already-handled notes. After parsing the frontmatter,
      check the `status` field BEFORE doing any work:

      - `status: read` → skip this note (it is archived; normally it is also renamed
        to `*.read.md` and excluded in Step 1, but skip defensively if you encounter
        it).
      - `status: flagged` → skip this note. A flagged note was already judged
        ambiguous on a prior run and is awaiting human clarification. Do NOT
        re-process it and do NOT append another `> flagged:` blockquote — re-flagging
        duplicates the reason line on every run. A flagged note is intentionally NOT
        renamed (it stays a `.md` file so it remains visible), so it WILL reappear in
        the Step 1 listing; the `status: flagged` check here is what makes the re-run
        idempotent for it.
      - `status: resolved` → skip this note. The fix has been applied on a prior run;
        the note is visible in the extension so the developer can verify it on the
        page. Do NOT re-process or re-rename it.

      Only continue to the remaining sub-steps (b–e) when `status` is `unread`. This
      mirrors the `classifyNote` helper (`lib/review-notes.ts`), which returns
      `'read'`, `'flagged'`, or `'resolved'` as skip outcomes and only
      `'fixable'`/`'text-only'` as actionable.

      Parse the frontmatter by extracting the text between the first `---` pair and
      passing it to a YAML parser.

      Derive the note's serial from `filename.slice(0, 4)` — NEVER from the `id`
      frontmatter field. The `id` field is stored as an integer and loses its leading
      zeros (the integer `1` is not the string `"0001"`). The filename prefix always
      carries the authoritative zero-padded serial.

      The text after the closing `---\n` is the note body. The first non-blank line
      of the body is the developer's instruction — the comment they typed into the
      stickyfix note UI. Read it as the actionable request.

   b. **Read element context (element mode only)**

      If `mode` is `element`, the body contains a `## Element context` section
      immediately after the developer comment. Use this section to locate the
      relevant code. It looks like:

      ```markdown
      ## Element context

      - **Selector:** `#submit-btn`
      - **React component:** `SubmitButton`
      - **Tag / role:** `button` / `button`
      - **Text:** Submit
      - **Rect:** x=100 y=200 w=80 h=30

      ### Computed styles (curated)
      | prop | value |
      |------|-------|
      | display | inline-flex |
      | color | rgb(255,255,255) |

      ### outerHTML (truncated)
      ```html
      <button id="submit-btn" class="btn-primary">Submit</button>
      ```
      ```

      The selector, React component name, tag, text, computed styles, and outerHTML
      together give you enough context to locate the exact element in the codebase
      without guessing. Use `grep`, a file search, or your knowledge of the project
      structure to find the relevant source file(s).

   c. **Open screenshots (if available and present on disk)**

      The frontmatter `screenshots` field is an array of filenames. These filenames
      are relative to the **notes directory**, not the project root. Resolve each
      screenshot path by joining it with the notes directory path:

      ```
      screenshotAbsPath = join(notesDir, screenshotFilename)
      ```

      If `screenshots` is non-empty AND the referenced PNG files exist on disk, open
      them with vision when the text description or element context alone is
      insufficient to understand the issue.

      If a referenced screenshot file does not exist on disk, emit exactly one line:

      ```
      WARN: <filename> not found — proceeding text-only
      ```

      Then continue processing the note as a text-only note. A missing screenshot is
      NOT ambiguous — the developer instruction and element context remain actionable.
      Do not flag the note or skip it because of a missing screenshot.

   d. **Apply the fix**

      Using all available context — the developer instruction, element context
      (selector, computed styles, outerHTML), and any screenshots — apply the
      requested fix to the relevant source file(s) in the project.

      If the instruction is genuinely ambiguous even after reading the element
      context and any screenshots — for example, "make this better" with no
      actionable target and no element context — do NOT attempt a fix. Instead:

      - Update the frontmatter: set `status` from `unread` to `flagged`, and add a
        `reply:` field containing a short, one-line clarification question directed at
        the developer (e.g. `reply: "Which colour should the button be — brand blue or
        red?"`)
      - Optionally also append a blockquote line to the end of the note body for
        human readability:
        ```
        > flagged: <brief reason why the instruction is ambiguous>
        ```
        (The canonical machine-readable signal is the `reply:` frontmatter field; the
        blockquote is supplementary.)
      - Leave the filename unchanged (do NOT rename to `.read.md` or any other name)
      - Skip to the next note

      The extension renders flagged pins in amber and shows the `reply` text on hover,
      so the developer sees exactly what question to answer.

      For all other cases (clear instruction, missing-screenshot text-only, element
      mode with context), proceed with the fix and continue to step (e).

   e. **Mark the note as resolved — ONLY after a successful fix**

      The frontmatter update is the LAST action, performed only after the fix has been
      successfully applied. This ordering is the core reliability guarantee: if the fix
      fails or is interrupted, the note stays `unread` and will be retried on the next
      run.

      **Update the frontmatter:** Parse the YAML block, set `status: resolved`, add a
      `reply:` field with a one-line description of what was done, and optionally add
      `fixed_in:` with the commit hash or PR ref. Preserve every other existing field.

      ```
      rawFm = content between the first --- pair
      fm = yaml.parse(rawFm)
      fm['status'] = 'resolved'
      fm['reply'] = 'Renamed Submit → Save Changes in Header.tsx'   // what you did
      fm['fixed_in'] = 'abc1234'   // optional: commit hash or PR ref
      newFmBlock = '---\n' + yaml.stringify(fm) + '---\n'
      newContent = newFmBlock + bodyAfterFrontmatter
      writeFile(mdPath, newContent)
      ```

      The project's `yaml` library (`yaml@2.9.0`, import `{ parse, stringify } from
      'yaml'`) handles colons and quotes in URL values correctly — do not hand-roll
      YAML serialization.

      **Do NOT rename the file.** A resolved note stays as `<serial>-<timestamp>.md`
      so it remains visible in the extension as a green pin with a ✓. The developer
      must be able to see the fix confirmation on the page before dismissing the note.

      **Archive / dismiss (separate, later step):** Only when the developer has
      acknowledged a resolved note (or explicitly wants to dismiss a note) should the
      note be archived. Archiving means:

      - Set `status: read` in the frontmatter
      - Rename the file: `readPath = mdPath.replace(/\.md$/, '.read.md')`

      This two-step approach (status:read + rename to *.read.md) is belt-and-suspenders:
      the rename is the primary skip signal on the next run (excluded by the glob in
      Step 1); the `status: read` frontmatter field lets other tools (like
      `listAnnotations` in the host) still list the note while knowing it is archived.
      The archive step is NOT done automatically after fixing — it is a separate,
      developer-triggered action.

3. **Report a terse summary**

   After processing all notes, report:

   ```
   Processed N notes: M resolved (fix applied), K flagged (needs clarification), J skipped (resolved/read).
   ```

   If any notes were resolved, list their filenames and the `reply` text (what was
   done) so the developer knows what to verify on the page.

   If any notes were flagged, list their filenames and the `reply` question so the
   developer knows what to clarify.

## After the pass

On the next run:

- `resolved` notes: still present as `.md` files (not renamed), skipped by the
  `status: resolved` check in Step 2a. They remain visible on the page as green pins
  until the developer archives them.
- `flagged` notes: skipped by the `status: flagged` check in Step 2a. They remain
  visible on the page as amber pins until the developer answers the question and the
  note is re-opened for processing.
- `read` notes: excluded by the Step 1 glob (renamed to `*.read.md`) and skipped
  defensively by the `status: read` check if encountered anyway.

A re-run on a fully-processed directory does no fixing work and reports either "no
unread notes" (all `unread` notes have been resolved or flagged) or that only
previously-flagged notes remain. This is the idempotency guarantee — re-running never
re-applies a fix, never re-resolves an already-resolved note, and never appends a
duplicate `> flagged:` blockquote.

## Forbidden patterns (do not do these)

- **Glob `*.md` without excluding `*.read.md`** — `.read.md` files end in `.md`; a
  naive glob will reprocess already-archived notes
- **Derive serial from the `id` frontmatter field** — the integer `id` loses zero-
  padding; always use `filename.slice(0, 4)`
- **Set `status: read` on a successful fix** — a successful fix must set
  `status: resolved` (not `read`). `read` is the archive state, set only after the
  developer has acknowledged the resolved note. Getting this wrong hides the green pin
  before the developer can verify the fix.
- **Rename the file after a fix** — resolved notes are NOT renamed. Renaming to
  `*.read.md` is the archive step, not the fix-completion step.
- **Rename before fix** — for the archive step (if triggered), write the updated
  status first; rename is always the last action
- **Treat a missing screenshot as ambiguous** — warn once and proceed text-only;
  only an unclear developer instruction triggers the flagged path
- **Overwrite existing frontmatter fields** — always parse the YAML block, update
  only `status`, `reply`, and `fixed_in`, and reserialize. Never clobber `id`,
  `created`, `url`, `selector`, or any other field the extension wrote.
- **Make network or host calls** — this skill is disk-only; do not call the stickyfix
  host HTTP API, do not POST to any endpoint
