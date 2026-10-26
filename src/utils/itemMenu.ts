/**
 * itemMenu.ts
 * Which actions an item's menu has, the same in the course grid, the
 * laptop sidebar and the Library (Lea, step 3.2 feedback). Pure; the menu
 * itself is src/hooks/useItemMenu.tsx.
 */

import type { LibraryItem } from '../services/move.service';
import type { StarTarget } from '../services/shelf.service';
import type { ShelfItem, ShelfType } from './shelf';

export type ItemAction =
  | 'open'
  | 'rename'
  | 'move'
  | 'moveOut'
  | 'cut'
  | 'copy'
  | 'star'
  | 'summarize'
  | 'examPack'
  | 'export'
  | 'delete';

const ACTIONS: Partial<Record<ShelfType, ItemAction[]>> = {
  course: ['open', 'rename', 'star', 'examPack', 'delete'],
  folder: ['open', 'rename', 'move', 'moveOut', 'cut', 'copy', 'star', 'examPack', 'delete'],
  lecture: ['open', 'rename', 'move', 'moveOut', 'cut', 'copy', 'star', 'summarize', 'export', 'delete'],
  pdf: ['open', 'rename', 'move', 'moveOut', 'cut', 'copy', 'star', 'delete'],
  image: ['open', 'rename', 'move', 'moveOut', 'cut', 'copy', 'star', 'delete'],
};

/**
 * The item's menu, in order (step 3.4). Move out only for an item inside a
 * folder. Kinds without their own actions yet (documents, exam packs, a
 * lecture's photos): Open and Favorites.
 */
export function itemActions(item: Pick<ShelfItem, 'type' | 'folderId'>): ItemAction[] {
  const actions = ACTIONS[item.type] ?? ['open', 'star'];
  return item.folderId ? actions : actions.filter((a) => a !== 'moveOut');
}

/** Why an action is greyed out (shown under it), or null when it works. */
export function actionHint(action: ItemAction, type: ShelfType): string | null {
  if (action === 'copy' && (type === 'lecture' || type === 'folder')) return 'Coming soon';
  if (action === 'summarize' || action === 'examPack') return 'Coming in a later update';
  return null;
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

export type SpaceAction = 'newFolder' | 'newDocument' | 'record' | 'upload' | 'takePhoto' | 'paste' | 'sort';

/** Right-click (laptop), long-press or "…" (iPhone) on empty space in a course, like Finder. */
export function emptySpaceActions(canTakePhoto: boolean): SpaceAction[] {
  return ['newFolder', 'newDocument', 'record', 'upload', ...(canTakePhoto ? (['takePhoto'] as const) : []), 'paste', 'sort'];
}

export const SPACE_LABELS: Record<SpaceAction, string> = {
  newFolder: 'New folder',
  newDocument: 'New document',
  record: 'Record',
  upload: 'Upload document',
  takePhoto: 'Take photo',
  paste: 'Paste',
  sort: 'Sort by…',
};

/** The Paste line: what it pastes, or why it is greyed out. */
export function pasteLabel(clip: { mode: 'cut' | 'copy'; title: string } | null): { text: string; hint: string | null } {
  if (!clip) return { text: 'Paste', hint: 'Nothing to paste' };
  return { text: `Paste '${clip.title}'`, hint: null };
}
