# Changelog

All notable changes to **stikfix** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.0] - 2026-07-18

### Added
- **One-click Windows installer (`stikfix-setup-x.y.z.exe`).** A signed Inno Setup installer replaces the terminal-only `npx stikfix init` flow for non-developer machines. It offers a **Complete** install (host + every detected Chromium browser + run-on-startup + desktop icon, fully automatic) or a **Custom** install where you pick components (host, per-browser extension) and tasks (run-on-startup, desktop shortcut). The wizard finishes with a **post-install health check** (Doctor) showing a ✓/✗ verification of every part of the setup.
- **Standalone host binary (`stikfix-host.exe`, Node SEA).** The host now ships as a single self-contained executable that needs **no Node.js on the target machine** — resolving the most common fresh-install failure. It multiplexes every role by subcommand: `serve` (HTTP host), `native` (native-messaging, auto-detected when a browser launches it), `register` (non-interactive setup), `doctor` (health check, `--json` supported), and `uninstall` (idempotent teardown).
- **Automatic cross-browser extension install via signed CRX + policy.** The extension is packed into a CRX3 signed with the project key (stable ID `ccdfmbhd…`) and force-installed into Chrome/Edge/Brave via `ExtensionInstallForcelist`, pointed at a self-hosted update manifest on GitHub Releases. The policy writer is idempotent and never clobbers unrelated forcelist entries; uninstall removes only stikfix's entry.
- **Build tooling:** `npm run pack:crx`, `npm run gen:update-xml`, `npm run build:sea`, and `npm run build:installer` (orchestrates build → SEA → CRX → update manifest → ISCC into `dist/installer/`).

### Fixed
- **Desktop shortcut now lands on the real Desktop under OneDrive.** The launcher shortcut hardcoded `%USERPROFILE%\Desktop`, which does not exist when OneDrive "Known Folder Move" redirects the Desktop — so shortcut creation failed. It now resolves the actual Desktop via `[Environment]::GetFolderPath('Desktop')` (and the installer uses Inno's OneDrive-aware `{autodesktop}`).

## [1.5.1] - 2026-07-18

### Fixed
- **Fresh installs no longer crash the host on launch.** The published npm tarball omitted `dist/lib/pin-position.js` — the `files` allowlist shipped `dist/host/src` but not `dist/lib`, so the HTTP host (`dist/host/src/index.js` → `read-note.js`, which imports `../../lib/pin-position.js`) died with `ERR_MODULE_NOT_FOUND` on any machine that installed from npm. Added `dist/lib/pin-position.js` to the `files` allowlist; verified present via `npm pack --dry-run`.

## [1.5.0] - 2026-07-18

### Added
- **Git-sync mode (opt-in, per project).** A new **"Sync notes to git"** toggle in the extension popup — off by default — makes the host automatically `git add` / `git commit` / `git push` after writing each captured note (and its screenshots), pathspec-limited to `notes/` so it never touches the owner's code changes. A new `--git-sync` host CLI flag sets it as a machine-level default. This lets notes captured on one computer show up (via `git pull`) on another computer where the AI agent works — notes stay plain markdown files, read exactly as before. The host uses the machine's existing git auth (SSH/credential manager); stikfix stores no token.
- **`/status` reports git-sync state.** The host status endpoint now includes `gitRepo` (whether the project root is a git repository) and `gitSyncStatus` (whether git-sync is enabled and its last commit/push outcome), so the extension and other tooling can surface sync health.
- **`review-notes` skill updated for git-sync.** `skill/SKILL.md` now documents pulling before reading notes (so notes pushed from another machine are visible) and committing/pushing the skill's own frontmatter edits (`status: resolved`, `reply`, etc.) in git-sync projects, since the host only auto-commits new note captures, not the skill's later edits.

### Changed
- **Dark-theme polish across the on-page UI and popup.** The on-page chip, notes panel, note cards, and toasts now share a cohesive dark surface with lighter outlines so each box stands out against the page. The chip and notes panel each gained a **`||` drag grip** signalling they can be grabbed and dragged, and the **notes panel is now draggable** by its header (previously fixed in place). The popup is a clean edge-to-edge dark surface. Purely visual — all drag, routing, and capture behaviour is unchanged.

### Fixed
- **The "Sync notes to git" toggle now persists.** It previously reset to unchecked every time the popup reopened: prefs saved before the git-sync field existed had no `gitSync` key, and the storage fallback only fills a wholly-absent item (it never back-fills a new key), so both the read and the write threw and were silently swallowed. The popup read/write and the background send path now tolerate the missing key and initialise it on first write.

### Added
- **Annotation drawing toolbar.** A new **✎ Annotate** button on every note card opens a floating dark-pill toolbar for marking up a screenshot. Entering draw mode freezes the current page as a still image (stikfix's own UI is excluded from the capture, same as the region tool), then you can draw **arrows, lines, rectangles, circles/ellipses, and freehand marker** strokes — with a **color** picker and **stroke-thickness** control, a live drag-preview, select-move-delete, and `Ctrl+Z` undo. Clicking **Save** flattens the shapes into the captured PNG and attaches it as a normal screenshot, so it travels to disk with the note exactly like today's screenshots — no host, frontmatter, or file-format change. The on-screen preview matches the saved pixels exactly (the editor and the flattener share one draw routine).

### Changed
- **Chip and floating "+" button refreshed to a dark-pill look.** The on-page chip and FAB now use the same dark slate + blue-accent styling as the new drawing toolbar (rounded corners, softer shadow, hover/press feedback) for a cohesive on-page UI. Purely visual — all drag, routing, and button behavior is unchanged; the green/red host-connection dot keeps its meaning.
- **Simplified the popup to match an auto-connect workflow.** Removed the per-host token-entry list (token input · Apply · Clear · remove), the host-count summary, and the "+" add-host form — they were confusing and redundant now that hosts auto-connect. The popup is now just the header + Refresh, the Recent Projects quick-connect list (click to attach/launch and to switch projects), Enter Review Mode, and the routing line. Manual token entry is gone; connecting is handled by auto-connect and the native pairing button.
- **Auto-connect now also runs on Refresh / popup-open**, not only on Chrome startup. `REFRESH_HOSTS` now silently fetches each discovered host's token via native messaging, so starting a host *after* Chrome is already running connects it the moment you open the popup — no manual token entry.

### Fixed
- **Critical: every note Send failed with "Host unreachable: TypeError: Failed to fetch."** The service-worker relay had been refactored to take a URL *path* and build `http://127.0.0.1:<port><path>` in one place, but the five call sites (send / list / edit / delete / screenshot) still passed **full URLs** — producing a malformed double-prefixed URL that made `fetch` throw on every request, so no note could be captured. All call sites now pass paths. A dropped note is a regression; this restores reliable capture.
- **The relay now self-heals a stale host port.** On a network-level failure it re-runs host discovery, rematches the host (by name, else the sole live host), persists the corrected port to the registry, and retries once — so sends recover after the host restarts onto a different port (39240–39260) while Chrome stays open, instead of dead-ending. A host that is genuinely down still surfaces the visible "Host unreachable" toast (no silent drop).

## [1.3.2] - 2026-07-05

### Fixed
- **Critical: the package failed to install via `npm install` / `npx`.** The `postinstall` guard meant to skip `wxt prepare` for consumers was inverted — on a machine without `wxt` (every end-user install) it ran `wxt prepare` anyway, which errored with `'wxt' is not recognized`, aborting the install so no `stikfix` CLI bin was ever linked. This is why `npx stikfix init` could appear to do nothing. `postinstall` now runs `wxt prepare` only when `wxt` actually resolves and never fails the install. Affected 1.3.0–1.3.1 and earlier; **use 1.3.2+**.

## [1.3.1] - 2026-07-05

### Changed
- **`npx stikfix init` no longer requires `--root`.** When omitted, it defaults to the current working directory (prints `no --root given, using current directory: <cwd>`), so running it from inside your project folder just works. Pass `--root <dir>` to target a different folder.

### Fixed
- Startup de-registration (`--no-startup`, and `uninstall` when no autostart was set) no longer prints a spurious `ERROR: The system was unable to find the specified registry key or value.` — `reg DELETE` output is now suppressed since idempotent removal of an absent value is expected, not an error.

## [1.3.0] - 2026-07-04

### Added
- **Quick-connect recent projects.** The extension now remembers the last projects you used (a capped, most-recent-first list) and surfaces them in two places: a **"Recent projects"** section in the popup, and a **"Recent"** group in the on-page chip's project dropdown. Clicking one connects you in a single action — if that project's host is already running it just re-attaches; if it's stopped, the extension **launches the host for you** (via a new native `START_HOST` message that spawns the host detached — the native host still never listens on a socket itself) and connects once it comes up. Idempotent: a running project is never double-spawned.
- **Auto-connect on Chrome start.** On browser startup (and on extension install/update) the service worker now not only discovers running hosts but also silently fetches each one's token via native messaging, so your hosts are connected without opening the popup. Powered by an extended native `GET_TOKEN` that accepts an optional `root`, letting the extension fetch a token for *any* project it knows about (not just the one in `config.json`).
- **Run the host on Windows login.** `npx stikfix init` now asks *"Start stikfix host automatically on Windows login?"* (default **Yes**; `--startup` / `--no-startup` bypass the prompt, non-interactive shells skip it). When enabled it registers the existing hidden VBS launcher under `HKCU\…\CurrentVersion\Run`; `npx stikfix uninstall` removes it. `config.json` gains `hostEntry` / `nodePath` so the host can be relaunched cleanly — **existing installs should re-run `npx stikfix init` once** to pick these up and to see the startup prompt.
- **System-tray host indicator (Windows).** The running host now shows a tray icon whose presence means "host is running." It polls `/status` (green = running · tooltip shows the project + port; grey = not responding), self-exits when the host stops, and offers a right-click menu: **Open notes folder**, **Stop host**, **Quit tray**. Best-effort and Windows-only — it never affects the host on other platforms and can never crash it (a dropped note remains the one thing that must never happen).

### Changed
- **Chip shows the project name after you pick one.** Once you choose a folder or project in the chip dropdown, the chip collapses to the project's name instead of leaving the confusing "— select project —" placeholder, and re-opening the dropdown pre-selects the current project.

### Fixed
- Native `GET_TOKEN` with an explicit `root` no longer silently falls back to the default project when that root is invalid — it now returns a precise error instead of the wrong project's token.
- Quick-connect no longer leaves a row stuck spinning if the post-connect UI refresh fails, and every connect failure is now both surfaced to the user and logged.
- Quick-connect to an already-running host no longer risks spawning a duplicate host when an internal reconcile error occurs (that error now propagates instead of being swallowed).

## [1.2.0] - 2026-07-01

### Added
- **"Read / Archived" filter in the Notes panel + honest status counts.** The panel now has a `Read` chip listing archived notes (`*.read.md` / `status: read`), and the `All`/`Unread`/`Flagged`/`Resolved` chips count active work while `Read` counts the archive — so resolved/dismissed notes are no longer invisible and the counts reflect reality. This is panel-only: the page-pin layer and the live poller still exclude done notes (a `done=1` opt-in flows panel→SW→host `GET /annotations`), so read/resolved pins never reappear on the page (the v1.0.4 invariant holds).
- **"Browse folder…" in the chip dropdown.** Review Mode's project pull-down now has a `📁 Browse folder…` item at the top, so you can pick the project folder for the current site directly — no longer only via the first Send. Selecting it opens the OS folder dialog, persists the origin→folder mapping, and the chip self-updates to the `→ name · <folder>` routed label. The existing host-routing options and the Send→needs-folder flow are unchanged.
- **Firefox MV3 support (full port).** New `npm run build:firefox` WXT target emits a Firefox build with `browser_specific_settings.gecko.id` (`stikfix@stikfix.com`, `strict_min_version 109.0`). `npx stikfix init --root <dir> --browser firefox` registers a Firefox native-messaging host — `allowed_extensions` (gecko id) instead of `allowed_origins`, Mozilla manifest paths (macOS/Linux) and the `HKCU\Software\Mozilla\NativeMessagingHosts` registry key on Windows. The Chrome build is unchanged (same `key`, same derived extension ID).

### Changed
- **Renamed: stickyfix → stikfix.** The project, npm package (`stikfix`), CLI (`npx stikfix init`), native-messaging host id (`com.stikfix.host` + its OS registry keys), Firefox add-on id (`stikfix@stikfix.com`), env-var prefix (`STIKFIX_*`), and the on-disk `.stikfix-token` / `.stikfix-port` files are all renamed to **stikfix**. New home: `github.com/omernesh/stikfix` and `stikfix.com`. The Chrome extension's pinned ID is unchanged, so existing Chrome users keep the same extension; anyone who ran the old host must re-run `npx stikfix init` to re-register it under the new id.

### Fixed
- **Stale/orphaned pins are hidden instead of cluttering the page.** On SPAs, an element pin whose CSS selector no longer matches a live DOM node (the target re-rendered/disappeared) used to render greyed at its last-known rect — the declutter then fanned dozens of them into a corner cluster. Orphaned element pins are now hidden (`display:none`) and excluded from declutter; they reappear automatically if the anchor resolves again on scroll/DOM change. The note file and its Notes-panel entry are untouched (no data loss — the reliable-capture invariant holds). Free-floating pins are never affected.
- **Hermetic port-scan test (WR-06).** The test previously hardcoded the production port `39240` as its "occupied" blocker, so it failed with `EADDRINUSE` whenever a real stikfix host was already running on that port. It now occupies an OS-assigned ephemeral port and scans a range starting on it. `bindServer()` gained optional `startPort`/`endPort` params (defaulting to the existing `39240`–`39260` range) to support this — production behavior is unchanged.

## [1.1.1] - 2026-06-17

### Fixed
- **Free-note pins now restore where you dropped them.** A wire-key mismatch (the host serialized the field as `viewportCoords` while the extension read `note_position`) meant every free-floating pin fell back to the top-left corner instead of its saved position. The host descriptor field is now `note_position` end-to-end (matching the on-disk frontmatter key and the extension). Pre-existing since persistent pins shipped; surfaced by the v1.1.0 review.
- **All-pages live sync.** When the notes panel is in "All pages" mode, the live poller now polls project-wide, so a reply/status change to a note on another page updates the panel without a manual refresh (a scope switch itself no longer triggers a spurious pin re-render).

### Internal
- The service-worker `PinDescriptor` type now declares `reply`/`fixedIn` (type honesty; the fields were already forwarded structurally).

## [1.1.0] - 2026-06-17

### Added
- **Two-way review loop — AI replies on the page.** Notes now carry a `reply` (and optional `fixed_in`) field the AI writes when it processes them, surfaced on the pin and in the notes panel. New status model: `unread` (yellow) → `flagged` (amber pin, hover shows the AI's clarification question) → `resolved` (green ✓ pin, hover shows what was fixed — stays visible so you can verify) → `read` (hidden archive). The `review-notes` skill now sets `status: resolved` + `reply` on a fix instead of immediately archiving; `read`/`*.read.md` is reserved for the developer-triggered archive/dismiss step.
- **Notes panel.** A chip-toggled panel listing every note for the page: status counts, filter chips (all/unread/flagged/resolved), text search, and click-to-jump that scrolls to the pin. An "All pages" toggle lists notes across the whole project folder (`GET /annotations?scope=all`); clicking an off-page note navigates to it (http/https only).
- **Live disk→UI sync.** While Review Mode is active and the tab is visible, the page polls for note changes (~4s) and re-renders pins + panel when the AI writes a reply or changes a status — no manual refresh needed.
- **Pin decluttering.** Pins that would overlap now fan out deterministically so dense pages stay readable and every pin remains clickable.
- **Continuous integration.** GitHub Actions runs `npm run check` on push and PRs across Ubuntu and Windows (cross-platform build gate).

### Security
- The notes panel only navigates to `http`/`https` note URLs; a note file whose `url` is a `javascript:`/`data:` URL can no longer trigger navigation.

## [1.0.4] - 2026-06-17

### Fixed
- **Read notes no longer show a pin:** marking a note read (via the `review-notes` skill) now removes its pin from the page on the next refresh. The host's `listAnnotations` previously returned every note matching the page URL — including read ones — so a marked-read note's pin lingered (merely dimmed) until the file was deleted. The host now excludes notes the skill has marked done, by both signals it writes: the `*.read.md` filename rename (primary) and `status: read` in frontmatter (secondary). Unread notes are never affected — a freshly written note is always `status: unread` with a plain `.md` name, so the reliable-capture invariant holds.

## [1.0.3] - 2026-06-10

### Fixed
- **Stale pins after SPA navigation:** pins from a prior page no longer linger after an in-page (SPA) route change. Pins and the chip route are URL-scoped, but an in-page navigation does not reload the document, so the content script (and its pins) stayed bound to the old URL. The SW now detects in-page URL changes (`tabs.onUpdated` with `changeInfo.url`) on review-mode tabs and signals the live content script, which re-fetches pins (URL-filtered by the host) and refreshes the chip for the new URL. A mount-generation guard prevents overlapping refreshes from double-appending pins.

## [1.0.2] - 2026-06-10

### Fixed
- **Duplicate chip per tab:** entering Review Mode no longer leaves two chips in a tab. The idempotency guard now uses a synchronous isolated-world flag set before `createShadowRootUi` is awaited, closing a race where a second injection (SW re-inject on `tabs.onUpdated`, a repeated `complete` fire, or a fast re-enter) ran during the await window — before the shadow host was in the DOM — and the old `document.querySelector` guard missed it. The flag is released on chip close / exit / context invalidation so re-entering review mode still works.

## [1.0.1] - 2026-06-07

### Fixed
- **Folder picker error reporting:** when the native host is down or its token is missing, the chip/card now surfaces the real host error (e.g. _"stikfix host not found — run: npx stikfix init"_) instead of the misleading _"No folder chosen — note not saved. Drop again to pick one."_ toast. The "drop again" message is shown only when the OS dialog is actually dismissed by the user.
- **Folder picker no longer requires a token:** the native host reads `.stikfix-token` lazily (only for token pairing), so choosing a project folder works during onboarding even before the host token exists. Previously the native host exited early when the token file was absent and the OS dialog never opened.
- **Automatic recovery from token rotation:** every host request — loading pins, saving, editing, deleting notes, and fetching screenshots — now auto re-pairs with the native host and retries once on HTTP 401, so a host restart (which mints a new token) no longer dead-ends with an _"unauthorized"_ toast (e.g. _"Could not load pins — unauthorized"_).

## [1.0.0] - 2026-06-07

### Added
- Initial public release (npm: `stikfix`, MIT).
- Chrome MV3 extension (WXT) to pin free-floating or DOM-anchored sticky notes on any web page; review UI injected on demand inside a shadow root.
- Localhost native-messaging host (Node built-ins + `yaml`) that writes each note as a markdown file into the target project's `notes/` folder, auto-creating `notes/` if missing.
- Turnkey onboarding via `npx stikfix init --root <project>` — registers the native-messaging host and Desktop launcher.
- Zero-config origin→folder mapping (D-04): an unmapped origin opens an OS folder picker; the choice is remembered and reused silently.
- Security: host binds `127.0.0.1` only, token auth on `POST /annotation`, 12 MB body cap.
