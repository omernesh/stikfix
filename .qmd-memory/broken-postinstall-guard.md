---
title: Inverted postinstall guard broke npm/npx install (1.3.0–1.3.1)
date: 2026-07-05
tags: [debugging, gotcha, npm, publish, postinstall]
worker: Dash
---

## Symptom
`npx stikfix init` appeared to do nothing (only `npm warn cleanup EPERM` noise);
`npm install stikfix` failed with `'wxt' is not recognized`; no `.bin/stikfix` shim
was created so npx reported `'stikfix' is not recognized`.

## Root cause
The `postinstall` guard meant to skip `wxt prepare` on consumer machines was inverted:
```
node -e "try{require.resolve('wxt')}catch(e){process.exit(0)}" && wxt prepare
```
On a machine WITHOUT wxt (every end-user / npx install), `require.resolve` throws →
`process.exit(0)` → the `&&` PROCEEDS to `wxt prepare` → `'wxt' is not recognized` →
non-zero postinstall → npm ABORTS the install and rolls back node_modules/.bin →
no CLI bin. `exit(0)` on the missing-dep branch is the bug; it should short-circuit.

## Fix (1.3.2)
Single pure-node guard that runs `wxt prepare` only when wxt resolves and never fails:
```
node -e "try{require.resolve('wxt');require('node:child_process').execSync('wxt prepare',{stdio:'inherit'})}catch(e){}"
```
Always exits 0. Consumers: require.resolve throws → caught → no-op. Dev: wxt resolves,
npm puts node_modules/.bin on PATH so execSync('wxt prepare') works.

## Lesson / how to verify a publish
`npm publish` does NOT run `postinstall`, so a broken postinstall passes CI/publish and
only bites CONSUMERS. Always verify a release with a clean install into a temp dir:
`mkdir t && cd t && npm init -y && npm install <pkg>@<ver>` — check it exits 0 and
`node_modules/.bin/<bin>` exists. Then run the bin. Also test the real `npx <pkg>@<ver>`
path (clear `%LOCALAPPDATA%\npm-cache\_npx` first for a true cold test).

The EPERM `npm warn cleanup ... rmdir` on Windows is a separate, cosmetic issue (npx
can't delete its temp cache — Defender/OneDrive file locks under AppData\Local); harmless.

Related: [[quick-connect-and-startup-architecture]]. Also in this release: `stikfix init`
now defaults `--root` to `process.cwd()` when omitted; `unregisterStartup` runs
`reg DELETE` with `stdio:'ignore'` so the benign "unable to find key" message is silent.
