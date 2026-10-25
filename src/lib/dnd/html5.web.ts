/**
 * html5.web.ts — Option B of the step 3.1 spike: the browser's own drag and
 * drop on the DOM nodes behind React Native Web views. It shows the native
 * drag image, scrolls while dragging, and receives files dragged from the
 * computer (Finder), which a gesture-based drag can't.
 */

import type { DragItem } from './rules';
import type { Html5DropHandlers } from './html5';

export const html5Supported = true;

const MIME = 'application/x-studiply-item';
// The item being dragged inside the page: its data can't be read during
// dragover (the browser hides it until the drop), so it is kept here.
let dragging: DragItem | null = null;

function isElement(node: unknown): node is HTMLElement {
  return !!node && typeof (node as HTMLElement).addEventListener === 'function';
}

export function attachDraggable(node: unknown, item: DragItem, onEnd?: () => void): () => void {
  if (!isElement(node)) return () => {};
  node.setAttribute('draggable', 'true');
  const start = (e: DragEvent) => {
    dragging = item;
    e.dataTransfer?.setData(MIME, item.id);
    e.dataTransfer?.setData('text/plain', item.title);
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
  const enter = (e: DragEvent) => {
    e.preventDefault();
    depth++;
    h.onHover(dragging, fromComputer(e));
  };
  const over = (e: DragEvent) => {
    e.preventDefault(); // allows the drop
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
    const files = Array.from(e.dataTransfer?.files ?? []).map((f) => ({ name: f.name }));
    h.onDrop(dragging, files);
    h.onLeave();
    dragging = null;
  };
  node.addEventListener('dragenter', enter);
  node.addEventListener('dragover', over);
  node.addEventListener('dragleave', leave);
  node.addEventListener('drop', drop);
  return () => {
    node.removeEventListener('dragenter', enter);
    node.removeEventListener('dragover', over);
    node.removeEventListener('dragleave', leave);
    node.removeEventListener('drop', drop);
  };
}
