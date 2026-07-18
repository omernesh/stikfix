/**
 * node:test unit tests for bin/skill-install.ts
 *
 * Covers the user-level review-notes skill install/remove helpers used by
 * `npx stikfix init` / `uninstall`:
 *   - installReviewNotesSkill: creates ~/.claude/skills/review-notes/SKILL.md
 *     with the given content; idempotent overwrite; ok:false (never throws) when
 *     the target dir cannot be created (homeDir is an existing FILE path).
 *   - removeReviewNotesSkill: deletes an installed file; no-op when absent; never throws.
 *
 * Pattern: mkdtempSync tmpdir lifecycle per describe (matches host/test conventions).
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installReviewNotesSkill, removeReviewNotesSkill } from '../../bin/skill-install.js';

const SKILL_PATH_TAIL = join('.claude', 'skills', 'review-notes', 'SKILL.md');

describe('installReviewNotesSkill', () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'sfx-skill-test-'));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  test('creates ~/.claude/skills/review-notes/SKILL.md with the given content', () => {
    const content = '# review-notes\n\nBody content for the skill.\n';
    const result = installReviewNotesSkill(home, content);

    assert.equal(result.ok, true);
    assert.equal(result.error, undefined);
    assert.equal(result.path, join(home, SKILL_PATH_TAIL));
    assert.ok(existsSync(result.path), 'SKILL.md should exist on disk');
    assert.equal(readFileSync(result.path, 'utf8'), content);
  });

  test('overwrites an existing file (idempotent update)', () => {
    const first = installReviewNotesSkill(home, 'old content');
    assert.equal(first.ok, true);

    const second = installReviewNotesSkill(home, 'new content');
    assert.equal(second.ok, true);
    assert.equal(second.path, first.path);
    assert.equal(readFileSync(second.path, 'utf8'), 'new content');
  });

  test('returns ok:false with an error (never throws) when the dir cannot be created', () => {
    // Make homeDir an existing FILE — mkdirSync of a subpath under it fails (ENOTDIR).
    const fileHome = join(home, 'not-a-dir');
    writeFileSync(fileHome, 'i am a file, not a directory');

    let result: ReturnType<typeof installReviewNotesSkill>;
    assert.doesNotThrow(() => {
      result = installReviewNotesSkill(fileHome, 'content');
    });
    // @ts-expect-error assigned inside doesNotThrow callback
    assert.equal(result.ok, false);
    // @ts-expect-error assigned inside doesNotThrow callback
    assert.equal(typeof result.error, 'string');
    // @ts-expect-error assigned inside doesNotThrow callback
    assert.ok(result.error.length > 0);
    // @ts-expect-error assigned inside doesNotThrow callback
    assert.equal(existsSync(result.path), false);
  });
});

describe('removeReviewNotesSkill', () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'sfx-skill-test-'));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  test('deletes an installed file (removed:true)', () => {
    const installed = installReviewNotesSkill(home, 'content');
    assert.equal(installed.ok, true);
    assert.ok(existsSync(installed.path));

    const result = removeReviewNotesSkill(home);
    assert.equal(result.removed, true);
    assert.equal(result.path, installed.path);
    assert.equal(existsSync(result.path), false);
  });

  test('is a no-op when the file is absent (removed:false), never throwing', () => {
    let result: ReturnType<typeof removeReviewNotesSkill>;
    assert.doesNotThrow(() => {
      result = removeReviewNotesSkill(home);
    });
    // @ts-expect-error assigned inside doesNotThrow callback
    assert.equal(result.removed, false);
    // @ts-expect-error assigned inside doesNotThrow callback
    assert.equal(result.path, join(home, SKILL_PATH_TAIL));
  });
});
