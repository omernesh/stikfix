---
phase: 04-free-note-mode-capture-utilities
verified: 2026-06-01T00:00:00Z
status: human_needed
score: 9/10 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Live browser capture trio round-trip (04-03 Task 2)"
    expected: "captureTab() resolves to data:image/png;base64 via the SW; captured image shows no own-UI (chip/FAB absent — double-rAF flush confirmed); cropToRect returns a correctly sized DPR-correct crop; a free note sent in the same session still writes screenshots:[]"
    why_human: "Requires a loaded Chrome extension, a running host, and DevTools console invocation of the capture trio — cannot be verified by static analysis or node:test"
  - test: "FAB drag + clamp in Review Mode"
    expected: "The + FAB is visible at bottom-right, drags smoothly within the page viewport, and does not drift off-screen at any DPR"
    why_human: "interactjs restrictRect window modifier behavior inside WXT shadow root requires visual confirmation in a live Chrome session"
  - test: "Single card enforcement under FAB double-click"
    expected: "Clicking the FAB while a card is already open focuses the existing card's textarea — no second card appears"
    why_human: "DOM-level guard (activeCard ref) is verified statically, but the actual UI behavior in the shadow root needs a live session"
  - test: "Send free note end-to-end: writes notes/000N-ts.md"
    expected: "Typing a note and hitting Send (or Ctrl+Enter) calls POST /annotation with mode:free, url, title, viewport, screenshots:[] and a correctly named .md appears in the routed project notes/ dir; success toast names the file"
    why_human: "Requires a live Chrome extension + running stikfix host to verify the full round-trip including the notes/ file on disk"
  - test: "Host-down error toast persistence"
    expected: "When the host is not running, Send shows a persistent error toast that does not auto-dismiss and has a working x dismiss button"
    why_human: "Requires live Chrome extension with host intentionally stopped"
  - test: "Chip label re-map affordance (D-09)"
    expected: "Clicking the routed chip label re-opens the project dropdown; selecting a different project updates the label and persists the mapping"
    why_human: "UI interaction flow; label.onclick wiring is verified statically, but end-to-end re-map via SFX_SET_ROUTE needs a live session"
---

# Phase 4: Free-Note Mode + Capture Utilities Verification Report

**Phase Goal:** Free-Note Mode + Capture Utilities — Draggable FAB + post-it + Send + .md on disk; DPR-correct crop, double-rAF flush, captureVisibleTab relay established as reusable utilities (inherited by Phases 5 and 6). End-to-end vertical slice: a free note written to disk works at the end of Phase 4.

**Verified:** 2026-06-01
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                           | Status     | Evidence                                                                                                  |
|-----|-----------------------------------------------------------------------------------------------------------------|------------|-----------------------------------------------------------------------------------------------------------|
| 1   | computeCropCoords(rect, dpr) returns integer pixel coords correct at DPR=1, 1.25, 2                            | VERIFIED   | lib/capture.ts exports pure computeCropCoords with Math.round; test passes DPR=1/1.25/2 including sx=13, sh=63 at DPR=1.25 |
| 2   | Single-active-card guard rejects a second open while one card is active                                         | VERIFIED   | card-state.ts exports tryOpenCard/closeCardState/isCardActive; test covers all 4 behaviors; 32 tests pass |
| 3   | interactjs@1.10.27 is installed and resolves for the extension build                                            | VERIFIED   | package.json dependencies.interactjs === "1.10.27" (no caret); fab.ts and card.ts import interactjs successfully; npm run build exits 0 |
| 4   | npm run test:lib runs capture + card-state tests and exits 0                                                    | VERIFIED   | Live run: 32 pass, 0 fail — routing(8) + discovery(4) + capture(6) + card-state(4) + other(10) |
| 5   | SFX_CAPTURE_TAB constant + MsgCaptureTab interface exported from lib/types.ts (side-effect-free)               | VERIFIED   | lib/types.ts line 79: `export const SFX_CAPTURE_TAB = 'SFX_CAPTURE_TAB' as const`; MsgCaptureTab interface at lines 81-84; NOT in SfxMessage union |
| 6   | A draggable + FAB is visible in Review Mode and opens one post-it card                                          | VERIFIED (code) / UNCERTAIN (live) | fab.ts exports mountFab returning HTMLButtonElement; interactjs applied with direct element ref; index.ts wires mountFab + openCard; HUMAN-UAT required for live confirmation |
| 7   | Hitting Send POSTs a mode:'free' text-only payload (screenshots:[]) and writes notes/000N-ts.md                | VERIFIED (code) / UNCERTAIN (live) | card.ts _doSend builds payload with mode:'free', screenshots:[], relays via SFX_SEND_ANNOTATION; card.ts does NOT import lib/capture.ts; HUMAN-UAT required for disk write |
| 8   | Success toast names host-returned file; host-down Send shows persisting error toast; never silent               | VERIFIED (code) | toast.ts showToast: success auto-dismiss 3s, error persists with dismiss.onclick; card.ts lastError guard always calls showToastFn |
| 9   | SW exposes SFX_CAPTURE_TAB relay; SW is the sole captureVisibleTab caller; windowId from chrome.tabs.get       | VERIFIED   | background.ts handleCaptureTab at line 369; captureVisibleTab appears exactly once in source (line 375); windowId from chrome.tabs.get(tabId), never msg.windowId; sender-bind IDOR guard at line 482 |
| 10  | Capture trio round-trip proven standalone (captureTab + waitTwoRafs + cropToRect, own-UI flushed, DPR crop correct) | UNCERTAIN | Code is complete and wired; live browser round-trip deferred per 04-03 Task 2 (checkpoint:human-verify gate) |

**Score:** 9/10 truths verified (truth #10 requires human verification per plan design)

### Required Artifacts

| Artifact                                              | Expected                                               | Status     | Details                                                             |
|-------------------------------------------------------|--------------------------------------------------------|------------|---------------------------------------------------------------------|
| `lib/capture.ts`                                      | computeCropCoords pure + browser-only helpers          | VERIFIED   | All 4 exports present; no top-level chrome/document/window access  |
| `lib/test/capture.test.ts`                            | DPR=1/1.25/2 unit coverage                             | VERIFIED   | 6 tests including edge cases; runs under node:test                  |
| `entrypoints/review.content/card-state.ts`            | DOM-free single-active-card state machine              | VERIFIED   | Zero document/window/chrome references; all 3 exports present      |
| `lib/test/card-state.test.ts`                         | FREE-02 guard unit tests                               | VERIFIED   | 4 behaviors covered with beforeEach reset                           |
| `lib/types.ts`                                        | SFX_CAPTURE_TAB + MsgCaptureTab exported               | VERIFIED   | Lines 79-84; not in SfxMessage union                               |
| `entrypoints/review.content/fab.ts`                   | mountFab(container, onOpen) — draggable + FAB          | VERIFIED   | Exports mountFab returning HTMLButtonElement; interactjs direct-ref |
| `entrypoints/review.content/card.ts`                  | openCard/closeCard — single post-it, free-note Send    | VERIFIED   | Exports openCard + closeCard; no capture.ts import; screenshots:[] |
| `entrypoints/review.content/toast.ts`                 | showToast(container, msg, isError)                     | VERIFIED   | Exported; dismiss.onclick (not addEventListener); textContent only  |
| `entrypoints/background.ts`                           | handleCaptureTab + SFX_CAPTURE_TAB router case         | VERIFIED   | Lines 369-380 (handler) + 477-492 (case); return true present      |

### Key Link Verification

| From                                          | To                          | Via                                             | Status   | Details                                                                                 |
|-----------------------------------------------|-----------------------------|-------------------------------------------------|----------|-----------------------------------------------------------------------------------------|
| package.json test:lib                         | dist/lib/lib/test/capture.test.js | node --test argument list                  | VERIFIED | Both capture.test.js and card-state.test.js in test:lib script; live run confirms      |
| entrypoints/review.content/card.ts            | SFX_MSG.SEND_ANNOTATION     | chrome.runtime.sendMessage with mode:'free' payload | VERIFIED | _doSend builds payload with mode:'free'; relays via SFX_MSG.SEND_ANNOTATION            |
| entrypoints/review.content/card.ts            | showToast                   | onSend result callback echoes resp.file         | VERIFIED | Line 304: showToastFn(`wrote notes\\${resp.file}`, false) on resp.ok                   |
| chip.ts renderRoutedLabel                     | renderDropdown (re-map)     | label.onclick = () => renderDropdown(...)        | VERIFIED | line 254: label.onclick assignment; both call sites at lines 174 and 349 updated       |
| entrypoints/background.ts onMessage router    | handleCaptureTab            | case SFX_CAPTURE_TAB with return true           | VERIFIED | Lines 477-492; sender-bind IDOR guard at 482; return true at 491                       |
| lib/capture.ts captureTab                     | SW handleCaptureTab         | chrome.runtime.sendMessage round-trip           | VERIFIED (code) | captureTab sends {type: SFX_CAPTURE_TAB, tabId}; SW receives and returns dataUrl; live round-trip is human_verification item |
| entrypoints/review.content/index.ts           | mountFab + openCard + showToast | onMount wiring into shared container        | VERIFIED | index.ts imports mountFab/openCard/closeCard/showToast; all mounted into same container; getTabId called once |

### Data-Flow Trace (Level 4)

| Artifact         | Data Variable  | Source                                                          | Produces Real Data | Status   |
|------------------|----------------|-----------------------------------------------------------------|--------------------|----------|
| card.ts _doSend  | payload.comment | textarea.value.trim()                                          | Yes — user input   | FLOWING  |
| card.ts _doSend  | payload.page.url | window.location.href                                          | Yes — live DOM     | FLOWING  |
| card.ts _doSend  | resp.file       | chrome.runtime.sendMessage callback (SW returns host filename) | Yes — host returns | FLOWING  |
| toast.ts         | msgSpan.textContent | msg param from caller (resp.file / resp.error)            | Yes — capped 200ch | FLOWING  |

### Behavioral Spot-Checks

Step 7b: SKIPPED — extension requires a live Chrome runtime. The lib test suite ran live (Step 7b equivalent for pure-function code) and confirmed all 32 tests pass.

### Probe Execution

No conventional `scripts/*/tests/probe-*.sh` probes found in the repository. No probes declared in PLAN files. SKIPPED.

### Requirements Coverage

| Requirement | Source Plan | Description                                                          | Status        | Evidence                                                                            |
|-------------|-------------|----------------------------------------------------------------------|---------------|-------------------------------------------------------------------------------------|
| FREE-01     | 04-02, 04-03 | Draggable + FAB opens a single post-it note card                    | SATISFIED     | fab.ts mountFab + card.ts openCard wired in index.ts; SW relay proven in background.ts |
| FREE-02     | 04-01, 04-02 | Post-it card is draggable; only one active card at a time           | SATISFIED     | card-state.ts DOM-free guard + card.ts interactjs drag; 4 unit tests pass          |
| FREE-03     | 04-02        | Send captures url/title/timestamp/viewport, POSTs, writes 000N-ts.md | SATISFIED (code) | card.ts _doSend payload has mode:'free' with all required fields; HUMAN-UAT for disk write |
| FREE-04     | 04-02        | Toast confirms written filename on success                          | SATISFIED     | toast.ts showToast; card.ts shows resp.file on success; error toast persists       |

No orphaned requirements — all four FREE-* IDs from the PLANs map to implemented artifacts.

### Anti-Patterns Found

| File                                             | Line | Pattern                          | Severity | Impact                                  |
|--------------------------------------------------|------|----------------------------------|----------|-----------------------------------------|
| No TBD/FIXME/XXX markers found in phase files    | —    | —                                | None     | —                                       |
| No innerHTML assignments in card.ts/toast.ts/fab.ts | — | All host-derived strings via textContent | — | XSS surface is clean                |
| card.ts does NOT import lib/capture.ts           | —    | D-06 enforced                    | None     | screenshots:[] always literal []        |
| captureVisibleTab appears exactly once in source | —    | INVARIANT B + T-04-09 mitigated  | None     | SW is sole caller                       |

No blockers. No warning-level anti-patterns.

### Human Verification Required

#### 1. Live Browser Capture Trio Round-Trip (04-03 Task 2 — plan-designated checkpoint:human-verify)

**Test:** Build + load the unpacked extension. Start a host (`npm run host -- --root <test-dir>`), open any HTTPS page, enter Review Mode. From DevTools, invoke: hide shadow-root UI; `await waitTwoRafs()`; `const url = await captureTab(tabId)`; `const cropped = await cropToRect(url, {x:0,y:0,width:200,height:120}, window.devicePixelRatio)`; restore UI. Open the captured dataURL in a new tab.

**Expected:** captureTab resolves to a data:image/png;base64 string via the SW; the captured image shows real page pixels at device resolution with NO stikfix UI visible (chip/FAB absent — double-rAF flush worked); cropToRect returns a correctly sized DPR-correct crop; a free note sent in the same session writes `screenshots: []`.

**Why human:** Requires a live Chrome session with the extension loaded and a running host. Cannot be verified by static analysis or node:test.

#### 2. FAB Drag and Clamp in Review Mode

**Test:** In Review Mode, drag the + FAB around the viewport including toward edges.

**Expected:** FAB drags smoothly via interactjs; stays within viewport bounds at all edges (restrictRect 'window' modifier working inside the WXT shadow root).

**Why human:** interactjs behavior inside an open shadow root requires visual confirmation in a live Chrome session (RESEARCH Assumption A2/A3 was confirmed by the executor but not verifiable statically).

#### 3. Single Card Enforcement Under FAB Double-Click

**Test:** Click the FAB to open a card, then click the FAB again without closing.

**Expected:** The existing card's textarea gains focus; no second card appears.

**Why human:** DOM-level activeCard reference verified statically; shadow root rendering behavior requires a live session.

#### 4. Free Note Send End-to-End

**Test:** Type a note in the post-it card, hit Send. Check the routed project's `notes/` dir.

**Expected:** `notes/000N-YYYYMMDD-HHmmss.md` appears with the comment text, url, title, viewport, and `screenshots: []`. Success toast names the file (`wrote notes\000N-YYYYMMDD-HHmmss.md`).

**Why human:** Full disk round-trip requires live Chrome + running host.

#### 5. Host-Down Error Toast Persistence

**Test:** Stop the stikfix host, then hit Send on an open card.

**Expected:** A persistent error toast appears that does not auto-dismiss; the × button removes it; the card stays open with Send/Cancel re-enabled.

**Why human:** Requires live Chrome + intentionally stopped host.

#### 6. Chip Label Re-Map Affordance (D-09)

**Test:** With a routed project, click the chip's project label.

**Expected:** The project dropdown re-opens; selecting a different project updates the label and persists the routing (the new project is used for subsequent note Sends).

**Why human:** UI interaction + SFX_SET_ROUTE persistence across a re-route requires a live session.

### Gaps Summary

No gaps. All programmatically verifiable must-haves are VERIFIED. The only open item is the plan-designated `checkpoint:human-verify` gate (04-03 Task 2) plus related UAT items that require a live Chrome session. These are classified as `human_verification` per the phase design.

---

_Verified: 2026-06-01_
_Verifier: Claude (gsd-verifier)_
