#!/usr/bin/env node
/**
 * Packs the built extension (.output/chrome-mv3) into a CRX3 file signed with
 * the project's private key (.keys/stikfix-extension.pem), and asserts the
 * resulting extension ID matches the pinned ID baked into wxt.config.ts's
 * manifest.key (ccdfmbhdcafhmnnnfjpbhgebfkfgjgca).
 *
 * Usage:
 *   node scripts/pack-crx.mjs [--src <dir>] [--key <pem>] [--out <crx>]
 */
import { parseArgs } from 'node:util';
import { createHash, createPrivateKey, createPublicKey } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import crx3 from 'crx3';

const EXPECTED_EXTENSION_ID = 'ccdfmbhdcafhmnnnfjpbhgebfkfgjgca';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const { values } = parseArgs({
  options: {
    src: { type: 'string', default: join(repoRoot, '.output', 'chrome-mv3') },
    key: { type: 'string', default: join(repoRoot, '.keys', 'stikfix-extension.pem') },
    out: { type: 'string', default: join(repoRoot, 'dist', 'crx', 'stikfix.crx') },
  },
});

const srcDir = resolve(process.cwd(), values.src);
const keyPath = resolve(process.cwd(), values.key);
const crxPath = resolve(process.cwd(), values.out);
const outDir = dirname(crxPath);
const zipPath = join(outDir, 'stikfix.zip');
const manifestPath = join(srcDir, 'manifest.json');

if (!existsSync(srcDir) || !existsSync(manifestPath)) {
  console.error(`[pack-crx] Extension source dir not found or missing manifest.json: ${srcDir}`);
  console.error('[pack-crx] Run "npm run build" first.');
  process.exit(1);
}

if (!existsSync(keyPath)) {
  console.error(`[pack-crx] Private key not found: ${keyPath}`);
  process.exit(1);
}

// --- Compute the Chrome extension ID directly from the PEM, independent of ---
// --- whatever the crx3 library does internally, so the assertion below is  ---
// --- a true cross-check and not just trusting the packer's own math.       ---
// Algorithm: sha256(DER SPKI public key) -> first 16 bytes -> hex -> map each
// hex nibble 0-9a-f to a-p (Chrome's base16-with-letters extension ID alphabet).
function computeExtensionId(pemPath) {
  const pem = readFileSync(pemPath, 'utf8');
  const privateKey = createPrivateKey(pem);
  const publicKeyDer = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  const digest = createHash('sha256').update(publicKeyDer).digest();
  const idBytes = digest.subarray(0, 16);
  return Buffer.from(idBytes)
    .toString('hex')
    .split('')
    .map((nibble) => String.fromCharCode('a'.charCodeAt(0) + parseInt(nibble, 16)))
    .join('');
}

const computedId = computeExtensionId(keyPath);
console.log(`[pack-crx] Computed extension ID from ${keyPath}: ${computedId}`);

if (computedId !== EXPECTED_EXTENSION_ID) {
  console.error('[pack-crx] FATAL: computed extension ID does not match the pinned ID.');
  console.error(`[pack-crx]   expected: ${EXPECTED_EXTENSION_ID}`);
  console.error(`[pack-crx]   computed: ${computedId}`);
  console.error('[pack-crx] The private key at --key does not match manifest.key in wxt.config.ts.');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const result = await crx3([manifestPath], {
  keyPath,
  crxPath,
  zipPath,
});

// Cross-check: crx3's own internal computation of the app ID must agree too.
if (result.appId !== computedId) {
  console.error('[pack-crx] FATAL: crx3 library computed a different extension ID than expected.');
  console.error(`[pack-crx]   expected: ${computedId}`);
  console.error(`[pack-crx]   crx3 got: ${result.appId}`);
  process.exit(1);
}

console.log(`[pack-crx] Extension ID OK: ${computedId} === ${EXPECTED_EXTENSION_ID}`);
console.log(`[pack-crx] CRX3 written to: ${crxPath}`);
console.log(`[pack-crx] ZIP written to: ${zipPath}`);
