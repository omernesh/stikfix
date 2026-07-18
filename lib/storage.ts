/**
 * WXT storage.defineItem definitions for the stikfix extension.
 * Uses chrome.storage.local via WXT's typed wrapper.
 *
 * NOTE: This file imports from 'wxt/utils/storage' and is intentionally
 * excluded from tsconfig.lib.json (node:test compile path) because wxt is
 * not resolvable in a plain Node.js context.
 */

import { storage } from 'wxt/utils/storage';
import type { HostEntry, RecentProject, StorageState } from './types.js';

// ---------------------------------------------------------------------------
// Named storage items
// ---------------------------------------------------------------------------

/** Host registry: name → HostEntry */
export const sfxRegistry = storage.defineItem<Record<string, HostEntry>>(
  'local:sfxRegistry',
  { fallback: {} }
);

/** Per-host auth tokens: name → token string */
export const sfxTokens = storage.defineItem<Record<string, string>>(
  'local:sfxTokens',
  { fallback: {} }
);

/** Origin → host name mapping (persisted after one-time dropdown selection) */
export const sfxOriginMap = storage.defineItem<Record<string, string>>(
  'local:sfxOriginMap',
  { fallback: {} }
);

/**
 * Extension preferences.
 *
 * Key choice for `gitSync` (git-sync opt-in toggle, per project):
 *   - `reviewMode` is keyed by tabId (ephemeral — a tab-scoped UI state, reset
 *     across browser restarts, meaningless once the tab closes). NOT reusable
 *     for gitSync, which must persist per PROJECT, not per tab.
 *   - `gitSync` is keyed by the STABLE host registry name (`HostEntry.name`,
 *     i.e. the `sfxRegistry` key). This is exactly the identifier GET_ROUTE
 *     resolves to for a tab's origin, and the same one handleSendAnnotation
 *     (background.ts) resolves to for the host a note is sent to — so the
 *     popup checkbox and the send-time lookup always agree on the same key.
 *     It stays stable across tabs, popup re-opens, and host restarts/port
 *     changes (registry entries are reconciled by name — see
 *     lib/routing.ts reconcileRegistry — never by port).
 */
export const sfxPrefs = storage.defineItem<{
  reviewMode: Record<string, boolean>;
  showHints: boolean;
  gitSync: Record<string, boolean>;
}>(
  'local:sfxPrefs',
  // showHints defaults ON; gitSync defaults to {} (opt-in, OFF per project
  // until the owner checks the box). Note: prefs persisted before these
  // fields existed will lack them — read sites must treat missing as default
  // (prefs.showHints !== false; prefs.gitSync?.[key] === true).
  { fallback: { reviewMode: {}, showHints: true, gitSync: {} } }
);

/** Recently-used projects (most-recent-first, capped at 8) — Features 3 & 4 */
export const sfxRecent = storage.defineItem<RecentProject[]>('local:sfxRecent', {
  fallback: [],
});

// ---------------------------------------------------------------------------
// Convenience loader
// ---------------------------------------------------------------------------

/**
 * Load all storage keys in parallel and return a typed StorageState.
 * Call at the TOP of every SW message handler — never rely on module-level cache
 * (the MV3 service worker is recycled after ~30s idle; globals are zeroed).
 */
export async function loadStorageState(): Promise<StorageState> {
  const [registry, tokens, originMap, prefs, recent] = await Promise.all([
    sfxRegistry.getValue(),
    sfxTokens.getValue(),
    sfxOriginMap.getValue(),
    sfxPrefs.getValue(),
    sfxRecent.getValue(),
  ]);
  return { registry, tokens, originMap, prefs, recent };
}
