// scripts/cross-browser-doc-check.mjs
// Asserts that docs/cross-browser.md contains the required sections for ONB-06
// (D-05 / Phase 9 Plan 03). Exits 0 if all tokens are present; exits 1 with a
// descriptive message for each missing token.
//
// Required tokens:
//   - Three section headings (Edge, Firefox, Safari)
//   - Firefox-specific manifest key: allowed_extensions
//   - Safari conversion tool: safari-web-extension-converter
//   - Edge Windows registry path: Microsoft\Edge\NativeMessagingHosts
//
// Usage: node scripts/cross-browser-doc-check.mjs

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DOC_PATH = join(process.cwd(), 'docs', 'cross-browser.md');

if (!existsSync(DOC_PATH)) {
  console.error(
    'cross-browser-doc-check: MISSING docs/cross-browser.md\n' +
    'Run the plan to create this file before checking.'
  );
  process.exit(1);
}

const text = readFileSync(DOC_PATH, 'utf8');

// Each entry: [token, description, how to find it in the doc]
// Tokens with backslashes are stored as plain strings (single \).
const REQUIRED_TOKENS = [
  {
    token: '## Microsoft Edge',
    description: 'Edge section heading ("## Microsoft Edge")',
  },
  {
    token: '## Firefox',
    description: 'Firefox section heading ("## Firefox")',
  },
  {
    token: '## Safari',
    description: 'Safari section heading ("## Safari")',
  },
  {
    token: 'allowed_extensions',
    description: 'Firefox manifest key "allowed_extensions"',
  },
  {
    token: 'safari-web-extension-converter',
    description: 'Safari conversion tool "safari-web-extension-converter"',
  },
  {
    // Windows registry path for Edge native-messaging hosts.
    // In the markdown source this appears as the literal backslash string
    // inside a code block: HKCU\Software\Microsoft\Edge\NativeMessagingHosts
    token: 'Microsoft\\Edge\\NativeMessagingHosts',
    description: 'Edge Windows registry path "Microsoft\\Edge\\NativeMessagingHosts"',
  },
];

let allPassed = true;

for (const { token, description } of REQUIRED_TOKENS) {
  if (!text.includes(token)) {
    console.error(`cross-browser-doc-check: MISSING — ${description}`);
    allPassed = false;
  }
}

if (!allPassed) {
  process.exit(1);
}

console.log('cross-browser-doc-check: PASS — all required sections present');
