# Phase 3: Extension Skeleton + SW Relay Proof — Research

**Researched:** 2026-05-31
**Domain:** WXT 0.20.x MV3 extension — service-worker relay, on-demand content-script injection, shadow-root chip, chrome.storage.local persistence, host discovery, routing resolution
**Confidence:** HIGH (all critical items verified against official Chrome docs, WXT docs, or cross-confirmed through multiple sources)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 — SW-as-HTTP-Client Relay:** All localhost traffic goes through the service worker, never the content script. Content script sends `chrome.runtime.sendMessage({type:'SEND_ANNOTATION', payload})`; SW resolves origin → host, attaches token, does the single `fetch('http://127.0.0.1:<port>/annotation', …)`. Dodges Chrome-142 LNA + content-script CORS block. The dummy Send proves a stub `.md` lands on disk (Success Criterion 3). `captureVisibleTab` also lives in the SW.

**D-02 — Message Protocol:** Explicit typed messages between content script ↔ SW: at minimum `ENTER_REVIEW` / `EXIT_REVIEW`, `GET_ROUTE`, `SEND_ANNOTATION`, and discovery refresh. Responses carry `{ok,...}` / `{ok:false,error}`.

**D-03 — Host Discovery:** SW probes all of ports 39240–39260 on `127.0.0.1` in parallel via `GET /status`, collecting every responder with `{app:'stickyfix'}`. Runs on Review-Mode entry and on SW wake. Short per-probe timeout.

**D-04 — No Static content_scripts:** Inject review UI with `chrome.scripting.executeScript` only when Review Mode is entered. Manifest: `permissions: [activeTab, scripting, storage, tabs]`, `host_permissions: [http://127.0.0.1/*, http://localhost/*]`, `optional_host_permissions: [<all_urls>]` requested on demand per-origin.

**D-05 — Storage Schema:** Everything in `chrome.storage.local`. Stored: host registry (last-seen port/name/origins), per-host tokens, origin→host map, prefs. SW re-reads storage at start of every handler. Reconcile by project `name` + origin (not port) on wake.

**D-06 — Routing Resolution Order:** (1) discovered host advertising this origin; (2) persisted origin→host mapping; (3) page self-id (`<meta name="stickyfix-project">` / `window.__stickyfix_project`); (4) one-time dropdown + persist. Never per-note after that.

**D-07 — Vanilla Popup:** No framework. Lists every discovered host with project name + connection state + per-host token field + Enter/Exit Review Mode toggle. Token edits persist to `chrome.storage.local`.

**D-08 — Connection Chip in Shadow DOM:** WXT `createShadowRootUi`, `z-index: 2147483647`, top-right default, draggable + viewport-clamped (pointer events), shows project + notes dir, Exit button, stub Send. Genuine post-it styling deferred to Phase 6.

**D-09 — Dummy Relay Payload:** Stub Send constructs a minimal valid §9.1 free-note payload (`mode:'free'`, fixed `comment:"stickyfix relay proof"`, real `page.url/title`, `viewport`) so host writes a stub `.md`. Must be on an HTTPS-origin page.

### Claude's Discretion

Exact message-type names/casing, popup DOM structure, chip drag implementation (interact.js vs pointer events — interact.js is the eventual choice but a lightweight pointer-events chip is acceptable here), per-probe timeout value, and how the one-time dropdown is rendered — left to the planner. Keep `sfx-*`/`stickyfix` namespace.

### Deferred Ideas (OUT OF SCOPE)

- `+` free-note FAB + post-it card — Phase 4.
- 🎯 element picker + rich element capture — Phase 5.
- 📷 region capture + genuine post-it/paper visual design + mode color-coding — Phase 6.
- Full no-silent-failure toast coverage + multi-note session stability — Phase 8.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXT-01 | MV3 manifest with activeTab, scripting, storage, tabs; localhost host_permissions; optional_host_permissions on demand | See §WXT Manifest Config — exact wxt.config.ts fields verified |
| EXT-02 | Review UI injected dynamically via chrome.scripting.executeScript; no static content_scripts | See §On-Demand Injection — registration:'runtime' + output path `content-scripts/review.js` |
| EXT-03 | Toolbar popup lists discovered hosts + per-host token + Enter/Exit toggle | See §Popup Patterns — vanilla DOM, chrome.storage.local read/write |
| EXT-04 | SW probes 39240–39260 and builds registry from /status | See §Host Discovery — parallel fetch with AbortController, registry schema |
| EXT-05 | All localhost fetches route through service worker (not content script) — Chrome LNA/CORS | See §SW Relay — LNA exemption confirmed, async sendMessage pattern |
| EXT-06 | Each note routes by active tab's origin to advertising host — zero per-note picks | See §Routing Resolution — resolution order implementation |
| EXT-07 | Unknown origin prompts one-time host dropdown; origin→host persists | See §Routing Resolution — dropdown triggers, storage persist |
| EXT-08 | Same-origin clashes resolved by page self-id (meta/window var) | See §Page Self-ID Probe — injected script reads DOM/window |
| EXT-09 | Registry, tokens, origin→host map, prefs persist in chrome.storage.local across restart + SW recycling | See §Storage Schema — defineItem patterns, survival confirmed |
| EXT-10 | On wake: re-discover hosts and re-bind by name+origin (not port) | See §Storage Reconciliation — reconcile-by-name algorithm |
| EXT-11 | Draggable viewport-clamped connection chip (z-index 2147483647) shows state + notes dir + Exit button | See §Connection Chip — createShadowRootUi, pointer-events drag, CSS isolation |
</phase_requirements>

---

## Summary

Phase 3 proves the hardest architectural seam in stickyfix: the service worker is the only HTTP client speaking to localhost hosts, and every architectural decision cascades from this. The phase wires background discovery, popup UI, on-demand content-script injection via WXT's `registration:'runtime'` pattern, a shadow-root connection chip, chrome.storage.local-backed persistence, multi-host routing, and ends with a dummy `SEND_ANNOTATION` round-trip that produces a visible `.md` file on disk.

The most critical technical decision — already locked — is correct: the SW's extension-context origin means Chrome's LNA restrictions do not apply to it, while they do apply to content scripts running in the injected page's origin. The content-script-to-SW message relay is therefore non-negotiable and is the key integration seam this phase proves.

WXT's `registration:'runtime'` pattern (introduced in the context7/WXT docs) compiles the content script to `content-scripts/review.js` in the output directory without adding it to the static manifest's `content_scripts` array. The background SW then calls `browser.scripting.executeScript({ target: { tabId }, files: ['content-scripts/review.js'] })` to inject it on demand. This is the correct WXT pattern — attempting to call `createShadowRootUi` from a raw `scripting.executeScript` injected script does NOT work (confirmed in WXT discussion #623) because `createShadowRootUi` requires a `ContentScriptContext` that only exists inside a proper WXT content script entrypoint.

The storage layer uses WXT's `storage.defineItem<T>('local:key', { fallback })` — typed, namespaced, persistent across SW termination cycles. The SW reads from storage at the top of every handler; no module-level caches.

**Primary recommendation:** Wire the full message protocol and storage schema in Wave 0 (shared lib), then build discovery → popup → injection → chip → relay in order. Keep the routing logic and storage reconciliation as pure TypeScript functions in `lib/` so they can be unit-tested with `node:test` without the Chrome API.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| HTTP client (fetch to localhost) | Service Worker | — | LNA + CORS exemption; extension context not page context |
| Host discovery (port scan) | Service Worker | — | Uses host_permissions; runs on wake + Review-Mode entry |
| Origin→host routing | Service Worker (`lib/routing.ts`) | — | Pure function testable without Chrome API |
| Storage read/write | Service Worker | Popup (direct reads) | SW owns writes; popup reads for display |
| Permission request (optional_host_permissions) | Popup | — | chrome.permissions.request MUST be in a user gesture — popup click handler |
| Content-script injection | Service Worker | — | scripting.executeScript requires scripting permission, called from SW on ENTER_REVIEW |
| Connection chip UI | Content Script (shadow root) | — | Injected DOM; shadow root isolates from page CSS |
| Drag behavior on chip | Content Script | — | Pointer events on the shadow host element |
| Token entry + host list | Popup | — | Extension page; reads chrome.storage.local directly |
| Review Mode toggle | Popup → SW message | — | Popup click → sendMessage ENTER_REVIEW → SW injects CS |

---

## Standard Stack

### Core (already installed — no new installs for Phase 3)

| Library | Version | Purpose | Source |
|---------|---------|---------|--------|
| WXT | 0.20.26 | MV3 build, manifest, shadow-root UI, registration:'runtime' | [VERIFIED: npm registry] |
| TypeScript | 6.0.3 | Language; extension tsconfig uses `types:["chrome"]` | [VERIFIED: npm registry] |
| `@types/chrome` | 0.1.42 | Chrome extension API types | [VERIFIED: npm registry — in devDeps] |
| WXT `storage` | (bundled with wxt) | Typed `defineItem` wrappers over chrome.storage.local | [VERIFIED: wxt.dev/storage] |

### New installs for Phase 3

Phase 3 does NOT need to add new npm packages. The draggable chip is implemented with pointer events (Phase 6 adds interactjs for the full UI). `@medv/finder` and `interactjs` are Phase 4/5 dependencies.

**No new `npm install` commands needed for Phase 3.**

### Supporting (for chip drag — pointer events, no library)

Pointer-events drag is ~40 lines (see §Connection Chip pattern). `interactjs@1.10.27` is the eventual solution (Phase 6) but is NOT needed for Phase 3's functional chip.

---

## Package Legitimacy Audit

> Phase 3 installs no new packages. All packages below are already in package.json.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `wxt` | npm | 3 yrs (2023) | High (official framework) | github.com/wxt-dev/wxt | [SUS — false positive: confused with "next"] | Approved — wxt is the official Web Extension Framework at wxt.dev; slopcheck typosquat detector fires incorrectly. Verified via official docs + homepage. |
| `interactjs` | npm | ~10 yrs (2016) | High | github.com/taye/interact.js | [OK] | Approved (Phase 6) |
| `@medv/finder` | npm | ~8 yrs (2018) | Moderate | github.com/antonmedv/finder | — | Approved (Phase 5) |

**Packages removed due to [SLOP]:** none
**Packages flagged [SUS] with caveats:** `wxt` — false positive confirmed. The WXT framework is a well-established, officially documented MV3 extension framework at https://wxt.dev with an active GitHub repo (wxt-dev/wxt). Slopcheck's detection heuristic incorrectly flags it as a typosquat of "next".

---

## Architecture Patterns

### System Architecture Diagram

```
POPUP (popup/main.ts)
  [User clicks "Enter Review Mode"]
  → chrome.permissions.request({origins:['<all_urls>']})  ← MUST be in this user gesture
  → chrome.runtime.sendMessage({type:'ENTER_REVIEW', tabId})
                                      ↓
SERVICE WORKER (background.ts)
  chrome.runtime.onMessage.addListener(async (msg, sender) => {
    const state = await loadStorage();          ← re-read every handler
    if (msg.type === 'ENTER_REVIEW') {
      await discoverHosts(state);               ← parallel probe 39240-39260
      const route = resolveRoute(origin, state);← lib/routing.ts pure fn
      await browser.scripting.executeScript({   ← inject content script
        target: { tabId: msg.tabId },
        files: ['content-scripts/review.js']   ← WXT output path
      });
      await browser.scripting.insertCSS({       ← inject styles
        target: { tabId: msg.tabId },
        files: ['content-scripts/review.css']
      });
      return { ok: true, route };
    }
    if (msg.type === 'SEND_ANNOTATION') {
      const host = resolveRoute(origin, state); ← lib/routing.ts
      const resp = await fetch(
        `http://127.0.0.1:${host.port}/annotation`,
        { method:'POST',
          headers:{'Content-Type':'application/json',
                   'X-Stickyfix-Token': host.token},
          body: JSON.stringify(msg.payload)
        }
      );
      return await resp.json();                 ← {ok, file, serial}
    }
  });
                                      ↓
CONTENT SCRIPT (review.content/index.ts)
  defineContentScript({
    matches: ['<all_urls>'],
    registration: 'runtime',          ← NOT in static manifest
    cssInjectionMode: 'ui',           ← CSS goes into shadow root
    async main(ctx) {
      const ui = await createShadowRootUi(ctx, {
        name: 'sfx-review-ui',
        position: 'inline',
        zIndex: 2147483647,
        onMount(container) { mountChip(container); },
        onRemove({ unmount }) { unmount(); }
      });
      ui.mount();
      ctx.onInvalidated(ui.remove);
    }
  })
  [User clicks stub Send button in chip]
  → chrome.runtime.sendMessage({type:'SEND_ANNOTATION', payload})
  → SW fetches → host writes .md → SW returns {ok, file}
  → Chip shows: "Saved: 0001-YYYYMMDD-HHmmss.md"
                                      ↓
HOST (http://127.0.0.1:392xx)
  POST /annotation → validate X-Stickyfix-Token
                   → withSerialLock(getNextSerial + writeNote)
                   → {ok:true, file:'0001-…md', serial:1}
```

### Recommended Project Structure (Phase 3 additions)

```
stickyfix/
├── entrypoints/
│   ├── background.ts            # SW: extend with discovery, routing, relay
│   ├── popup/
│   │   ├── index.html           # existing shell — extend with host list markup
│   │   └── main.ts             # replace placeholder — host list + token + toggle
│   └── review.content/          # NEW: on-demand shadow-root UI
│       ├── index.ts            # defineContentScript registration:'runtime'
│       ├── chip.ts             # connection chip — mount/unmount/drag/stub-send
│       └── styles.css          # shadow-root scoped CSS (all:initial on :host)
│
├── lib/                         # NEW: pure, testable, Chrome-API-free functions
│   ├── types.ts                # shared TS types: StorageState, HostEntry, MsgType, etc.
│   ├── storage.ts              # WXT defineItem definitions (registry, tokens, originMap, prefs)
│   ├── routing.ts              # resolveRoute(origin, state) — pure fn, no Chrome API
│   └── discovery.ts            # probeHost(port) + discoverHosts(ports) — uses fetch
│
├── wxt.config.ts               # extend with permissions, host_permissions, optional_host_permissions
└── host/src/types.ts           # AnnotationPayload already defined — import for shared use
```

### Pattern 1: WXT Manifest Config for MV3 (EXT-01)

**What:** Extend `wxt.config.ts` with the required permission set. WXT merges the `manifest` object into the generated manifest. No separate `manifest.json` file.

```typescript
// wxt.config.ts
import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'stickyfix',
    description: 'Pin sticky notes on any page — your AI reads them.',
    version: '0.1.0',
    icons: {
      16: '/icon/16.png',
      32: '/icon/32.png',
      48: '/icon/48.png',
      128: '/icon/128.png',
    },
    // Phase 3 additions:
    permissions: ['activeTab', 'scripting', 'storage', 'tabs'],
    host_permissions: ['http://127.0.0.1/*', 'http://localhost/*'],
    optional_host_permissions: ['<all_urls>'],
    // action popup is auto-discovered from entrypoints/popup/index.html
    // background service worker is auto-discovered from entrypoints/background.ts
  },
});
```

[CITED: wxt.dev/guide/essentials/config/manifest]

**Note on `optional_host_permissions` TypeScript:** WXT's manifest typing may not include this key yet; add `// @ts-ignore` above it if tsc complains, or use `as any` casting. Both are acceptable — the field is valid MV3 JSON.

[ASSUMED: TypeScript may need @ts-ignore for optional_host_permissions in WXT 0.20.x — pattern seen in community examples but not confirmed in official WXT API types]

### Pattern 2: On-Demand Content Script Injection (EXT-02)

**What:** The WXT `registration: 'runtime'` option marks a content script as NOT included in the static manifest. WXT still compiles it and outputs it to `content-scripts/<name>.js`. The developer calls `browser.scripting.executeScript` manually from the SW.

**Critical output path:** For `entrypoints/review.content/index.ts`, WXT outputs:
- JS: `content-scripts/review.js`
- CSS: `content-scripts/review.css` (when `cssInjectionMode: 'ui'`)

[CITED: wxt.dev/guide/essentials/scripting + wxt.dev/guide/essentials/entrypoints.html — "{name}.content/index.ts → content-scripts/{name}.js"]

```typescript
// entrypoints/review.content/index.ts
import './styles.css';  // MUST be top-level import for cssInjectionMode:'ui' to work

export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',     // NOT added to manifest content_scripts
  cssInjectionMode: 'ui',      // CSS injected into shadow root, not document <head>
  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'sfx-review-ui',
      position: 'inline',      // 'overlay' is NOT documented — use 'inline'
      zIndex: 2147483647,
      onMount(container: HTMLElement) {
        mountChip(container);
        return { unmount: () => teardownChip(container) };
      },
      onRemove({ unmount }: { unmount: () => void }) {
        unmount();
      },
    });
    ui.mount();
    ctx.onInvalidated(ui.remove);
  },
});
```

[CITED: wxt.dev/guide/key-concepts/content-script-ui.html, WXT discussion #623]

**Warning:** `createShadowRootUi` requires the `ContentScriptContext` (`ctx`) from `main(ctx)`. It CANNOT be called from a plain `scripting.executeScript({ func: ... })` injection — the context object would be undefined. The `registration:'runtime'` + entrypoint-based approach is the only way to use `createShadowRootUi` with on-demand injection.

[VERIFIED: WXT GitHub Discussion #623 — maintainer confirmed this is the required pattern]

**Injection call from SW:**
```typescript
// background.ts
await browser.scripting.executeScript({
  target: { tabId },
  files: ['content-scripts/review.js'],  // exact WXT output path
});
// CSS is handled by cssInjectionMode:'ui' — WXT injects it automatically
// via the shadow root, no separate insertCSS call needed
```

### Pattern 3: Optional Permission Request from User Gesture (EXT-01/EXT-02)

**What:** `chrome.permissions.request` MUST be called inside a user gesture event handler. In MV3, the popup's button click handler qualifies.

[CITED: developer.chrome.com/docs/extensions/reference/api/permissions — "Permissions must be requested from inside a user gesture, like a button's click handler"]

```typescript
// popup/main.ts — inside the "Enter Review Mode" click handler
reviewBtn.addEventListener('click', async () => {
  // Step 1: request optional permission (must be here — user gesture required)
  const granted = await chrome.permissions.request({
    origins: ['<all_urls>'],   // declared in optional_host_permissions
  });
  if (!granted) {
    showError('Page access required for Review Mode');
    return;
  }
  // Step 2: send ENTER_REVIEW to SW (SW injects the content script)
  const tab = await chrome.tabs.query({ active: true, currentWindow: true });
  const result = await chrome.runtime.sendMessage({
    type: 'ENTER_REVIEW',
    tabId: tab[0].id,
    origin: new URL(tab[0].url!).origin,
  });
  if (!result.ok) showError(result.error);
});
```

**Gesture constraint detail:** The permission request dialog is triggered by Chrome ONLY when the call is in the synchronous call-stack of a user gesture event. Using `await` before the `.request()` call (e.g., awaiting a storage read first) may break the gesture association in some Chrome versions. Keep `.request()` as the first async call in the handler.

[ASSUMED: The gesture-chain-breaking risk with await-before-request is documented in community reports but not in official Chrome docs. Conservative approach: call chrome.permissions.request before any other awaits in the handler.]

### Pattern 4: SW Relay — The Core Seam (EXT-05)

**What:** The SW's `chrome.runtime.onMessage` handler performs the fetch to localhost. It uses `return true` to keep the message channel open for an async response (Chrome MV3 requirement).

**Why SW is LNA-exempt:** Chrome LNA blocks public-origin→local-network requests. Extension service workers with `host_permissions` operate under the extension's origin (e.g., `chrome-extension://abc123/`), NOT the injected page's origin. Browser extensions with appropriate host_permissions bypass LNA entirely.

[CITED: blog.openreplay.com/chrome-local-network-access-lna-permission/ — "Browser extensions operate under a different security model and are not subject to the LNA permission prompt. Extensions with appropriate host permissions can still make requests to local network addresses without triggering the dialog."]

```typescript
// background.ts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SEND_ANNOTATION') {
    handleSendAnnotation(msg, sender)
      .then(sendResponse)
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true;  // CRITICAL: return true to keep channel open for async sendResponse
  }
  // ... other handlers
});

async function handleSendAnnotation(
  msg: { type: 'SEND_ANNOTATION'; tabId: number; payload: AnnotationPayload },
  sender: chrome.runtime.MessageSender
): Promise<{ ok: boolean; file?: string; serial?: number; error?: string }> {
  // 1. Re-read storage (MV3 SW may have been recycled)
  const state = await loadStorageState();

  // 2. Determine origin of the sending tab
  const tab = await chrome.tabs.get(msg.tabId);
  const origin = new URL(tab.url!).origin;

  // 3. Resolve host (pure fn, no Chrome API)
  const host = resolveRoute(origin, state);
  if (!host) {
    return { ok: false, error: `No host mapped for origin: ${origin}` };
  }

  // 4. Fetch — SW has host_permissions, exempt from LNA and CORS
  const resp = await fetch(`http://127.0.0.1:${host.port}/annotation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Stickyfix-Token': host.token,
    },
    body: JSON.stringify(msg.payload),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
    return { ok: false, error: err.error ?? `HTTP ${resp.status}` };
  }
  return resp.json();
}
```

**Async response pattern — important:** `return true` from `onMessage` listener is the MV3 standard approach. Chrome 148+ also supports returning a Promise directly (the `async (msg, sender) => { ... return value; }` pattern), but `return true` + `sendResponse` is the safe cross-version choice.

[CITED: developer.chrome.com/docs/extensions/develop/concepts/messaging — "return a literal true (not just a truthy value) from the event listener"]

### Pattern 5: Host Discovery — Parallel Port Scan (EXT-04)

**What:** Probe all 21 ports in parallel with `Promise.allSettled`, short `AbortController` timeout, collect `/status` responders with `{app:'stickyfix'}`.

```typescript
// lib/discovery.ts — pure fetch, no Chrome API needed
const PROBE_PORTS = Array.from({ length: 21 }, (_, i) => 39240 + i);
const PROBE_TIMEOUT_MS = 800; // enough for loopback; fail fast on closed ports

export interface HostEntry {
  name: string;
  port: number;
  origins: string[];
  notesDir: string;
  token: string | null;  // null until user enters it
}

export async function discoverHosts(): Promise<HostEntry[]> {
  const results = await Promise.allSettled(
    PROBE_PORTS.map(port => probePort(port))
  );
  return results
    .filter((r): r is PromiseFulfilledResult<HostEntry> => r.status === 'fulfilled')
    .map(r => r.value);
}

async function probePort(port: number): Promise<HostEntry> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const resp = await fetch(`http://127.0.0.1:${port}/status`, {
      signal: ctrl.signal,
    });
    const data = await resp.json();
    if (data.app !== 'stickyfix') throw new Error('not stickyfix');
    return {
      name: data.name,
      port,
      origins: data.origins ?? [],
      notesDir: data.notesDir,
      token: null,
    };
  } finally {
    clearTimeout(timer);
  }
}
```

**Note:** SW fetch to `/status` does NOT require `optional_host_permissions`. The SW has `host_permissions: [http://127.0.0.1/*]` which covers all 127.0.0.1 ports unconditionally.

[CITED: developer.chrome.com/docs/extensions/reference/api/scripting — host_permissions grants unrestricted access to matching origins]

### Pattern 6: chrome.storage.local Schema + WXT defineItem (EXT-09)

**What:** WXT's `storage.defineItem<T>('local:key', { fallback })` provides typed, namespaced storage over `chrome.storage.local`. Key format is `'local:myKey'` (namespace prefix required).

[CITED: wxt.dev/storage + WXT Storage API reference]

```typescript
// lib/storage.ts
import { storage } from 'wxt/utils/storage';
import type { HostEntry } from './types';

export interface StorageState {
  registry: Record<string, HostEntry>;   // name → HostEntry
  tokens: Record<string, string>;         // name → token
  originMap: Record<string, string>;      // origin → host name
  prefs: { reviewMode: Record<number, boolean> }; // tabId → reviewMode
}

// Named items for type safety
export const sfxRegistry = storage.defineItem<Record<string, HostEntry>>(
  'local:sfxRegistry',
  { fallback: {} }
);

export const sfxTokens = storage.defineItem<Record<string, string>>(
  'local:sfxTokens',
  { fallback: {} }
);

export const sfxOriginMap = storage.defineItem<Record<string, string>>(
  'local:sfxOriginMap',
  { fallback: {} }
);

export const sfxPrefs = storage.defineItem<{ reviewMode: Record<string, boolean> }>(
  'local:sfxPrefs',
  { fallback: { reviewMode: {} } }
);

// Convenience: load all at once
export async function loadStorageState(): Promise<StorageState> {
  const [registry, tokens, originMap, prefs] = await Promise.all([
    sfxRegistry.getValue(),
    sfxTokens.getValue(),
    sfxOriginMap.getValue(),
    sfxPrefs.getValue(),
  ]);
  return { registry, tokens, originMap, prefs };
}
```

**Survival guarantee:** `chrome.storage.local` is persisted to disk by Chrome. It survives SW termination, Chrome restart, and extension reload. Values are not cleared when users clear browser cache.

[CITED: developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle]

### Pattern 7: Storage Reconciliation on SW Wake (EXT-10)

**What:** When the SW wakes and re-discovers hosts, merge fresh discoveries into the persisted registry by project `name`, preserving tokens. Never key by port.

```typescript
// lib/routing.ts — pure function, no Chrome API
export function reconcileRegistry(
  persisted: Record<string, HostEntry>,
  discovered: HostEntry[],
  tokens: Record<string, string>
): Record<string, HostEntry> {
  const result = { ...persisted };
  for (const host of discovered) {
    result[host.name] = {
      ...host,
      // Preserve persisted token if user set one; otherwise keep null
      token: tokens[host.name] ?? persisted[host.name]?.token ?? null,
    };
  }
  return result;
}
```

This function is pure — it takes plain objects, returns a plain object, and can be unit-tested with `node:test` without any Chrome API.

### Pattern 8: Routing Resolution Order (EXT-06, EXT-07, EXT-08)

**What:** Resolve an origin to a host entry using the locked D-06 resolution order. Pure function.

```typescript
// lib/routing.ts — no Chrome API, fully unit-testable
export function resolveRoute(
  origin: string,
  state: StorageState
): HostEntry | null {
  // Step 1: host advertising this origin in its origins[]
  const byAdvertised = Object.values(state.registry).find(
    h => h.origins.includes(origin)
  );
  if (byAdvertised) return { ...byAdvertised, token: state.tokens[byAdvertised.name] ?? null };

  // Step 2: persisted origin→name map
  const mappedName = state.originMap[origin];
  if (mappedName && state.registry[mappedName]) {
    const h = state.registry[mappedName];
    return { ...h, token: state.tokens[mappedName] ?? null };
  }

  // Step 3: page self-id — resolved elsewhere (requires injected script to read DOM)
  // If caller passes a resolved hostName from page self-id, it arrives as step 2 already
  // persisted. Step 3 is handled by GET_ROUTE message → SW injects probe → reads meta/window.

  // Step 4: no route found — caller must trigger dropdown
  return null;
}
```

**Step 3 Implementation Detail (EXT-08):** Reading `<meta name="stickyfix-project">` or `window.__stickyfix_project` requires an injected script because the SW cannot see the page DOM. The flow is:

1. `GET_ROUTE` message from content script → SW calls `resolveRoute` (steps 1 & 2)
2. If null: SW calls `browser.scripting.executeScript({ target:{tabId}, func: readPageSelfId })` to run a small inline function in the page and return the meta/window value
3. If found: persist to `originMap`, return to content script
4. If still null: content script shows the one-time dropdown

```typescript
// inline probe function — runs in isolated world
function readPageSelfId(): string | null {
  const meta = document.querySelector('meta[name="stickyfix-project"]');
  if (meta) return meta.getAttribute('content');
  return (window as any).__stickyfix_project ?? null;
}

// In SW handler:
const probeResult = await browser.scripting.executeScript({
  target: { tabId: msg.tabId },
  func: readPageSelfId,
});
const projectName = probeResult[0]?.result ?? null;
```

[CITED: developer.chrome.com/docs/extensions/reference/api/scripting#method-executeScript — func property for inline code]

### Pattern 9: Connection Chip in Shadow Root (EXT-11)

**What:** A minimal functional chip mounted via `createShadowRootUi`. Draggable with pointer events (no interactjs in Phase 3). Viewport-clamped.

```typescript
// review.content/chip.ts
export function mountChip(container: HTMLElement, route: RouteInfo) {
  const chip = document.createElement('div');
  chip.id = 'sfx-chip';
  // Never use innerHTML with data from external sources (XSS surface).
  // route.name/notesDir come from the trusted /status endpoint, but DOM
  // construction with textContent is the correct pattern unconditionally.
  const label = document.createElement('span');
  label.className = 'sfx-chip-route';
  label.textContent = `→ ${route.name} · ${route.notesDir}`;

  const sendBtn = document.createElement('button');
  sendBtn.className = 'sfx-chip-send';
  sendBtn.textContent = 'Send (test)';

  const exitBtn = document.createElement('button');
  exitBtn.className = 'sfx-chip-exit';
  exitBtn.textContent = 'Exit';

  chip.append(label, sendBtn, exitBtn);
  container.appendChild(chip);
  makeDraggable(chip);
  exitBtn.addEventListener('click', exitReview);
  sendBtn.addEventListener('click', sendDummy);
}

function makeDraggable(el: HTMLElement) {
  let startX = 0, startY = 0, origLeft = 0, origTop = 0;
  el.style.position = 'fixed';
  el.style.top = '16px';
  el.style.right = '16px';

  el.addEventListener('pointerdown', (e: PointerEvent) => {
    el.setPointerCapture(e.pointerId);
    startX = e.clientX; startY = e.clientY;
    const rect = el.getBoundingClientRect();
    origLeft = rect.left; origTop = rect.top;
  });

  el.addEventListener('pointermove', (e: PointerEvent) => {
    if (!el.hasPointerCapture(e.pointerId)) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const newLeft = Math.max(0, Math.min(window.innerWidth - el.offsetWidth, origLeft + dx));
    const newTop = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, origTop + dy));
    el.style.left = `${newLeft}px`;
    el.style.top = `${newTop}px`;
    el.style.right = 'auto';
  });
}
```

**CSS isolation — required `:host` reset:**
```css
/* review.content/styles.css */
:host {
  all: initial;
  display: block;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;   /* host passes through; chip itself has pointer-events:auto */
  z-index: 2147483647;
}

#sfx-chip {
  pointer-events: auto;
  position: fixed;
  top: 16px;
  right: 16px;
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 6px;
  padding: 8px 12px;
  font-family: system-ui, sans-serif;   /* explicit — no inheritance from page */
  font-size: 13px;                       /* px not rem — WXT resets html font-size */
  box-shadow: 0 2px 8px rgba(0,0,0,.15);
  cursor: default;
  user-select: none;
  display: flex;
  gap: 8px;
  align-items: center;
}
```

**rem units warning:** WXT applies `all: initial` to the shadow host, but `rem` units inside the shadow root remain relative to the page's `<html>` font-size (NOT a reset value). Use `px` exclusively in Phase 3 chip CSS.

[CITED: wxt.dev/guide/resources/faq.html — rem gotcha documented]

### Pattern 10: Dummy Relay Payload (D-09, EXT-05)

**What:** The stub Send button in the chip emits a minimal valid §9.1 payload so the host writes a `.md` proving the relay works end-to-end.

```typescript
// review.content/chip.ts — sendDummy function
async function sendDummy() {
  const payload: AnnotationPayload = {
    mode: 'free',
    comment: 'stickyfix relay proof',    // distinctive — easy to spot/delete
    page: {
      url: window.location.href,
      title: document.title,
    },
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
    screenshots: [],
  };
  const result = await chrome.runtime.sendMessage({
    type: 'SEND_ANNOTATION',
    tabId: await getCurrentTabId(),
    payload,
  });
  if (result.ok) {
    showToast(`Saved: ${result.file}`);
  } else {
    showToast(`Error: ${result.error}`, 'error');
  }
}
```

**HTTPS-origin requirement:** Success Criterion 3 requires this dummy Send to succeed on an HTTPS-origin page (not just localhost). The SW relay is the only path that works there — content-script fetch would be LNA-blocked.

### Anti-Patterns to Avoid

- **Global state in background.ts:** Never `let registry = {}` at module scope. SW is killed after ~30s idle — all globals are lost. Always re-read from `sfxRegistry.getValue()` at handler start.
- **`port` as stable routing key:** Store `originMap: origin → host name`. On re-discovery, update the port. Never `originMap: origin → port`.
- **`return;` without `return true;` in async onMessage:** If the listener returns `undefined` (implicit), Chrome closes the message channel immediately. The `sendResponse` call from an async continuation is silently dropped. Always `return true`.
- **Calling `createShadowRootUi` outside an entrypoint `main(ctx)`:** Won't work — `ctx` is undefined. Must use WXT's `registration:'runtime'` entrypoint pattern.
- **Requesting `<all_urls>` from the SW directly:** `chrome.permissions.request` must be called from a user gesture. The SW cannot be inside a user gesture chain. Only the popup's click handler qualifies.
- **Sequential port probing:** 21 ports × 800ms timeout = 16.8s worst case. Always probe with `Promise.allSettled`.
- **`rem` units in shadow root CSS:** Use `px` — rem refers to the host page's `<html>` font-size which may be 62.5% or other values.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Typed storage over chrome.storage.local | Custom wrapper | WXT `storage.defineItem` | Handles fallbacks, types, watch, versioning |
| Shadow-root UI with style isolation | Manual ShadowRoot.attachShadow | WXT `createShadowRootUi` | Handles CSS injection mode, all:initial, lifecycle cleanup, ctx invalidation |
| Routing resolution | Ad-hoc `if/else` in background.ts | `lib/routing.ts` pure functions | Testable without Chrome API; keeps background.ts clean |

**Key insight:** The pure functions in `lib/` (routing resolution, registry reconciliation, storage schema) should have zero Chrome API calls — they work on plain TypeScript objects. This makes them `node:test`-testable. The Chrome API boundary lives only in `background.ts` and the content script.

---

## Runtime State Inventory

> Phase 3 is a new feature phase (not a rename/refactor). No runtime state migration required.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Phase 3 creates `sfxRegistry`, `sfxTokens`, `sfxOriginMap`, `sfxPrefs` in chrome.storage.local — all new keys | Initialize on first access via `fallback: {}` |
| Live service config | None — no external services have Phase 3 state | None |
| OS-registered state | None | None |
| Secrets/env vars | None — tokens are user-entered into popup, stored in chrome.storage.local | None |
| Build artifacts | None — lib/ and review.content/ are new; no stale artifacts | None |

---

## Common Pitfalls

### Pitfall 1: SW State Loss After Idle (Critical)

**What goes wrong:** SW terminates after ~30s idle. Any `const registry = {}` at module scope is zeroed. Next SEND_ANNOTATION has no host to route to — silent drop.

**Why it happens:** MV3 SW lifecycle is ephemeral. Unlike MV2 background pages, SW has no persistence guarantee.

**How to avoid:** Re-read `sfxRegistry.getValue()` + `sfxTokens.getValue()` at the TOP of every handler. No module-level caches.

**Warning signs:** Notes fail after idle period; resume working after clicking the extension icon (which re-wakes the SW).

[CITED: developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle]

### Pitfall 2: `return true` Missing from onMessage (Silent Async Drop)

**What goes wrong:** Listener returns `undefined` implicitly (forgetting `return true`). Chrome closes the response channel. `sendResponse({ok: true, file: ...})` fires from the async continuation but the channel is gone — the content script never gets the response. The Promise in the content script times out or hangs.

**How to avoid:** Every handler that calls `sendResponse` asynchronously MUST `return true` synchronously from the listener. This is the standard MV3 pattern.

**Warning signs:** Content script awaiting `chrome.runtime.sendMessage(...)` hangs indefinitely; no toast appears.

[CITED: developer.chrome.com/docs/extensions/develop/concepts/messaging]

### Pitfall 3: Optional Permission Request Outside User Gesture

**What goes wrong:** `chrome.permissions.request({ origins: ['<all_urls>'] })` is called from the SW (or after an await in the popup handler). Chrome silently rejects it — the dialog never appears, `granted` is `false`.

**How to avoid:** The `.request()` call must be the first thing in the button click handler, before any `await`. The gesture association is preserved through synchronous code; it may break after an `await`.

**Warning signs:** Permission request returns `false` with no dialog shown; Review Mode silently fails to enter.

[CITED: developer.chrome.com/docs/extensions/reference/api/permissions]

### Pitfall 4: Wrong Output Path in scripting.executeScript

**What goes wrong:** Using `files: ['review.js']` or `files: ['review.content.js']` instead of `files: ['content-scripts/review.js']`. Extension throws "No matching file found" or similar.

**How to avoid:** WXT's naming convention: `entrypoints/review.content/index.ts` → `content-scripts/review.js`. Build once and confirm the path in `.output/chrome-mv3/content-scripts/`.

**Warning signs:** `chrome.scripting.executeScript` throws a runtime error when entering Review Mode.

[CITED: wxt.dev/guide/essentials/entrypoints.html]

### Pitfall 5: Shadow DOM CSS Using rem Units

**What goes wrong:** CSS like `font-size: 1rem` in the shadow root inherits from the HOST PAGE's `<html>` font-size. A Tailwind site that sets `html { font-size: 62.5% }` makes all rem-sized text tiny.

**How to avoid:** Use `px` exclusively in Phase 3 chip CSS. `all: initial` on `:host` resets inherited properties but NOT the rem base (rem refers to the document root, not the shadow root).

**Warning signs:** Chip renders at different sizes on different sites.

[CITED: wxt.dev/guide/resources/faq.html]

### Pitfall 6: Parallel Discovery Timeout Too Short / Too Long

**What goes wrong:** Too short (< 200ms) and a slow loopback response misses a live host. Too long (> 2s) and entering Review Mode with no hosts running takes forever.

**How to avoid:** 800ms per probe. Loopback latency is < 1ms; 800ms is ~800x the expected RTT and still fails fast on closed ports (TCP RST is near-instantaneous on 127.0.0.1).

[ASSUMED: 800ms probe timeout — reasonable for loopback but not verified in official docs]

---

## Code Examples

### Minimal Valid Dummy Payload (§9.1, D-09)

```typescript
// Source: PRD §9.1 — annotation payload shape
const dummyPayload: AnnotationPayload = {
  mode: 'free',
  comment: 'stickyfix relay proof',
  page: {
    url: window.location.href,
    title: document.title,
  },
  viewport: {
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
  },
  // screenshots: [] is valid — host skips PNG write if empty
};
```

Host accepts this because `mode`, `comment`, `page.url`, `page.title`, `viewport.width`, `viewport.height`, `viewport.devicePixelRatio` all pass the server's shape guard (see `host/src/server.ts` line 107–118).

### Storage Read Pattern (Every SW Handler)

```typescript
// Source: WXT storage docs + PRD §7.6
// Pattern: read at top of every handler, never rely on module-level cache
export async function handleMessage(msg: SfxMessage, sender: chrome.runtime.MessageSender) {
  const [registry, tokens, originMap] = await Promise.all([
    sfxRegistry.getValue(),
    sfxTokens.getValue(),
    sfxOriginMap.getValue(),
  ]);
  // ... use registry, tokens, originMap
}
```

### WXT Manifest — Complete Phase 3 wxt.config.ts

```typescript
// Source: wxt.dev/guide/essentials/config/manifest
import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'stickyfix',
    description: 'Pin sticky notes on any page — your AI reads them.',
    version: '0.1.0',
    icons: { 16: '/icon/16.png', 32: '/icon/32.png', 48: '/icon/48.png', 128: '/icon/128.png' },
    permissions: ['activeTab', 'scripting', 'storage', 'tabs'],
    host_permissions: ['http://127.0.0.1/*', 'http://localhost/*'],
    // @ts-ignore — valid MV3 key, may not be in WXT's TS types yet
    optional_host_permissions: ['<all_urls>'],
  },
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Persistent background pages (MV2) | Ephemeral service worker (MV3) | Chrome 88+ (MV3 introduction) | ALL state must be in chrome.storage.local |
| Content script fetching localhost directly | SW relay (content script → sendMessage → SW → fetch) | Chrome 142 (LNA enforcement) | Non-optional for HTTPS-origin pages |
| Static content_scripts in manifest | On-demand injection via chrome.scripting.executeScript | Best practice (MV3) | Zero footprint on unactivated pages |
| return true + sendResponse | Also: async function returning Promise (Chrome 148+) | Chrome 148 | return true is still the safe cross-version choice |

**Deprecated/outdated:**
- MV2 background pages: removed in Chrome 127+; not applicable.
- `chrome.extension.sendMessage`: removed; use `chrome.runtime.sendMessage`.
- `moduleResolution: node` in tsconfig: deprecated in TS6; use `bundler` (extension) / `nodenext` (host).

---

## Testability Analysis

### Pure Functions in `lib/` — Unit-Testable with node:test

These have zero Chrome API surface — test with `node:test` like existing host tests:

| Module | Function | Test approach |
|--------|----------|---------------|
| `lib/routing.ts` | `resolveRoute(origin, state)` | Construct mock StorageState objects; assert correct HostEntry returned for each routing step |
| `lib/routing.ts` | `reconcileRegistry(persisted, discovered, tokens)` | Assert port updates but token preservation; assert new hosts added; assert stale hosts not removed |
| `lib/discovery.ts` | `discoverHosts()` | Mock fetch (Node 18+ `--experimental-fetch` or test doubles); assert correct port filtering |
| `lib/storage.ts` | Schema definitions | Type-check only; no runtime test needed |

**Test file location:** `lib/test/routing.test.ts` + `lib/test/discovery.test.ts` — compile with tsconfig.host.json extension (add `lib/` to include), run with `node --test`.

**Add to `npm run check`:** `node --test dist/lib/test/routing.test.js dist/lib/test/discovery.test.js`

### Manual-Only Tests (Chrome Required)

| Test | Why manual |
|------|-----------|
| SW injection triggers content script | Requires loaded extension in Chrome |
| Permission request dialog appears | Requires Chrome UI |
| Chip renders in shadow root at z-index 2147483647 | Visual verification |
| Dummy Send produces .md on HTTPS-origin page | Requires live host + live HTTPS page |
| SW state survives 5-min idle | Requires waiting; Chrome devtools |
| Optional permission survives Chrome restart | Requires restart |

The 5 Success Criteria (SW host list, token persist/survive restart, HTTPS-origin dummy Send, re-bind after port change, one-time origin dropdown) are all manual Chrome verification steps.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Test runner (node:test), host | ✓ | v25.8.1 | — |
| npm | Package management | ✓ | 11.9.0 | — |
| WXT | Extension build | ✓ | 0.20.26 (in devDeps) | — |
| TypeScript | Type checking | ✓ | 6.0.3 (in devDeps) | — |
| Chrome/Chromium | Manual extension testing | ✓ (assumed — dev machine) | 142+ required for LNA behavior | — |
| stickyfix-host | Relay proof (Success Criterion 3) | ✓ (Phase 2 complete) | Phase 2 | — |

**Missing dependencies with no fallback:** None.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` (same as host tests) |
| Config file | None — compiled files run directly via `node --test` |
| Quick run command | `tsc -p tsconfig.host.json && node --test dist/lib/test/routing.test.js dist/lib/test/discovery.test.js` |
| Full suite command | `npm run check` (extends existing check script) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXT-04 | discoverHosts collects all /status responders | unit | `node --test dist/lib/test/discovery.test.js` | ❌ Wave 0 |
| EXT-05 | resolveRoute never returns null when host advertises origin | unit | `node --test dist/lib/test/routing.test.js` | ❌ Wave 0 |
| EXT-06 | resolveRoute step 1 (advertised) beats step 2 (persisted) | unit | `node --test dist/lib/test/routing.test.js` | ❌ Wave 0 |
| EXT-07 | originMap persistence after one-time selection | unit | `node --test dist/lib/test/routing.test.js` | ❌ Wave 0 |
| EXT-08 | reconcileRegistry preserves tokens, updates ports | unit | `node --test dist/lib/test/routing.test.js` | ❌ Wave 0 |
| EXT-09 | Storage survives SW eviction | manual | Idle 5 min in Chrome | manual-only |
| EXT-10 | Re-bind by name after port change | unit (reconcileRegistry) + manual | `node --test dist/lib/test/routing.test.js` + Chrome manual | ❌ Wave 0 |
| EXT-01,02,03,11 | Manifest, injection, popup, chip | manual | Chrome load + visual verify | manual-only |

### Sampling Rate

- **Per task commit:** `tsc --noEmit && tsc -p tsconfig.host.json --noEmit` (type-check both halves)
- **Per wave merge:** `npm run check` (full suite including routing/discovery unit tests)
- **Phase gate:** Full suite green + all 5 Success Criteria verified manually in Chrome before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `lib/test/routing.test.ts` — covers EXT-05, EXT-06, EXT-07, EXT-08, EXT-10 (pure fn tests)
- [ ] `lib/test/discovery.test.ts` — covers EXT-04 (fetch mock or integration)
- [ ] `tsconfig.host.json` — extend `include` to cover `lib/` alongside `host/`
- [ ] `package.json` — extend `check` and `test` scripts to run lib tests

---

## Security Domain

> `security_enforcement: true` in config — ASVS Level 1 required.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Partial (token auth in host, not in extension itself) | `X-Stickyfix-Token` header — host validates; already implemented in Phase 2 |
| V3 Session Management | No (no sessions — tokens are long-lived per-host credentials) | — |
| V4 Access Control | Yes (SW is only HTTP client; popup is only token entry point) | Architecture enforces — no direct content-script fetch |
| V5 Input Validation | Yes (extension sends structured payloads) | Payload shape validated by host's guard (server.ts lines 107–118) |
| V6 Cryptography | No (no crypto in extension; host uses crypto.randomUUID for tokens) | Phase 2 |

### Known Threat Patterns for MV3 + Shadow DOM

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Content script injecting to wrong origin | Spoofing | origin extracted from `chrome.tabs.get(tabId).url` in SW — can't be spoofed by page |
| Page JS reading shadow DOM internals | Information Disclosure | Shadow DOM prevents direct access; no secrets stored in DOM |
| Token visible in storage (chrome.storage.local) | Information Disclosure | chrome.storage.local is extension-scoped; page JS cannot read it |
| Malicious page sending SEND_ANNOTATION | Tampering | Content scripts from other extensions can't send to our SW; page JS can't send chrome.runtime.sendMessage to another extension |
| LNA block workaround via CORS host bypass | Elevation of Privilege | Blocked by architecture — SW relay is the only path |

**GPL clean-room:** All extension code is written from this PRD spec and WXT docs. No upstream (`JodusNodus/opencode-chrome-annotation`) code is copied. Identifier namespace `sfx-*` / `stickyfix` maintains separation. This is a Phase 1 invariant carried forward.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `optional_host_permissions` may need `// @ts-ignore` in WXT 0.20.x | §Pattern 1 — WXT Manifest | Low — field is valid MV3 JSON; worst case is a TS warning, not a build failure |
| A2 | Permission request breaks gesture chain if called after an `await` in the same handler | §Pattern 3 | Medium — if Chrome actually preserves gesture through awaits, the conservative ordering is still correct but unnecessary. If wrong (doesn't preserve), permission request silently fails. |
| A3 | 800ms probe timeout is appropriate for loopback | §Pattern 5 — Host Discovery | Low — easily tunable; loopback is < 1ms RTT so any value > 100ms works |
| A4 | `content-scripts/review.css` is automatically injected by WXT when `cssInjectionMode:'ui'` is used with `registration:'runtime'` | §Pattern 2 — On-Demand Injection | Medium — if WXT requires a separate `scripting.insertCSS` call for runtime-registered scripts, CSS won't appear. Mitigation: build once and check `.output/chrome-mv3/` before implementation |

**If A4 is wrong:** Add `await browser.scripting.insertCSS({ target: { tabId }, files: ['content-scripts/review.css'] })` after `executeScript`. This is the fallback for any runtime-injection CSS gap.

---

## Open Questions

1. **Does WXT auto-inject CSS for `registration:'runtime'` + `cssInjectionMode:'ui'`?**
   - What we know: WXT docs say `cssInjectionMode:'ui'` puts CSS into the shadow root. For static content scripts this is automatic. For runtime-registered scripts, the WXT scripting guide shows only `files: ['content-scripts/example.js']` — no mention of separate CSS injection.
   - What's unclear: Whether WXT injects the CSS file automatically alongside the JS when using `executeScript`, or whether the developer must call `insertCSS` separately.
   - Recommendation: Build once in Wave 0, inspect `.output/chrome-mv3/`, then test both paths. If CSS is missing from the chip, add `insertCSS` for the `.css` file.

2. **Does `chrome.permissions.request` for `<all_urls>` persist across Chrome restarts?**
   - What we know: `chrome.storage.local` persists. Optional permissions granted via `chrome.permissions.request` should also persist (Chrome docs say optional permissions persist until removed).
   - What's unclear: Whether the user must re-grant on every Chrome restart or only once ever.
   - Recommendation: Test on fresh Chrome profile. EXT-09 Success Criterion requires it to survive restart.

---

## Sources

### Primary (HIGH confidence)

- [developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) — SW idle timeout (30s), storage survival, global variable loss
- [developer.chrome.com/docs/extensions/develop/concepts/messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging) — `return true` async sendResponse pattern
- [developer.chrome.com/docs/extensions/reference/api/permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions) — user gesture requirement for permissions.request
- [developer.chrome.com/docs/extensions/reference/api/scripting#method-executeScript](https://developer.chrome.com/docs/extensions/reference/api/scripting#method-executeScript) — executeScript signature; files vs func properties
- [wxt.dev/guide/key-concepts/content-script-ui.html](https://wxt.dev/guide/key-concepts/content-script-ui.html) — createShadowRootUi API, cssInjectionMode, position, onMount/onRemove
- [wxt.dev/guide/essentials/scripting](https://wxt.dev/guide/essentials/scripting) — registration:'runtime', output path pattern `content-scripts/{name}.js`
- [wxt.dev/guide/essentials/entrypoints.html](https://wxt.dev/guide/essentials/entrypoints.html) — `{name}.content/index.ts` → `content-scripts/{name}.js` naming convention
- [wxt.dev/storage](https://wxt.dev/storage) — storage.defineItem API, key format `local:key`, fallback, getValue/setValue/watch
- [wxt.dev/guide/resources/faq.html](https://wxt.dev/guide/resources/faq.html) — rem gotcha in shadow roots
- [blog.openreplay.com/chrome-local-network-access-lna-permission/](https://blog.openreplay.com/chrome-local-network-access-lna-permission/) — extensions with host_permissions exempt from LNA
- PRD.md §6.1, §7.1, §7.4, §7.6, §9.1 — authoritative project spec
- `host/src/server.ts` — live /status + /annotation contracts; payload shape guard (lines 107–118)
- `host/src/types.ts` — AnnotationPayload TypeScript interface (authoritative)
- WXT GitHub Discussion #623 — createShadowRootUi requires ContentScriptContext from entrypoint main(ctx); cannot be used with executeScript func injection

### Secondary (MEDIUM confidence)

- [github.com/wxt-dev/examples/blob/main/examples/dynamic-content-scripts/wxt.config.ts](https://github.com/wxt-dev/examples/blob/main/examples/dynamic-content-scripts/wxt.config.ts) — optional_host_permissions `*://*/*` pattern
- [deepwiki.com/wxt-dev/wxt/6.2-storage-api](https://deepwiki.com/wxt-dev/wxt/6.2-storage-api) — storage.defineItem pattern with fallback
- [developer.chrome.com/blog/local-network-access](https://developer.chrome.com/blog/local-network-access) — LNA launched in Chrome 142

### Tertiary (LOW / ASSUMED — flagged)

- A2: Permission request gesture-chain after await — community reports, not official docs
- A3: 800ms probe timeout — engineering judgment for loopback

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified on npm registry; WXT docs fetched
- Architecture: HIGH — prior research ARCHITECTURE.md + Chrome docs confirm SW-relay pattern
- On-demand injection: HIGH — WXT discussion #623 + scripting guide confirm registration:'runtime' + output path
- LNA exemption: HIGH — OpenReplay article + Chrome LNA blog confirm extensions are exempt
- Storage: HIGH — WXT storage docs + Chrome lifecycle docs confirm chrome.storage.local survival
- Pitfalls: HIGH — prior PITFALLS.md research, confirmed against Chrome docs
- CSS injection mode for runtime scripts: MEDIUM — A4 is an assumption requiring build verification

**Research date:** 2026-05-31
**Valid until:** 2026-08-31 (WXT is actively maintained; Chrome API changes are documented in release notes)
