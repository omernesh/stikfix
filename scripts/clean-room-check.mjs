// scripts/clean-room-check.mjs
// Cross-platform Node ESM script — walks the source tree and exits 1 if any
// banned upstream identifier is found. Zero dependencies; runs on Windows,
// macOS, and Linux without bash or ripgrep.
//
// Enforces BUILD-04: the repo is an MIT clean-room build and must not contain
// identifiers from the GPL-3.0 upstream project (see PRD section 13).
// The three banned patterns are tested case-insensitively against file content.
//
// Banned patterns are constructed from fragments to avoid a false-positive
// when the script scans itself (the scanner must not trigger on its own source).

import { readdirSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

// Construct banned patterns from fragments so this file does not self-trip.
const BANNED = [
  // upstream private-API prefix: __ + opc + _
  new RegExp('__' + 'opc' + '_', 'i'),
  // upstream project name: open + code
  new RegExp('open' + 'code', 'i'),
  // upstream author handle: Jodus + Nodus
  new RegExp('Jodus' + 'Nodus', 'i'),
];

const SCAN_EXTS = new Set(['.ts', '.js', '.mjs', '.cjs', '.json', '.html', '.css', '.md']);

// Directories to skip — build outputs, vendor, and research/planning dirs that
// legitimately reference the upstream identifiers (Pitfall 5 in RESEARCH.md).
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.output',
  'dist',
  '.wxt',
  '.planning',
]);

// Root-level documentation and legal files that may reference the upstream
// project for attribution or legal notice — NOT first-party source code.
// Excluded for the same reason as .planning/: attribution must be allowed.
const SKIP_FILENAMES = new Set([
  'PRD.md',
  'README.md',
  'CLAUDE.md',
  'LICENSE',
]);

/**
 * Recursively walk `dir`, collecting {file, match} for every banned pattern found.
 * @param {string} dir
 * @param {{ file: string; match: string }[]} found
 * @returns {{ file: string; match: string }[]}
 */
function walk(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        walk(join(dir, entry.name), found);
      }
    } else if (SCAN_EXTS.has(extname(entry.name))) {
      if (SKIP_FILENAMES.has(entry.name)) continue;
      const full = join(dir, entry.name);
      const text = readFileSync(full, 'utf8');
      for (const pattern of BANNED) {
        const match = text.match(pattern);
        if (match) {
          found.push({ file: full, match: match[0] });
        }
      }
    }
  }
  return found;
}

const hits = walk(process.cwd());

if (hits.length > 0) {
  console.error('CLEAN-ROOM VIOLATION — banned identifiers found:');
  for (const h of hits) {
    console.error(`  ${h.file}: "${h.match}"`);
  }
  process.exit(1);
}

console.log('clean-room audit: PASS — no banned identifiers found');
