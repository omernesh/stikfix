/**
 * Pure routing and registry-reconciliation functions for stickyfix.
 *
 * ZERO chrome/wxt imports — these functions operate on plain TypeScript objects
 * and are fully unit-testable with node:test without any Chrome API.
 */

import type { HostEntry, StorageState } from './types.js';

// ---------------------------------------------------------------------------
// resolveRoute — D-06 routing resolution order
// ---------------------------------------------------------------------------

/**
 * Resolve an active tab's origin to a HostEntry using the locked D-06 order:
 *   Step 1 — A discovered host that advertises this origin in its origins[].
 *   Step 2 — A persisted origin → host-name mapping in state.originMap.
 *   Step 3 — Page self-id (handled by SW via scripting.executeScript; not here).
 *   Step 4 — null → caller triggers one-time dropdown.
 *
 * The returned HostEntry always carries the token from state.tokens (the
 * authoritative per-host token store), overriding any stale value in the
 * registry entry.
 *
 * @returns The matched HostEntry (with live token) or null if no route found.
 */
export function resolveRoute(
  origin: string,
  state: StorageState
): HostEntry | null {
  // Step 1: a registry host that explicitly lists this origin
  const byAdvertised = Object.values(state.registry).find(
    (h) => h.origins.includes(origin)
  );
  if (byAdvertised) {
    return {
      ...byAdvertised,
      token: state.tokens[byAdvertised.name] ?? byAdvertised.token ?? null,
    };
  }

  // Step 2: persisted origin → host-name map
  const mappedName = state.originMap[origin];
  if (mappedName && state.registry[mappedName]) {
    const h = state.registry[mappedName];
    return {
      ...h,
      token: state.tokens[mappedName] ?? h.token ?? null,
    };
  }

  // Step 3 / Step 4: not found — caller handles self-id probe or dropdown
  return null;
}

// ---------------------------------------------------------------------------
// reconcileRegistry — EXT-10 name+origin re-bind on SW wake
// ---------------------------------------------------------------------------

/**
 * Merge a fresh discovery result into the persisted registry.
 *
 * Rules:
 *  - A discovered host with the same name REPLACES the persisted entry's
 *    port/origins/notesDir (the host may have restarted on a new port).
 *  - The persisted/user-entered token is PRESERVED from `tokens[name]`,
 *    falling back to the existing registry entry's token.
 *  - A newly discovered host name is ADDED to the result.
 *  - A persisted host NOT found in this discovery is kept unchanged
 *    (it may be temporarily offline — do not evict it).
 *
 * @param persisted - The current registry from storage (name → HostEntry).
 * @param discovered - Fresh HostEntry list from discoverHosts().
 * @param tokens    - The sfxTokens map (name → token string) from storage.
 * @returns         A new registry record (does not mutate inputs).
 */
export function reconcileRegistry(
  persisted: Record<string, HostEntry>,
  discovered: HostEntry[],
  tokens: Record<string, string>
): Record<string, HostEntry> {
  const result: Record<string, HostEntry> = { ...persisted };

  for (const host of discovered) {
    result[host.name] = {
      ...host,
      // Prefer the token from the dedicated tokens map; fall back to whatever
      // the registry had (could be null for a brand-new host).
      token: tokens[host.name] ?? persisted[host.name]?.token ?? null,
    };
  }

  return result;
}
