/**
 * rules.ts
 * Drag and drop, the part that is the same on the iPhone and the web
 * (step 3.1): which drop target is under the pointer, and whether the
 * dragged item may go there. Pure, so it is unit tested; the 3.3 library
 * moves build on canDrop.
 */

import { folderSubtree } from '../cloudRows';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface DragItem {
  id: string;
  kind: 'file' | 'folder';
  title: string;
  /** The folder it is in; null = the top level. */
  parentId: string | null;
}

export interface DropTarget {
  id: string;
  /** A folder; the top level ("My library", the breadcrumb); Trash. */
  kind: 'folder' | 'root' | 'trash';
  title: string;
  rect: Rect;
}

function contains(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

/** The target under the point; when targets overlap, the smallest (innermost) one. */
export function hitTest<T extends DropTarget>(point: Point, targets: T[]): T | null {
  let best: T | null = null;
  for (const t of targets) {
    if (!contains(t.rect, point)) continue;
    if (!best || t.rect.width * t.rect.height < best.rect.width * best.rect.height) best = t;
  }
  return best;
}

export type DropCheck = { ok: true } | { ok: false; reason: string };

/**
 * Whether `item` may be dropped on `target`. `folders` are all folders with
 * their parent (to stop a folder going into its own subfolder).
 */
export function canDrop(
  item: DragItem,
  target: Pick<DropTarget, 'id' | 'kind'>,
  folders: { id: string; parent_id: string | null }[],
): DropCheck {
  if (target.kind === 'trash') return { ok: true };
  const destination = target.kind === 'root' ? null : target.id;
  if (item.kind === 'folder' && destination !== null) {
    if (destination === item.id) return { ok: false, reason: "Can't move a folder into itself" };
    if (folderSubtree(item.id, folders).includes(destination)) {
      return { ok: false, reason: "Can't move a folder into one of its own folders" };
    }
  }
  if (destination === item.parentId) return { ok: false, reason: 'Already here' };
  return { ok: true };
}
