/**
 * html5.ts (iPhone): the browser's drag and drop doesn't exist here; the
 * web twin (html5.web.ts) is the laptop's drag (step 3.1, Option B).
 */

import type { Dragged } from './rules';

export const html5Supported = false;

export interface Html5DropHandlers {
  /** Whether a drop is allowed here; refused targets show "not allowed" and get no drop. */
  accepts: (dragged: Dragged | null, fromComputer: boolean) => boolean;
  onHover: (dragged: Dragged | null, fromComputer: boolean) => void;
  onLeave: () => void;
  onDrop: (dragged: Dragged | null, files: { name: string }[]) => void;
}

export function attachDraggable(_node: unknown, _get: () => Dragged | null, _onEnd?: () => void): () => void {
  return () => {};
}

export function attachDropTarget(_node: unknown, _handlers: Html5DropHandlers): () => void {
  return () => {};
}
