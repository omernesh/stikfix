---
title: Quick-connect (launch stopped hosts) + Windows startup autoload architecture
date: 2026-07-04
tags: [architecture, decision, native-messaging, host, extension]
worker: Dash
---

Implemented 5 UX features. The two non-obvious architectural keystones:

## 1. `GET_TOKEN` gained an optional `root` param — this is the enabler for everything
The native-messaging host (`host/src/native-host.ts`) previously read the token
only from the single configured root in `~/.config/stikfix/config.json`. The SW
therefore could only auto-pair with ONE project. Fix: `{type:'GET_TOKEN', root?}`
— when `root` is a valid dir, read `<root>/.stikfix-token` + `.stikfix-port` from
THERE (name=basename(root), notesDir=<root>/notes); absent/invalid → old behavior
(backward compatible). This single change unlocks BOTH:
- **Auto-connect on Chrome load** (Feature 2): `onStartup`/`onInstalled` discover
  hosts, then `fetchTokenViaNative(dirname(host.notesDir))` for each tokenless host.
- **Quick-connect / launch stopped host** (popup + chip): after START_HOST spawns a
  host at an arbitrary root, the SW fetches its token via `GET_TOKEN {root}`.

## 2. `START_HOST` spawns a DETACHED child — native host must never listen itself
Security invariant T-09-07: the native host must NOT call createHostServer/bindServer/
listen. So `{type:'START_HOST', root}` does `spawn(nodePath, [hostEntry, '--root', root],
{detached:true, stdio:'ignore', windowsHide:true}).unref()` then replies `HOST_STARTING`
and exits. The SW then polls `discoverHosts()` (600ms × 9s) until a host matching
`dirname(notesDir)===root || name===basename(root)` appears, then pairs. `handleStartHost`
is idempotent: it runs discovery FIRST and short-circuits to token-fetch if the host is
already live (no duplicate spawn).

### New config.json fields (written by `npx stikfix init`)
`hostEntry` = abs path to `dist/host/src/index.js`, `nodePath` = `process.execPath`.
Native host reads these to spawn. Fallback for OLD configs: resolve `join(__dirname,
'src','index.js')`. **Existing installs must re-run `npx stikfix init` to get these
fields + the new startup-on-login prompt.**

## 3. Windows startup autoload (Feature 1)
`registerStartup()` in `bootstrap/register.ts` adds HKCU
`...\CurrentVersion\Run\stikfix-host = wscript.exe "<vbsPath>"` (the existing hidden
VBS launcher). `bin/stikfix.ts` prompts `[Y/n]` DEFAULT ON during init (TTY only;
`--startup`/`--no-startup` bypass; non-TTY skips). uninstall removes the Run value.

## Storage
New `sfxRecent: RecentProject[]` (local:sfxRecent, most-recent-first, cap 8).
`RecentProject = {name, notesDir, root?, port?, origin?, lastUsed}`. Upserted
(`recordRecent`, dedupe by root→name) on token-fetch, SET_ROUTE, and PICK_FOLDER.
`root` is derived from `notesDir` (strip trailing `/notes`) — that's how the extension,
which never knew project roots, can now launch stopped hosts.

## Test/host layout gotcha
Two hosts run in dev: `stickyfix-uat` (D:\docker\stickyfix-uat, :39240) and the repo
itself `stikfix`/`stickyfix` (D:\docker\stickyfix, :39241, token "stikfix-dev"). Host
has a single-instance guard — re-running `node dist/host/src/index.js --root X` prints
"already running ... not starting a second instance" instead of failing.
