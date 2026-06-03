# Phase 8: Hardening + Pre-Release Audit - Pattern Map

**Mapped:** 2026-06-03
**Files analyzed:** 9 (5 NEW, 4 MODIFY)
**Analogs found:** 9 / 9

> All excerpts below are quoted verbatim from current source with file:line.
> The most load-bearing facts: the exact `card.ts` toast strings (D-01a), the
> `lib/` pure-module + `node:test` convention, the `server.test.ts` fixture boot
> sequence, the ECONNRESET-tolerant oversize pattern, and the clean-room
> fragment-construction trick.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `lib/error-toast.ts` (NEW) | utility (pure lib) | transform | `lib/capture.ts` (`computeCropCoords`) | exact (pure-lib invariant) |
| `lib/test/error-toast.test.ts` (NEW) | test | transform | `lib/test/marquee.test.ts` | exact |
| `lib/payload-size.ts` (NEW) | utility (pure lib) | transform | `lib/capture.ts` (`computeCropCoords`) | exact (pure-lib invariant) |
| `lib/test/payload-size.test.ts` (NEW) | test | transform | `lib/test/marquee.test.ts` | exact |
| `host/test/server.test.ts` (MODIFY) | test | request-response / concurrency | self (existing `buildFixture`/POST-block + PUT-oversize block) | exact |
| `scripts/clean-room-check.mjs` (MODIFY) | config / build tooling | batch (static scan) | self (existing `BANNED`/`walk`) | exact |
| `entrypoints/review.content/card.ts` (MODIFY) | component (content script) | request-response (SW relay) | self (`_doSend`/`_doElementSend` catch sites) | exact |
| `tsconfig.lib.json` + `package.json` (MODIFY) | config | — | self (existing `include[]` + `test:lib` list) | exact |
| `08-UAT.md` (NEW) | doc (manual runbook) | — | `.planning/phases/07-…/07-HUMAN-UAT.md` | role-match |

---

## Pattern Assignments

### `lib/error-toast.ts` (pure utility, transform) — D-01 / D-01a

**Analog:** `lib/capture.ts` — the established pure, `node:test`-safe lib module.

**Pure-lib invariant header to copy** (`lib/capture.ts:1-12`):
```typescript
/**
 * Capture utilities for stickyfix.
 *
 * computeCropCoords — pure, node:test-safe (no DOM/chrome at module level).
 * ...
 * INVARIANT: No top-level chrome / document / window access — all browser
 * API use is inside function bodies so computeCropCoords imports cleanly
 * under node:test.
 */
```
The new module MUST observe the same invariant: **zero top-level `chrome`/`document`/`window`** so it imports under `node:test`. It returns a `{ message, isError }` descriptor; the content script does the DOM `showToast` call.

**Pure-function export shape to mirror** (`lib/capture.ts:25-35`):
```typescript
export function computeCropCoords(
  rect: { x: number; y: number; width: number; height: number },
  dpr: number
): { sx: number; sy: number; sw: number; sh: number } {
  return { sx: Math.round(rect.x * dpr), /* … */ };
}
```

**VERBATIM strings the mapper MUST reproduce (D-01a — quoted from `card.ts`, do not alter a single character):**

| Outcome | Source line | Exact string |
|---------|-------------|--------------|
| channel-dead (path #4) | `card.ts:413-415` & `card.ts:849-851` (byte-identical) | `'Extension error: ' + (chrome.runtime.lastError?.message ?? 'no response')` |
| relay-error (paths #1,#2,#2b,#3,#5) | `card.ts:433` & `card.ts:867` | `resp.error` passed straight through (host-derived string) |
| success | `card.ts:427` & `card.ts:860` | `` `wrote notes\\${resp.file}` `` (note the literal backslash — see warning below) |

> **CRITICAL string detail:** the success template is `` `wrote notes\\${resp.file}` `` in TS source, which means the emitted runtime string contains a **single** backslash: `wrote notes\<file>`. The mapper's unit test must assert the single-backslash runtime value (e.g. `'wrote notes\\0001-….md'` in a TS test literal == `wrote notes\0001-….md` at runtime). Do not normalize to a forward slash.

> **Taxonomy the client mapper distinguishes is exactly TWO** (not five): **dead channel** (`chrome.runtime.lastError || !resp`) vs **relay error** (`resp.ok === false`). The five named failure paths already arrive pre-mapped to one host-derived `error` string by the SW (`background.ts:350-360`). This matches the existing branch split at `card.ts:412` (dead) vs `card.ts:431` (relay). RESEARCH Pattern 1 proposes a discriminated union `SendOutcome = {kind:'ok'|'channel-dead'|'relay-error'}` returning `{ message, isError }` — adopt it (planner has discretion per CONTEXT D-01).

> **`chip.ts` scope (Open Question 1 / Assumption A1):** `chip.ts` is a Phase-3 "Stub Send (relay proof)" with DIFFERENT strings (`'SW error: …'`, `` `sent ✓ ${resp.file}` ``). D-01a's "sacred" constraint applies to `card.ts` production toasts. Planner should confirm with user whether to also route `chip.ts` through a mapper variant; leaving the stub untouched still honors D-01a. **Default: consolidate `card.ts` `_doSend` + `_doElementSend` only.**

---

### `lib/payload-size.ts` (pure utility, transform) — D-04

**Analog:** `lib/capture.ts` (same pure-lib invariant + export shape as above).

**Threshold (mirror host exactly):** host cap is `12 * 1024 * 1024 = 12582912` bytes at `host/src/security.ts:12`; host rejects on `> MAX_BODY`. Pre-flight must reject at the **same** boundary so 11.9 MB passes and ≥12 MB+1 fails (SC-3).

**Counting basis:** host counts raw UTF-8 request-body bytes. CS must compute `new TextEncoder().encode(JSON.stringify(payload)).length`. `TextEncoder` is a global in both content scripts and Node 20+, so the lib is `node:test`-safe with no import.

**RESEARCH-proposed shape (original, adopt):**
```typescript
export const MAX_BODY_BYTES = 12 * 1024 * 1024; // mirror host/src/security.ts:12
export function encodedBodyBytes(jsonBody: string): number {
  return new TextEncoder().encode(jsonBody).length;
}
export function exceedsBodyCap(jsonBody: string): boolean {
  return encodedBodyBytes(jsonBody) > MAX_BODY_BYTES;
}
```

**Insertion in `card.ts`:** in `_doSend` after `payload` is assembled (`card.ts:392-405`, before the `sendMessage` at `:408`) and in `_doElementSend` after its `payload` (`card.ts:827-841`, before `:844`). If `exceedsBodyCap(JSON.stringify(payload))`, call `showToastFn(<new message>, true)`, restore controls (mirror the existing error branch — `_doSend` at `:434-440`, `_doElementSend` via `restoreControls()` at `:868`), then `return` — no SW round-trip. **New toast string is unconstrained by D-01a** (no existing string to preserve); RESEARCH suggests `"Screenshot too large to send (over 12 MB) — remove a capture and retry"`.

---

### `lib/test/error-toast.test.ts` + `lib/test/payload-size.test.ts` (tests)

**Analog:** `lib/test/marquee.test.ts` — pure-math `node:test` with zero mocks.

**Imports + structure to copy** (`lib/test/marquee.test.ts:10-22`):
```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildMarqueeRect, isBelowThreshold, MARQUEE_MIN_PX } from '../marquee.js';

describe('MARQUEE_MIN_PX', () => {
  test('is 6 (CAM-03 threshold)', () => {
    assert.strictEqual(MARQUEE_MIN_PX, 6);
  });
});
```
Note: import is from `'../<module>.js'` (NodeNext extension), and boundary cases are asserted explicitly (`marquee.test.ts:100-101` documents inclusive-boundary reasoning). Mirror this for:
- error-toast: one test per `SendOutcome` kind, asserting the **verbatim** output string (channel-dead with and without `lastErrorMessage`, relay-error pass-through, ok success format).
- payload-size: `MAX_BODY_BYTES === 12582912`; an 11.9 MB string → `exceedsBodyCap === false`; a `MAX_BODY_BYTES + 1` string → `true`; exact boundary `MAX_BODY_BYTES` → `false`.

---

### `host/test/server.test.ts` (MODIFY) — D-02 concurrency + D-04 host backstop

**Analog:** the file itself (existing fixture + POST block + PUT-oversize block).

**Fixture boot sequence to reuse** (`server.test.ts:24-53`):
```typescript
const TEST_TOKEN = 'test-token-fixed-abcdef1234567890';

function buildFixture(): TestFixture {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'sfx-server-test-'));
  const cfg = resolveConfig({ root: tmpRoot, token: TEST_TOKEN });
  ensureNotesDir(cfg.notesDir);
  const server = createHostServer(cfg);
  return { cfg, server, baseUrl: '', tmpRoot };
}

function listenFixture(fixture: TestFixture): Promise<string> {
  return new Promise((resolve, reject) => {
    fixture.server.once('error', reject);
    fixture.server.listen(0, '127.0.0.1', () => {
      const addr = fixture.server.address() as AddressInfo;
      fixture.baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve(fixture.baseUrl);
    });
  });
}
```
Add new `describe` block(s) with their own `before`/`after` calling `buildFixture`/`listenFixture`/`closeFixture` (mirror the Phase-6 blocks at `server.test.ts:414`, `:505`).

**Successful POST shape to fire concurrently** (`server.test.ts:141-170`):
```typescript
const res = await fetch(`${fixture.baseUrl}/annotation`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Stickyfix-Token': TEST_TOKEN },
  body: JSON.stringify({ mode: 'free', comment: '…',
    page: { url: 'http://localhost:5173/test', title: 'Test Page' },
    viewport: { width: 1280, height: 800, devicePixelRatio: 1 } }),
});
const body = await res.json() as { ok: boolean; file: string; serial: string };
```
**D-02 test:** fire 10 of these via `Promise.all`, collect `body.serial`, assert sorted serials === `['0001'..'0010']` and exactly 10 distinct `.md` files in `fixture.cfg.notesDir` (RESEARCH Pattern 3 has the full block). `Promise.all` issues all fetches before awaiting → real concurrency the `withSerialLock` mutex serializes.

**ECONNRESET-tolerant oversize pattern to MIRROR for the POST backstop** (`server.test.ts:477-502`):
```typescript
it('PUT /annotation/<serial> with >12MB body is rejected (HOST-11/T-06-03)', async () => {
  const bigBody = JSON.stringify({ comment: 'x'.repeat(13 * 1024 * 1024) });
  let status: number | null = null;
  try {
    const res = await fetch(`${fixture.baseUrl}/annotation/0001`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Stickyfix-Token': TEST_TOKEN },
      body: bigBody,
    });
    status = res.status;
  } catch {
    // Connection reset (ECONNRESET) — req.destroy() closed the socket. Acceptable.
  }
  if (status !== null) {
    assert.equal(status, 413, `Expected 413 for oversized body, got ${status}`);
  }
});
```
**D-04 host backstop test:** add the matching POST pair — an 11.9 MB body → 200, a 12 MB+1 body → 413-OR-reset (do NOT strictly assert 413; mirror the tolerance above — Pitfall 2). For the large body, prefer chunked construction (see `security.test.ts:101-110`) to avoid one giant allocation.

**Chunked-write reference** (`host/test/security.test.ts:101-110`):
```typescript
const chunkSize = 64 * 1024;
const totalTarget = 12 * 1024 * 1024 + 1;
let sent = 0;
const chunk = Buffer.alloc(chunkSize, 0x41); // 'A'
while (sent < totalTarget) {
  const toSend = Math.min(chunkSize, totalTarget - sent);
  pt.write(chunk.subarray(0, toSend)); sent += toSend;
}
```
> `server.test.ts` is already in the `package.json` `test` list (`:12`) — **no script change needed** for the host test extension.

---

### `scripts/clean-room-check.mjs` (MODIFY) — D-03

**Analog:** the file itself.

**Fragment-construction (MUST use so the script never self-trips)** (`clean-room-check.mjs:16-24`):
```javascript
// Construct banned patterns from fragments so this file does not self-trip.
const BANNED = [
  new RegExp('__' + 'opc' + '_', 'i'),       // upstream private-API prefix
  new RegExp('open' + 'code', 'i'),          // upstream project name
  new RegExp('Jodus' + 'Nodus', 'i'),        // upstream author handle
];
```
Any NEW banned token / self-audited selector constant added by D-03 MUST be split into fragments the same way (Pitfall 4). `clean-room-check.mjs` is NOT in `SKIP_FILENAMES`, so it scans itself.

**Skip sets to extend if needed** (`clean-room-check.mjs:32-55`): `SKIP_DIRS` (adds `node_modules`, `.git`, `dist`, `.planning`, `notes`, `private`, `.claude`, `.qmd-memory`) and `SKIP_FILENAMES` (`PRD.md`, `README.md`, `CLAUDE.md`, `LICENSE`, `CLEAN-ROOM.md`).

**D-03 method (no-peek):** self-audit OUR repo for provenance-risky magic strings / selector constants (e.g. `lib/element-context.ts` curated-styles config). If our code is genuinely clean-room, the audit may add nothing beyond the three known tokens — a valid PASS (Pitfall 5). Record the extended banned set + method + result in `CLEAN-ROOM.md` (CONTEXT canonical ref). Script must continue exiting 0 in `npm run check`.

---

### `entrypoints/review.content/card.ts` (MODIFY) — D-01a consolidation

**Analog:** the file itself. Route both catch sites through `lib/error-toast.ts` WITHOUT changing emitted strings or the control-restore behavior.

**`toast()` call signature (the only toast surface)** — `showToast(container, msg, isError)` (`toast.ts:24`); inside `card.ts` it is bound as `showToastFn(msg: string, isError: boolean)`.

**`_doSend` catch site to consolidate** (`card.ts:408-443`):
```typescript
chrome.runtime.sendMessage(
  { type: SFX_MSG.SEND_ANNOTATION, tabId, payload },
  (resp: AnnotationResponse | undefined) => {
    if (chrome.runtime.lastError || !resp) {
      showToastFn('Extension error: ' + (chrome.runtime.lastError?.message ?? 'no response'), true);
      sendBtn.disabled = false; sendBtn.textContent = 'Send';
      cancelBtn.disabled = false; textarea.readOnly = false;
      return;
    }
    if (resp.ok) {
      showToastFn(`wrote notes\\${resp.file}`, false);
      _doClose(onDismiss); onSent?.();
    } else {
      showToastFn(resp.error, true);
      sendBtn.textContent = 'Send'; cancelBtn.disabled = false; textarea.readOnly = false;
      const hasText = textarea.value.trim().length > 0; sendBtn.disabled = !hasText;
    }
  }
);
```

**`_doElementSend` catch site — byte-identical error handling** (`card.ts:844-873`): same three branches; uses `restoreControls()` then `sendBtn.disabled = textarea.value.trim().length === 0` instead of inline restores.

> **Consolidation guidance:** the mapper produces the `{ message, isError }`; the **control-restore logic stays inline** at each call-site (it is call-site-specific). Replace only the string-construction with `const spec = mapSendOutcome(outcome); showToastFn(spec.message, spec.isError);`. Do NOT remove the `chrome.runtime.lastError || !resp` guard — it is the SW-eviction safety net (Security invariant).

---

### `tsconfig.lib.json` + `package.json` (MODIFY) — wiring (Pitfall 3 — runners do NOT glob)

**`tsconfig.lib.json include[]`** (`:13-25`) — append `"lib/error-toast.ts"` and `"lib/payload-size.ts"` (each lib file is listed explicitly; `lib/test/**/*.ts` is already a glob so the new tests compile automatically).

**`package.json` `test:lib`** (`:11`) — the runner lists each compiled test file explicitly (NOT a glob):
```
"test:lib": "tsc -p tsconfig.lib.json && node --test dist/lib/lib/test/routing.test.js … dist/lib/lib/test/review-notes.test.js"
```
Append `dist/lib/lib/test/error-toast.test.js` and `dist/lib/lib/test/payload-size.test.js` or the new tests run silently as no-ops. Verify assertion counts in the output.

---

### `08-UAT.md` (NEW) — manual runbook (D-01 / D-05)

**Analog:** `.planning/phases/07-review-notes-skill-docs/07-HUMAN-UAT.md`.

**Structure to mirror** (`07-HUMAN-UAT.md:1-11`): title `# Phase 08 — Human UAT Runbook`, `**Purpose:**` / `**Who runs this:**` / `**Time estimate:**` header, then a fixture/scenario table, a `## Before You Begin`, and numbered `## Steps`. Include cross-platform commands (the analog gives both bash and PowerShell — `:32-37`).

**Required content (authoritative checklist from CONTEXT/RESEARCH):**
- Enumerate **all five** REL-01 failure paths with repro + expected verbatim toast:
  1. Host unreachable → `Host unreachable: …`
  2. 401 token mismatch → `unauthorized`
  2b. No token for host → `No token set for host "…" — enter it in the popup`
  3. 413 body too large → `Payload Too Large` (or `Host unreachable: …` via reset — both visible, not silent; D-04 pre-flight gives a deterministic toast)
  4. SW evicted mid-flight → `Extension error: …` (repro: `chrome://extensions` → service worker → Stop, then Send; or wait >30s idle)
  5. No host mapped for origin → `No host mapped for origin: …`
- D-05 regression: (a) SW idle-eviction state survival + subsequent Send routes correctly; (b) multi-note serial increment `0001` → `0002`.
- D-02a: manual rapid multi-Send (folded here, non-blocking).
- D-04 manual: a near-12 MB screenshot Send shows the new pre-flight toast before any round-trip.

---

## Shared Patterns

### Pure-lib + node:test invariant (applies to both new lib files)
**Source:** `lib/capture.ts:1-12`, `lib/test/marquee.test.ts:10-12`
**Apply to:** `lib/error-toast.ts`, `lib/payload-size.ts`, and their tests.
Zero top-level `chrome`/`document`/`window`; import tests via `'../<module>.js'`; `import { test, describe } from 'node:test'` + `import assert from 'node:assert/strict'`.

### Booted-host fixture (applies to the host test extension)
**Source:** `host/test/server.test.ts:24-63`
**Apply to:** the D-02 concurrency block and the D-04 POST-boundary block.
Reuse `TEST_TOKEN`, `buildFixture`, `listenFixture`, `closeFixture`; token via `X-Stickyfix-Token` header.

### ECONNRESET tolerance for oversize bodies
**Source:** `host/test/server.test.ts:477-502`
**Apply to:** the D-04 POST 12 MB+1 case — `try fetch / catch (reset ok)`, assert 413 only if a response came back. Never strictly assert 413 (Pitfall 2).

### Clean-room fragment construction
**Source:** `scripts/clean-room-check.mjs:16-24`
**Apply to:** every new banned token in D-03 — split into string fragments so the scanner does not match itself.

### No-silent-failure / D-01a preservation
**Source:** `entrypoints/review.content/toast.ts:1-12`, `card.ts:411-441`/`:847-871`
**Apply to:** the mapper consolidation — emitted toast strings byte-identical; `lastError||!resp` guard retained; host-derived strings stay `textContent`-only (INVARIANT C).

---

## No Analog Found

None. Every file has an exact or strong in-repo analog (this is a hardening phase over working code).

---

## Metadata

**Analog search scope:** `lib/`, `lib/test/`, `host/test/`, `host/src/`, `entrypoints/review.content/`, `scripts/`, `.planning/phases/07-…/`, root config (`package.json`, `tsconfig.lib.json`)
**Files scanned (read in full or targeted):** `lib/capture.ts`, `lib/test/marquee.test.ts`, `package.json`, `tsconfig.lib.json`, `scripts/clean-room-check.mjs`, `entrypoints/review.content/toast.ts`, `entrypoints/review.content/card.ts` (catch-site ranges), `host/test/server.test.ts` (fixture + POST + PUT-oversize ranges), `host/test/security.test.ts` (413 boundary), `07-HUMAN-UAT.md`
**Pattern extraction date:** 2026-06-03
