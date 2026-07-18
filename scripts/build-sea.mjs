// scripts/build-sea.mjs
// Build the standalone Windows host binary `stikfix-host.exe` via Node SEA.
//
// Pipeline:
//   1. esbuild-bundle host/src/exe-main.ts → dist/sea/stikfix-host.cjs
//      (--platform=node --format=cjs --bundle --external:node:*, version inlined
//       via --define so the bundle needs no package.json on disk). yaml (pure JS)
//       is bundled in; no native .node addon is required at runtime (the win32
//       tray shells out to powershell.exe, it does not load a native addon).
//   2. Write dist/sea/sea-config.json and run `node --experimental-sea-config`
//      to produce dist/sea/sea-prep.blob.
//   3. Copy the running node.exe → dist/sea/stikfix-host.exe.
//   4. postject-inject the blob into the exe with the standard SEA sentinel fuse.
//
// Node builtins + esbuild + postject only.

import { readFileSync, writeFileSync, copyFileSync, mkdirSync, statSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { inject } from 'postject';

const SENTINEL_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, '..');
const seaDir = join(root, 'dist', 'sea');
mkdirSync(seaDir, { recursive: true });

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version;

const bundlePath = join(seaDir, 'stikfix-host.cjs');
const seaConfigPath = join(seaDir, 'sea-config.json');
const blobPath = join(seaDir, 'sea-prep.blob');
const exeName = process.platform === 'win32' ? 'stikfix-host.exe' : 'stikfix-host';
const exePath = join(seaDir, exeName);

// ---------------------------------------------------------------------------
// 1. Bundle exe-main.ts → dist/sea/stikfix-host.cjs
// ---------------------------------------------------------------------------

console.log('[build:sea] bundling host/src/exe-main.ts …');
await esbuild.build({
  entryPoints: [join(root, 'host', 'src', 'exe-main.ts')],
  outfile: bundlePath,
  platform: 'node',
  format: 'cjs',
  bundle: true,
  external: ['node:*'],
  define: {
    // Inline the version so config.ts never needs package.json on disk in the exe.
    __STIKFIX_VERSION__: JSON.stringify(version),
    // Authoritative "this code is running inside the single-executable bundle"
    // flag: index.ts uses it to suppress its direct-entry auto-run (exe-main
    // dispatches explicitly), and exe-main uses it for SEA-aware argv slicing.
    __STIKFIX_BUNDLED__: 'true',
  },
  logLevel: 'info',
});

// ---------------------------------------------------------------------------
// 2. sea-config.json + blob
// ---------------------------------------------------------------------------

// Node resolves the config's `main`/`output` relative to CWD; absolute paths
// (forward slashes so the JSON is valid on Windows) are unambiguous.
writeFileSync(
  seaConfigPath,
  JSON.stringify(
    {
      main: bundlePath.replace(/\\/g, '/'),
      output: blobPath.replace(/\\/g, '/'),
      disableExperimentalSEAWarning: true,
    },
    null,
    2,
  ),
);

console.log('[build:sea] generating SEA blob …');
rmSync(blobPath, { force: true });
execFileSync(process.execPath, ['--experimental-sea-config', seaConfigPath], {
  stdio: 'inherit',
  cwd: root,
});

// ---------------------------------------------------------------------------
// 3. Copy node.exe → stikfix-host.exe
// ---------------------------------------------------------------------------

console.log(`[build:sea] copying ${process.execPath} → ${exePath}`);
rmSync(exePath, { force: true });
copyFileSync(process.execPath, exePath);

// ---------------------------------------------------------------------------
// 4. postject-inject the blob
// ---------------------------------------------------------------------------

console.log('[build:sea] injecting SEA blob with postject …');
const blob = readFileSync(blobPath);
const injectOpts = { sentinelFuse: SENTINEL_FUSE };
// macho-segment-name is macOS-only; on darwin the SEA blob must live in its own
// Mach-O segment. Not needed on win32/linux.
if (process.platform === 'darwin') {
  injectOpts.machoSegmentName = 'NODE_SEA';
}
await inject(exePath, 'NODE_SEA_BLOB', blob, injectOpts);

const size = statSync(exePath).size;
console.log(`\n[build:sea] DONE → ${exePath}`);
console.log(`[build:sea] size: ${(size / 1024 / 1024).toFixed(1)} MB (${size} bytes), version ${version}`);
