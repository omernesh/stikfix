/**
 * Pure path-string helpers shared by the service worker AND content scripts.
 *
 * SIDE-EFFECT-FREE by design: no Node builtins, no top-level statements, no
 * chrome.* access. This is the whole point of the module — the chip (content
 * script) and the SW both need identical separator/basename logic, and this is
 * the single source of truth for it. Importing it into a content-script bundle
 * must never drag in SW-only registrations (that lives in background.ts).
 */

/**
 * basename of an absolute path (last path segment), '' if none. Handles both
 * POSIX ('/') and Windows ('\\') separators; tolerates trailing separators.
 */
export function basenameOf(p: string | undefined | null): string {
  if (typeof p !== 'string') return '';
  const trimmed = p.replace(/[\\/]+$/, '');
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

/**
 * Derive the project root from a notesDir by stripping a trailing `/notes` (or
 * `\notes`) segment, tolerating both POSIX and Windows separators. Returns
 * undefined for an empty/whitespace notesDir (root unknown).
 *
 * Examples:
 *   /home/me/proj/notes  → /home/me/proj
 *   C:\code\proj\notes   → C:\code\proj
 *   /home/me/proj        → /home/me  (last segment stripped as a fallback)
 */
export function rootFromNotesDir(notesDir: string | undefined | null): string | undefined {
  if (typeof notesDir !== 'string') return undefined;
  const trimmed = notesDir.replace(/[\\/]+$/, ''); // drop trailing separators
  if (trimmed.length === 0) return undefined;
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  if (idx <= 0) return undefined; // no separator (or leading-only) → root unknown
  const parent = trimmed.slice(0, idx);
  return parent.length > 0 ? parent : undefined;
}
