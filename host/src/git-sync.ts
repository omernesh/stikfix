/**
 * Opt-in git-sync for stikfix-host.
 *
 * When git-sync is enabled, after a note's .md + screenshots are written AND the
 * HTTP 200 is already sent, the host commits ONLY the notes/ folder and pushes —
 * non-blocking, so Send stays instant. Default (git-sync OFF) = no git calls at all;
 * this module is never even imported into the hot path unless a sync is requested
 * (server.ts fires gitSyncNote only when doSync is true) and isGitRepo is only
 * queried by /status.
 *
 * Security invariant (matches host/src/folder-picker.ts and
 * host/src/bootstrap/register.ts): ALL shell-outs go through
 * execFile('git', [argArray], { cwd: root }) — NEVER exec, NEVER shell:true, and
 * NEVER string-interpolate user input into a command. Arg arrays only. The commit
 * message is a fixed `stikfix: note NNNN` (NNNN = digits) passed as a single arg
 * element, so command injection is impossible.
 *
 * Node builtins only — no WXT, no Chrome imports.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Injectable execFile shape (promisified). The real default is
 * promisify(execFile); unit tests inject a fake so no real git is spawned.
 * A non-zero git exit rejects with an error carrying `code`, `stdout`, `stderr`.
 */
export type ExecFileFn = (
  file: string,
  args: readonly string[],
  options: { cwd: string },
) => Promise<{ stdout: string; stderr: string }>;

export interface GitSyncStatus {
  ok: boolean;
  error?: string;
  at: number;
}

const execFileAsync = promisify(execFile) as unknown as ExecFileFn;

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

/** Per-root cache of "is this a git work tree" — repo status is stable per session. */
const gitRepoCache = new Map<string, boolean>();

/** Result of the most recent git-sync attempt (null until the first attempt). */
let lastStatus: GitSyncStatus | null = null;

/**
 * Serialize all git operations through a promise-chain queue (mutex): each
 * gitSyncNote call chains after the previous so concurrent notes never race git.
 * Never rejects — the chain always continues.
 */
let gitQueue: Promise<void> = Promise.resolve();

// ---------------------------------------------------------------------------
// isGitRepo — cached "is <root> inside a git work tree"
// ---------------------------------------------------------------------------

/**
 * Return true iff `git rev-parse --is-inside-work-tree` (cwd=root) exits 0 and
 * prints "true". Cached per-root (repo status doesn't change during a session)
 * so /status calls are cheap.
 */
export async function isGitRepo(
  root: string,
  execFileFn: ExecFileFn = execFileAsync,
): Promise<boolean> {
  const cached = gitRepoCache.get(root);
  if (cached !== undefined) return cached;

  let result = false;
  try {
    const { stdout } = await execFileFn('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root });
    result = stdout.trim() === 'true';
  } catch {
    result = false;
  }

  gitRepoCache.set(root, result);
  return result;
}

// ---------------------------------------------------------------------------
// getLastGitSyncStatus — read the most recent attempt (for /status)
// ---------------------------------------------------------------------------

export function getLastGitSyncStatus(): GitSyncStatus | null {
  return lastStatus;
}

// ---------------------------------------------------------------------------
// gitSyncNote — commit ONLY notes/ and push (queued, never rejects)
// ---------------------------------------------------------------------------

/**
 * Heuristic: did this git error mean "there was nothing to commit"? git commit
 * exits 1 with a clean tree and prints "nothing to commit" / "no changes added".
 */
function isNothingToCommit(err: unknown): boolean {
  const e = err as { code?: number | string; stdout?: string; stderr?: string; message?: string };
  const text = `${e.stdout ?? ''}\n${e.stderr ?? ''}\n${e.message ?? ''}`.toLowerCase();
  return (
    text.includes('nothing to commit') ||
    text.includes('no changes added to commit') ||
    text.includes('nothing added to commit')
  );
}

/**
 * Sync a single note to git: add → commit (pathspec-limited to notes/) → push.
 *
 * Behavior:
 *  1. Not a git repo → record {ok:false, error:'not a git repository'} and return
 *     (does NOT throw).
 *  2. `git add -- <notesDir>` — stage only the note files.
 *  3. `git commit -m "stikfix: note <NNNN>" -- <notesDir>` — pathspec-limited so it
 *     commits ONLY notes/, never the owner's other staged/unstaged code. A
 *     "nothing to commit" exit is treated as OK/no-op, not an error.
 *  4. `git push` — uses the current branch's upstream. On push failure (no upstream,
 *     non-fast-forward, …) the error is recorded but NO automatic pull/rebase is
 *     attempted (never mutate the owner's branch beyond adding the note commit).
 *     The commit is already local and safe.
 *  5. Full success → record {ok:true}.
 *
 * Serialized through a module-level queue; catches ALL errors internally so it can
 * be fired non-awaited without ever crashing the host.
 */
export function gitSyncNote(args: {
  root: string;
  notesDir: string;
  serial: number;
  execFileFn?: ExecFileFn;
}): Promise<void> {
  const { root, notesDir, serial } = args;
  const run = args.execFileFn ?? execFileAsync;

  // Chain onto the queue; the wrapped body never rejects.
  const next = gitQueue.then(async () => {
    try {
      if (!(await isGitRepo(root, run))) {
        lastStatus = { ok: false, error: 'not a git repository', at: Date.now() };
        return;
      }

      // Stage only the notes dir (absolute path is fine with cwd=root).
      await run('git', ['add', '--', notesDir], { cwd: root });

      // Pathspec-limited commit — fixed message, NNNN = zero-padded serial digits.
      const message = `stikfix: note ${String(serial).padStart(4, '0')}`;
      try {
        await run('git', ['commit', '-m', message, '--', notesDir], { cwd: root });
      } catch (commitErr) {
        if (isNothingToCommit(commitErr)) {
          // Note path already committed — treat as success/no-op.
          lastStatus = { ok: true, at: Date.now() };
          return;
        }
        throw commitErr;
      }

      // Push to the current branch's upstream. On failure, record but do NOT
      // pull/rebase — the commit is already local and safe.
      await run('git', ['push'], { cwd: root });

      lastStatus = { ok: true, at: Date.now() };
    } catch (err) {
      const e = err as { message?: string; stderr?: string };
      const detail = (e.stderr && e.stderr.trim()) || e.message || String(err);
      lastStatus = { ok: false, error: detail, at: Date.now() };
    }
  });

  // Keep the queue alive even if something unexpected escapes (it shouldn't).
  gitQueue = next.catch(() => {});
  return next;
}

// ---------------------------------------------------------------------------
// Test-only reset — clear module state between unit tests
// ---------------------------------------------------------------------------

/** @internal Reset cache/status/queue. Used by unit tests only. */
export function __resetGitSyncStateForTests(): void {
  gitRepoCache.clear();
  lastStatus = null;
  gitQueue = Promise.resolve();
}
