---
phase: 08-hardening-pre-release-audit
reviewed: 2026-06-04T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - lib/error-toast.ts
  - lib/payload-size.ts
  - lib/test/error-toast.test.ts
  - lib/test/payload-size.test.ts
  - entrypoints/review.content/card.ts
  - host/test/server.test.ts
  - scripts/clean-room-check.mjs
  - tsconfig.lib.json
  - package.json
findings:
  critical: 0
  blocker: 0
  warning: 3
  info: 4
  total: 7
status: issues-found
---

# Phase 8: Code Review Report

**Reviewed:** 2026-06-04
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues-found

## Summary

Phase 8 hardening work is solid on its headline contracts. I verified the
three load-bearing invariants against ground-truth source, not just against
the new files' own comments:

- **D-01a no-regression (error-toast.ts):** All three toast strings reproduce
  the prior card.ts/pin.ts behaviour byte-for-byte. The pre-existing strings
  still live in `pin.ts:440,538` (`'Extension error: ' + (… ?? 'no response')`)
  and the relay pass-through / success `wrote notes\<file>` (single backslash)
  forms match the mapper exactly. The module is pure — no `chrome`/`document`/
  `window` at top level. PASS.
- **D-04 boundary (payload-size.ts):** `exceedsBodyCap` uses strict `>` against
  `12 * 1024 * 1024`, and the host backstop (`host/src/security.ts:12,51`)
  rejects on `total > MAX_BODY` with the same constant. Boundary semantics
  agree exactly — the exact-cap value is accepted by both, `cap+1` rejected by
  both. No off-by-one. PASS.
- **Pre-flight measures what the host receives:** The card pre-flight encodes
  `JSON.stringify(payload)`; the SW relay (`background.ts:324`) sends
  `body: JSON.stringify(payload)` — the identical inner payload, no envelope
  re-wrap. The pre-flight therefore counts the same bytes the host counts. PASS.
- **card.ts routing:** Both `_doSend` and `_doElementSend` route every outcome
  through `mapSendOutcome`, the dead-channel guard (`lastError || !resp`) is
  preserved on both paths, and `exceedsBodyCap` fires before `sendMessage` on
  both. No new silent-failure path. PASS.
- **server.test.ts concurrency:** The 10-concurrent test builds all 10 fetch
  promises before awaiting (`Promise.all(Array.from(...))`) — genuinely
  concurrent. Assertions (sorted serials 0001–0010, exactly 10 `.md` files) are
  sound. The payload-boundary tests tolerate ECONNRESET only when no response
  arrived, and still assert `=== 413` whenever a status is read — ECONNRESET is
  not masking a real failure. PASS.
- **clean-room-check.mjs:** Banned patterns are fragment-constructed
  (`'__' + 'opc' + '_'`, etc.) so the scanner never trips on its own source.
  The audit was not weakened — skip lists are unchanged in intent and the three
  tokens remain the complete banned set. PASS.

Remaining findings are one genuine correctness defect in shared card.ts
thumbnail renumbering (WR-01), a test-fragility issue (WR-02), a CI-scope gap
(WR-03), plus minor info items.

## Warnings

### WR-01: Thumbnail delete renumbering collides with the element `+1` highlight slot

**File:** `entrypoints/review.content/card.ts:78-83` (with `:629` and `:844-857`)
**Issue:** `renderThumbnails`'s delete handler renumbers ALL remaining entries
to `+${j + 1}`, i.e. starting at `+1`:
```js
items.forEach((item, j) => { item.kind = `+${j + 1}`; });
```
The inline comment claims this "preserves +1 slot for element auto-highlight",
but it does not. On the **element** path, region thumbnails are deliberately
created starting at `+2` (`:629`, `kind: '+${thumbnails.length + 2}'`) to
reserve `+1` for the element auto-highlight that `_doElementSend` adds at send
time (`:846`, `kind: '+1'`). After the user deletes any region thumbnail, the
remaining region captures are renumbered to `+1, +2, …` — so the first region
capture becomes `+1` and now collides with the element auto-highlight `+1`. The
resulting payload (`:844-857`) contains two `screenshots[]` entries with
`kind: '+1'`. Downstream filename/frontmatter generation that keys on `kind`
can overwrite one PNG with the other or mislabel them. On the free path this
renumbering is correct; only the element path is wrong.
**Fix:** Make the renumber offset path-aware. Pass an offset into
`renderThumbnails` (1 for element, 0 for free), or have the element camera
handler/delete share a single numbering function:
```js
function renderThumbnails(container, items, baseOffset = 0) {
  // ...
  del.addEventListener('click', () => {
    items.splice(i, 1);
    items.forEach((item, j) => { item.kind = `+${j + 1 + baseOffset}`; });
    renderThumbnails(container, items, baseOffset);
  });
  // ...
}
```
Call with `baseOffset = 1` from `openElementCard`, `0` from `openCard`. Add a
unit test that deletes a middle element-path thumbnail and asserts no two
`screenshots[].kind` values are equal.

### WR-02: Payload-size tests allocate up to 12 MB+ strings — slow and memory-heavy under `--test`

**File:** `lib/test/payload-size.test.ts:49-58`; mirrored in
`host/test/server.test.ts:628-728`
**Issue:** `'x'.repeat(MAX_BODY_BYTES)` and `'x'.repeat(MAX_BODY_BYTES + 1)`
each materialise ~12 MB strings, and `encodedBodyBytes` then re-encodes them via
`TextEncoder` into another ~12 MB `Uint8Array`. Running both boundary cases plus
the host 11.9 MB / 12 MB+ integration bodies in one `node --test` process can
spike RSS by 60–100 MB and slows the suite. This is correctness-neutral but a
flake/OOM risk on constrained CI runners. (Performance per se is out of v1
scope; flagged here only as a test-robustness risk, not an algorithmic concern.)
**Fix:** The pure boundary test does not need a real 12 MB allocation — assert
against a stubbed length instead, e.g. expose the comparison on a number, or
test `exceedsBodyCap` with a short string while separately unit-testing the
`>` against `MAX_BODY_BYTES` via a synthetic encoder. If the literal large
string is required for fidelity, gate it behind a single shared buffer reused
across the two cases rather than allocating twice.

### WR-03: `test:lib` enumerates test files by hand — a new lib test can silently never run

**File:** `package.json:11` (and `:12` for host)
**Issue:** `test:lib` hard-codes the full list of compiled test paths
(`dist/lib/lib/test/error-toast.test.js dist/lib/lib/test/payload-size.test.js …`).
The two Phase 8 tests were added correctly, but the pattern means any future
lib test that an author forgets to append to this string compiles but is never
executed — a green CI that proves nothing for the new file. For a project whose
core value is "a dropped note is a regression," a silently-unrun test is a real
reliability hazard.
**Fix:** Use a glob/directory form so the runner discovers every compiled test:
```json
"test:lib": "tsc -p tsconfig.lib.json && node --test \"dist/lib/lib/test/**/*.test.js\""
```
Node 20+'s `--test` supports glob discovery. Same treatment for `test`.
If you must keep the explicit list, add a check that the count of
`dist/lib/lib/test/*.test.js` equals the number of paths enumerated.

## Info

### IN-01: Doubled `lib/lib` output path is correct but brittle/confusing

**File:** `tsconfig.lib.json:6-7`; `package.json:11`
**Issue:** `outDir: "dist/lib"` + `rootDir: "."` maps `lib/test/x.ts` →
`dist/lib/lib/test/x.js`, hence the `dist/lib/lib/test/...` paths in
`test:lib`. This is internally consistent and works, but the doubled segment is
a foot-gun for the next person editing the script (easy to write
`dist/lib/test/...` and get "no test files found").
**Fix:** Optional — set `rootDir: "lib"` (and move `card-state.ts` handling) so
output is `dist/lib/test/...`, or just add a one-line comment in package.json's
neighbourhood / a README note documenting the doubled segment.

### IN-02: Misleading inline comment in `renderThumbnails`

**File:** `entrypoints/review.content/card.ts:80`
**Issue:** The comment "Renumber remaining entries (preserves +1 slot for
element auto-highlight)" actively misstates the code's behaviour (see WR-01).
A wrong comment is worse than none — it will mislead the fixer.
**Fix:** Correct or remove the comment as part of the WR-01 fix.

### IN-03: `mapSendOutcome` switch relies on exhaustiveness without a guard

**File:** `lib/error-toast.ts:60-80`
**Issue:** The `switch (o.kind)` has no `default`/`never` exhaustiveness check.
Today TS enforces all three union arms are handled, but if a fourth
`SendOutcome` kind is later added, the function silently returns `undefined`
(no compile error inside the switch because there is no return-type narrowing
forcing it). Given the no-silent-failure invariant, a `undefined` ToastSpec
would surface as a blank/crashing toast.
**Fix:** Add an exhaustiveness guard:
```ts
default: {
  const _exhaustive: never = o;
  return _exhaustive;
}
```

### IN-04: clean-room scanner reads every matched file fully into memory

**File:** `scripts/clean-room-check.mjs:99,104-109`
**Issue:** `readFileSync(full, 'utf8')` loads each scanned file entirely and runs
three regexes. Fine for source trees, but the `.json`/`.md` scan set could
include a large committed fixture and the script has no size guard. Not a
correctness issue (skip dirs exclude `node_modules`, `.output`, etc.) — noted
only as a latent robustness item.
**Fix:** Optional — skip files over, say, 2 MB with a warning, since banned
identifiers are short tokens that will appear in normal-sized source.

---

_Reviewed: 2026-06-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
