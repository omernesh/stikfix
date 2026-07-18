/**
 * Pure helpers for installing / removing the user-level review-notes skill.
 *
 * Kept in a standalone, side-effect-free module (no top-level CLI dispatch) so
 * it can be unit-tested in isolation without executing bin/stikfix.ts's init
 * flow on import. bin/stikfix.ts imports these and wires them into the CLI.
 */

import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Install the review-notes skill into the user-level Claude Code skills dir
 * (~/.claude/skills/review-notes/SKILL.md) so every project's agent can run it.
 * Best-effort: never throws; returns a result the caller reports (no silent failure).
 */
export function installReviewNotesSkill(
  homeDir: string,
  skillContent: string,
): { ok: boolean; path: string; error?: string } {
  const dir = join(homeDir, '.claude', 'skills', 'review-notes');
  const path = join(dir, 'SKILL.md');
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, skillContent, { encoding: 'utf8' });
    return { ok: true, path };
  } catch (err) {
    return { ok: false, path, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Remove the user-level review-notes skill (best-effort; used by uninstall). */
export function removeReviewNotesSkill(homeDir: string): { removed: boolean; path: string } {
  const path = join(homeDir, '.claude', 'skills', 'review-notes', 'SKILL.md');
  try {
    if (existsSync(path)) {
      rmSync(path, { force: true });
      return { removed: true, path };
    }
  } catch {
    /* best-effort */
  }
  return { removed: false, path };
}
