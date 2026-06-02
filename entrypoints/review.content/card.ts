/**
 * stickyfix post-it card — shadow-root UI
 *
 * Single free-note card: textarea + Send/Cancel + interactjs drag on header.
 * FREE-01: opens on FAB click.
 * FREE-02: only one card active at a time (delegated to card-state.ts).
 * FREE-03: Send POSTs mode:'free' payload via SFX_SEND_ANNOTATION SW relay.
 * FREE-04 / REL-01: showToastFn is called on every result — never silent.
 *
 * Security invariants:
 *  - DOM via createElement/textContent — no innerHTML (INVARIANT C / T-04-03)
 *  - screenshots: [] ALWAYS empty for openCard/free path — D-06 (free notes are text-only)
 *  - openCard / _doSend (free path) MUST NOT import lib/capture.ts (T-04-04 / D-06);
 *    openElementCard / _doElementSend IS the first capture-trio consumer and does import it.
 *  - All host-derived strings (resp.file, resp.error) go through showToastFn
 *    which calls textContent — never innerHTML
 *  - SW is the sole HTTP client (INVARIANT B — sendMessage relay only)
 *  - sfx-* namespace (INVARIANT D)
 */

import interact from 'interactjs';
import { SFX_MSG } from '../../lib/types.js';
import type { AnnotationPayload } from '../../lib/types.js';
import { tryOpenCard, closeCardState } from './card-state.js';
import { captureTab, waitTwoRafs } from '../../lib/capture.js';
import { drawHighlightBox } from '../../lib/highlight-draw.js';
import { buildContextSummary } from '../../lib/element-context.js';
import type { ElementContext } from '../../lib/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnnotationOkResponse {
  ok: true;
  file: string;
  serial: string;
}

interface AnnotationErrResponse {
  ok: false;
  error: string;
}

type AnnotationResponse = AnnotationOkResponse | AnnotationErrResponse;

// ---------------------------------------------------------------------------
// Module-level active card DOM reference (FREE-02 DOM half)
// The DECISION is in card-state.ts (DOM-free); the DOM ref lives here.
// ---------------------------------------------------------------------------

let activeCard: HTMLElement | null = null;

// ---------------------------------------------------------------------------
// openCard — entry point called from index.ts FAB handler
// ---------------------------------------------------------------------------

/**
 * Open the post-it card inside the shadow-root container.
 *
 * FREE-02: if a card is already active, focuses its textarea and returns.
 *
 * @param container    Shadow-root container from createShadowRootUi
 * @param tabId        Current tab ID (resolved once in index.ts)
 * @param onDismiss    Called on Cancel or after Send success
 * @param showToastFn  Adapter: (msg, isError) => void (from index.ts)
 */
export function openCard(
  container: HTMLElement,
  tabId: number,
  onDismiss: () => void,
  showToastFn: (msg: string, isError: boolean) => void
): void {
  // FREE-02: single-card guard (DOM-free decision delegated to card-state.ts)
  // WR-04: if card-state says active but activeCard is null (stale flag after
  // CS re-injection without page navigation), reset state and open fresh.
  // This handles the race where onRemove/closeCard ran but the module-level
  // `active` flag was not reset because the module cache was reused.
  const decision = tryOpenCard();
  if (decision === 'focus-existing') {
    if (activeCard === null) {
      // Stale state: state-machine thinks a card is open but DOM says otherwise.
      // Reset and proceed to open a new card.
      closeCardState();
      // tryOpenCard again now that state is clean
      tryOpenCard();
    } else {
      // Genuine existing card — focus its textarea (D-02)
      const existing = activeCard.querySelector<HTMLTextAreaElement>('#sfx-card-textarea');
      existing?.focus();
      return;
    }
  }

  // Build card via createElement/textContent — INVARIANT C
  const card = document.createElement('div');
  card.id = 'sfx-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Add free note');
  card.setAttribute('aria-modal', 'false');

  // --- Header (drag handle zone) ---
  const header = document.createElement('div');
  header.className = 'sfx-card-header';

  const headerLabel = document.createElement('span');
  headerLabel.className = 'sfx-card-header-label';
  headerLabel.textContent = 'Free note';
  header.appendChild(headerLabel);

  card.appendChild(header);

  // --- Body ---
  const body = document.createElement('div');
  body.className = 'sfx-card-body';

  const textarea = document.createElement('textarea');
  textarea.id = 'sfx-card-textarea';
  textarea.setAttribute('placeholder', 'Type your note…');
  body.appendChild(textarea);

  card.appendChild(body);

  // --- Footer ---
  const footer = document.createElement('div');
  footer.className = 'sfx-card-footer';

  const sendBtn = document.createElement('button');
  sendBtn.id = 'sfx-card-send';
  sendBtn.textContent = 'Send';
  sendBtn.setAttribute('aria-label', 'Send note (empty)');
  sendBtn.disabled = true; // disabled until textarea has content

  const cancelBtn = document.createElement('button');
  cancelBtn.id = 'sfx-card-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.setAttribute('aria-label', 'Cancel note');

  footer.appendChild(sendBtn);
  footer.appendChild(cancelBtn);
  card.appendChild(footer);

  container.appendChild(card);
  activeCard = card;

  // Focus textarea on next microtask — after DOM insertion
  Promise.resolve().then(() => textarea.focus());

  // -------------------------------------------------------------------------
  // Send disabled rule: disabled when textarea empty (after trim) or in-flight
  // -------------------------------------------------------------------------
  textarea.addEventListener('input', () => {
    const hasText = textarea.value.trim().length > 0;
    sendBtn.disabled = !hasText;
    sendBtn.setAttribute('aria-label', hasText ? 'Send note' : 'Send note (empty)');
  });

  // -------------------------------------------------------------------------
  // Keyboard: Esc → cancel; Ctrl+Enter (or Cmd+Enter) → send if enabled
  // -------------------------------------------------------------------------
  textarea.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      _doClose(onDismiss);
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (!sendBtn.disabled) {
        _doSend(textarea, sendBtn, cancelBtn, tabId, onDismiss, showToastFn);
      }
    }
  });

  // -------------------------------------------------------------------------
  // Cancel button
  // -------------------------------------------------------------------------
  cancelBtn.addEventListener('click', () => {
    _doClose(onDismiss);
  });

  // -------------------------------------------------------------------------
  // Send button — relay pattern copied from chip.ts wireSendButton (lines 336-373)
  // -------------------------------------------------------------------------
  sendBtn.addEventListener('click', () => {
    _doSend(textarea, sendBtn, cancelBtn, tabId, onDismiss, showToastFn);
  });

  // -------------------------------------------------------------------------
  // Drag: interactjs on card, allowFrom header only (UI-SPEC §2)
  // Mirrors fab.ts approach — direct element ref, NOT CSS selector (Pitfall 2)
  // -------------------------------------------------------------------------
  let cx = 0;
  let cy = 0;

  try {
    interact(card).draggable({
      inertia: false,
      allowFrom: '.sfx-card-header',
      modifiers: [
        // FIX 4: 'window' is treated as a CSS selector → null → no clamping.
        // Use a function that returns the current viewport rect as the restriction.
        interact.modifiers.restrictRect({
          restriction: () => ({ left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }),
          endOnly: false,
        }),
      ],
      listeners: {
        start(event: Interact.DragEvent) {
          const el = event.target as HTMLElement;
          const style = window.getComputedStyle(el);
          const transform = style.transform;
          if (transform && transform !== 'none') {
            const matrix = new DOMMatrixReadOnly(transform);
            cx = matrix.m41;
            cy = matrix.m42;
          } else {
            cx = 0;
            cy = 0;
          }
        },
        move(event: Interact.DragEvent) {
          cx += event.dx;
          cy += event.dy;
          (event.target as HTMLElement).style.transform = `translate(${cx}px, ${cy}px)`;
        },
      },
    });
  } catch (_e) {
    // Fallback: header-restricted pointer-events drag
    _applyHeaderDrag(card, header);
  }
}

// ---------------------------------------------------------------------------
// closeCard — exported so index.ts can tear down on onRemove
// ---------------------------------------------------------------------------

/**
 * Remove the active card from the DOM and reset card-state.
 * Safe to call when no card is active.
 */
export function closeCard(): void {
  if (activeCard) {
    activeCard.remove();
    activeCard = null;
  }
  closeCardState();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _doClose(onDismiss: () => void): void {
  closeCard();
  onDismiss();
}

/**
 * Execute the Send relay — copied from chip.ts wireSendButton (lines 336-373),
 * replacing the stub comment with textarea.value.trim().
 *
 * screenshots: [] — D-06: ALWAYS empty for free notes.
 * card.ts MUST NOT import lib/capture.ts (T-04-04 / D-06).
 */
function _doSend(
  textarea: HTMLTextAreaElement,
  sendBtn: HTMLButtonElement,
  cancelBtn: HTMLButtonElement,
  tabId: number,
  onDismiss: () => void,
  showToastFn: (msg: string, isError: boolean) => void
): void {
  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending…';
  cancelBtn.disabled = true;
  textarea.readOnly = true;

  // §9.1 free-note payload (D-06 enforced: screenshots ALWAYS [])
  const payload: AnnotationPayload = {
    mode: 'free',
    comment: textarea.value.trim(),
    page: {
      url: window.location.href,
      title: document.title,
    },
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
    screenshots: [],  // D-06: ALWAYS empty for free notes — never add capture here
  };

  // SW relay — mirrors chip.ts wireSendButton exactly (INVARIANT B: no direct fetch)
  chrome.runtime.sendMessage(
    { type: SFX_MSG.SEND_ANNOTATION, tabId, payload },
    (resp: AnnotationResponse | undefined) => {
      // WR-02: guard both lastError AND resp — never silent (REL-01)
      if (chrome.runtime.lastError || !resp) {
        showToastFn(
          'Extension error: ' + (chrome.runtime.lastError?.message ?? 'no response'),
          true
        );
        // Restore controls so user can retry
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send';
        cancelBtn.disabled = false;
        textarea.readOnly = false;
        return;
      }

      if (resp.ok) {
        // resp.file is the exact host-returned filename — never client-reconstructed
        showToastFn(`wrote notes\\${resp.file}`, false);
        _doClose(onDismiss);
      } else {
        // Error: card stays open; restore controls (user can retry)
        showToastFn(resp.error, true);
        sendBtn.textContent = 'Send';
        cancelBtn.disabled = false;
        textarea.readOnly = false;
        // Re-apply disabled rule based on current textarea content (WR-02: removed
        // the preceding sendBtn.disabled=false which was immediately overwritten here)
        const hasText = textarea.value.trim().length > 0;
        sendBtn.disabled = !hasText;
      }
    }
  );
}

// ---------------------------------------------------------------------------
// openElementCard — parallel to openCard; element-note path (ELEM-07/08/09)
// ---------------------------------------------------------------------------

/**
 * Open the element-note post-it card inside the shadow-root container.
 *
 * Mirrors openCard but adds:
 *  - .sfx-card-element modifier on #sfx-card root
 *  - Header label "Element note" (not "Free note")
 *  - Read-only .sfx-ctx-header strip (role=note) above .sfx-card-body
 *  - Secondary button label "Discard note" (not "Cancel")
 *  - Element Send: hide-all → waitTwoRafs → captureTab → drawHighlightBox → restore → POST
 *
 * @param container    Shadow-root container from createShadowRootUi
 * @param tabId        Current tab ID (resolved once in index.ts)
 * @param elementCtx   Frozen ElementContext captured at picker click time
 * @param onDismiss    Called on Discard or after Send success
 * @param showToastFn  Adapter: (msg, isError) => void (from index.ts)
 * @param onSent       Optional — called ONLY after a successful Send (not on
 *                     Discard/error). Used to re-arm pick mode so the user can
 *                     immediately pick the next element (sticky-picker UX).
 */
export function openElementCard(
  container: HTMLElement,
  tabId: number,
  elementCtx: ElementContext,
  onDismiss: () => void,
  showToastFn: (msg: string, isError: boolean) => void,
  onSent?: () => void
): void {
  // FREE-02 compatible: single-card guard (shared with openCard via card-state.ts)
  const decision = tryOpenCard();
  if (decision === 'focus-existing') {
    if (activeCard === null) {
      closeCardState();
      tryOpenCard();
    } else {
      const existing = activeCard.querySelector<HTMLTextAreaElement>('#sfx-card-textarea');
      existing?.focus();
      return;
    }
  }

  // Build card via createElement/textContent — INVARIANT C
  const card = document.createElement('div');
  card.id = 'sfx-card';
  card.className = 'sfx-card-element';   // element-mode modifier
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Add element note');
  card.setAttribute('aria-modal', 'false');

  // --- Header (drag handle zone) ---
  const header = document.createElement('div');
  header.className = 'sfx-card-header';

  const headerLabel = document.createElement('span');
  headerLabel.className = 'sfx-card-header-label';
  headerLabel.textContent = 'Element note';   // differs from free-note card
  header.appendChild(headerLabel);

  card.appendChild(header);

  // --- Context header (read-only strip — D-03 / ELEM-07) ---
  // textContent ONLY — page-derived strings; NEVER innerHTML (T-05-09)
  const ctxHeader = document.createElement('div');
  ctxHeader.className = 'sfx-ctx-header';
  ctxHeader.setAttribute('role', 'note');
  ctxHeader.setAttribute('aria-label', 'Element context');

  const ctxText = document.createElement('span');
  ctxText.className = 'sfx-ctx-header-text';
  ctxText.textContent = buildContextSummary(elementCtx);   // textContent — INVARIANT C
  ctxHeader.appendChild(ctxText);

  card.appendChild(ctxHeader);

  // --- Body ---
  const body = document.createElement('div');
  body.className = 'sfx-card-body';

  const textarea = document.createElement('textarea');
  textarea.id = 'sfx-card-textarea';
  textarea.setAttribute('placeholder', 'Type your note…');
  body.appendChild(textarea);

  card.appendChild(body);

  // --- Footer ---
  const footer = document.createElement('div');
  footer.className = 'sfx-card-footer';

  const sendBtn = document.createElement('button');
  sendBtn.id = 'sfx-card-send';
  sendBtn.textContent = 'Send';
  sendBtn.setAttribute('aria-label', 'Send note (empty)');
  sendBtn.disabled = true;   // disabled until textarea has content

  const discardBtn = document.createElement('button');
  discardBtn.id = 'sfx-card-cancel';
  discardBtn.textContent = 'Discard note';   // differs from free-note "Cancel"
  discardBtn.setAttribute('aria-label', 'Discard element note');

  footer.appendChild(sendBtn);
  footer.appendChild(discardBtn);
  card.appendChild(footer);

  container.appendChild(card);
  activeCard = card;

  // Focus textarea on next microtask — after DOM insertion
  Promise.resolve().then(() => textarea.focus());

  // -------------------------------------------------------------------------
  // Send disabled rule: disabled when textarea empty (after trim) or in-flight
  // Context header does NOT affect Send enablement (D-03)
  // -------------------------------------------------------------------------
  textarea.addEventListener('input', () => {
    const hasText = textarea.value.trim().length > 0;
    sendBtn.disabled = !hasText;
    sendBtn.setAttribute('aria-label', hasText ? 'Send note' : 'Send note (empty)');
  });

  // -------------------------------------------------------------------------
  // Keyboard: Esc → discard; Ctrl+Enter / Cmd+Enter → send if enabled
  // -------------------------------------------------------------------------
  textarea.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      _doClose(onDismiss);
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (!sendBtn.disabled) {
        _doElementSend(textarea, sendBtn, discardBtn, tabId, elementCtx, container, onDismiss, showToastFn, onSent);
      }
    }
  });

  // -------------------------------------------------------------------------
  // Discard button
  // -------------------------------------------------------------------------
  discardBtn.addEventListener('click', () => {
    _doClose(onDismiss);
  });

  // -------------------------------------------------------------------------
  // Send button
  // -------------------------------------------------------------------------
  sendBtn.addEventListener('click', () => {
    _doElementSend(textarea, sendBtn, discardBtn, tabId, elementCtx, container, onDismiss, showToastFn, onSent);
  });

  // -------------------------------------------------------------------------
  // Drag: interactjs on card, allowFrom header only (UI-SPEC §2)
  // Mirrors openCard drag block exactly — only element refs differ
  // -------------------------------------------------------------------------
  let cx = 0;
  let cy = 0;

  try {
    interact(card).draggable({
      inertia: false,
      allowFrom: '.sfx-card-header',
      modifiers: [
        interact.modifiers.restrictRect({
          restriction: () => ({ left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }),
          endOnly: false,
        }),
      ],
      listeners: {
        start(event: Interact.DragEvent) {
          const el = event.target as HTMLElement;
          const style = window.getComputedStyle(el);
          const transform = style.transform;
          if (transform && transform !== 'none') {
            const matrix = new DOMMatrixReadOnly(transform);
            cx = matrix.m41;
            cy = matrix.m42;
          } else {
            cx = 0;
            cy = 0;
          }
        },
        move(event: Interact.DragEvent) {
          cx += event.dx;
          cy += event.dy;
          (event.target as HTMLElement).style.transform = `translate(${cx}px, ${cy}px)`;
        },
      },
    });
  } catch (_e) {
    // Fallback: header-restricted pointer-events drag
    _applyHeaderDrag(card, header);
  }
}

/**
 * Execute the element-note Send with capture pipeline (ELEM-08 / D-02a):
 *  1. Disable controls (Sending…)
 *  2. Hide all sfx surfaces synchronously (display:none)
 *  3. waitTwoRafs()
 *  4. captureTab(tabId) → full viewport dataUrl
 *  5. Build canvas, draw image, drawHighlightBox at frozenRect×dpr
 *  6. Restore sfx visibility
 *  7. Assemble mode:'element' AnnotationPayload
 *  8. chrome.runtime.sendMessage(SFX_SEND_ANNOTATION)
 *  9. Toast on success/failure; re-enable controls on failure
 *
 * frozenRect = elementCtx.rect — captured at click time, NEVER re-measured (Pitfall 2).
 * Own-UI is absent from the captured image (Pitfall 3 / T-05-13).
 */
function _doElementSend(
  textarea: HTMLTextAreaElement,
  sendBtn: HTMLButtonElement,
  discardBtn: HTMLButtonElement,
  tabId: number,
  elementCtx: ElementContext,
  container: HTMLElement,
  onDismiss: () => void,
  showToastFn: (msg: string, isError: boolean) => void,
  onSent?: () => void
): void {
  // Step 1: disable controls
  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending…';
  discardBtn.disabled = true;
  textarea.readOnly = true;

  // Freeze rect at click time — never re-measure (Pitfall 2)
  const frozenRect = elementCtx.rect ?? { x: 0, y: 0, width: 0, height: 0 };

  // Helper: restore controls on failure
  function restoreControls(): void {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send';
    discardBtn.disabled = false;
    textarea.readOnly = false;
  }

  // Helper: hide/show all sfx surfaces (card, chip, fab, hover overlay)
  function setSfxVisibility(visible: boolean): void {
    const display = visible ? '' : 'none';
    // card (activeCard — the element card itself)
    if (activeCard) activeCard.style.display = display;
    // chip
    const chip = container.querySelector<HTMLElement>('#sfx-chip');
    if (chip) chip.style.display = display;
    // FAB
    const fab = container.querySelector<HTMLElement>('#sfx-fab');
    if (fab) fab.style.display = display;
    // hover-highlight overlay (may be absent if pick mode exited)
    const hoverOverlay = container.querySelector<HTMLElement>('.sfx-hover-highlight');
    if (hoverOverlay) hoverOverlay.style.display = display;
  }

  // Step 2: hide all sfx surfaces synchronously (own-UI must be absent from capture)
  setSfxVisibility(false);

  // Steps 3-6: async capture sequence
  (async () => {
    let plus1DataUrl: string;
    try {
      // Step 3: wait two rAFs — ensures repaint before capture (Pitfall 3)
      await waitTwoRafs();

      // Step 4: capture full viewport via SW relay (SFX_CAPTURE_TAB)
      const dataUrl = await captureTab(tabId);

      // Step 5: draw highlight box onto canvas at frozen element rect
      const img = new Image();
      const canvas = await new Promise<HTMLCanvasElement>((resolve, reject) => {
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const ctx2d = c.getContext('2d');
          if (!ctx2d) { reject(new Error('No 2D context')); return; }
          ctx2d.drawImage(img, 0, 0);
          drawHighlightBox(c, frozenRect, window.devicePixelRatio);
          resolve(c);
        };
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = dataUrl;
      });

      plus1DataUrl = canvas.toDataURL('image/png');
    } catch (_capErr) {
      // Step 6 (capture fail path): restore UI visibility first, then controls
      setSfxVisibility(true);
      restoreControls();
      showToastFn('Screenshot capture failed — note not sent', true);
      return;
    }

    // Step 6 (success path): restore sfx UI visibility
    setSfxVisibility(true);

    // Step 7: assemble mode:'element' payload
    const payload: AnnotationPayload = {
      mode: 'element',
      comment: textarea.value.trim(),
      page: {
        url: window.location.href,
        title: document.title,
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      element: elementCtx,
      screenshots: [
        {
          kind: '+1',
          mime: 'image/png',
          dataUrl: plus1DataUrl,
          rect: {
            x: frozenRect.x,
            y: frozenRect.y,
            width: frozenRect.width,
            height: frozenRect.height,
          },
        },
      ],
    };

    // Step 8: SW relay (INVARIANT B — no direct fetch)
    chrome.runtime.sendMessage(
      { type: SFX_MSG.SEND_ANNOTATION, tabId, payload },
      (resp: AnnotationResponse | undefined) => {
        // Step 9: guard both lastError AND resp — never silent (REL-01)
        if (chrome.runtime.lastError || !resp) {
          showToastFn(
            'Extension error: ' + (chrome.runtime.lastError?.message ?? 'no response'),
            true
          );
          restoreControls();
          // Re-apply disabled rule (mirrors _doSend pattern)
          sendBtn.disabled = textarea.value.trim().length === 0;
          return;
        }

        if (resp.ok) {
          showToastFn(`wrote notes\\${resp.file}`, false);
          _doClose(onDismiss);
          // Sticky-picker UX: re-arm pick mode after a successful element Send
          // so the user can immediately pick the next element (success only —
          // never on Discard/error).
          onSent?.();
        } else {
          showToastFn(resp.error, true);
          restoreControls();
          // Re-apply disabled rule (mirrors _doSend pattern)
          sendBtn.disabled = textarea.value.trim().length === 0;
        }
      }
    );
  })();
}

/**
 * Fallback drag for card via pointer events (header-restricted).
 * Only used if interactjs throws during initialization.
 * Mirrors chip.ts makeDraggable approach adapted for header-only initiation.
 */
function _applyHeaderDrag(card: HTMLElement, header: HTMLElement): void {
  let isDragging = false;
  let startPtrX = 0;
  let startPtrY = 0;
  let startTransX = 0;
  let startTransY = 0;

  header.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return;
    card.setPointerCapture(e.pointerId);
    isDragging = true;
    startPtrX = e.clientX;
    startPtrY = e.clientY;

    const style = window.getComputedStyle(card);
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

  card.addEventListener('pointermove', (e: PointerEvent) => {
    if (!isDragging || !card.hasPointerCapture(e.pointerId)) return;
    const dx = e.clientX - startPtrX;
    const dy = e.clientY - startPtrY;
    card.style.transform = `translate(${startTransX + dx}px, ${startTransY + dy}px)`;
  });

  card.addEventListener('pointerup', (e: PointerEvent) => {
    if (!isDragging) return;
    isDragging = false;
    card.releasePointerCapture(e.pointerId);
  });

  card.addEventListener('pointercancel', (e: PointerEvent) => {
    if (!isDragging) return;
    isDragging = false;
    try { card.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  });
}
