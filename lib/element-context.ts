/**
 * Element context extraction utilities for stickyfix.
 *
 * captureElementContext — pure, node:test-safe (all DOM/chrome inside function bodies).
 * buildContextSummary — pure, node:test-safe.
 * CURATED_STYLE_PROPS — exported const array.
 *
 * INVARIANT: No top-level chrome / document / window access — all browser
 * API use is inside function bodies so exported functions import cleanly
 * under node:test.
 */

import { finder } from '@medv/finder';
import type { ElementContext } from './types.js';

// ---------------------------------------------------------------------------
// CURATED_STYLE_PROPS — the ~25 layout/visual properties worth capturing
// ---------------------------------------------------------------------------

/**
 * The subset of computed CSS properties captured per element.
 * ~25 props: enough to understand layout intent without blowing payload size.
 * Based on 05-RESEARCH D-04 / 05-CONTEXT D-03.
 */
export const CURATED_STYLE_PROPS = [
  'display',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'width',
  'height',
  'margin',
  'padding',
  'border',
  'box-sizing',
  'flex-direction',
  'justify-content',
  'align-items',
  'gap',
  'grid-template-columns',
  'z-index',
  'overflow',
  'color',
  'background-color',
  'font-size',
  'font-weight',
  'font-family',
  'line-height',
  'opacity',
  'visibility',
] as const;

// ---------------------------------------------------------------------------
// buildSelector — wrap @medv/finder with fallback
// ---------------------------------------------------------------------------

/**
 * Generate a unique CSS selector for an element.
 * Falls back to `el.tagName.toLowerCase()` if @medv/finder throws
 * (e.g. element is not attached to a document, or document has no unique path).
 */
function buildSelector(el: Element): string {
  try {
    // @medv/finder attr override: always accept data-testid, data-cy, data-qa
    return finder(el, {
      attr: (name: string, value: string) => {
        if (name === 'data-testid' || name === 'data-cy' || name === 'data-qa') return true;
        // Delegate to default: only accept id attribute by default
        return name === 'id' && /^[a-z][\w-]*$/i.test(value);
      },
    });
  } catch {
    return el.tagName.toLowerCase();
  }
}

// ---------------------------------------------------------------------------
// getReactComponentName — best-effort React fiber walk
// ---------------------------------------------------------------------------

/**
 * Walk the React fiber to find the nearest named PascalCase component.
 * Returns undefined if no React fiber key present, or no named component found.
 *
 * INVARIANT: maxSteps guard (~50) + circular break prevents infinite loop (T-05-03).
 */
function getReactComponentName(el: Element): string | undefined {
  try {
    // Find the fiber key: __reactFiber$ (React 17+) or __reactInternalInstance$ (React 16)
    const fiberKey = Object.keys(el).find(
      k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
    );
    if (!fiberKey) return undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fiber: any = (el as unknown as Record<string, unknown>)[fiberKey];
    const seen = new Set<unknown>();
    let steps = 0;
    const MAX_STEPS = 50;

    while (fiber && steps < MAX_STEPS) {
      if (seen.has(fiber)) break;  // circular ref guard
      seen.add(fiber);
      steps++;

      const name: unknown = fiber?.type?.name ?? fiber?.type?.displayName;
      if (typeof name === 'string' && name.length > 2 && /^[A-Z]/.test(name)) {
        return name;
      }
      fiber = fiber.return;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// nearestTestId — walk own then ancestors for data-testid
// ---------------------------------------------------------------------------

/**
 * Return the nearest `data-testid` attribute value, starting from `el`
 * and walking up through `parentElement` ancestors.
 * Returns undefined when none found in the chain.
 */
function nearestTestId(el: Element | null): string | undefined {
  let current: Element | null = el;
  while (current) {
    const val = current.getAttribute('data-testid');
    if (val) return val;
    current = current.parentElement;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// captureElementContext — main extraction function
// ---------------------------------------------------------------------------

/**
 * Capture rich context from a DOM element for the annotation payload.
 * All browser API calls (getComputedStyle, getBoundingClientRect, etc.)
 * are INSIDE this function body — safe to import under node:test.
 *
 * @param el  The target DOM element (passed in — no document.querySelector here)
 * @returns   ElementContext matching the host/src/types.ts contract exactly
 */
export function captureElementContext(el: Element): ElementContext {
  // --- selector ---
  const selector = buildSelector(el);

  // --- tag ---
  const tag = el.tagName.toLowerCase();

  // --- id (omit when empty) ---
  const id = (el as HTMLElement).id || undefined;

  // --- classList (omit when empty) ---
  const classArr = [...el.classList];
  const classList = classArr.length > 0 ? classArr : undefined;

  // --- role / ariaLabel ---
  const role = el.getAttribute('role') ?? undefined;
  const ariaLabel = el.getAttribute('aria-label') ?? undefined;

  // --- text (innerText ?? textContent, collapse whitespace, truncate 1000) ---
  // Also append any extra aria-* attrs as [aria-key=value] suffix
  const rawText: string =
    (el as HTMLElement).innerText ??
    el.textContent ??
    '';
  let text: string | undefined = rawText.replace(/\s+/g, ' ').trim();

  // Append extra aria-* attributes (beyond aria-label which is its own field)
  const ariaExtras: string[] = [];
  for (const attrName of el.getAttributeNames()) {
    if (attrName.startsWith('aria-') && attrName !== 'aria-label') {
      const val = el.getAttribute(attrName);
      if (val !== null) {
        ariaExtras.push(`${attrName}=${val}`);
      }
    }
  }
  if (ariaExtras.length > 0) {
    text = (text ? text + ' ' : '') + '[' + ariaExtras.join(', ') + ']';
  }

  text = text.length > 0 ? text.slice(0, 1000) : undefined;

  // --- rect (rounded integers) ---
  const domRect = el.getBoundingClientRect();
  const rect = {
    x: Math.round(domRect.x),
    y: Math.round(domRect.y),
    width: Math.round(domRect.width),
    height: Math.round(domRect.height),
  };

  // --- computedStyles (only CURATED_STYLE_PROPS, browser-only — graceful skip under node:test) ---
  let computedStyles: Record<string, string> | undefined;
  try {
    // typeof window guard: window exists in browser, throws/undefined in node:test
    if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
      const cs = window.getComputedStyle(el);
      const styles: Record<string, string> = {};
      for (const prop of CURATED_STYLE_PROPS) {
        const val = cs.getPropertyValue(prop);
        if (val) styles[prop] = val;
      }
      if (Object.keys(styles).length > 0) computedStyles = styles;
    }
  } catch {
    // gracefully skip
  }

  // --- outerHTML (sliced to 2000) ---
  const rawHtml = el.outerHTML ?? '';
  const outerHTML = rawHtml.length > 0 ? rawHtml.slice(0, 2000) : undefined;

  // --- dataset (omit when empty) ---
  const datasetEntries = Object.entries((el as HTMLElement).dataset ?? {}) as [string, string][];
  const dataset = datasetEntries.length > 0
    ? Object.fromEntries(datasetEntries)
    : undefined;

  // --- reactComponent (best-effort) ---
  const reactComponent = getReactComponentName(el);

  // --- nearestTestId ---
  const testId = nearestTestId(el);

  const ctx: ElementContext = {
    selector,
    tag,
  };

  if (id !== undefined) ctx.id = id;
  if (classList !== undefined) ctx.classList = classList;
  if (role !== undefined) ctx.role = role;
  if (ariaLabel !== undefined) ctx.ariaLabel = ariaLabel;
  if (text !== undefined) ctx.text = text;
  ctx.rect = rect;
  if (computedStyles !== undefined) ctx.computedStyles = computedStyles;
  if (outerHTML !== undefined) ctx.outerHTML = outerHTML;
  if (dataset !== undefined) ctx.dataset = dataset;
  if (reactComponent !== undefined) ctx.reactComponent = reactComponent;
  if (testId !== undefined) ctx.nearestTestId = testId;

  return ctx;
}

// ---------------------------------------------------------------------------
// buildContextSummary — human-readable one-liner for the card header
// ---------------------------------------------------------------------------

/**
 * Build a concise human-readable summary of an ElementContext.
 * Format: `shortSelector · "text" · <Component> · WxH`
 * Absent parts are omitted; parts joined by ` · `.
 *
 * shortSelector: id > class > tag, capped at 20 chars.
 */
export function buildContextSummary(ctx: ElementContext): string {
  // Build shortSelector (≤20 chars)
  let shortSelector: string = ctx.tag ?? 'el';
  if (ctx.id) {
    const candidate = `${ctx.tag}#${ctx.id}`;
    shortSelector = candidate.length <= 20 ? candidate : ctx.tag;
  } else if (ctx.classList && ctx.classList.length > 0) {
    const candidate = `${ctx.tag}.${ctx.classList[0]}`;
    shortSelector = candidate.length <= 20 ? candidate : ctx.tag;
  }
  // Clamp to 20 chars
  if (shortSelector.length > 20) {
    shortSelector = shortSelector.slice(0, 20);
  }

  const parts: string[] = [shortSelector];

  if (ctx.text) {
    parts.push(`"${ctx.text.slice(0, 40)}"`);
  }

  if (ctx.reactComponent) {
    parts.push(`<${ctx.reactComponent}>`);
  }

  if (ctx.rect) {
    parts.push(`${ctx.rect.width}x${ctx.rect.height}`);
  }

  return parts.join(' · ');
}
