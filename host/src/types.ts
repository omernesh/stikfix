/**
 * Shared TypeScript interfaces for stikfix-host.
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
  /**
   * D-03: viewport coords of the note card at Send time (free notes only).
   * Populated by card.ts getBoundingClientRect() and persisted to frontmatter
   * as 'note_position' (canonical key). Undefined for element notes.
   */
  notePosition?: { x: number; y: number };
  /**
   * D-04 (09-05): ROUTING-ONLY. When the SW resolves this origin to a chosen
   * folder (origin→folder mapping), it injects the validated absolute folder
   * here so the host writes to <targetDir>/notes. The host RE-VALIDATES it and
   * does NOT persist it into the note frontmatter. Absent for the --root /
   * origin→host default path.
   */
  targetDir?: string;
}

export interface Config {
  root: string;
  notesDir: string;
  name: string;
  origins: string[];
  port?: number;
  token: string;
}
