# 📌 stickyfix

> Pin sticky notes on any web page. Your AI coding agent reads them as markdown and fixes them. Repeat.

**stickyfix** turns visual UI review into a tight, file-based loop. Instead of screenshotting your app, pasting it into a chat, and describing what's wrong, you:

1. Toggle **Review Mode** on any page (a Chrome extension).
2. Drop **sticky notes** — either a free-floating note (`+`) or an **element-anchored** note (click an element and it auto-captures the selector, computed styles, outerHTML, screenshot, and more).
3. Each note is written as a **markdown file** into your project's `notes/` folder by a tiny local host.
4. Tell your AI coding agent **"read my notes"** — it reads the unread `.md` files, fixes them, and renames each to `*.read.md` so the next pass only sees what's new.
5. Review again. Iterate.

No cloud. No accounts. Localhost-only. Your notes never leave your machine.

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

## Status

🚧 **Pre-build.** This repo currently contains the product spec only — see **[PRD.md](./PRD.md)**. It is written to be executed autonomously by an AI coding session (e.g. via the GSD `/gsd:new-project` flow). Build it, then this README gets the real install/usage instructions.

## Architecture (one-liner)

```
[Chrome Extension (MV3)]  --POST /annotation-->  [stickyfix-host (localhost)]  --writes-->  notes/NNNN-<ts>.md
        you annotate                 token-authed, 127.0.0.1 only                 your AI agent reads these
```

## License

MIT © 2026 Omer Nesher. See [LICENSE](./LICENSE).

This is an **original, clean-room implementation**. Its architecture was informed by a study of the GPL-3.0 project [`JodusNodus/opencode-chrome-annotation`](https://github.com/JodusNodus/opencode-chrome-annotation), but **no source code was copied** from it. See PRD §"Clean-room notice".
