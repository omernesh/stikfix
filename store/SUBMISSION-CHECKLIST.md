---
version: 1.1.1
last_updated: 2026-06-17
---

# Store Submission Checklist — stickyfix v1.1.1

Use this checklist for both Chrome Web Store and Firefox AMO submissions. Complete the Pre-Submit section once; the store-specific sections apply independently.

---

## Pre-Submit (both stores)

### Version & code

- [ ] Version in `wxt.config.ts` → `manifest.version` matches the intended release (`1.1.1`)
- [ ] `npm run check` passes (tsc, clean-room check, host smoke test, all tests)
- [ ] `CHANGELOG.md` is up to date with the release entry

### Chrome build

- [ ] `npm run build` completes without errors
- [ ] Output at `.output/chrome-mv3/` — verify `manifest.json` is present and version matches
- [ ] Zip the directory: `cd .output && zip -r stickyfix-1.1.1-chrome.zip chrome-mv3/`
- [ ] Verify zip size is under 10 MB (CWS limit)

### Firefox build

- [ ] `npm run build:firefox` completes without errors
- [ ] Output at `.output/firefox-mv*/` — verify `manifest.json` and `browser_specific_settings.gecko.id` = `stickyfix@stickyfix.dev`
- [ ] Zip the directory: `cd .output && zip -r stickyfix-1.1.1-firefox.zip firefox-mv*/`
- [ ] Prepare a source code zip for AMO (required for bundled extensions): `git archive HEAD --format=zip -o stickyfix-1.1.1-source.zip`

### Icons & screenshots

Screenshots are prepared by a separate agent in `store/chrome-web-store/screenshots/` and `store/firefox-amo/screenshots/` and promo tiles in `store/promo/`. Verify the following are present before uploading:

- [ ] `store/chrome-web-store/screenshots/` — 1280×800 or 640×400 PNG/JPEG, at least 1, up to 5
- [ ] `store/promo/promo-440x280.png` — small promo tile (CWS: 440×280 PNG, required)
- [ ] `store/promo/promo-920x680.png` — large promo tile (CWS: 920×680 PNG, optional)
- [ ] `store/firefox-amo/screenshots/` — at least 1 screenshot (AMO: max 2048×2048, JPEG/PNG/GIF)
- [ ] Extension icons at `public/icon/`: 16.png, 32.png, 48.png, 128.png (all must be present in the zip)

### Privacy policy

- [ ] `store/privacy-policy.md` is committed to the repo
- [ ] Privacy policy is reachable at a public URL — recommended: `https://github.com/omernesh/stickyfix/blob/main/store/privacy-policy.md`
- [ ] Copy that URL — you'll need it for both CWS and AMO fields

---

## Chrome Web Store Submission

### Account & setup

- [ ] Sign in to https://chrome.google.com/webstore/devconsole
- [ ] One-time $5 developer registration fee paid (if not already done)
- [ ] Choose "Add new item" and upload `stickyfix-1.1.1-chrome.zip`

### Listing fields (copy from `store/chrome-web-store/listing.md`)

- [ ] **Name:** `stickyfix`
- [ ] **Summary:** (≤ 132 chars) copy from listing.md
- [ ] **Detailed description:** copy from listing.md (plain text; CWS strips markdown)
- [ ] **Category:** Developer Tools
- [ ] **Language:** English
- [ ] **Tags / keywords:** (up to 5) developer tools, AI coding agent, UI review, sticky notes, code review

### Graphics

- [ ] Upload at least one screenshot (1280×800 or 640×400)
- [ ] Upload small promo tile: `store/promo/promo-440x280.png` (440×280 PNG — REQUIRED for listing to go live)
- [ ] Upload large promo tile if available: `store/promo/promo-920x680.png` (optional)
- [ ] Verify icon displays correctly (pulled from manifest)

### Privacy & permissions

- [ ] **Privacy policy URL:** `https://github.com/omernesh/stickyfix/blob/main/store/privacy-policy.md`
- [ ] **Single purpose:** paste from `store/chrome-web-store/permission-justifications.md` → Single Purpose Statement
- [ ] **Permission justifications:** for each permission CWS flags, paste the justification from `store/chrome-web-store/permission-justifications.md`
- [ ] **Remote code:** answer "No" + explanation (copy from permission-justifications.md → Remote Code Statement)
- [ ] **Data practices:** answer all data-use questions → No to all (copy from permission-justifications.md → Data Use Disclosures)

### Reviewer notes

- [ ] Paste the "Reviewer Notes" block from `store/chrome-web-store/listing.md` into the "Notes for reviewers" field
- [ ] Note explicitly: the companion host (`npx stickyfix init`) must be installed before the extension can be fully exercised; link the npm package: https://www.npmjs.com/package/stickyfix
- [ ] Note explicitly: `<all_urls>` is an optional_host_permission requested on demand, not at install time

### Publish

- [ ] Review all fields for accuracy
- [ ] Submit for review
- [ ] Expected review time: 1–3 business days (longer if flagged for manual review due to `nativeMessaging` or `<all_urls>`)
- [ ] Monitor the developer console for reviewer questions

---

## Firefox AMO Submission

### Account & setup

- [ ] Sign in to https://addons.mozilla.org/developers/
- [ ] Choose "Submit a New Add-on"
- [ ] Upload `stickyfix-1.1.1-firefox.zip`
- [ ] When prompted about source code: select "Yes, I have source code to submit" and upload `stickyfix-1.1.1-source.zip`

### Listing fields (copy from `store/firefox-amo/listing.md`)

- [ ] **Name:** `stickyfix`
- [ ] **Add-on ID:** `stickyfix@stickyfix.dev` (must match `browser_specific_settings.gecko.id`)
- [ ] **Summary:** copy from listing.md
- [ ] **About this extension:** copy from listing.md → "About This Extension" section
- [ ] **Homepage:** `https://github.com/omernesh/stickyfix`
- [ ] **Support email:** `omernesher@gmail.com`
- [ ] **Support site:** `https://github.com/omernesh/stickyfix/issues`
- [ ] **License:** MIT
- [ ] **Tags:** developer-tools, AI, code-review, web-development, productivity

### Screenshots

- [ ] Upload at least 1 screenshot from `store/firefox-amo/screenshots/`

### Source code note

- [ ] AMO requires source code for minified/bundled extensions — upload `stickyfix-1.1.1-source.zip`
- [ ] In the build instructions field, paste from `store/firefox-amo/listing.md` → Source Code Submission Note

### Reviewer notes

- [ ] Paste the "Reviewer Notes for AMO" block from `store/firefox-amo/listing.md` into the AMO reviewer notes field
- [ ] Note: Firefox native messaging uses `allowed_extensions` (add-on ID), not `allowed_origins`
- [ ] Note: companion host (`npx stickyfix init`) must be installed before extension can be fully exercised

### Review process

- [ ] AMO review can take days to weeks for new submissions; automated validation is immediate
- [ ] Manual review is likely because of `nativeMessaging` permission
- [ ] Monitor AMO developer hub for reviewer messages

---

## Companion Host — npm Package

The extension is useless without the companion host. Before promoting either store listing, verify:

- [ ] `stickyfix` npm package at https://www.npmjs.com/package/stickyfix reflects the current version
- [ ] `npx stickyfix init --root <path>` works on Windows, macOS, and Linux
- [ ] The npm README links to the CWS listing URL (update after CWS approval)

The extension listing and the npm package are tightly coupled — keep them in sync. If a host update changes the protocol or token format, bump both versions and update both store listings.

---

## Known Reviewer Caveats

1. **`nativeMessaging` permission** — Both stores may flag this for manual review. The justification is in `store/chrome-web-store/permission-justifications.md`. The host is open source, on npm, and the communication protocol is entirely local.

2. **`<all_urls>` optional permission** — CWS may ask why this is needed. Answer: the extension is a developer tool that must work on any URL the developer chooses to review; a fixed host-pattern list is not feasible. It is optional and requested only on demand.

3. **Companion host dependency** — Reviewers cannot fully exercise the note-capture flow without running `npx stickyfix init`. The reviewer notes template in both listing files explains this. Offer to assist reviewers via the support email if needed.

4. **AMO source review** — AMO reviewers will examine the source zip. Ensure `npm run build:firefox` from the source zip produces the submitted artifact. Test this before submitting.
