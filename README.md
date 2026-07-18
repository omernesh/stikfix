<div align="center">

<img src="public/icon/128.png" alt="stikfix" width="96" height="96" />

# stikfix

**Stick a note on any web page. Your AI coding agent reads it and fixes it. That's the whole loop.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![npm](https://img.shields.io/npm/v/stikfix.svg)](https://www.npmjs.com/package/stikfix)
[![GitHub Release](https://img.shields.io/github/v/release/omernesh/stikfix?label=Windows%20installer)](https://github.com/omernesh/stikfix/releases/latest)
[![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-blue.svg)](#load-the-extension)

<br/>

<img src="docs/media/01-hero.png" alt="stikfix in action — drop a note on any element and it lands as a markdown file your AI reads" width="860" />

📖 **[Read the illustrated Getting Started guide →](docs/getting-started.md)**

</div>

---

## The problem you already know too well

You spot something off in your UI — a button that's 4px too low, a heading that wraps weird, a modal that scrolls when it shouldn't. So you screenshot it. Paste it into a chat. Type a paragraph explaining *which* button, on *which* page, and what "right" looks like. Your agent guesses. You screenshot again. Round and round.

That ping-pong is slow, lossy, and maddening — and it throws away everything the browser already knows about the element you're pointing at.

**stikfix kills the ping-pong.** You drop a note *directly on the thing*, and it lands on disk as a precise, context-rich markdown file in your project's `notes/` folder — which your AI agent can just read, fix, and mark done. A durable, file-based review loop instead of ephemeral chat.

No cloud. No accounts. No sign-up. Everything stays on `127.0.0.1` — **your code and your notes never leave your machine.**

## How it feels to use

1. Click **Enter Review Mode** on any page.
2. Drop a **sticky note** — free-floating, or click an element to anchor it. Anchored notes auto-capture the CSS selector, computed styles, `outerHTML`, the bounding box, an auto-highlighted screenshot, and the React component name. No describing required. Want to point at something exactly? **Draw an arrow, box, or circle right on a screenshot** and it rides along with the note.
3. Tell your agent **"read my notes."** It reads the fresh `.md` files, makes the fixes, and **writes a reply back into each note** — so the pin turns **green ✓** right on the page with a one-line "here's what I changed" (no fix is lost in a chat log). Anything ambiguous turns **amber** with the agent's clarifying question.
4. Glance at the pins (or open the **notes panel** to filter/search/jump), drop a few more, repeat. Pins update live as the agent works — no refresh. Your UI gets tighter every loop.

## See it in action

| | |
|:---:|:---:|
| <img src="docs/media/02-element-context.png" alt="Element context capture" width="440"/> | <img src="docs/media/03-draw.png" alt="Annotation drawing" width="440"/> |
| **Every note already knows the element** — selector, computed styles, component name. | **Draw arrows, boxes & circles** right on a frozen screenshot; it rides along with the note. |
| <img src="docs/media/04-pins.png" alt="On-page pins with agent replies" width="440"/> | <img src="docs/media/05-panel.png" alt="Notes panel" width="440"/> |
| **Your agent replies on the page** — green ✓ resolved, amber = a clarifying question. | **Filter, search & jump** to any note across the page or the whole project. |

**→ [Full illustrated Getting Started guide](docs/getting-started.md)**

## Quick start

### Windows: one-click installer (recommended)

1. Download the latest **`stikfix-setup-<version>.exe`** from the [latest release](https://github.com/omernesh/stikfix/releases/latest).
2. Run it. It needs **administrator rights** — it writes a browser policy so the extension can install itself.
3. Pick a setup type:
   - **Complete** — installs the host, force-installs the extension into every Chromium browser it finds (Chrome/Edge/Brave), sets the host to run on Windows login, and adds a desktop shortcut. Fully automatic — no terminal.
   - **Custom** — pick components (the host; which browsers get the extension) and tasks (run-on-startup, desktop shortcut) individually, and choose your notes folder.
4. The wizard finishes with a **post-install health check** that verifies the host binds, native messaging is registered, the browser force-install policy is set, and the notes folder is writable.
5. Open Chrome/Edge/Brave — the extension is already there, next time the browser starts. You'll see **"Installed by your organization"** next to it; that's expected and correct for a self-hosted extension. It's force-installed via enterprise policy (`ExtensionInstallForcelist`) pointed at a self-hosted update manifest, not a Chrome Web Store listing.
6. Open your app, click **Enter Review Mode**, and start dropping notes.

The installer ships **`stikfix-host.exe`**, a self-contained binary — no Node.js needs to be installed on the machine. Re-run the health check anytime with `stikfix-host.exe doctor`, or the **"Stikfix Health Check"** shortcut it adds to the Start menu. To remove everything — host, browser policy entry, startup entry, native-messaging registration — use Windows **Add or remove programs**.

For advanced use or troubleshooting, the same binary takes subcommands directly: `stikfix-host.exe serve --root <dir>`, `stikfix-host.exe doctor` (prints the health checklist), `stikfix-host.exe register` / `stikfix-host.exe uninstall`.

#### Staying up to date

stikfix keeps itself current with **no reinstalling by hand**:

- **Extension** — auto-updates silently. The installer registers a self-hosted update manifest via enterprise policy, so Chrome/Edge/Brave pull new versions on their own, exactly like a Web Store extension.
- **Host** — checks GitHub for a newer release on startup and every ~6 hours. When one is available, the **system-tray icon** shows an *update available* balloon and an **Update Stikfix (vX.Y.Z)** item in its right-click menu. Click it and stikfix downloads the new installer, **verifies its SHA-256**, and runs it (one Windows permission prompt) to replace and restart the host — your notes folder and settings are preserved.

The **system-tray icon** is also your at-a-glance host status: green when the host is running, and its menu lets you open the notes folder, stop the host, or apply a pending update.

> Already on an older build? Install the latest `stikfix-setup-<version>.exe` once; from then on, every future version offers itself from the tray with a single click.

### Developer path (macOS, Linux, or from source on Windows)

Everything the Windows installer automates above, you can also do by hand — this is the path for macOS/Linux, or for building and loading the extension from source.

#### 1. Install the host (one command)

```bash
npx stikfix init --root /path/to/your/project
```

This turnkey installer:

- registers the secure native-messaging host for **Chrome and Edge** (user-level, no admin rights),
- writes a small config pointing at your project,
- creates a **"Stikfix Host" launcher on your Desktop** so you can start the backend with a double-click — no terminal babysitting,
- prints your stable **extension ID** (you never copy-paste a token).

> **Keep it current:** re-run `npx --yes stikfix@latest init --root /path/to/your/project` anytime to update the host.

#### 2. Load the extension

On the developer path the extension is loaded **unpacked** (a Chrome Web Store listing is coming next — the Windows installer above already force-installs it automatically, so unpacked loading isn't needed there):

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and pick the **`.output/chrome-mv3/`** folder from this repo.

The loaded ID matches what the installer printed — nothing to type. (Building `.output/chrome-mv3/` from source is covered under [Development](#development).)

#### 3. Start the backend

Double-click the **Stikfix Host** launcher on your Desktop. That's it — no commands, and double-clicking again is safe (it won't launch a second copy). The host listens on a port in the `39240–39260` range; the extension discovers it automatically.

#### 4. Pair in one click

Open the stikfix popup in your toolbar and hit **Pair with host**. The token is handed over automatically through the OS native-messaging channel — you never see it, never paste it. Pair once and it stays paired, even after restarts.

#### 5. Drop a note

Open your app, click **Enter Review Mode**, and start dropping notes. The first note on a new site opens an **OS folder picker** so you can choose where that origin's notes live; it's remembered after that. When you're ready, tell your AI agent **"read my notes."**

## Features

- **Free notes** — a draggable post-it you can drop anywhere on the page. Captures URL, title, timestamp, viewport, and a screenshot.
- **Element notes** — click any element and the note auto-captures a robust unique CSS selector ([`@medv/finder`](https://github.com/antonmedv/finder)), curated computed styles, truncated `outerHTML`, bounding box, `data-*`, accessibility role/label, the best-effort **React component name**, and an **auto element-highlight screenshot** showing exactly which element you meant.
- **Region / marquee capture** — the camera tool dims the page, gives you a crosshair, and lets you drag a rectangle. stikfix hides its own UI, captures, and crops the screenshot DPR-correctly. Stack multiple per note; each is a deletable thumbnail.
- **Annotation drawing** — mark up exactly what you mean instead of describing it. The pencil tool freezes the current view as a screenshot and drops you into a drawing canvas with **arrow, line, rectangle, circle, and freehand pen** tools, a color palette, and S/M/L thickness. Your drawing is flattened onto the screenshot and attached to the note, so your agent sees the annotated image — pixel-for-pixel.
- **Persistent on-page pins** — notes stay visible as pins on the page across reloads. View, edit, and delete them in place — backed by host-side CRUD over the localhost relay. Overlapping pins fan out automatically so dense pages stay readable.
- **Two-way status, on the page** — pins reflect the loop: **unread** (yellow), **flagged** (amber — the agent needs you to clarify, with its question on hover), **resolved** (green ✓ — fixed, with the agent's reply on hover). Resolved notes stay visible so you can verify the fix; archived (`read`) notes disappear.
- **Notes panel** — a chip-toggled list of every note: counts by status, filter chips, text search, and click-to-jump that scrolls right to the pin. Flip **All pages** to browse every note across the project, not just the current page.
- **Live updates** — while Review Mode is on, pins and the panel refresh on their own (~4s, only when the tab is visible) as the agent writes replies and resolves notes. No manual reload.
- **Per-origin project routing** — the first note on a new site opens an OS folder picker; after that, every tab routes to the right project's `notes/` folder automatically. No per-note picking.
- **Cross-browser host** — one `npx stikfix init` registers Chrome and Edge in a single pass. On Windows, the one-click installer does this (and the browser-side install) for you.
- **Self-updating** — the browser extension auto-updates via enterprise policy; the Windows host checks GitHub and offers a **SHA-256-verified, one-click update** from its system-tray icon (which also shows live running/stopped status). See [Staying up to date](#staying-up-to-date).
- **The `review-notes` AI skill** — the portable agent half of the loop (see below).

## How notes reach your AI

Every note becomes a markdown file in your project's `notes/` folder, named `<serial>-<YYYYMMDD-HHmmss>.md` (e.g. `0007-20260531-143022.md`), with any screenshots written alongside it as `<base>+<N>.png`. Element notes embed a full **Element context** section — selector, computed styles, `outerHTML`, React component — so an agent can locate the exact code without guessing.

The **review-notes** skill is the agent half of the loop. It works through your unread notes in serial order, applies each fix, then writes a short **`reply`** into the note and marks it **`resolved`** (the pin turns green ✓ on the page). Re-running is always idempotent — resolved, flagged, and archived notes are skipped.

**Claude Code:** installation is now **automatic** — both the Windows installer's "Install the review-notes skill for Claude Code" task and `npx stikfix init` drop the skill into the user-level `~/.claude/skills/review-notes/SKILL.md`, so it's available in *every* Claude Code project with no manual copy. Pass `npx stikfix init --no-skill` to skip it; `npx stikfix uninstall` removes it.

Fallbacks (both optional):

- **Project-local install** — to pin the skill to one repo instead of user-wide:

  ```bash
  mkdir -p .claude/skills/review-notes
  cp /path/to/stikfix/skill/SKILL.md .claude/skills/review-notes/SKILL.md
  ```

- **Any other folder-reading agent (Cursor, Codex, etc.):** point it at [`skill/SKILL.md`](skill/SKILL.md) — it's plain markdown, no Claude-specific bits. For example: *"follow the instructions in skill/SKILL.md."*

**Just say the word.** Any of these kicks it off — including the **`/review-notes`** slash command in Claude Code:

- `/review-notes`
- "read my notes"
- "process review notes"
- "fix sticky notes"
- "what notes do I have"

**Under the hood, it:**

1. Finds every unread `notes/*.md` (skips `*.read.md` and already-resolved/flagged notes), oldest serial first.
2. Reads the note plus its screenshots, then makes the code change.
3. Marks the note **resolved** with a `reply` (and optional `fixed_in` commit ref) — only *after* the fix lands. If a fix is interrupted, the note stays unread and is retried next run. Resolved notes stay on the page (green ✓) so you can verify; archiving/dismissing (`status: read` + `*.read.md` rename, which hides the pin) is a separate step done after you've acknowledged them.
4. Flags anything ambiguous instead of guessing — sets **flagged** with a `reply` question (amber pin), so it surfaces again next run for you to clarify.
5. Gives you a one-line recap: N resolved, K flagged, J already done.

Run it on a clean directory and it just says "no unread notes." Safe to fire any time.

## Git-sync mode (optional)

By default stikfix is purely local: notes land in `notes/` and nothing else
happens. **Git-sync mode** is an opt-in, per-project mode for working across
more than one computer — capture a note on your laptop, `git pull` on your
desktop, and your agent sees it there.

- **Enable it** with the **"Sync notes to git"** toggle in the extension
  popup for that project, or set it as a machine-level default by launching
  the host with the `--git-sync` flag.
- **Requirements:** the project must be a git repository with a configured
  remote you can push to. stikfix uses your machine's existing git auth
  (SSH key / credential manager) — it never stores or handles a token itself.
- **What it does:** after writing a captured note (and any screenshot PNGs)
  to disk, the host runs `git add`, `git commit`, and `git push` — all
  pathspec-limited to `notes/`, so it only ever commits notes and never
  touches your code changes.
- **Multi-computer workflow:** capture notes on machine A → they're pushed
  automatically → `git pull` on machine B → your AI agent (via the
  `review-notes` skill) sees them. The skill also pulls before reading and
  pushes its own frontmatter updates (`status: resolved`, `reply`, etc.) back
  up — see [`skill/SKILL.md`](skill/SKILL.md).
- **Repo size:** screenshots are committed as PNGs alongside their notes, so
  the repo will grow over time with review history — something to be aware
  of on long-lived projects.

## Demo

![stikfix — the full drop-a-note → "read my notes" loop](docs/media/loop.gif)

*The whole loop: enter Review Mode → click the element → type what's wrong → it lands as a `.md` file → your agent fixes it and the pin turns green ✓ with its reply. See the [Getting Started guide](docs/getting-started.md) for the annotated walkthrough.*

## Cross-browser

| Browser | v1.0 status | Notes |
|---------|-------------|-------|
| **Chrome** | Supported | Load unpacked from `.output/chrome-mv3/` |
| **Edge** | Supported | Drop-in; the same artifact loads directly. `init` registers Edge automatically |
| Firefox | Documented (next) | Different native-messaging manifest key; path documented |
| Safari | Documented (next) | App-bundled extension via Mac App Store; path documented |

Full packaging details, manifest locations, and the Firefox/Safari paths are in [docs/cross-browser.md](docs/cross-browser.md).

## Security

stikfix is built localhost-first on purpose:

- **`127.0.0.1` only.** The host binds to localhost and nothing else — never `0.0.0.0`, not reachable from your network.
- **Authorized writes only.** Every `POST /annotation` is token-checked. The token is delivered to the extension over the OS native-messaging channel during pairing — it never travels over the web and you never handle it.
- **Stays in its lane.** The host only writes `.md` and `.png` files inside the project folder you chose (its `notes/` dir). Path-traversal attempts are rejected; no eval, no shelling out.
- **Sensible limits.** Oversized payloads are turned away (12 MB body cap → `413`).
- **Right project, every time.** Each tab's origin is mapped to its project, so notes land in the correct folder automatically.
- **MIT, clean-room.** Original implementation written from spec — contains no code from the GPL-3.0 upstream. See [CLEAN-ROOM.md](./CLEAN-ROOM.md) for the full provenance declaration and GPL grep audit.

## Development

Build the extension and host from source:

```bash
npm install          # installs deps + runs `wxt prepare`
npm run build        # builds the extension (.output/chrome-mv3) + host bundles
npm test             # host test suite
npm run check        # full gate: tsc, clean-room check, host smoke test, all tests
```

Useful scripts:

- `npm run dev` — WXT dev server with HMR for the extension.
- `npm run host -- --root /path/to/project --origin http://localhost:3000` — start the host directly from a terminal (the Desktop launcher is the easy path; this is the manual one). On Windows PowerShell, use the equals form (`--root=C:\path`) or set `STIKFIX_ROOT` / `STIKFIX_ORIGINS` env vars, since npm 11.x swallows unknown `--flags`.

**Removing stikfix:**

```bash
npx stikfix uninstall
```

This removes the native-messaging manifest, the desktop launcher, and the local config — no leftovers.

### Architecture (one-liner)

```
[Chrome/Edge Extension (MV3)]  --POST /annotation-->  [stikfix host (localhost)]  --writes-->  notes/NNNN-<ts>.md
        you annotate                token-authed, 127.0.0.1 only                      your AI agent reads these
```

Pairing rides a separate OS-level native-messaging channel so the token never touches the web; notes themselves flow over the localhost HTTP relay (`GET /status`, `POST /annotation`, plus `GET/PUT/DELETE /annotation/<serial>` for the persistent on-page pins).

## Tech stack

TypeScript ES modules both halves. Extension built with [WXT](https://wxt.dev) (Vite, MV3) — vanilla DOM in a shadow root, [`@medv/finder`](https://github.com/antonmedv/finder) for selectors, [`interactjs`](https://interactjs.io) for drag + marquee, native `chrome.tabs.captureVisibleTab` + canvas crop for screenshots. The host is Node built-ins only plus [`yaml`](https://eemeli.org/yaml/) for safe frontmatter.

## License & provenance

MIT © 2026 Omer Nesher. See [LICENSE](./LICENSE).

This is an **original, clean-room implementation**. See [CLEAN-ROOM.md](./CLEAN-ROOM.md) for the full MIT provenance declaration, clean-room method narrative, and the live GPL grep audit result.
