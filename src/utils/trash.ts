/**
 * trash.ts
 * What Recently Deleted shows (step 3.5), pure so it is tested: each item's
 * real kind, where it was ("Math › Tema 1"), how long ago it was deleted,
 * and which items to list at all. Like Finder, what was deleted together
 * with its folder or course is listed once, under that folder or course:
 * restoring the folder brings it back (same deleted_at), and anything
 * deleted on its own earlier keeps its own line.
 */

export type TrashKind = 'course' | 'folder' | 'lecture' | 'pdf' | 'image' | 'document' | 'exam_pack' | 'unit_summary';

export interface TrashedRow {
  id: string;
  type: 'project' | 'folder' | 'session';
  kind: TrashKind;
  name: string;
  deletedAt: string;
  courseId: string | null;
  /** The folder it is in (a folder: its parent). */
  folderId: string | null;
}

export interface NamedFolder {
  id: string;
  name: string;
  parent_id: string | null;
  deleted_at: string | null;
}

export interface NamedCourse {
  id: string;
  name: string;
  deleted_at: string | null;
}

const LABELS: Record<TrashKind, string> = {
  course: 'Course',
  folder: 'Folder',
  lecture: 'Lecture',
  pdf: 'PDF',
  image: 'Photo',
  document: 'Document',
  exam_pack: 'Exam pack',
  unit_summary: 'Unit summary',
};

export function trashKindLabel(kind: TrashKind): string {
  return LABELS[kind];
}

/** A file's kind as stored (files.kind), for the trash. */
export function fileTrashKind(kind: string): TrashKind {
  return (['lecture', 'pdf', 'image', 'document', 'exam_pack', 'unit_summary'] as const).find((k) => k === kind) ?? 'document';
}

/** The folders from the course down to `folderId`, top first (guarded against loops). */
function folderChain(folderId: string | null, folders: Map<string, NamedFolder>): NamedFolder[] {
  const chain: NamedFolder[] = [];
  const seen = new Set<string>();
  let id = folderId;
  while (id && !seen.has(id)) {
    seen.add(id);
    const folder = folders.get(id);
    if (!folder) break;
    chain.unshift(folder);
    id = folder.parent_id;
  }
  return chain;
}

/** Where it was: "Math › Tema 1"; null for a course or something outside every course. */
export function trashPlace(
  row: Pick<TrashedRow, 'type' | 'courseId' | 'folderId'>,
  courses: Map<string, NamedCourse>,
  folders: Map<string, NamedFolder>,
): string | null {
  if (row.type === 'project') return null;
  const parts = [
    ...(row.courseId ? [courses.get(row.courseId)?.name ?? ''] : []),
    ...folderChain(row.folderId, folders).map((f) => f.name),
  ].filter(Boolean);
  return parts.length ? parts.join(' › ') : null;
}

/**
 * The rows to list: a row deleted together with a folder or course above it
 * (the same deleted_at) is inside that line, not a line of its own.
 */
export function visibleTrash(
  rows: TrashedRow[],
  courses: Map<string, NamedCourse>,
  folders: Map<string, NamedFolder>,
): TrashedRow[] {
  return rows.filter((row) => {
    if (row.type === 'project') return true;
    const course = row.courseId ? courses.get(row.courseId) : undefined;
    if (course?.deleted_at && sameTime(course.deleted_at, row.deletedAt)) return false;
    return !folderChain(row.folderId, folders).some((f) => f.deleted_at && sameTime(f.deleted_at, row.deletedAt));
  });
}

function sameTime(a: string, b: string): boolean {
  return new Date(a).getTime() === new Date(b).getTime();
}

const DAY = 24 * 60 * 60 * 1000;
export const RETENTION_DAYS = 30;

/** "Deleted today" / "Deleted yesterday" / "Deleted 3 days ago". */
export function deletedAgo(deletedAt: string, now: Date = new Date()): string {
  const days = Math.floor((startOfDay(now) - startOfDay(new Date(deletedAt))) / DAY);
  if (days <= 0) return 'Deleted today';
  if (days === 1) return 'Deleted yesterday';
  return `Deleted ${days} days ago`;
}

/** Whole days left before the nightly clean-up removes it (30 days after deletion). */
export function daysLeft(deletedAt: string, now: Date = new Date()): number {
  const expiry = new Date(deletedAt).getTime() + RETENTION_DAYS * DAY;
  return Math.max(0, Math.ceil((expiry - now.getTime()) / DAY));
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
