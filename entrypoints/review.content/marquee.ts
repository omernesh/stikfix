/**
 * stickyfix marquee mode — shadow-root scrim + interact.js drag-to-draw
 *
 * enterMarqueeMode — creates a full-viewport scrim inside the shadow-root
 * container, wires an interact.js draggable on the scrim for rubber-band
 * rect drawing, and registers an Esc-cancel handler.
 *
 * Security invariants:
 *  - DOM via createElement/textContent only — no innerHTML (INVARIANT C)
 *  - No page-derived strings in DOM (scrim is purely structural)
 *  - sfx-* namespace (INVARIANT D)
 *
 * T-06-07 (own-UI-leak ordering): the scrim is removed by cleanup() BEFORE
 * the caller calls setSfxVisibility(false) → waitTwoRafs → captureTab.
 * The caller (card.ts onCapture) is responsible for this ordering.
 */

import interact from 'interactjs';
import { buildMarqueeRect, isBelowThreshold } from '../../lib/marquee.js';

/**
 * Enter marquee/camera-capture mode.
 *
 * Appends a `.sfx-cam-scrim` div to `container`, wires interact.js draggable
 * on it (direct element ref — no context:shadowRoot needed, per card.ts:195),
 * and registers a capture-phase Esc listener.
 *
 * @param container   Shadow-root mounting container
 * @param onCapture   Called with the CSS-viewport-coord rect on successful drag (≥6px)
 * @param onCancel    Called on Esc or sub-threshold drag — NO capture
 * @returns           cleanup() function — removes scrim, listeners, interact instance
 */
export function enterMarqueeMode(
  container: HTMLElement,
  onCapture: (rect: { x: number; y: number; width: number; height: number }) => void,
  onCancel: () => void
): () => void {
  // Build scrim + marquee rect via createElement/textContent — INVARIANT C
  const scrim = document.createElement('div');
  scrim.className = 'sfx-cam-scrim';

  const rectEl = document.createElement('div');
  rectEl.className = 'sfx-cam-rect';
  scrim.appendChild(rectEl);

  container.appendChild(scrim);

  // Add crosshair cursor to :host via container class
  // (:host(.sfx-cam-mode) { cursor: crosshair } handled entirely by the scrim CSS)
  container.classList.add('sfx-cam-mode');

  let startX = 0;
  let startY = 0;

  // Esc handler — registered with capture:true so it fires before the page's handlers
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cleanup();
      onCancel();
    }
  };
  document.addEventListener('keydown', escHandler, true);

  // Wire interact.js draggable with a DIRECT element reference (no context: option)
  // This is the established pattern from card.ts:195 — direct ref works without
  // context:shadowRoot when the element is passed by reference, not by selector.
  const interactable = interact(scrim).draggable({
    inertia: false,
    listeners: {
      start(event: Interact.DragEvent) {
        startX = event.clientX;
        startY = event.clientY;
        // Show and position the rubber-band rect at the drag start point
        rectEl.style.display = 'block';
        rectEl.style.left = startX + 'px';
        rectEl.style.top = startY + 'px';
        rectEl.style.width = '0px';
        rectEl.style.height = '0px';
      },
      move(event: Interact.DragEvent) {
        const r = buildMarqueeRect(startX, startY, event.clientX, event.clientY);
        rectEl.style.left = r.x + 'px';
        rectEl.style.top = r.y + 'px';
        rectEl.style.width = r.width + 'px';
        rectEl.style.height = r.height + 'px';
      },
      end(event: Interact.DragEvent) {
        const r = buildMarqueeRect(startX, startY, event.clientX, event.clientY);
        // cleanup() removes scrim FIRST (T-06-07: scrim must not appear in screenshot)
        cleanup();
        if (isBelowThreshold(r)) {
          // CAM-03: sub-6px drag in BOTH dimensions → cancel, no capture
          onCancel();
          return;
        }
        onCapture(r);
      },
    },
  });

  /**
   * Cleanup: remove Esc listener, unset interact.js interactable, remove scrim
   * from DOM, remove cam-mode class. Idempotent (interact.unset() is safe to
   * call multiple times).
   *
   * T-06-07 MANDATORY: caller must call cleanup() BEFORE setSfxVisibility(false).
   * The scrim is removed here so it cannot appear in the captured pixels.
   */
  function cleanup(): void {
    document.removeEventListener('keydown', escHandler, true);
    interactable.unset();
    scrim.remove();
    container.classList.remove('sfx-cam-mode');
  }

  return cleanup;
}
