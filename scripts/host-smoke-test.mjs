// scripts/host-smoke-test.mjs
// Spawns the compiled host server against a temp --root, reads the startup JSON line
// via readline (Pattern 12 — server runs indefinitely; spawnSync would hang).
// Part of npm run check: asserts startup line shape, GET /status, token-gated POST
// /annotation (200 + .md on disk), and no-token POST /annotation (401).

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOST_DIST = 'dist/host/src/index.js';

const PORT_RANGE_START = 39240;
const PORT_RANGE_END = 39260;

// Guard: fail with a helpful message if host has not been built yet
if (!existsSync(HOST_DIST)) {
  console.error(
    `smoke test: MISSING ${HOST_DIST}\n` +
    'Run `npm run build` (or `tsc -p tsconfig.host.json`) first, then re-run this test.'
  );
  process.exit(1);
}

const tmpRoot = mkdtempSync(join(tmpdir(), 'sfx-smoke-'));

let child;
try {
  child = spawn(process.execPath, [HOST_DIST, '--root', tmpRoot], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Collect stderr for diagnostics
  const stderrLines = [];
  child.stderr.on('data', (chunk) => stderrLines.push(chunk.toString()));

  // Read the startup JSON line (Pattern 12)
  const startupLine = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('smoke test: timeout waiting for startup JSON line (5 s)'));
    }, 5000);

    const rl = createInterface({ input: child.stdout });
    rl.once('line', (line) => {
      clearTimeout(timer);
      rl.close();
      resolve(line);
    });

    child.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code !== null && code !== 0) {
        reject(new Error(`smoke test: host exited with code ${code}\nstderr: ${stderrLines.join('')}`));
      }
    });
  });

  // Parse startup JSON
  let startup;
  try {
    startup = JSON.parse(startupLine);
  } catch {
    console.error('smoke test: startup line is not valid JSON:', startupLine);
    process.exit(1);
  }

  // Assert startup shape
  if (startup.app !== 'stickyfix') {
    console.error(`smoke test: expected app:"stickyfix", got: ${JSON.stringify(startup.app)}`);
    process.exit(1);
  }
  if (typeof startup.port !== 'number' || startup.port < 1) {
    console.error(`smoke test: expected numeric port in startup, got: ${JSON.stringify(startup.port)}`);
    process.exit(1);
  }
  if (startup.port < PORT_RANGE_START || startup.port > PORT_RANGE_END) {
    console.error(
      `smoke test: port ${startup.port} is outside expected range ${PORT_RANGE_START}-${PORT_RANGE_END}`
    );
    process.exit(1);
  }
  if (startup.root !== tmpRoot) {
    console.error(`smoke test: root mismatch — expected ${tmpRoot}, got ${startup.root}`);
    process.exit(1);
  }
  if (!startup.token || typeof startup.token !== 'string') {
    console.error(`smoke test: expected non-empty string token in startup, got: ${JSON.stringify(startup.token)}`);
    process.exit(1);
  }
  if (!startup.notesDir || typeof startup.notesDir !== 'string') {
    console.error(`smoke test: expected notesDir in startup, got: ${JSON.stringify(startup.notesDir)}`);
    process.exit(1);
  }

  const BASE = `http://127.0.0.1:${startup.port}`;

  // 1. Probe GET /status
  const statusRes = await fetch(`${BASE}/status`);
  if (!statusRes.ok) {
    console.error(`smoke test: GET /status returned ${statusRes.status}`);
    process.exit(1);
  }

  const status = await statusRes.json();
  if (status.app !== 'stickyfix') {
    console.error(`smoke test: /status.app expected "stickyfix", got ${JSON.stringify(status.app)}`);
    process.exit(1);
  }
  if (status.token !== undefined) {
    console.error('smoke test: /status must NOT include the token field');
    process.exit(1);
  }

  // 2. POST /annotation — no token -> 401
  const noTokenRes = await fetch(`${BASE}/annotation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'free',
      comment: 'no-token probe',
      page: { url: 'http://localhost:5173/', title: 'smoke' },
      viewport: { width: 1440, height: 900, devicePixelRatio: 1 },
    }),
  });
  if (noTokenRes.status !== 401) {
    console.error(
      `smoke test: POST /annotation without token expected 401, got ${noTokenRes.status}`
    );
    process.exit(1);
  }

  // 3. POST /annotation — with token -> 200 + .md on disk
  const annotRes = await fetch(`${BASE}/annotation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Stickyfix-Token': startup.token,
    },
    body: JSON.stringify({
      mode: 'free',
      comment: 'smoke test note',
      page: { url: 'http://localhost:5173/', title: 'smoke' },
      viewport: { width: 1440, height: 900, devicePixelRatio: 1 },
    }),
  });
  if (annotRes.status !== 200) {
    const body = await annotRes.text().catch(() => '(unreadable)');
    console.error(
      `smoke test: POST /annotation with token expected 200, got ${annotRes.status}: ${body}`
    );
    process.exit(1);
  }

  const annotBody = await annotRes.json();
  if (!annotBody.ok) {
    console.error(`smoke test: POST /annotation response ok:false — ${JSON.stringify(annotBody)}`);
    process.exit(1);
  }
  if (!annotBody.file || typeof annotBody.file !== 'string') {
    console.error(`smoke test: POST /annotation response missing file field — ${JSON.stringify(annotBody)}`);
    process.exit(1);
  }

  // body.file is the absolute path returned by writeNote
  const notePath = annotBody.file;
  if (!existsSync(notePath)) {
    console.error(`smoke test: expected .md file not found on disk: ${notePath}`);
    process.exit(1);
  }

  console.log('smoke test: PASS');
} finally {
  // Always kill the child and clean up temp dir
  if (child) {
    child.kill('SIGTERM');
    // Wait briefly for clean exit on Windows (SIGTERM may not be immediate)
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  rmSync(tmpRoot, { recursive: true, force: true });
}
