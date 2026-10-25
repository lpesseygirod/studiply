/**
 * libraryGrid.ts
 * The Finder-style course view (step 3.2): sorting a level's items and the
 * short line under each tile. Pure, so it is unit tested.
 */

import { typeLabel, type ShelfItem, type ShelfType } from './shelf';

export type LibrarySort = 'kind' | 'name' | 'edited';

export const SORT_LABELS: Record<LibrarySort, string> = {
  kind: 'Kind',
  name: 'Name',
  edited: 'Date edited',
};

const KIND_ORDER: Partial<Record<ShelfType, number>> = {
  folder: 0,
  lecture: 1,
  document: 2,
  unit_summary: 3,
  exam_pack: 4,
  pdf: 5,
  image: 6,
};

const byName = (a: ShelfItem, b: ShelfItem) =>
  a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
const byEdited = (a: ShelfItem, b: ShelfItem) => b.updatedAt.localeCompare(a.updatedAt);
const rank = (i: ShelfItem) => KIND_ORDER[i.type] ?? 9;

/** Folders always first (as in Drive), then by the chosen order. */
export function sortEntries(items: ShelfItem[], sort: LibrarySort): ShelfItem[] {
  const folderFirst = (a: ShelfItem, b: ShelfItem) => Number(a.type !== 'folder') - Number(b.type !== 'folder');
  const order =
    sort === 'kind'
      ? (a: ShelfItem, b: ShelfItem) => rank(a) - rank(b) || byName(a, b)
      : sort === 'name'
        ? byName
        : byEdited;
  return [...items].sort((a, b) => folderFirst(a, b) || order(a, b));
}

/** "45 s", "32 min", "1 h 32 min". */
export function formatLength(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "Edited today", "Edited yesterday", "Edited 3 days ago", "Edited 23 Oct". */
export function editedLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const days = Math.round(
    (new Date(now.toDateString()).getTime() - new Date(date.toDateString()).getTime()) / 86_400_000,
  );
  if (days <= 0) return 'Edited today';
  if (days === 1) return 'Edited yesterday';
  if (days < 7) return `Edited ${days} days ago`;
  return `Edited ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}

/** The line under a tile (docs/design desktop-04: "7 items", "1 h 32 min", "Edited today"). */
export function tileMeta(item: ShelfItem, now: Date = new Date()): string {
  switch (item.type) {
    case 'folder':
      if (item.childCount === undefined) return 'Folder';
      return item.childCount === 0 ? 'Empty' : item.childCount === 1 ? '1 item' : `${item.childCount} items`;
    case 'lecture':
      if (item.status === 'completed') return item.durationSeconds ? formatLength(item.durationSeconds) : 'Ready';
      if (item.status === 'processing' || item.status === 'transcribing') return 'Processing';
      if (item.status === 'failed') return 'Needs attention';
      return 'Not processed yet';
    case 'exam_pack':
    case 'unit_summary':
      return typeLabel(item.type);
    default:
      return item.pending ? 'Waiting to upload' : editedLabel(item.updatedAt, now);
  }
}
