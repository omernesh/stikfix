/**
 * stikfix popup — vanilla DOM, no framework (D-07)
 *
 * Responsibilities:
 *   - Refresh button / popup-open → SFX_REFRESH_HOSTS (SW discovers running
 *     hosts AND silently auto-connects them: fetches each token via native
 *     messaging). No manual per-host token entry — that UI was removed as
 *     confusing; auto-connect + the Recent Projects list cover connecting.
 *   - Render the Recent Projects quick-connect list (click to launch/attach)
 *   - Query active tab → send SFX_GET_ROUTE → render routing line
 *   - Review Mode toggle:
 *       CRITICAL: chrome.permissions.request MUST be the FIRST awaited call
 *       in the click handler (Pattern 3 / Pitfall 3 — no storage/tabs await
 *       before it or Chrome silently rejects the permission dialog).
 *
 * This file MUST NOT fetch 127.0.0.1/localhost — all HTTP is the SW's job.
 */

import { SFX_MSG, SFX_LIST_RECENT, SFX_START_HOST, isLaunchable } from '../../lib/types.js';
import type { HostEntry, MsgPairNative, MsgListRecent, MsgStartHost, RecentProject, MsgListRecentResponse } from '../../lib/types.js';
import { sfxRegistry, sfxTokens, sfxPrefs } from '../../lib/storage.js';

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const root = document.querySelector<HTMLDivElement>('#sfx-popup-root')!;
const emptyStateEl = document.getElementById('sfx-empty-state') as HTMLElement;
const refreshBtn = document.getElementById('sfx-refresh-btn') as HTMLButtonElement;
const reviewBtn = document.getElementById('sfx-review-btn') as HTMLButtonElement;
const toggleErrorEl = document.getElementById('sfx-toggle-error') as HTMLElement;
const hintsCheckbox = document.getElementById('sfx-hints-checkbox') as HTMLInputElement;
const routingLineEl = document.getElementById('sfx-routing-line')!;

// Recent projects section
const recentSectionEl = document.getElementById('sfx-recent-section') as HTMLElement;
const recentListEl = document.getElementById('sfx-recent-list') as HTMLElement;

// Pairing banner elements (Phase 9 — additive, always in DOM)
const pairingBanner = document.getElementById('sfx-pairing-banner') as HTMLElement;
const pairingStatus = document.getElementById('sfx-pairing-status') as HTMLElement;
const pairBtn = document.getElementById('sfx-pair-btn') as HTMLButtonElement;
const pairingDetails = document.getElementById('sfx-pairing-details') as HTMLDetailsElement;
const pairingErrorDetail = document.getElementById('sfx-pairing-error-detail') as HTMLElement;

// ---------------------------------------------------------------------------
// Utility: safe text helpers (no innerHTML with host-provided strings)
// ---------------------------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Partial<HTMLElementTagNameMap[K]>,
  ...children: (string | Node)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs) Object.assign(node, attrs);
  for (const child of children) {
    if (typeof child === 'string') {
      node.appendChild(document.createTextNode(child));
    } else {
      node.appendChild(child);
    }
  }
  return node;
}

// ---------------------------------------------------------------------------
// Pairing banner — state machine (09-UI-SPEC states 1-5)
// ---------------------------------------------------------------------------

/**
 * State 1: show banner, set status text, reveal Pair button.
 * Triggered on popup open when sfxRegistry is empty (fresh install).
 */
function showPairingState1(): void {
  pairingBanner.hidden = false;

  pairingStatus.className = '';
  pairingStatus.textContent = 'Host found — click to pair';

  pairBtn.hidden = false;
  pairBtn.disabled = false;
  pairBtn.className = '';
  pairBtn.textContent = 'Pair with host';

  pairingDetails.hidden = true;
}

/**
 * State 2: pairing in progress — disable button, show spinner class.
 */
function showPairingState2(): void {
  pairingBanner.hidden = false;

  pairingStatus.className = '';
  pairingStatus.textContent = 'Pairing…';

  pairBtn.hidden = false;
  pairBtn.disabled = true;
  pairBtn.classList.add('sfx-pairing');
  pairBtn.textContent = 'Pairing…';
}

/**
 * State 3: paired — show success message, hide button, schedule hide.
 * After 1200ms auto-transitions to state 5 (banner hidden).
 */
function showPairingState3(name: string): void {
  pairingBanner.hidden = false;

  pairingStatus.className = 'sfx-pairing-status--paired';
  // Phase 8 UAT finding: MUST NOT use checkmark alone — use word + glyph (09-UI-SPEC Color note)
  pairingStatus.textContent = '● Paired with ' + name;

  pairBtn.hidden = true;
  pairBtn.disabled = false;
  pairBtn.className = '';

  pairingDetails.hidden = true;

  // Auto-dismiss after 1200ms (UI-SPEC state 3 duration), then focus Review Mode btn
  setTimeout(() => {
    pairingBanner.hidden = true;
    reviewBtn.focus();
  }, 1200);
}

/**
 * State 4: pairing failed — show error, re-enable Retry button, show details.
 */
function showPairingState4(error: string): void {
  pairingBanner.hidden = false;

  pairingStatus.className = 'sfx-pairing-status--failed';
  // Build the error message as DOM nodes (no innerHTML with user-controlled strings)
  while (pairingStatus.firstChild) {
    pairingStatus.removeChild(pairingStatus.firstChild);
  }
  const line1 = document.createTextNode('Auto-pair failed. Run:');
  const br1 = document.createElement('br');
  const code = document.createElement('code');
  code.textContent = 'npx stikfix init';
  const br2 = document.createElement('br');
  const line3 = document.createTextNode('Then click Refresh.');
  pairingStatus.appendChild(line1);
  pairingStatus.appendChild(br1);
  pairingStatus.appendChild(code);
  pairingStatus.appendChild(br2);
  pairingStatus.appendChild(line3);

  pairBtn.hidden = false;
  pairBtn.disabled = false;
  pairBtn.className = '';
  pairBtn.textContent = 'Retry';

  // Show error detail in collapsible <details> if non-empty
  if (error) {
    pairingErrorDetail.textContent = error;
    pairingDetails.hidden = false;
    pairingDetails.open = false;
  } else {
    pairingDetails.hidden = true;
  }

  // Focus the retry button (UI-SPEC focus management)
  pairBtn.focus();
}

/**
 * State 5: already paired (returning user) — banner stays hidden.
 * The existing host list with green dot communicates paired status.
 */
function showPairingState5(): void {
  pairingBanner.hidden = true;
}

/**
 * doPair — invoked by Pair button click and Retry button click.
 * Sends PAIR_NATIVE to SW, handles response and updates state.
 */
async function doPair(registry: Record<string, HostEntry>, tokens: Record<string, string>): Promise<void> {
  showPairingState2();

  let resp: { ok: boolean; name?: string; error?: string } | null = null;
  try {
    const msg: MsgPairNative = { type: SFX_MSG.PAIR_NATIVE };
    resp = await chrome.runtime.sendMessage(msg);
  } catch (err) {
    resp = { ok: false, error: String(err) };
  }

  if (resp && resp.ok && typeof resp.name === 'string') {
    showPairingState3(resp.name);
    // Re-render the recent list (banner still visible for 1200ms — the paired
    // project appears there with a green dot).
    await renderRecent();
  } else {
    showPairingState4(resp?.error ?? 'Unknown error');
  }

  // Suppress unused-param lint — registry and tokens provided by caller for future use
  void registry;
  void tokens;
}

// ---------------------------------------------------------------------------
// Recent projects — quick-connect list
// ---------------------------------------------------------------------------

/**
 * Fetch recent projects from the SW and render the section.
 * If there are no recent projects, the section stays hidden.
 * Returns the list of liveNames so callers can refresh if needed.
 */
async function renderRecent(): Promise<void> {
  let recent: RecentProject[] = [];
  let liveNames: string[] = [];

  try {
    const msg: MsgListRecent = { type: SFX_LIST_RECENT };
    const resp = await chrome.runtime.sendMessage(msg) as MsgListRecentResponse | null;

    if (resp?.ok) {
      recent = resp.recent;
      liveNames = resp.liveNames;
    } else if (resp) {
      // SW returned an error response — log and leave section hidden
      console.error('[stikfix] renderRecent: SW error:', resp.error);
    }
    // null response → SW not ready; leave hidden silently (handled by catch below)
  } catch (err) {
    // SW may be starting — hide the section silently
    console.debug('[stikfix] renderRecent: SW not ready:', err);
  }

  if (recent.length === 0) {
    recentSectionEl.hidden = true;
    emptyStateEl.hidden = false;
    return;
  }
  emptyStateEl.hidden = true;

  // Clear and rebuild the list
  recentListEl.replaceChildren();

  for (const project of recent) {
    const isLive = liveNames.includes(project.name);
    const launchable = isLaunchable(project);
    const displayPath = project.notesDir || project.root || '';

    // Status dot
    const dot = el('span');
    dot.className = isLive ? 'sfx-dot sfx-dot--green' : 'sfx-dot sfx-dot--grey';
    dot.setAttribute('title', isLive ? 'connected' : 'stopped');

    // Project name
    const nameEl = el('span');
    nameEl.className = 'sfx-recent-name';
    nameEl.textContent = project.name;

    // Secondary path line
    const infoCol = el('div');
    infoCol.className = 'sfx-recent-info';
    infoCol.appendChild(nameEl);

    if (displayPath) {
      const pathEl = el('span');
      pathEl.className = 'sfx-recent-path';
      pathEl.textContent = displayPath;
      pathEl.title = displayPath;  // full path on hover for truncated display
      infoCol.appendChild(pathEl);
    } else if (!launchable) {
      const noPathEl = el('span');
      noPathEl.className = 'sfx-recent-no-path';
      noPathEl.textContent = '(no path)';
      infoCol.appendChild(noPathEl);
    }

    // Row
    const row = el('div');
    row.className = 'sfx-recent-row';
    if (!launchable) {
      row.classList.add('sfx-recent-row--disabled');
      row.setAttribute('title', 'No project root — cannot launch');
    }
    row.appendChild(dot);
    row.appendChild(infoCol);

    // Quick-connect click handler (only when root is available)
    if (isLaunchable(project)) {
      const launchableProject = project; // narrowed: RecentProject & { root: string }
      row.addEventListener('click', () => {
        void doQuickConnect(row, dot, infoCol, launchableProject);
      });
    }

    recentListEl.appendChild(row);
  }

  recentSectionEl.hidden = false;
}

/**
 * Quick-connect a stopped (or already-running) project.
 * Shows a spinner on the row while in flight, then re-renders both
 * the host list and the recent list on success, or shows inline error on failure.
 */
async function doQuickConnect(
  row: HTMLDivElement,
  dot: HTMLSpanElement,
  infoCol: HTMLDivElement,
  project: RecentProject & { root: string },
): Promise<void> {
  // Disable the row and show spinner
  row.classList.add('sfx-recent-row--connecting');
  dot.className = 'sfx-recent-spinner';

  // Remove any prior inline error from a previous attempt
  const priorError = infoCol.querySelector('.sfx-recent-error');
  if (priorError) {
    infoCol.removeChild(priorError);
  }

  const connectingHint = el('span');
  connectingHint.className = 'sfx-recent-path';
  connectingHint.textContent = 'Connecting…';
  infoCol.appendChild(connectingHint);

  let resp: { ok: true; name: string; port: number } | { ok: false; error: string } | null = null;
  try {
    const msg: MsgStartHost = { type: SFX_START_HOST, root: project.root };
    resp = await chrome.runtime.sendMessage(msg) as typeof resp;
  } catch (err) {
    resp = { ok: false, error: String(err) };
  } finally {
    // Always remove the "Connecting…" hint and spinner class
    infoCol.removeChild(connectingHint);
    row.classList.remove('sfx-recent-row--connecting');
  }

  if (resp && resp.ok) {
    // Re-render the recent list so the newly-connected host shows live status
    try {
      await renderRecent();
    } catch (err) {
      console.error('[stikfix] doQuickConnect re-render failed for', project.root, 'resp:', resp, err);
    }
    // Dot stays green regardless of refresh failure — connection succeeded
    dot.className = 'sfx-dot sfx-dot--green';
  } else {
    // Show inline error — never fail silently (project rule)
    console.error('[stikfix] doQuickConnect failed for', project.root, 'resp:', resp);
    dot.className = 'sfx-dot sfx-dot--grey';

    const errorEl = el('span');
    errorEl.className = 'sfx-recent-error';
    errorEl.textContent = resp?.error ?? 'Connection failed';
    infoCol.appendChild(errorEl);
  }
}

// ---------------------------------------------------------------------------
// Routing line
// ---------------------------------------------------------------------------

async function renderRoutingLine(): Promise<void> {
  routingLineEl.textContent = 'checking route…';

  let tabs: chrome.tabs.Tab[];
  try {
    tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    routingLineEl.textContent = 'unmapped — pick on page';
    return;
  }

  const tab = tabs[0];
  if (!tab?.id || !tab.url) {
    routingLineEl.textContent = 'unmapped — pick on page';
    return;
  }

  let origin: string;
  try {
    origin = new URL(tab.url).origin;
  } catch {
    routingLineEl.textContent = 'unmapped — pick on page';
    return;
  }

  try {
    const resp = await chrome.runtime.sendMessage({
      type: SFX_MSG.GET_ROUTE,
      tabId: tab.id,
      origin,
    });

    if (resp && resp.ok && resp.host) {
      const host = resp.host as HostEntry;
      routingLineEl.textContent =
        '→ ' + host.name + ' · ' + host.notesDir;
    } else {
      routingLineEl.textContent = 'unmapped — pick on page';
    }
  } catch {
    routingLineEl.textContent = 'unmapped — pick on page';
  }
}

// ---------------------------------------------------------------------------
// Refresh (sends REFRESH_HOSTS to SW, then re-renders)
// ---------------------------------------------------------------------------

async function doRefresh(): Promise<void> {
  refreshBtn.disabled = true;
  refreshBtn.textContent = 'Refreshing…';

  try {
    // REFRESH_HOSTS now also silently auto-connects newly discovered hosts
    // (fetches their token via native messaging), so a host started after
    // Chrome was already running connects on this click — no token entry.
    await chrome.runtime.sendMessage({ type: SFX_MSG.REFRESH_HOSTS });
  } catch {
    // SW may be starting; re-render from storage regardless
  }

  await renderRecent();
  await renderRoutingLine();

  refreshBtn.disabled = false;
  refreshBtn.textContent = 'Refresh';
}

refreshBtn.addEventListener('click', doRefresh);

// ---------------------------------------------------------------------------
// Review Mode toggle — state helpers
// ---------------------------------------------------------------------------

function setReviewBtnEnter(): void {
  reviewBtn.textContent = 'Enter Review Mode';
  reviewBtn.className = '';
}

function setReviewBtnExit(): void {
  reviewBtn.textContent = 'Exit Review Mode';
  reviewBtn.className = 'sfx-exit-mode';
}

function setReviewBtnGrant(): void {
  reviewBtn.textContent = 'Grant page access to enter Review Mode';
  reviewBtn.className = 'sfx-grant-mode';
}

function showToggleError(msg: string): void {
  toggleErrorEl.textContent = msg;
  toggleErrorEl.hidden = false;
}

function clearToggleError(): void {
  toggleErrorEl.hidden = true;
  toggleErrorEl.textContent = '';
}

// ---------------------------------------------------------------------------
// Review Mode state — track per active tab via sfxPrefs.reviewMode
// ---------------------------------------------------------------------------

let reviewModeActive = false;

async function loadReviewState(): Promise<void> {
  let tabs: chrome.tabs.Tab[];
  try {
    tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    return;
  }

  const tab = tabs[0];
  if (!tab?.id) return;

  try {
    const prefs = await sfxPrefs.getValue();
    const active = prefs.reviewMode[String(tab.id)] ?? false;
    reviewModeActive = active;
    if (active) {
      setReviewBtnExit();
    } else {
      setReviewBtnEnter();
    }
  } catch {
    // Default to Enter state
  }
}

// ---------------------------------------------------------------------------
// Show-hints preference — checkbox load + persist
// ---------------------------------------------------------------------------

/** Load the showHints pref into the checkbox (default true when undefined). */
async function loadHintsPref(): Promise<void> {
  try {
    const prefs = await sfxPrefs.getValue();
    // Treat missing/legacy as default ON (prefs persisted before showHints existed)
    hintsCheckbox.checked = prefs.showHints !== false;
  } catch {
    hintsCheckbox.checked = true;
  }
}

// Persist on change — read-modify-write so reviewMode is preserved (never clobbered).
hintsCheckbox.addEventListener('change', () => {
  void (async () => {
    try {
      const prefs = await sfxPrefs.getValue();
      prefs.showHints = hintsCheckbox.checked;
      await sfxPrefs.setValue(prefs);
    } catch {
      // Non-fatal — the next open re-reads current state
    }
  })();
});

// ---------------------------------------------------------------------------
// Review Mode toggle click handler
//
// CRITICAL ORDERING (Pattern 3 / Pitfall 3):
//   chrome.permissions.request MUST be the FIRST awaited call.
//   Any storage read or chrome.tabs.query BEFORE the request breaks the
//   gesture chain — Chrome silently rejects the permission dialog.
// ---------------------------------------------------------------------------

reviewBtn.addEventListener('click', async () => {
  clearToggleError();
  reviewBtn.disabled = true;

  // ── EXIT branch ────────────────────────────────────────────────────────────
  if (reviewModeActive) {
    let tab: chrome.tabs.Tab | undefined;
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      tab = tabs[0];
    } catch {
      showToggleError('Could not query active tab.');
      reviewBtn.disabled = false;
      return;
    }

    if (!tab?.id) {
      showToggleError('No active tab.');
      reviewBtn.disabled = false;
      return;
    }

    try {
      await chrome.runtime.sendMessage({
        type: SFX_MSG.EXIT_REVIEW,
        tabId: tab.id,
      });
    } catch {
      // Best-effort — content script may already be gone
    }

    // Update prefs
    try {
      const prefs = await sfxPrefs.getValue();
      prefs.reviewMode[String(tab.id)] = false;
      await sfxPrefs.setValue(prefs);
    } catch {
      // Non-fatal
    }

    reviewModeActive = false;
    setReviewBtnEnter();
    reviewBtn.disabled = false;
    return;
  }

  // ── ENTER branch ───────────────────────────────────────────────────────────
  // STEP 1: permission request — MUST be the FIRST awaited call (user gesture).
  // DO NOT insert any chrome.storage or chrome.tabs call before this line.
  let granted: boolean;
  try {
    granted = await chrome.permissions.request({
      origins: ['<all_urls>'],
    });
  } catch {
    granted = false;
  }

  if (!granted) {
    setReviewBtnGrant();
    showToggleError('Page access is required to enter Review Mode.');
    reviewBtn.disabled = false;
    return;
  }

  // STEP 2: only after grant — query the active tab and send ENTER_REVIEW
  let tab: chrome.tabs.Tab | undefined;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs[0];
  } catch {
    showToggleError('Could not query active tab.');
    reviewBtn.disabled = false;
    return;
  }

  if (!tab?.id || !tab.url) {
    showToggleError('No active tab URL.');
    reviewBtn.disabled = false;
    return;
  }

  let origin: string;
  try {
    origin = new URL(tab.url).origin;
  } catch {
    showToggleError('Active tab has no valid URL.');
    reviewBtn.disabled = false;
    return;
  }

  let resp: { ok: boolean; route?: HostEntry | null; error?: string } | null = null;
  try {
    resp = await chrome.runtime.sendMessage({
      type: SFX_MSG.ENTER_REVIEW,
      tabId: tab.id,
      origin,
    });
  } catch (err) {
    showToggleError('SW error: ' + String(err));
    reviewBtn.disabled = false;
    return;
  }

  if (!resp || !resp.ok) {
    showToggleError(resp?.error ?? 'Could not enter Review Mode.');
    reviewBtn.disabled = false;
    return;
  }

  // Update prefs + UI
  try {
    const prefs = await sfxPrefs.getValue();
    prefs.reviewMode[String(tab.id)] = true;
    await sfxPrefs.setValue(prefs);
  } catch {
    // Non-fatal
  }

  reviewModeActive = true;
  setReviewBtnExit();
  reviewBtn.disabled = false;

  // Update routing line to reflect the route returned
  if (resp.route) {
    const host = resp.route;
    routingLineEl.textContent =
      '→ ' + host.name + ' · ' + host.notesDir;
  }

  // Review Mode is now active — close the popup so the user lands straight on
  // the page (no extra click to dismiss). Success path only.
  window.close();
});

// ---------------------------------------------------------------------------
// Pair button click handler — wired once; doPair is invoked on each click
// (covers both initial "Pair with host" and "Retry" states)
// ---------------------------------------------------------------------------

pairBtn.addEventListener('click', () => {
  // Read registry+tokens at click time (Pitfall 1 — re-read, not cached)
  void (async () => {
    const [registry, tokens] = await Promise.all([
      sfxRegistry.getValue(),
      sfxTokens.getValue(),
    ]);
    await doPair(registry, tokens);
  })();
});

// ---------------------------------------------------------------------------
// Initialization — runs on popup open
// ---------------------------------------------------------------------------

async function init(): Promise<void> {
  // Auto-connect on popup open: discover running hosts + silently fetch their
  // tokens (REFRESH_HOSTS → autoConnectDiscovered in the SW). This is what makes
  // "start the host, open the popup, it's connected" work without any token
  // entry. Best-effort — never blocks the render below.
  try {
    await chrome.runtime.sendMessage({ type: SFX_MSG.REFRESH_HOSTS });
  } catch {
    // SW may be starting — render from whatever storage already holds.
  }

  const registry = await sfxRegistry.getValue();

  await renderRecent();
  await loadReviewState();
  await loadHintsPref();
  await renderRoutingLine();

  // Pairing banner state machine (09-UI-SPEC Interaction Contract):
  //   - Empty registry (fresh install / cleared state) → state 1 (show banner, focus btn)
  //   - Non-empty registry (returning user) → state 5 (banner stays hidden)
  // Auto-fire on popup open is intentionally NOT done — button-driven per UI-SPEC rationale.
  if (Object.keys(registry).length === 0) {
    showPairingState1();
    pairBtn.focus(); // focus the primary action for fresh-install UX
  } else {
    showPairingState5();
  }
}

init().catch(err => {
  // Fail-safe: show a minimal error rather than a blank popup
  const errEl = el('p');
  errEl.style.cssText = 'color:#dc2626;padding:12px;font-size:12px';
  errEl.textContent = 'Error loading popup: ' + String(err);
  root.appendChild(errEl);
});
