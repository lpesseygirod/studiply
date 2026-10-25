/**
 * itemMenu.ts
 * Which actions an item's menu has, the same in the course grid, the
 * laptop sidebar and the Library (Lea, step 3.2 feedback). Pure; the menu
 * itself is src/hooks/useItemMenu.tsx.
 */

import type { LibraryItem } from '../services/move.service';
import type { StarTarget } from '../services/shelf.service';
import type { ShelfItem, ShelfType } from './shelf';

export type ItemAction = 'open' | 'rename' | 'move' | 'star' | 'export' | 'delete';

const ACTIONS: Partial<Record<ShelfType, ItemAction[]>> = {
  course: ['open', 'rename', 'star', 'delete'],
  folder: ['open', 'rename', 'move', 'star', 'delete'],
  lecture: ['open', 'rename', 'move', 'star', 'export', 'delete'],
  pdf: ['open', 'rename', 'move', 'star', 'delete'],
  image: ['open', 'rename', 'move', 'star', 'delete'],
};

/** Kinds without their own actions yet (documents, exam packs, a lecture's photos): Open and Favorites. */
export function itemActions(type: ShelfType): ItemAction[] {
  return ACTIONS[type] ?? ['open', 'star'];
}

/** What the confirmation and the Undo toast call it. */
export function itemNoun(type: ShelfType): string {
  switch (type) {
    case 'course':
      return 'Course';
    case 'folder':
      return 'Folder';
    case 'lecture':
      return 'Lecture';
    default:
      return 'File';
  }
}

/** Which table an item's favorite lives in. */
export function starTarget(item: ShelfItem): StarTarget {
  switch (item.type) {
    case 'course':
      return { type: 'course', id: item.id };
    case 'folder':
      return { type: 'folder', id: item.id };
    case 'lecture_photo':
    case 'lecture_pdf':
      return { type: 'media', id: item.id };
    default:
      return { type: 'file', id: item.id };
  }
}

/** The item as Move to… takes it; null for kinds that can't be moved. */
export function movableItem(item: ShelfItem): LibraryItem | null {
  const base = { id: item.id, title: item.title, courseId: item.courseId };
  switch (item.type) {
    case 'folder':
      return { ...base, type: 'folder', parentId: item.folderId };
    case 'lecture':
      return { ...base, type: 'lecture', folderId: item.folderId };
    case 'pdf':
    case 'image':
      return { ...base, type: 'file', folderId: item.folderId };
    default:
      return null;
  }
}

export type SpaceAction = 'newFolder' | 'upload' | 'takePhoto' | 'record' | 'sort';

/** Right-click (laptop) or long-press (iPhone) on empty space in a course, like Finder. */
export function emptySpaceActions(canTakePhoto: boolean): SpaceAction[] {
  return ['newFolder', 'upload', ...(canTakePhoto ? (['takePhoto'] as const) : []), 'record', 'sort'];
}

export const SPACE_LABELS: Record<SpaceAction, string> = {
  newFolder: 'New folder',
  upload: 'Upload photo or PDF',
  takePhoto: 'Take photo',
  record: 'Record lecture here',
  sort: 'Sort by…',
};
