#!/usr/bin/env node
/**
 * Writes a Chrome `gupdate` update manifest (dist/crx/update.xml) pointing at
 * the pinned extension ID, for self-hosted CRX auto-update outside the
 * Chrome Web Store.
 *
 * Usage:
 *   node scripts/gen-update-xml.mjs [--out <xml>] [--codebase <url>]
 *
 * Codebase URL precedence: --codebase flag > STIKFIX_CRX_CODEBASE env > default.
 */
import { parseArgs } from 'node:util';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXTENSION_ID = 'ccdfmbhdcafhmnnnfjpbhgebfkfgjgca';
const DEFAULT_CODEBASE = 'https://github.com/omernesh/stikfix/releases/latest/download/stikfix.crx';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: join(repoRoot, 'dist', 'crx', 'update.xml') },
    codebase: { type: 'string' },
  },
});

const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const version = pkg.version;
const codebase = values.codebase || process.env.STIKFIX_CRX_CODEBASE || DEFAULT_CODEBASE;
const outPath = resolve(process.cwd(), values.out);

mkdirSync(dirname(outPath), { recursive: true });

const xml = `<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='${EXTENSION_ID}'>
    <updatecheck codebase='${codebase}' version='${version}' />
  </app>
</gupdate>
`;

writeFileSync(outPath, xml, 'utf8');

console.log(`[gen-update-xml] Wrote: ${outPath}`);
console.log(`[gen-update-xml] version: ${version}`);
console.log(`[gen-update-xml] codebase: ${codebase}`);
