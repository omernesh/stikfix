# stickyfix

> Pin sticky notes on any web page. Your AI coding agent reads them as markdown and fixes them. Repeat.

**stickyfix** turns visual UI review into a tight, file-based loop. Instead of screenshotting your app, pasting it into a chat, and describing what's wrong, you:

1. Toggle **Review Mode** on any page (a Chrome extension).
2. Drop **sticky notes** — either a free-floating note (`+`) or an **element-anchored** note (click an element and it auto-captures the selector, computed styles, outerHTML, screenshot, and more).
3. Each note is written as a **markdown file** into your project's `notes/` folder by a tiny local host.
4. Tell your AI coding agent **"read my notes"** — it reads the unread `.md` files, fixes them, and renames each to `*.read.md` so the next pass only sees what's new.
5. Review again. Iterate.

No cloud. No accounts. Localhost-only. Your notes never leave your machine.

## Quickstart (< 5 minutes)

1. **Build** — install dependencies and compile both the extension and host:
   ```bash
   npm install
   npm run build
   ```

2. **Start the host** — point it at the project you want to review:
   ```bash
   npm run host -- --root /path/to/project --origin http://localhost:3000
   ```
   The host prints a token on startup — keep that terminal open.
   (Windows PowerShell users: see the [Windows variants](#running-the-host) section directly below.)

3. **Load the extension** — open `chrome://extensions`, enable **Developer Mode**, click **Load unpacked**, and select the `.output/chrome-mv3/` folder inside this repo.

4. **Pair the token** — copy the token from the host startup output, then paste it into the extension popup (click the stickyfix icon in your Chrome toolbar).

5. **Drop notes and run the skill** — navigate to your app, click **Enter Review Mode**, drop notes on the page. When you're ready, tell your AI coding agent:
   > "read my notes"
   The agent runs the review-notes skill, applies each fix, and renames each note to `*.read.md`. Repeat until your UI is clean.

## Running the host

After `npm run build`, start the local host with:

```bash
# bash / macOS / Linux — standard form
npm run host -- --root /path/to/project --origin http://localhost:3000
```

**Windows PowerShell** — npm 11.x intercepts unknown `--flags` before passing them on, so use one of these instead:

```powershell
# Option A: equals-sign form (npm exposes these via npm_config_* env vars internally)
npm run host -- --root=C:\path\to\project --origin=http://localhost:3000

# Option B: set env vars explicitly, then start
$env:STICKYFIX_ROOT = "C:\path\to\project"
$env:STICKYFIX_ORIGINS = "http://localhost:3000"
npm run host

# Option C: invoke node directly (bypasses npm flag parsing entirely)
node dist/host/src/index.js --root C:\path\to\project --origin http://localhost:3000
```

All three options produce the same result. Option B also works when you need multiple origins: set `STICKYFIX_ORIGINS` to a comma-separated list (e.g. `"http://localhost:3000,http://localhost:4000"`).

## review-notes Skill

The **review-notes** skill is the AI agent half of the loop. It processes unread notes in serial order, applies each fix, and renames each note to `*.read.md` — idempotently.

**Install for Claude Code (project-local):**

```bash
mkdir -p .claude/skills/review-notes
cp /path/to/stickyfix/skill/SKILL.md .claude/skills/review-notes/SKILL.md
```

**Install for any other folder-reading agent (Cursor, Codex, etc.):**

Point your agent at `skill/SKILL.md` directly — it is a plain markdown file with no Claude-specific frontmatter. Example: "follow the instructions in skill/SKILL.md".

**Trigger phrase:** Tell your agent any of:

- "read my notes"
- "process review notes"
- "fix sticky notes"
- "what notes do I have"

**What it does:**

1. Globs `notes/*.md`, excludes `*.read.md`, sorts ascending by leading 4-digit serial.
2. For each unread note: reads frontmatter + body, opens screenshots (vision), applies the code fix.
3. Renames the note to `*.read.md` and sets `status: read` in frontmatter — only after the fix succeeds.
4. Ambiguous notes get `status: flagged` and a `> flagged: <reason>` line; their filename is left unchanged so they surface on the next run.
5. Reports a terse summary: N fixed, K flagged, J already read.

Re-running on a fully-processed directory is a no-op ("no unread notes") — safe to run any time.

## Security model

- **127.0.0.1 only.** The host binds to `127.0.0.1`, never `0.0.0.0`. It is not reachable from other machines on your network.
- **Token auth on every write.** Every `POST /annotation` requires the `X-Stickyfix-Token` header. The token is generated at host startup, stored in an owner-readable file, and printed to stdout once. Without the token, any local page that guesses the port gets a 401.
- **Origin trust mapping.** The extension maps each tab origin (e.g. `http://localhost:3000`) to the host instance that claimed it. Notes are routed to the right project automatically — no per-note picks.
- **Write confinement.** The host only writes `.md` and `.png` files inside the `--root` directory. Path-traversal attempts are rejected with a 400.
- **12 MB body cap.** Requests larger than 12 MB are rejected with a 413.

## Troubleshooting

**Token mismatch — extension shows "auth failed"**

Re-copy the token from the host's startup output (the line that says `token: ...`) and paste it into the extension popup. The token changes each time the host restarts.

**Cannot connect — extension shows "no host found"**

The host scans ports 39240–39260 for live instances. Make sure `npm run host` is running (it should be printing "listening on 127.0.0.1:392xx"). Check that your `--origin` matches the tab URL's origin exactly (scheme + host + port).

**Windows PowerShell: flags not passed through**

npm 11.x on Windows intercepts `--flags` before forwarding them. Use the equals-sign form, environment variables, or the `node` direct invocation shown in the [Running the host](#running-the-host) section above.

**Notes not appearing on disk**

Confirm the `--root` path is the project directory where you expect the `notes/` folder. The host creates `notes/` automatically on first write. Check the host terminal for any error output.

## Demo

![stickyfix demo](docs/demo-placeholder.png)

*Real demo coming — the placeholder above will be replaced with a recorded GIF.*

**How to record the demo (Windows, free tools):**

1. Install [LICEcap](https://www.cockos.com/licecap/) or [ScreenToGif](https://www.screentogif.com/) — both are free and require no account.
2. Start the host, load the extension, open your app in Chrome.
3. Record the 5-step quickstart flow: build → host start → load unpacked → token paste → drop a note → "read my notes".
4. Save the output as `docs/demo.gif`.
5. Replace the `docs/demo-placeholder.png` image reference in this README with `docs/demo.gif`.

## Browser support

Chrome and Microsoft Edge are fully supported. For Firefox and Safari packaging paths (FUT-01, v2 scope) see [docs/cross-browser.md](docs/cross-browser.md).

## Architecture (one-liner)

```
[Chrome Extension (MV3)]  --POST /annotation-->  [stickyfix-host (localhost)]  --writes-->  notes/NNNN-<ts>.md
        you annotate                 token-authed, 127.0.0.1 only                 your AI agent reads these
```

## License & provenance

MIT © 2026 Omer Nesher. See [LICENSE](./LICENSE).

This is an **original, clean-room implementation**. See [CLEAN-ROOM.md](./CLEAN-ROOM.md) for the full MIT provenance declaration, clean-room method narrative, and the live GPL grep audit result.
