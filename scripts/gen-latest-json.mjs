#!/usr/bin/env node
/**
 * Writes the host auto-update manifest (dist/installer/latest.json) that the
 * running host polls to discover a newer release. Contains the version, the
 * GitHub Releases download URL for the installer, and the installer's SHA-256.
 *
 * Must run AFTER the installer .exe is built — it hashes that exact file so the
 * tray's 1-click apply can verify the download before executing it.
 *
 * Usage:
 *   node scripts/gen-latest-json.mjs
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const version = pkg.version;
if (!version) {
  console.error('[gen-latest-json] ERROR: could not read version from package.json');
  process.exit(1);
}

const installerExe = join(repoRoot, 'dist', 'installer', `stikfix-setup-${version}.exe`);
if (!existsSync(installerExe)) {
  console.error(`[gen-latest-json] ERROR: installer not found: ${installerExe}`);
  console.error('[gen-latest-json] Run the installer build first (build:installer).');
  process.exit(1);
}

const sha256 = await new Promise((resolvePromise, rejectPromise) => {
  const hash = createHash('sha256');
  const stream = createReadStream(installerExe);
  stream.on('error', rejectPromise);
  stream.on('data', (chunk) => hash.update(chunk));
  stream.on('end', () => resolvePromise(hash.digest('hex')));
});

const outPath = join(repoRoot, 'dist', 'installer', 'latest.json');
mkdirSync(dirname(outPath), { recursive: true });

const manifest = {
  version,
  url: `https://github.com/omernesh/stikfix/releases/download/v${version}/stikfix-setup-${version}.exe`,
  sha256,
};

writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log(`[gen-latest-json] Wrote: ${outPath}`);
console.log(`[gen-latest-json] version: ${version}`);
console.log(`[gen-latest-json] sha256:  ${sha256}`);
