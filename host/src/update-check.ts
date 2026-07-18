/**
 * Host auto-update check for stikfix-host.
 *
 * The host periodically asks GitHub for the latest published release manifest
 * (`latest.json`) and, if a newer version is available, advertises it on
 * GET /status (`update.available` / `latestVersion` / `url` / `sha256`) so the
 * system-tray helper can offer a one-click apply.
 *
 * Design mirrors the git-sync module singleton pattern (getLastGitSyncStatus):
 * a module-level UpdateState is mutated by runUpdateCheck and read by
 * getUpdateState. All network I/O is fully defensive — fetchLatestManifest and
 * runUpdateCheck NEVER throw (a failed check must never crash the host).
 *
 * Node builtins only — uses the Node 20 global `fetch` (follows redirects),
 * consistent with lib/discovery.ts. No new npm dependency.
 */

// ---------------------------------------------------------------------------
// Semver compare (plain MAJOR.MINOR.PATCH, no external dep)
// ---------------------------------------------------------------------------

/**
 * Compare two dotted-integer version strings.
 *
 * Each segment is parsed with parseInt so a non-numeric suffix (e.g. "1.7.0-rc1")
 * contributes only its leading integer. Missing segments count as 0, so
 * "1.7" === "1.7.0". A malformed/empty string parses every segment as 0.
 *
 * @returns -1 if a < b, 0 if equal, 1 if a > b.
 */
export function compareSemver(a: string, b: string): number {
  const parse = (v: string): number[] =>
    String(v ?? '')
      .split('.')
      .map((seg) => {
        const n = parseInt(seg, 10);
        return Number.isNaN(n) ? 0 : n;
      });

  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Update state (module singleton — mirrors git-sync getLastGitSyncStatus)
// ---------------------------------------------------------------------------

export interface UpdateState {
  available: boolean;
  latestVersion: string | null;
  url: string | null;
  sha256: string | null;
  checkedAt: number; // epoch ms of last successful check; 0 if never
  error: string | null; // last check error message, or null
}

let updateState: UpdateState = {
  available: false,
  latestVersion: null,
  url: null,
  sha256: null,
  checkedAt: 0,
  error: null,
};

/** Read the most recent update-check result (for GET /status). */
export function getUpdateState(): UpdateState {
  return updateState;
}

/** Test-only: reset the module singleton back to its initial shape. */
export function __resetUpdateStateForTests(): void {
  updateState = {
    available: false,
    latestVersion: null,
    url: null,
    sha256: null,
    checkedAt: 0,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Manifest fetch
// ---------------------------------------------------------------------------

export interface LatestManifest {
  version: string;
  url: string;
  sha256: string;
}

export const UPDATE_MANIFEST_URL: string =
  process.env.STIKFIX_UPDATE_MANIFEST_URL ||
  'https://github.com/omernesh/stikfix/releases/latest/download/latest.json';

/**
 * GET the latest-release manifest and validate its shape.
 *
 * Returns null on any non-2xx, network error, JSON-parse error, or an invalid
 * shape (missing/blank version|url, or a sha256 that is not 64 hex chars).
 * NEVER throws — the caller treats null as "no usable manifest this time".
 */
export async function fetchLatestManifest(
  fetchImpl: typeof fetch = fetch,
  url: string = UPDATE_MANIFEST_URL,
): Promise<LatestManifest | null> {
  try {
    const resp = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const data = (await resp.json()) as unknown;
    if (!data || typeof data !== 'object') return null;
    const { version, url: dlUrl, sha256 } = data as Record<string, unknown>;
    if (
      typeof version !== 'string' || version.length === 0 ||
      typeof dlUrl !== 'string' || dlUrl.length === 0 ||
      typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(sha256)
    ) {
      return null;
    }
    return { version, url: dlUrl, sha256 };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// runUpdateCheck — refresh the module state
// ---------------------------------------------------------------------------

/**
 * Fetch the manifest, compare against the running version, and update the
 * module-level UpdateState.
 *
 * On a failed fetch/parse: keep any prior successful result's
 * available/latestVersion/url/sha256 fields, set error = 'update check failed',
 * and do NOT bump checkedAt.
 *
 * On success: available = remote > current; latestVersion always set to the
 * remote version; url/sha256 set only when an update is available; error null;
 * checkedAt = now.
 *
 * Safe to call with no network (inject fetchImpl in tests). NEVER throws.
 */
export async function runUpdateCheck(
  currentVersion: string,
  fetchImpl: typeof fetch = fetch,
): Promise<UpdateState> {
  const manifest = await fetchLatestManifest(fetchImpl);
  if (manifest === null) {
    updateState = { ...updateState, error: 'update check failed' };
    return updateState;
  }
  const avail = compareSemver(manifest.version, currentVersion) > 0;
  updateState = {
    available: avail,
    latestVersion: manifest.version,
    url: avail ? manifest.url : null,
    sha256: avail ? manifest.sha256 : null,
    checkedAt: Date.now(),
    error: null,
  };
  return updateState;
}
