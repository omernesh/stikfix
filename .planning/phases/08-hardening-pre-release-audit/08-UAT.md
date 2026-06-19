# Phase 08 — Human UAT Runbook

**Purpose:** Confirm that all five REL-01 failure paths surface a visible toast (never a
silent drop), verify the D-05 SW-idle-eviction + multi-note regression, manually confirm
the D-04 over-12-MB pre-flight toast, and spot-check D-02a rapid multi-Send serial
integrity. This runbook covers the runtime confirmations that cannot be gated by node:test.

**Who runs this:** Omer (or any developer with Chrome + a running stikfix host).

**Time estimate:** 15–25 minutes.

---

## Scenario Table

| # | Scenario | Category | PASS Signal |
|---|----------|----------|-------------|
| 1 | Host unreachable (host not running) | REL-01 path 1 | Toast: `Host unreachable: …` |
| 2 | 401 wrong token | REL-01 path 2 | Toast: `unauthorized` |
| 2b | No token set for host | REL-01 path 2b | Toast: `No token set for host "…" — enter it in the popup` |
| 3 | Payload Too Large (413) | REL-01 path 3 | Toast: `Payload Too Large` or `Host unreachable: …` (D-04 pre-flight gives deterministic toast first) |
| 4 | SW evicted mid-flight | REL-01 path 4 | Toast: `Extension error: …` |
| 5 | No host mapped for origin | REL-01 path 5 | Toast: `No host mapped for origin: …` |
| D-05a | SW idle-eviction state survival + subsequent Send routes | D-05 regression | Send succeeds after SW restarts; note written to disk |
| D-05b | Multi-note serial increment 0001 → 0002 | D-05 regression | Two notes on disk with consecutive serials |
| D-04 | Near-12 MB screenshot pre-flight | REL-03 | Pre-flight toast fires BEFORE any round-trip |
| D-02a | Rapid multi-Send (no gaps) | D-02a spot-check | All notes reach disk with no gaps |

---

## Before You Begin

### 1. Build and load the extension

```bash
# Bash
npm run build
# PowerShell
npm run build
```

Load the unpacked extension from `.output/chrome-mv3/` in Chrome at
`chrome://extensions` → "Load unpacked".

### 2. Start the host

```bash
# Bash
node dist/host/src/index.js --root /tmp/sfx-uat-notes --token my-uat-token
# PowerShell
node dist\host\src\index.js --root $env:TEMP\sfx-uat-notes --token my-uat-token
```

The host listens on `127.0.0.1:39240` by default and prints the bound port on startup.

### 3. Configure the extension

Open the extension popup (click the stikfix icon in the Chrome toolbar).
Add a host entry pointing at `http://127.0.0.1:39240` with token `my-uat-token`.
Map your test origin (e.g. `http://localhost:3000`) to this host.

### 4. Enter Review Mode

Navigate to a mapped page and click "Enter Review Mode" in the popup, or use the FAB.
Confirm the FAB is visible and the extension toolbar is active.

---

## Steps

### Scenario 1 — Host unreachable (REL-01 path 1)

**Repro:**

1. Stop the host (Ctrl-C or close the terminal).
2. In Review Mode on a mapped page, open a free note or element note.
3. Fill in a comment and click **Send**.

**Expected toast (verbatim):**

> `Host unreachable: …`

(The `…` is the underlying network error message, e.g. `fetch failed` or
`TypeError: Failed to fetch`.)

- [ ] **PASS** — toast appeared with `Host unreachable:` prefix; no silent drop.

---

### Scenario 2 — 401 wrong token (REL-01 path 2)

**Repro:**

1. Start the host with `--token correct-token`.
2. In the extension popup, change the host token to `wrong-token`.
3. In Review Mode, fill in a comment and click **Send**.

**Expected toast (verbatim):**

> `unauthorized`

- [ ] **PASS** — toast `unauthorized` appeared; no silent drop.

---

### Scenario 2b — No token set for host (REL-01 path 2b)

**Repro:**

1. In the extension popup, clear (blank out) the token for the current host.
2. In Review Mode, fill in a comment and click **Send**.

**Expected toast (verbatim):**

> `No token set for host "…" — enter it in the popup`

(The `…` is the host label/URL as stored in the extension's registry.)

- [ ] **PASS** — toast appeared with `No token set for host` text; no silent drop.

---

### Scenario 3 — Payload Too Large / 413 (REL-01 path 3 + D-04 pre-flight)

**Repro (D-04 pre-flight path — deterministic):**

1. Start the host normally.
2. In Review Mode, open an element note.
3. Capture a screenshot of a large visible area (aim for a high-resolution region).
4. If the screenshot payload is ≥ 12 MB after JSON encoding, the extension will show the
   pre-flight toast **before** sending to the host.

**Expected pre-flight toast (verbatim, fires before any network request):**

> `Screenshot too large to send (over 12 MB) — remove a capture and retry`

**Alternative (if host backstop fires instead):**

If the pre-flight did not catch it (payload under 12 MB but close), the host returns 413
or resets the connection. The toast will be one of:

> `Payload Too Large`

or

> `Host unreachable: …`

Both are visible toasts — neither is silent. The D-04 pre-flight makes the outcome
deterministic.

- [ ] **PASS** — toast appeared (pre-flight or host 413); no silent drop.

---

### Scenario 4 — SW evicted mid-flight (REL-01 path 4)

**Repro:**

**Method A (deterministic — recommended):**

1. Open `chrome://extensions`.
2. Find the stikfix extension entry.
3. Click "service worker" link to open the SW devtools pane.
4. Click **Stop** to terminate the SW.
5. Immediately switch back to the review page and click **Send** on an open note.

**Method B (idle eviction — slower):**

1. Leave Review Mode open on a mapped page but do not interact for > 30 seconds.
2. The SW will idle-evict naturally.
3. Click **Send** immediately after the eviction window.

**Expected toast (verbatim):**

> `Extension error: …`

(The `…` is `chrome.runtime.lastError.message`, e.g. `"message channel closed before a
response was received"` or `"The message port closed before a response was received"`.)

- [ ] **PASS** — toast appeared with `Extension error:` prefix; no silent drop.

---

### Scenario 5 — No host mapped for origin (REL-01 path 5)

**Repro:**

1. Navigate to a page whose origin is NOT mapped in the extension popup
   (e.g. `https://example.com` when only `http://localhost:3000` is mapped).
2. Use the FAB or popup to enter Review Mode on that unmapped page.
3. Open a note and click **Send**.

**Expected toast (verbatim):**

> `No host mapped for origin: …`

(The `…` is the origin string, e.g. `https://example.com`.)

- [ ] **PASS** — toast appeared with `No host mapped for origin:` prefix; no silent drop.

---

### Scenario D-05a — SW idle-eviction state survival + subsequent Send (D-05 regression)

**Purpose:** Confirm that state persisted in `chrome.storage.local` (origin → host map,
token) survives a full SW idle eviction and that a subsequent Send still routes correctly.

**Repro:**

1. Start the host; confirm host is running on port 39240.
2. Enter Review Mode on a mapped page and confirm at least one Send succeeds normally.
3. Wait > 30 seconds (or use Method A from Scenario 4 to stop the SW manually).
4. WITHOUT refreshing the page, open a new note and click **Send**.

**Expected behavior:**

- The SW restarts (re-hydrates from `chrome.storage.local`) and the Send succeeds.
- A new `.md` file appears in the `--root` notes directory.
- No `Extension error:` toast (the SW restarted cleanly before processing the message).

```bash
# Bash — check notes directory
ls /tmp/sfx-uat-notes/*.md
# PowerShell
Get-ChildItem $env:TEMP\sfx-uat-notes\*.md
```

- [ ] **PASS** — Send succeeded after SW eviction; note written to disk.

---

### Scenario D-05b — Multi-note serial increment 0001 → 0002 (D-05 regression)

**Purpose:** Confirm the second note gets serial `0002` (not `0001` again, not `0003`).

**Repro:**

1. Clear the notes directory (remove any existing `.md` files).
2. Enter Review Mode on a mapped page. Send a first note (free or element).
3. Send a second note.

**Verification:**

```bash
# Bash
ls /tmp/sfx-uat-notes/*.md | sort
# Expected output contains exactly two files:
# 0001-<timestamp>.md
# 0002-<timestamp>.md

# PowerShell
Get-ChildItem $env:TEMP\sfx-uat-notes\*.md | Sort-Object Name | Select-Object Name
```

- [ ] **PASS** — two files present; serials are `0001` and `0002` with no gap.

---

### Scenario D-04 — Near-12 MB screenshot pre-flight confirmation (REL-03)

**Purpose:** Confirm the client-side pre-flight check fires a toast immediately for an
over-12-MB payload without making a round-trip to the host.

**Repro (simulate large payload):**

1. On a page with a large rendered area (or a page that produces a large PNG), use the
   element picker to select a wide/tall element.
2. Click "Capture screenshot" to generate a screenshot.
3. If the encoded payload (JSON including base64 PNG) exceeds 12 MB, the pre-flight
   check fires before `chrome.runtime.sendMessage` is called.

**Verification:**

Open Chrome DevTools → Network tab. Filter for requests to `127.0.0.1:39240`. If the
pre-flight toast appears, **no request should appear in the Network tab** — the payload
was blocked entirely on the client side.

**Expected toast:**

> `Screenshot too large to send (over 12 MB) — remove a capture and retry`

- [ ] **PASS** — pre-flight toast appeared; no network request to host was made.

---

### Scenario D-02a — Rapid multi-Send spot-check (non-blocking)

**Purpose:** Confirm that quickly sending multiple notes in succession does not produce
gaps or duplicate serials. This is a manual spot-check; the automated 10-concurrent
integration test (`server.test.ts`) is the blocking gate for REL-02.

**Repro:**

1. Clear the notes directory.
2. In Review Mode, open a note, fill in a comment, and click Send rapidly 3 times in
   quick succession (open → fill → Send, repeat before prior completes).
3. Wait for all Sends to settle (all toasts shown).

**Verification:**

```bash
# Bash
ls /tmp/sfx-uat-notes/*.md | wc -l   # should be 3
ls /tmp/sfx-uat-notes/*.md | sort     # serials 0001, 0002, 0003

# PowerShell
(Get-ChildItem $env:TEMP\sfx-uat-notes\*.md).Count   # should be 3
Get-ChildItem $env:TEMP\sfx-uat-notes\*.md | Sort-Object Name | Select-Object Name
```

- [ ] **PASS (non-blocking)** — 3 files with serials 0001, 0002, 0003; no gaps or
  duplicates. Note: card UI prevents concurrent Sends from the same card (Send button is
  disabled while in-flight), so true concurrent sends require multiple open cards.

---

## Pass Criteria Summary

| Check | Pass condition |
|-------|---------------|
| Scenario 1 (host unreachable) | Toast contains `Host unreachable:` |
| Scenario 2 (wrong token) | Toast is exactly `unauthorized` |
| Scenario 2b (no token) | Toast contains `No token set for host` |
| Scenario 3 (payload too large) | Toast contains `Payload Too Large` OR `Host unreachable:` OR pre-flight `over 12 MB` toast |
| Scenario 4 (SW eviction) | Toast contains `Extension error:` |
| Scenario 5 (unmapped origin) | Toast contains `No host mapped for origin:` |
| D-05a (state survival) | Send succeeds after SW eviction; note on disk |
| D-05b (serial increment) | Files 0001 and 0002 both present; no gap |
| D-04 (pre-flight) | Pre-flight toast fires; no network request in DevTools |
| D-02a (rapid multi-Send) | 3 notes with consecutive serials 0001–0003 |

All REL-01 paths (1–5) must pass. D-05a, D-05b are required regression checks.
D-04 and D-02a are best-effort manual confirmations (non-blocking for release).

---

## On Completion

If all REL-01 checks and D-05a/D-05b pass, reply "approved" to the checkpoint.

If any check fails, describe what diverged (e.g. "Scenario 4 showed no toast after SW
Stop — silent drop") so the code can be investigated before release.

---

## Checkpoint Resolution

**Status:** Awaiting manual run.
