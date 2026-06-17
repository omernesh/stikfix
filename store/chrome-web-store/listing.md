---
store: Chrome Web Store
version: 1.1.1
last_updated: 2026-06-17
---

# Chrome Web Store — Listing Fields

## Name
(≤ 45 characters)

stickyfix

## Short Description / Summary
(≤ 132 characters — CWS calls this "Summary")

Pin sticky notes on any web page. Your AI reads them, fixes the issues, and replies — a durable, file-based review loop.

## Category

Developer Tools

## Language

English

## Detailed Description
(Rich text; use blank lines between paragraphs. CWS strips markdown formatting but preserves line breaks and blank lines.)

Stop describing UI bugs in chat. Drop a note directly on the broken element.

stickyfix turns browser-based UI review into a precise, file-based loop between you and your AI coding agent — no screenshots to paste, no "which button did you mean?", no lost context.

─── HOW IT WORKS ───

1. Run `npx stickyfix init --root /path/to/your/project` (one time, no admin rights). This registers the companion localhost host and drops a desktop launcher. Nothing is sent to any server — everything stays on your machine.

2. Click "Enter Review Mode" on any page. Drop sticky notes — free-floating, or click an element to anchor. Anchored notes auto-capture the CSS selector, computed styles, outerHTML, bounding box, React component name, and an element-highlight screenshot. Nothing to type beyond your actual comment.

3. Tell your AI agent "read my notes." It reads the fresh .md files in your project's notes/ folder, applies the fixes, and writes a reply back into each note. The pin on the page turns green ✓ with the agent's one-liner. Anything unclear turns amber with the agent's question.

4. Glance at the pins or open the notes panel. Drop more notes. Repeat.

─── FEATURES ───

• Free notes — draggable post-it anywhere on the page; captures URL, title, timestamp, viewport, screenshot.
• Element notes — click any element to anchor; auto-captures unique CSS selector, computed styles, truncated outerHTML, bounding box, data-* attributes, ARIA role/label, React component name, element-highlight screenshot.
• Region capture — drag a rectangle to crop a specific area; stack multiple screenshots per note.
• Two-way Review Loop — AI writes a reply and fixed_in commit reference back into each note; pin colour reflects the status.
• Notes panel — chip-toggled list with unread / flagged / resolved counts, filter chips, text search, click-to-jump. "All pages" toggle shows the full project.
• Live sync — pins and panel refresh automatically (~4 s, only while the tab is visible) as the AI updates notes. No manual reload.
• Pin decluttering — overlapping pins fan out so dense pages stay readable.
• Persistent pins — notes survive page reloads; backed by host-side CRUD over the localhost relay.
• Per-origin routing — first note on a new site opens a folder picker; choice is remembered for every subsequent tab on that origin.
• Cross-browser — the same artifact runs in Chrome and Edge; `npx stickyfix init` registers both.

─── WHO IT'S FOR ───

Developers who do UI review with an AI coding agent (Claude, Cursor, Copilot, or any agent that can read files on disk). If your review workflow today involves pasting screenshots into a chat and re-describing context, stickyfix replaces that with a durable, file-based loop where nothing is lost.

─── SETUP REQUIREMENT ───

⚠️ This extension requires a companion localhost host to function.

Install it with one command (Node 20+, no admin rights):

  npx stickyfix init --root /path/to/your/project

The host is a small Node.js process that runs entirely on your machine. It registers itself via Chrome's Native Messaging API — the extension communicates with it through the OS, not over the internet. No cloud account, no sign-up, no subscription.

The host is open source and published on npm as `stickyfix`. Repo: https://github.com/omernesh/stickyfix

─── PRIVACY & SECURITY ───

No data leaves your machine. Note content and screenshots are sent only to your own localhost host (127.0.0.1) over a token-authenticated local connection and written to your project folder on disk. No analytics, no telemetry, no remote servers. See the full privacy policy at: https://github.com/omernesh/stickyfix/blob/main/store/privacy-policy.md

─── OPEN SOURCE ───

MIT licensed. https://github.com/omernesh/stickyfix

## Suggested Search Keywords

(Enter these individually in the CWS "Tags" / keyword fields — CWS allows up to 5)

1. developer tools
2. AI coding agent
3. UI review
4. sticky notes
5. code review

## Reviewer Notes
(Paste into the "Notes for reviewer" field during submission)

This extension requires a companion native-messaging host to be installed and running on the reviewer's machine before the core functionality (note capture, pin display) is testable. The host is installed via:

  npx stickyfix init --root /tmp/stickyfix-test

After running that command, start the host via the desktop launcher it creates, then open any web page, click the extension icon, and click "Enter Review Mode."

The host communicates exclusively over 127.0.0.1 (port range 39240–39260). It writes only .md and .png files inside the folder specified by --root. Token auth is exchanged through the OS native-messaging channel (never over the network). No external network requests are made by the extension or host.

The `<all_urls>` optional_host_permissions entry is NOT requested at install time. It is requested on-demand the first time the user clicks "Enter Review Mode" on any page, so the content script can be injected into that page. This is intentionally deferred to minimize the install-time permission footprint.
