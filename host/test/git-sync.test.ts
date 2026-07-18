/**
 * Unit tests for host/src/git-sync.ts.
 *
 * Uses an INJECTED fake execFileFn — no real git is ever spawned. Covers:
 *   (a) successful sync command sequence (add → commit → push, padded serial,
 *       `-- <notesDir>` pathspec)
 *   (b) non-git-repo short-circuits with a recorded failure status, no add/commit/push
 *   (c) "nothing to commit" is treated as success/no-op (push skipped)
 *   (d) push failure records status but does NOT throw
 *   (e) the module queue serializes two concurrent calls
 *
 * Pattern 12: node:test lifecycle hooks, node:assert/strict. Mirrors serial.test.ts.
 */

import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  gitSyncNote,
  isGitRepo,
  getLastGitSyncStatus,
  __resetGitSyncStateForTests,
  type ExecFileFn,
} from '../src/git-sync.js';

interface RecordedCall {
  file: string;
  args: string[];
  cwd: string;
}

/**
 * Build a fake execFileFn. `handler` maps a git subcommand (args[0]) to either
 * a resolved {stdout,stderr} or a thrown error. An optional `delayMs` inserts an
 * await so interleaving would be observable if the queue did NOT serialize.
 */
function makeFake(
  handler: (sub: string, args: string[], cwd: string) => { stdout?: string; stderr?: string },
  delayMs = 0,
): { fn: ExecFileFn; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fn: ExecFileFn = async (file, args, options) => {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    calls.push({ file, args: [...args], cwd: options.cwd });
    const result = handler(args[0] ?? '', [...args], options.cwd);
    return { stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  };
  return { fn, calls };
}

/** A git error as promisified execFile would reject: carries code/stdout/stderr. */
function gitError(fields: { code?: number; stdout?: string; stderr?: string; message?: string }): Error {
  const err = new Error(fields.message ?? 'git failed') as Error & {
    code?: number;
    stdout?: string;
    stderr?: string;
  };
  err.code = fields.code ?? 1;
  err.stdout = fields.stdout ?? '';
  err.stderr = fields.stderr ?? '';
  return err;
}

describe('git-sync', () => {
  beforeEach(() => {
    __resetGitSyncStateForTests();
  });

  // -------------------------------------------------------------------------
  test('(a) successful sync issues add → commit → push with correct args', async () => {
    const root = '/repo/a';
    const notesDir = '/repo/a/notes';
    const { fn, calls } = makeFake((sub) => {
      if (sub === 'rev-parse') return { stdout: 'true\n' };
      return { stdout: '' };
    });

    await gitSyncNote({ root, notesDir, serial: 7, execFileFn: fn });

    // rev-parse (isGitRepo) then add, commit, push — 4 calls, all cwd=root, all `git`.
    assert.equal(calls.length, 4);
    assert.ok(calls.every((c) => c.file === 'git'));
    assert.ok(calls.every((c) => c.cwd === root));

    assert.deepEqual(calls[0].args, ['rev-parse', '--is-inside-work-tree']);
    assert.deepEqual(calls[1].args, ['add', '--', notesDir]);
    assert.deepEqual(calls[2].args, ['commit', '-m', 'stikfix: note 0007', '--', notesDir]);
    assert.deepEqual(calls[3].args, ['push']);

    const status = getLastGitSyncStatus();
    assert.ok(status);
    assert.equal(status.ok, true);
    assert.equal(status.error, undefined);
    assert.equal(typeof status.at, 'number');
  });

  // -------------------------------------------------------------------------
  test('(b) non-git-repo short-circuits: failure status, no add/commit/push', async () => {
    const root = '/not/a/repo';
    const { fn, calls } = makeFake((sub) => {
      if (sub === 'rev-parse') throw gitError({ code: 128, stderr: 'not a git repository' });
      return { stdout: '' };
    });

    await gitSyncNote({ root, notesDir: '/not/a/repo/notes', serial: 3, execFileFn: fn });

    // Only the rev-parse probe ran; no mutating commands.
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].args, ['rev-parse', '--is-inside-work-tree']);
    assert.ok(!calls.some((c) => c.args[0] === 'add'));
    assert.ok(!calls.some((c) => c.args[0] === 'commit'));
    assert.ok(!calls.some((c) => c.args[0] === 'push'));

    const status = getLastGitSyncStatus();
    assert.ok(status);
    assert.equal(status.ok, false);
    assert.equal(status.error, 'not a git repository');
  });

  // -------------------------------------------------------------------------
  test('(c) "nothing to commit" is treated as success/no-op; push skipped', async () => {
    const root = '/repo/c';
    const notesDir = '/repo/c/notes';
    const { fn, calls } = makeFake((sub) => {
      if (sub === 'rev-parse') return { stdout: 'true' };
      if (sub === 'add') return { stdout: '' };
      if (sub === 'commit') {
        throw gitError({ code: 1, stdout: 'nothing to commit, working tree clean' });
      }
      return { stdout: '' };
    });

    await gitSyncNote({ root, notesDir, serial: 12, execFileFn: fn });

    // rev-parse, add, commit — but NO push (nothing changed).
    assert.deepEqual(calls.map((c) => c.args[0]), ['rev-parse', 'add', 'commit']);
    assert.ok(!calls.some((c) => c.args[0] === 'push'));

    const status = getLastGitSyncStatus();
    assert.ok(status);
    assert.equal(status.ok, true, 'nothing-to-commit must record ok:true');
  });

  // -------------------------------------------------------------------------
  test('(d) push failure records failure status but does not throw', async () => {
    const root = '/repo/d';
    const notesDir = '/repo/d/notes';
    const { fn, calls } = makeFake((sub) => {
      if (sub === 'rev-parse') return { stdout: 'true' };
      if (sub === 'push') {
        throw gitError({ code: 1, stderr: 'fatal: no upstream configured for branch' });
      }
      return { stdout: '' };
    });

    // Must resolve (not reject) even though push failed.
    await assert.doesNotReject(() =>
      gitSyncNote({ root, notesDir, serial: 1, execFileFn: fn }),
    );

    // The commit still happened (local + safe); push was attempted.
    assert.deepEqual(calls.map((c) => c.args[0]), ['rev-parse', 'add', 'commit', 'push']);

    const status = getLastGitSyncStatus();
    assert.ok(status);
    assert.equal(status.ok, false);
    assert.ok(
      status.error && status.error.includes('no upstream'),
      `expected push error recorded, got: ${status.error}`,
    );
  });

  // -------------------------------------------------------------------------
  test('(e) queue serializes two concurrent calls (no interleaving)', async () => {
    const rootA = '/repo/e-a';
    const rootB = '/repo/e-b';
    // 5ms delay per op so unserialized calls WOULD interleave.
    const { fn, calls } = makeFake((sub) => {
      if (sub === 'rev-parse') return { stdout: 'true' };
      return { stdout: '' };
    }, 5);

    // Fire both WITHOUT awaiting the first.
    const p1 = gitSyncNote({ root: rootA, notesDir: `${rootA}/notes`, serial: 1, execFileFn: fn });
    const p2 = gitSyncNote({ root: rootB, notesDir: `${rootB}/notes`, serial: 2, execFileFn: fn });
    await Promise.all([p1, p2]);

    // All of call A's 4 ops must complete before any of call B's ops begin.
    const cwds = calls.map((c) => c.cwd);
    assert.deepEqual(cwds, [rootA, rootA, rootA, rootA, rootB, rootB, rootB, rootB]);
  });

  // -------------------------------------------------------------------------
  test('isGitRepo caches per-root (probe runs once)', async () => {
    const root = '/repo/cache';
    let probeCount = 0;
    const fn: ExecFileFn = async () => {
      probeCount++;
      return { stdout: 'true\n', stderr: '' };
    };

    assert.equal(await isGitRepo(root, fn), true);
    assert.equal(await isGitRepo(root, fn), true);
    assert.equal(probeCount, 1, 'second isGitRepo call must hit the cache');
  });
});
