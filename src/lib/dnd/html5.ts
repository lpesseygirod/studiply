/**
 * html5.ts (iPhone): the browser's drag and drop doesn't exist here; the
 * web twin (html5.web.ts) implements Option B of the step 3.1 spike.
 */

import type { DragItem } from './rules';

export const html5Supported = false;

export interface Html5DropHandlers {
  onHover: (item: DragItem | null, fromComputer: boolean) => void;
  onLeave: () => void;
  onDrop: (item: DragItem | null, files: { name: string }[]) => void;
}

export function attachDraggable(_node: unknown, _item: DragItem, _onEnd?: () => void): () => void {
  return () => {};
}

export function attachDropTarget(_node: unknown, _handlers: Html5DropHandlers): () => void {
  return () => {};
}
