/**
 * Pure helper functions for the review-notes skill.
 * SKILL-02: glob/exclude/sort unread notes
 * SKILL-04: read-marker computation + idempotency
 * SKILL-05: note classification (status + screenshot presence)
 *
 * No fs/DOM/chrome surface — all functions operate on plain strings/arrays.
 * The agent (skill prose) owns I/O; these are the deterministic backbone.
 *
 * Serial is always derived from filename.slice(0,4) — NEVER from `id` frontmatter
 * (the integer `id` field loses zero-padding: 1 not "0001").
 * See host/src/read-note.ts line 77 for the authoritative pattern.
 */

// ---------------------------------------------------------------------------
// selectUnread — filter a file listing to unread .md notes, sorted ascending
// ---------------------------------------------------------------------------

/**
 * Given an array of filenames (as returned by readdirSync), return a NEW
 * sorted array containing only filenames that:
 *   1. end in `.md`
 *   2. do NOT end in `.read.md` (explicit exclusion — RESEARCH Pitfall 1)
 *
 * Sort is ascending lexicographic (default string sort). The zero-padded
 * 4-digit serial prefix guarantees lexicographic order === serial order.
 *
 * Does NOT mutate the input array.
 */
export function selectUnread(files: readonly string[]): string[] {
  return files
    .filter(f => f.endsWith('.md') && !f.endsWith('.read.md'))
    .sort();
}

// ---------------------------------------------------------------------------
// markReadName — compute the *.read.md name for a given note filename
// ---------------------------------------------------------------------------

/**
 * Return the read-marker filename for the given note filename.
 * Replaces the trailing `.md` with `.read.md`.
 *
 * Idempotent guard: if the name already ends in `.read.md` it is returned
 * unchanged — prevents `0001-t.read.read.md` double-suffix (SKILL-04).
 *
 * Pattern mirrors host/src/read-note.ts line 189:
 *   mdPath.replace(/\.md$/, '.read.md')
 * The idempotent guard is added here because the skill re-runs are common.
 */
export function markReadName(name: string): string {
  if (name.endsWith('.read.md')) return name;
  return name.replace(/\.md$/, '.read.md');
}

// ---------------------------------------------------------------------------
// classifyNote — deterministic classification from frontmatter + file list
// ---------------------------------------------------------------------------

/**
 * Classify a note based on its frontmatter `status` and `screenshots` fields
 * against the set of screenshot files actually present on disk.
 *
 * Returns one of:
 *   'read'      — status is 'read'; skill skips this note
 *   'flagged'   — status is 'flagged'; note stays visible, skill skips (D-08)
 *   'text-only' — status is 'unread' AND at least one referenced screenshot
 *                 filename is absent from existingScreenshotNames (D-09).
 *                 Missing image is NOT ambiguous — proceed text-only.
 *   'fixable'   — status is 'unread' AND all referenced screenshots are present
 *                 (or screenshots array is empty — no screenshots is normal)
 *
 * NOTE: 'ambiguous' is a RUNTIME judgement the agent makes from instruction
 * clarity (D-08). It is NOT decidable from frontmatter alone — classifyNote
 * does not return 'ambiguous'. The prose skill owns the ambiguity call.
 *
 * @param fm  Frontmatter object (parsed YAML). Absent/undefined fields are safe.
 * @param existingScreenshotNames  Array of filenames present on disk in notes/.
 */
export function classifyNote(
  fm: { status?: string; screenshots?: string[] },
  existingScreenshotNames: readonly string[]
): 'read' | 'flagged' | 'fixable' | 'text-only' {
  if (fm.status === 'read') return 'read';
  if (fm.status === 'flagged') return 'flagged';

  // Treat absent/undefined screenshots field as empty (RESEARCH A1: UAT notes vary)
  const screenshots = fm.screenshots ?? [];

  // D-09: if ANY referenced screenshot is missing → text-only (not flagged)
  if (
    screenshots.length > 0 &&
    screenshots.some(s => !existingScreenshotNames.includes(s))
  ) {
    return 'text-only';
  }

  return 'fixable';
}
