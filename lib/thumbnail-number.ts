/**
 * Thumbnail kind renumbering helper for stickyfix.
 *
 * renumberThumbnailKinds — pure, node:test-safe (no DOM/chrome at module level).
 *
 * INVARIANT: No top-level chrome / document / window access — pure transform,
 * importable under node:test without mocks.
 *
 * CAM-05 / WR-01: When a thumbnail is deleted, remaining entries must be
 * renumbered with the correct offset for the active path:
 *   - Free path  (baseOffset = 0): kinds start at +1 (+1, +2, +3, …)
 *   - Element path (baseOffset = 1): kinds start at +2 (+2, +3, +4, …)
 *     reserving +1 for the element auto-highlight added by _doElementSend.
 */

// ---------------------------------------------------------------------------
// renumberThumbnailKinds — pure, node:test-safe
// ---------------------------------------------------------------------------

/**
 * Mutate each item's `kind` field to reflect its new position after a splice.
 *
 * items[i].kind = "+" + (i + 1 + baseOffset)
 *
 * @param items      — array of objects with a mutable `kind: string` field
 * @param baseOffset — added to (i + 1):
 *                     0 → free path  (kinds: +1, +2, +3, …)
 *                     1 → element path (kinds: +2, +3, +4, … — reserves +1)
 */
export function renumberThumbnailKinds(
  items: { kind: string }[],
  baseOffset = 0,
): void {
  items.forEach((item, i) => {
    item.kind = `+${i + 1 + baseOffset}`;
  });
}
