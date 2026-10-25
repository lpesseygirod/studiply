/**
 * html5.web.ts — the laptop's drag and drop (step 3.1, Option B): the
 * browser's own drag on the DOM nodes behind React Native Web views. It
 * shows the native drag image, scrolls while dragging, and receives files
 * dragged from the computer (Finder), which a gesture-based drag can't.
 */

import type { Dragged } from './rules';
import type { Html5DropHandlers } from './html5';

export const html5Supported = true;

const MIME = 'application/x-studiply-item';
// What is being dragged inside the page: its data can't be read during
// dragover (the browser hides it until the drop), so it is kept here.
let dragging: Dragged | null = null;

function isElement(node: unknown): node is HTMLElement {
  return !!node && typeof (node as HTMLElement).addEventListener === 'function';
}

/** `get` is asked when a drag starts; null cancels it (e.g. while the name is being edited). */
export function attachDraggable(node: unknown, get: () => Dragged | null, onEnd?: () => void): () => void {
  if (!isElement(node)) return () => {};
  node.setAttribute('draggable', 'true');
  const start = (e: DragEvent) => {
    // A drag that starts inside a nested draggable (a row in a row) is that one's.
    if (dragging) return;
    const dragged = get();
    if (!dragged) {
      e.preventDefault();
      return;
    }
    dragging = dragged;
    e.dataTransfer?.setData(MIME, dragged.kind === 'item' ? dragged.item.id : dragged.file.id);
    e.dataTransfer?.setData('text/plain', dragged.kind === 'item' ? dragged.item.title : dragged.name);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  };
  const end = () => {
    dragging = null;
    onEnd?.();
  };
  node.addEventListener('dragstart', start);
  node.addEventListener('dragend', end);
  return () => {
    node.removeAttribute('draggable');
    node.removeEventListener('dragstart', start);
    node.removeEventListener('dragend', end);
  };
}

export function attachDropTarget(node: unknown, h: Html5DropHandlers): () => void {
  if (!isElement(node)) return () => {};
  // dragenter/dragleave fire for every child too; count to know when the pointer really left.
  let depth = 0;
  const fromComputer = (e: DragEvent) => !dragging && !!e.dataTransfer?.types.includes('Files');
  const relevant = (e: DragEvent) => !!dragging || fromComputer(e);
  const enter = (e: DragEvent) => {
    if (!relevant(e)) return;
    e.preventDefault();
    depth++;
    h.onHover(dragging, fromComputer(e));
  };
  const over = (e: DragEvent) => {
    // A target inside this one (a folder tile in the grid) already took it: leave its answer alone.
    if (!relevant(e) || e.defaultPrevented) return;
    // Only an accepted drag is allowed to drop (preventDefault); a refused one shows "not allowed".
    if (!h.accepts(dragging, fromComputer(e))) {
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
      return;
    }
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = dragging ? 'move' : 'copy';
  };
  const leave = () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) h.onLeave();
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    depth = 0;
    const files = Array.from(e.dataTransfer?.files ?? []).map((f) => ({
      uri: URL.createObjectURL(f),
      name: f.name,
      mimeType: f.type || null,
      sizeBytes: f.size,
    }));
    const dropped = dragging;
    dragging = null;
    h.onLeave();
    if (h.accepts(dropped, !dropped && files.length > 0)) h.onDrop(dropped, files);
  };
  // A drop on a target inside this one (a folder tile in the grid) never reaches this one,
  // nor does a drag that ends elsewhere: any drop or drag end on the page clears the highlight.
  const reset = () => {
    if (depth === 0) return;
    depth = 0;
    h.onLeave();
  };
  node.addEventListener('dragenter', enter);
  node.addEventListener('dragover', over);
  node.addEventListener('dragleave', leave);
  node.addEventListener('drop', drop);
  window.addEventListener('drop', reset, true);
  window.addEventListener('dragend', reset, true);
  return () => {
    node.removeEventListener('dragenter', enter);
    node.removeEventListener('dragover', over);
    node.removeEventListener('dragleave', leave);
    node.removeEventListener('drop', drop);
    window.removeEventListener('drop', reset, true);
    window.removeEventListener('dragend', reset, true);
  };
}
