/**
 * moveRules.ts
 * Where a library item may go, without any I/O, so drop targets can ask
 * while the pointer moves and move.service.ts asks again before moving.
 */

import { folderSubtree } from '../lib/cloudRows';

/** Where something is, or goes: a course's top level (folderId null) or a folder. */
export interface Place {
  courseId: string | null;
  folderId: string | null;
  /** "Math / Funcions", for messages. */
  label: string;
}

export type LibraryItem =
  | { type: 'lecture' | 'file'; id: string; title: string; courseId: string | null; folderId: string | null }
  | { type: 'folder'; id: string; title: string; courseId: string | null; parentId: string | null };

export type MoveCheck = 'ok' | 'same-place' | 'into-itself';

export function placeOf(item: LibraryItem): { courseId: string | null; folderId: string | null } {
  return item.type === 'folder'
    ? { courseId: item.courseId, folderId: item.parentId }
    : { courseId: item.courseId, folderId: item.folderId };
}

/**
 * Whether `item` may go to `place`. `folders` are the student's folders
 * (id and parent), to find a folder's subfolders.
 */
export function canMoveTo(
  item: LibraryItem,
  place: Pick<Place, 'courseId' | 'folderId'>,
  folders: { id: string; parent_id: string | null }[],
): MoveCheck {
  const from = placeOf(item);
  if (from.folderId === place.folderId && (place.folderId !== null || from.courseId === place.courseId)) {
    return 'same-place';
  }
  if (item.type === 'folder' && place.folderId !== null && folderSubtree(item.id, folders).includes(place.folderId)) {
    return 'into-itself';
  }
  return 'ok';
}
