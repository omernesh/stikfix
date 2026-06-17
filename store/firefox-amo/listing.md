---
store: Firefox Add-ons (AMO)
version: 1.1.1
gecko_id: stickyfix@stickyfix.dev
last_updated: 2026-06-17
---

# Firefox Add-ons (AMO) — Listing Fields

## Name

stickyfix

## Summary
(AMO calls this field "Summary"; ≤ 250 characters)

Pin sticky notes on any web page. Your AI reads them, fixes the issues, and replies directly in the note — a durable, file-based UI review loop with no screenshots to paste or context to re-describe.

## About This Extension
(AMO's main description field — plain text or limited HTML; no markdown)

Stop describing UI bugs in chat. Drop a note directly on the broken element.

stickyfix turns browser-based UI review into a precise, file-based loop between you and your AI coding agent — no screenshots to paste, no "which button did you mean?", no lost context. Every note lands on disk as a structured markdown file your agent can read, fix, and reply to. The pin on the page updates to show the result.

HOW IT WORKS

1. Run `npx stickyfix init --root /path/to/your/project` (one time, no admin rights). This registers the companion localhost host via Firefox's Native Messaging API and drops a desktop launcher.

2. Click "Enter Review Mode" on any page. Drop sticky notes — free-floating, or click an element to anchor. Anchored notes auto-capture the CSS selector, computed styles, outerHTML, bounding box, React component name, and an element-highlight screenshot.

3. Tell your AI agent "read my notes." It reads the fresh .md files in your project's notes/ folder, applies the fixes, and writes a reply back into each note. The pin turns green ✓. Anything unclear turns amber with the agent's question.

4. Open the notes panel, drop more notes, repeat.

FEATURES

- Free notes: draggable post-it anywhere on the page; captures URL, title, timestamp, viewport, screenshot.
- Element notes: click any element to anchor; auto-captures CSS selector, computed styles, outerHTML, bounding box, data-*, ARIA role/label, React component name, element-highlight screenshot.
- Region capture: drag a rectangle for a cropped screenshot; stack multiple per note.
- Two-way Review Loop: AI writes a reply and commit reference back into the note; pin colour reflects the status (yellow → amber → green ✓).
- Notes panel: filter by status, text search, click-to-jump to the pin, all-pages project view.
- Live sync: pins and panel refresh automatically (~4 s, tab-visible only) as the AI updates notes.
- Pin decluttering: overlapping pins fan out so dense pages stay readable.
- Persistent pins: notes survive page reloads; backed by localhost CRUD.
- Per-origin routing: first note on a new origin opens a folder picker; choice is remembered.

WHO IT'S FOR

Developers doing UI review with an AI coding agent (Claude, Cursor, Copilot, or any agent that reads files on disk). If your current workflow involves pasting screenshots into chat and re-describing context, stickyfix replaces that loop with durable, file-based notes your agent can act on directly.

SETUP REQUIREMENT

This extension requires a companion localhost host to function.

Install it with one command (Node 20+, no admin rights):

  npx stickyfix init --root /path/to/your/project

The host is a small Node.js process that runs entirely on your machine, registered via Firefox's Native Messaging API. No cloud account, no sign-up, no subscription. Everything stays on your machine.

PRIVACY & SECURITY

No data leaves your machine. Note content and screenshots are sent only to your own localhost host (127.0.0.1) over a token-authenticated local connection and written to your project folder on disk. No analytics, no telemetry, no remote servers.

OPEN SOURCE

MIT licensed. Source: https://github.com/omernesh/stickyfix

## Categories
(AMO categories — pick the most relevant)

Primary: Other (under "Firefox Add-ons for developers" — AMO's developer-tools category)
Tags: developer-tools, productivity, web-development

## Tags
(AMO allows free-form tags)

developer-tools, AI, code-review, web-development, productivity, sticky-notes, markdown

## License

MIT

## Homepage / Support Site

https://github.com/omernesh/stickyfix

## Support Email

omernesher@gmail.com

## Add-on ID (Gecko)

stickyfix@stickyfix.dev

## Source Code Submission Note
(AMO requires source upload for extensions built with bundlers/minifiers)

This extension is built with WXT (a Vite-based MV3 framework) and TypeScript. The submitted .xpi is bundled/minified. AMO reviewers may require a source code upload to verify the build.

Build instructions:
1. Node 20+ required.
2. `git clone https://github.com/omernesh/stickyfix && cd stickyfix`
3. `npm install`
4. `npm run build:firefox`
5. Output: `.output/firefox-mv*/`

The full source, build scripts, and CI configuration are at:
https://github.com/omernesh/stickyfix

The extension contains no obfuscated code. All dependencies are open source and listed in package.json.

## Reviewer Notes for AMO

This extension requires a companion native-messaging host to be installed and running before the core functionality is testable. The host is installed via:

  npx stickyfix init --root /tmp/stickyfix-test

After running that command, start the host via the desktop launcher it creates, then open any web page, click the extension toolbar button, and click "Enter Review Mode."

Firefox native messaging uses `allowed_extensions` (add-on ID: `stickyfix@stickyfix.dev`) rather than `allowed_origins`. The `npx stickyfix init` command writes the correct Firefox manifest to:
  - macOS: ~/Library/Application Support/Mozilla/NativeMessagingHosts/com.stickyfix.host.json
  - Linux: ~/.mozilla/native-messaging-hosts/com.stickyfix.host.json
  - Windows: HKCU\Software\Mozilla\NativeMessagingHosts\com.stickyfix.host

The host communicates exclusively over 127.0.0.1 (port range 39240–39260). No external network requests are made.

NOTE: Firefox support in v1.1.1 is built and published but has had limited real-device testing compared to Chrome. The build targets `firefox-mv*/` and the gecko_id / strict_min_version (109.0) are set in wxt.config.ts. If any AMO-specific compatibility issues surface during review, please report them to omernesher@gmail.com — they will be addressed before public listing promotion.
