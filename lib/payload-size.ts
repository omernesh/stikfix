/**
 * Payload-size pre-flight check for stikfix.
 *
 * exceedsBodyCap — pure, node:test-safe (no DOM/chrome at module level).
 *
 * INVARIANT: No top-level chrome / document / window access — all browser
 * API use is inside function bodies so exceedsBodyCap imports cleanly
 * under node:test. (TextEncoder is a global in both content scripts and
 * Node 20+, so it needs no import and is node:test-safe.)
 *
 * D-04: Pre-flight encoded-size check before POST. If the payload exceeds
 * the host cap, the content script shows a toast immediately and skips the
 * wasted ~12 MB SW round-trip. The host 413 remains the downstream backstop.
 */

// ---------------------------------------------------------------------------
// MAX_BODY_BYTES — mirrors host/src/security.ts:12 exactly
// ---------------------------------------------------------------------------

/** Hard cap for the request body in bytes (12 MB), matching the host guard. */
export const MAX_BODY_BYTES = 12 * 1024 * 1024; // 12 MB hard cap (D-04, mirror host/src/security.ts:12)

// ---------------------------------------------------------------------------
// encodedBodyBytes — pure, node:test-safe
// ---------------------------------------------------------------------------

/**
 * Return the UTF-8 byte length of a JSON body string.
 *
 * TextEncoder.encode() counts the same bytes the host's Node HTTP server
 * counts — do NOT back-calculate raw image bytes from base64; the host
 * counts the full serialised JSON body bytes.
 */
export function encodedBodyBytes(jsonBody: string): number {
  return new TextEncoder().encode(jsonBody).length;
}

// ---------------------------------------------------------------------------
// exceedsBodyCap — pure, node:test-safe
// ---------------------------------------------------------------------------

/**
 * Return true if the serialised JSON body exceeds the host's 12 MB cap.
 *
 * Uses strict greater-than (>) so the exact boundary is accepted, matching
 * the host's rejection comparison in security.ts: `body.length > MAX_BODY`.
 *
 * @param jsonBody — the JSON-serialised request body string (JSON.stringify(payload))
 */
export function exceedsBodyCap(jsonBody: string): boolean {
  return encodedBodyBytes(jsonBody) > MAX_BODY_BYTES;
}
