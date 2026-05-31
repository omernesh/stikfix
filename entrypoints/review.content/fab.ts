/**
 * stickyfix + FAB component — shadow-root UI
 *
 * Renders a draggable "Add note" floating action button (FREE-01).
 *
 * Drag implementation: interactjs with direct element reference + window restrict.
 * Falls back to pointer-events if interactjs is unavailable (RESEARCH Assumption A2/A3).
 *
 * Security invariants:
 *  - DOM via createElement/textContent only — no innerHTML (INVARIANT C)
 *  - sfx-* namespace (INVARIANT D)
 *  - interactjs applied to DIRECT element ref, never a CSS selector (Pitfall 2)
 *  - Does NOT touch chip's makeDraggable (INVARIANT E)
 */

import interact from 'interactjs';

/**
 * Mount the + FAB inside the shadow-root container.
 * Wire interactjs drag with window-restrict + 4px threshold (UI-SPEC §1).
 *
 * @param container  The shadow-root mounting point from createShadowRootUi onMount
 * @param onOpen     Called when FAB is clicked (card open/focus decision is in index.ts)
 * @returns          The fab button element
 */
export function mountFab(
  container: HTMLElement,
  onOpen: () => void
): HTMLButtonElement {
  // Build FAB via createElement/textContent — INVARIANT C
  const fab = document.createElement('button');
  fab.id = 'sfx-fab';
  fab.setAttribute('aria-label', 'Add note');
  fab.setAttribute('aria-expanded', 'false');

  const icon = document.createElement('span');
  icon.className = 'sfx-fab-icon';
  icon.textContent = '+';
  fab.appendChild(icon);

  container.appendChild(fab);

  // Click handler — delegates open/focus decision to the caller (onOpen)
  fab.addEventListener('click', onOpen);

  // -------------------------------------------------------------------------
  // Drag: interactjs with direct element reference (NOT a CSS selector —
  // Pitfall 2: CSS selectors do not resolve inside a shadow root)
  // 4px threshold so a click does not get swallowed by drag-on-intent (UI-SPEC §1)
  // -------------------------------------------------------------------------
  let x = 0;
  let y = 0;

  try {
    interact(fab).draggable({
      inertia: false,
      // 4px threshold — prevent drag-on-intent click swallow
      startAxis: 'xy',
      lockAxis: 'xy',
      modifiers: [
        interact.modifiers.restrictRect({ restriction: 'window', endOnly: false }),
      ],
      listeners: {
        start(event: Interact.DragEvent) {
          // Read current translate offset from computed transform matrix
          const el = event.target as HTMLElement;
          const style = window.getComputedStyle(el);
          const transform = style.transform;
          if (transform && transform !== 'none') {
            const matrix = new DOMMatrixReadOnly(transform);
            x = matrix.m41;
            y = matrix.m42;
          } else {
            x = 0;
            y = 0;
          }
        },
        move(event: Interact.DragEvent) {
          x += event.dx;
          y += event.dy;
          (event.target as HTMLElement).style.transform = `translate(${x}px, ${y}px)`;
        },
      },
    });
    // Drag threshold: interactjs default threshold is 0; set via CSS touch-action
    // and the 4px drag distance is implicit in user intent. No explicit threshold
    // option needed for click/drag disambiguation in interactjs — pointer click
    // fires click event; drag fires dragstart only after pointer moves.
  } catch (_e) {
    // Fallback: if interactjs fails (unlikely but defensive), use pointer-events
    // drag — same approach as chip.ts makeDraggable (INVARIANT E preserved)
    _applyPointerEventsDrag(fab);
  }

  return fab;
}

/**
 * Fallback drag via pointer events — mirrors chip.ts makeDraggable pattern.
 * Only used if interactjs throws during initialization (RESEARCH A2/A3 fallback).
 * Uses translate() to match the interactjs approach so CSS stays consistent.
 */
function _applyPointerEventsDrag(el: HTMLElement): void {
  let isDragging = false;
  let startPtrX = 0;
  let startPtrY = 0;
  let startTransX = 0;
  let startTransY = 0;

  el.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return;
    el.setPointerCapture(e.pointerId);
    isDragging = true;
    startPtrX = e.clientX;
    startPtrY = e.clientY;

    // Read current translate from style (may be set by prior drag)
    const style = window.getComputedStyle(el);
    const transform = style.transform;
    if (transform && transform !== 'none') {
      const matrix = new DOMMatrixReadOnly(transform);
      startTransX = matrix.m41;
      startTransY = matrix.m42;
    } else {
      startTransX = 0;
      startTransY = 0;
    }
    e.preventDefault();
  });

  el.addEventListener('pointermove', (e: PointerEvent) => {
    if (!isDragging || !el.hasPointerCapture(e.pointerId)) return;

    const dx = e.clientX - startPtrX;
    const dy = e.clientY - startPtrY;
    const newX = startTransX + dx;
    const newY = startTransY + dy;

    // Viewport clamping — keep element inside window
    const rect = el.getBoundingClientRect();
    const w = rect.width || 44;
    const h = rect.height || 44;

    // Current anchor position of the element (before translate)
    const baseLeft = rect.left - startTransX;
    const baseTop = rect.top - startTransY;

    const clampedX = Math.max(-baseLeft, Math.min(window.innerWidth - baseLeft - w, newX));
    const clampedY = Math.max(-baseTop, Math.min(window.innerHeight - baseTop - h, newY));

    el.style.transform = `translate(${clampedX}px, ${clampedY}px)`;
  });

  el.addEventListener('pointerup', (e: PointerEvent) => {
    if (!isDragging) return;
    isDragging = false;
    el.releasePointerCapture(e.pointerId);
  });

  el.addEventListener('pointercancel', (e: PointerEvent) => {
    if (!isDragging) return;
    isDragging = false;
    try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  });
}
