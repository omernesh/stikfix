/**
 * Shared TypeScript interfaces for stickyfix-host.
 * Matches PRD §9.1 (annotation payload) and the resolved Config shape.
 */

export interface Screenshot {
  kind: string;
  mime: string;
  dataUrl: string;
  rect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface ElementContext {
  selector: string;
  tag: string;
  id?: string;
  classList?: string[];
  role?: string;
  ariaLabel?: string;
  text?: string;
  rect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  computedStyles?: Record<string, string>;
  outerHTML?: string;
  dataset?: Record<string, string>;
  reactComponent?: string;
  nearestTestId?: string;
}

export interface AnnotationPayload {
  mode: 'free' | 'element';
  comment: string;
  page: {
    url: string;
    title: string;
  };
  viewport: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
  element?: ElementContext;
  screenshots?: Screenshot[];
}

export interface Config {
  root: string;
  notesDir: string;
  name: string;
  origins: string[];
  port?: number;
  token: string;
}
