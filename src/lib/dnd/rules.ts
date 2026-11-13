/**
 * rules.ts
 * Drag and drop, the part that is the same on the iPhone and the web:
 * what is being dragged, where it can be dropped,
 * which target is under the pointer, and whether the drop is allowed.
 * Pure, so it is unit tested. The library's own rule (canMoveTo) decides
 * for places, so a drop and "Move to…" never disagree.
 */

import type { SourceFile } from '../../types/database';
import { canMoveTo, type LibraryItem, type Place } from '../../utils/moveRules';

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

/** A folder, lecture or library file; or a lecture's photo or PDF (it leaves the lecture). */
export type Dragged = { kind: 'item'; item: LibraryItem } | { kind: 'media'; file: SourceFile; name: string };

/** A course or folder (a tile, a breadcrumb part, the sidebar), or Trash. */
export type DropTarget = { id: string; kind: 'place'; place: Place } | { id: string; kind: 'trash' };

export type MeasuredTarget = DropTarget & { rect: Rect };

export function draggedId(d: Dragged): string {
  return d.kind === 'item' ? d.item.id : d.file.id;
}

export function draggedTitle(d: Dragged): string {
  return d.kind === 'item' ? d.item.title : d.name;
}

function contains(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

/** The target under the point; when targets overlap, the smallest (innermost) one. */
export function hitTest<T extends { rect: Rect }>(point: Point, targets: T[]): T | null {
  let best: T | null = null;
  for (const t of targets) {
    if (!contains(t.rect, point)) continue;
    if (!best || t.rect.width * t.rect.height < best.rect.width * best.rect.height) best = t;
  }
  return best;
}

export type DropCheck = { ok: true } | { ok: false; reason: string };

/**
 * Whether `dragged` may be dropped on `target`. `folders` are all folders
 * with their parent (to keep a folder out of its own subfolders).
 */
export function canDrop(
  dragged: Dragged,
  target: DropTarget,
  folders: { id: string; parent_id: string | null }[],
): DropCheck {
  if (target.kind === 'trash') {
    // Deleting a lecture's photo can't be undone, so it stays in its menu (with its question).
    return dragged.kind === 'media' ? { ok: false, reason: 'Delete it from its menu' } : { ok: true };
  }
  if (dragged.kind === 'media') return { ok: true };
  const { item } = dragged;
  switch (canMoveTo(item, target.place, folders)) {
    case 'same-place':
      return { ok: false, reason: 'Already here' };
    case 'into-itself':
      return {
        ok: false,
        reason: target.place.folderId === item.id ? "Can't move a folder into itself" : "Can't move a folder into one of its own folders",
      };
    default:
      return { ok: true };
  }
}
