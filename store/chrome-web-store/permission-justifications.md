---
store: Chrome Web Store
version: 1.1.1
last_updated: 2026-06-17
purpose: CWS review submission — permission justifications, single purpose, remote code statement
---

# Chrome Web Store — Permission Justifications

## Single Purpose Statement

stickyfix has a single purpose: to allow a developer to pin contextual sticky notes onto any web page, save those notes as markdown files on the developer's local machine (via a companion localhost host), and display AI-agent replies back on the page as colour-coded status pins — enabling an iterative, file-based UI review loop between the developer and an AI coding agent.

---

## Remote Code Statement

**Does this extension execute remote code?**

No. All JavaScript is bundled at build time using WXT (Vite). The extension does not fetch, eval, or execute any code from a remote URL at runtime. There is no use of `eval()`, `new Function()`, `innerHTML` assignment of untrusted strings, or dynamic script injection from external sources. The companion host is a separately installed local process; the extension never downloads or executes code from it.

---

## Permission Justifications

### `activeTab`

Needed to capture a screenshot of the current tab when the user drops a sticky note. `chrome.tabs.captureVisibleTab` requires `activeTab`. Access is scoped to the tab the user is actively viewing and is only exercised when the user explicitly triggers a capture (dropping a note or using the region-capture tool). The permission is never used for passive observation or background tab access.

### `scripting`

Needed to inject the Review Mode UI — the toolbar, sticky note post-its, status pins, and notes panel — into the current page on demand when the user clicks "Enter Review Mode." The extension uses `chrome.scripting.executeScript` at that moment. No content script is statically declared in the manifest; injection is always triggered by an explicit user action, minimising footprint on pages the user does not review.

### `storage`

Needed to persist two pieces of local state: (1) the per-origin project-folder mapping (which local folder stores notes for a given website origin, so the user is not asked to pick a folder on every tab), and (2) the native-messaging pairing state (so the extension stays paired with the companion host across browser restarts). No data is synced to the cloud. No user-identifiable information is stored.

### `tabs`

Needed to detect URL changes inside single-page applications. When the user navigates within the same tab without a full page load, `chrome.tabs.onUpdated` fires with the new URL, and the extension re-fetches the pins for the new page URL so stale pins from the previous route are not shown. This is the minimum necessary to support SPA navigation correctly.

### `nativeMessaging`

Needed to communicate with the `com.stickyfix.host` companion host, which is installed separately on the user's machine via `npx stickyfix init`. The extension uses the Native Messaging API to exchange an authentication token with the host at pairing time (so the token never travels over a network) and to trigger folder-picker dialogs on the host. All note writes use the HTTP relay on 127.0.0.1; native messaging is used for the secure pairing channel and for OS-level interactions (folder picker).

### `host_permissions`: `http://127.0.0.1/*`

Required to make HTTP requests to the companion host's relay server, which listens on 127.0.0.1 in the port range 39240–39260. These requests create, read, update, and delete notes, and fetch the current pin list for a page. The permission is scoped to loopback only; no external hosts are contacted. The host enforces token authentication on every write request.

### `host_permissions`: `http://localhost/*`

Required for the same purpose as `http://127.0.0.1/*` — some host implementations resolve the relay address as `localhost` rather than the numeric loopback address. Both are declared to ensure compatibility across platforms and Node.js versions. Access is functionally identical: loopback only, token-authenticated.

### `optional_host_permissions`: `<all_urls>`

Needed to inject the Review Mode content script into any web page the user chooses to review. This permission is **not** requested at install time. It is requested on demand the first time the user clicks "Enter Review Mode" — Chrome shows a runtime permission prompt. The user can decline; if declined, Review Mode will not function on that page. No access to page content occurs without this permission being explicitly granted by the user. The permission is necessary because stickyfix is a developer tool intended to work on any URL (the developer's own app, staging environments, etc.) — a fixed list of host patterns is not feasible.

---

## Data Use Disclosures

(Answers to CWS "Data practices" questions)

**Does the extension collect any user data?** No.
**Does it transmit any data to a remote server?** No. All data goes to 127.0.0.1 (the user's own machine).
**Does it use the data for any purpose other than the extension's core function?** No.
**Does it sell user data?** No.
**Certified?** Yes — the above disclosures are accurate and complete.
