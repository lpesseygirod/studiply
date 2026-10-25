/**
 * localQueries.ts
 * The services' queries, answered from cached rows instead of Supabase.
 *
 * Each function filters and orders exactly like the matching Supabase query
 * in the services, and returns the same row shapes, so the ../cloudRows
 * mappers work unchanged. Pure, so it is unit tested without SQLite.
 */

import {
  LEGACY_NOTE_FORMAT,
  type CourseRow,
  type FileRow,
  type FolderRow,
  type LectureFileRow,
  type LectureRow,
  type SummaryRow,
} from '../cloudRows';
import type { Tables } from '../../types/supabase';

export type MediaRow = Tables<'media'>;
export type AudioChunkRow = Tables<'audio_chunks'>;

const newestFirst = (a: { updated_at: string }, b: { updated_at: string }) =>
  b.updated_at.localeCompare(a.updated_at);

// ── Courses ─────────────────────────────────────────────────────────────

/** Courses on the library and home screens (not archived, not in Trash). */
export function isActiveCourse(c: CourseRow): boolean {
  return !c.is_archived && c.deleted_at === null;
}

export function activeCourses(courses: CourseRow[], limit?: number): CourseRow[] {
  const list = courses.filter(isActiveCourse).sort(newestFirst);
  return limit === undefined ? list : list.slice(0, limit);
}

/** Lectures per course, not counting those in Trash. */
export function lectureCounts(files: FileRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const f of files) {
    if (f.kind !== 'lecture' || f.deleted_at !== null || !f.course_id) continue;
    counts.set(f.course_id, (counts.get(f.course_id) ?? 0) + 1);
  }
  return counts;
}

// ── Folders ─────────────────────────────────────────────────────────────

/** undefined = every folder in the course, null = its top level. */
export type ParentFilter = string | null | undefined;

export function inFolderScope(f: FolderRow, courseId: string, parentId: ParentFilter): boolean {
  if (f.course_id !== courseId || f.deleted_at !== null) return false;
  if (parentId === undefined) return true;
  return f.parent_id === parentId;
}

export function foldersIn(folders: FolderRow[], courseId: string, parentId: ParentFilter): FolderRow[] {
  return folders
    .filter((f) => inFolderScope(f, courseId, parentId))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

// ── Lectures ────────────────────────────────────────────────────────────

/** A lecture file with its lecture row, as `files.select('*, lectures(*)')` returns it. */
export function withLectures(files: FileRow[], lectures: LectureRow[]): LectureFileRow[] {
  const byId = new Map(lectures.map((l) => [l.id, l]));
  return files.map((f) => ({ ...f, lectures: byId.get(f.id) ?? null }));
}

export interface LectureScope {
  courseId?: string;
  /** undefined = any folder, null = no folder. */
  folderId?: string | null;
}

export function inLectureScope(f: FileRow, scope: LectureScope): boolean {
  if (f.kind !== 'lecture' || f.deleted_at !== null) return false;
  if (scope.courseId !== undefined && f.course_id !== scope.courseId) return false;
  if (scope.folderId === undefined) return true;
  return f.folder_id === scope.folderId;
}

export function lecturesIn(
  files: FileRow[],
  lectures: LectureRow[],
  scope: LectureScope,
  limit?: number,
): LectureFileRow[] {
  const list = files.filter((f) => inLectureScope(f, scope)).sort(newestFirst);
  return withLectures(limit === undefined ? list : list.slice(0, limit), lectures);
}

/** The oldest lecture titled `title` in a course (the "Project Files" holder). */
export function lectureTitled(
  files: FileRow[],
  lectures: LectureRow[],
  courseId: string,
  title: string,
): LectureFileRow | null {
  const match = files
    .filter((f) => inLectureScope(f, { courseId }) && f.title === title)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  return match ? withLectures([match], lectures)[0] : null;
}

// ── Notes ───────────────────────────────────────────────────────────────

function isLegacyNote(s: SummaryRow): boolean {
  const result = s.result as { format?: unknown; isConfirmed?: unknown } | null;
  return !!result && typeof result === 'object' && result.format === LEGACY_NOTE_FORMAT;
}

function isConfirmedNote(s: SummaryRow): boolean {
  return isLegacyNote(s) && (s.result as { isConfirmed?: unknown }).isConfirmed === true;
}

/** The lecture's newest note, unless the lecture is in Trash. */
export function latestNote(summaries: SummaryRow[], file: FileRow | null): SummaryRow | null {
  if (!file || file.deleted_at !== null) return null;
  return (
    summaries
      .filter((s) => s.file_id === file.id && isLegacyNote(s))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
  );
}

/** Which of these lectures have a confirmed note. */
export function lecturesWithNotes(summaries: SummaryRow[], ids: string[]): Set<string> {
  const wanted = new Set(ids);
  return new Set(summaries.filter((s) => wanted.has(s.file_id) && isConfirmedNote(s)).map((s) => s.file_id));
}

/** Confirmed notes of lectures not in Trash, newest first. */
export function confirmedNotes(summaries: SummaryRow[], files: FileRow[]): SummaryRow[] {
  const live = new Set(files.filter((f) => f.deleted_at === null).map((f) => f.id));
  return summaries
    .filter((s) => live.has(s.file_id) && isConfirmedNote(s))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// ── Recordings, photos and PDFs ─────────────────────────────────────────

/** A lecture's audio still in Storage, in recording order. */
export function audioOf(chunks: AudioChunkRow[], lectureId: string): AudioChunkRow[] {
  return chunks.filter((c) => c.lecture_id === lectureId && c.storage_path !== null).sort((a, b) => a.seq - b.seq);
}

export function mediaOf(media: MediaRow[], lectureId: string): MediaRow[] {
  return media
    .filter((m) => m.lecture_id === lectureId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** Photos and PDFs of every lecture in a course, newest first. */
export function courseMedia(media: MediaRow[], files: FileRow[], courseId: string): MediaRow[] {
  const lectures = new Set(files.filter((f) => inLectureScope(f, { courseId })).map((f) => f.id));
  return media
    .filter((m) => m.lecture_id !== null && lectures.has(m.lecture_id) && (m.kind === 'photo' || m.kind === 'slides'))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// ── Files saved to the library (Save to library…) ───────────────────────

/** Kinds of files a student keeps in the library besides lectures. */
export const LIBRARY_FILE_KINDS = ['pdf', 'image'] as const;

export function isLibraryFile(f: FileRow): boolean {
  return (LIBRARY_FILE_KINDS as readonly string[]).includes(f.kind);
}

/** Library files directly in a course (folderId null) or a folder, by name, with their media. */
export function libraryFilesIn(
  files: FileRow[],
  media: MediaRow[],
  courseId: string,
  folderId: string | null,
): (FileRow & { media: MediaRow[] })[] {
  return files
    .filter((f) => isLibraryFile(f) && f.deleted_at === null && f.course_id === courseId && f.folder_id === folderId)
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((f) => ({ ...f, media: media.filter((m) => m.file_id === f.id) }));
}

// ── Library sections and the course tree (step 2.2) ─────────────────────

/** Files of any kind, not in Trash, newest change first. */
export function recentFiles(files: FileRow[], limit: number): FileRow[] {
  return files.filter((f) => f.deleted_at === null).sort(newestFirst).slice(0, limit);
}

/** Starred courses, folders and files, none of them in Trash or archived. */
export function starredRows(
  courses: CourseRow[],
  folders: FolderRow[],
  files: FileRow[],
): { courses: CourseRow[]; folders: FolderRow[]; files: FileRow[] } {
  return {
    courses: courses.filter((c) => c.starred_at !== null && isActiveCourse(c)),
    folders: folders.filter((f) => f.starred_at !== null && f.deleted_at === null),
    files: files.filter((f) => f.starred_at !== null && f.deleted_at === null),
  };
}

/**
 * Favorite photos and PDFs inside lectures whose lecture isn't in Trash,
 * with their lecture and its other media (to number "Photo 2").
 */
export function starredLectureMedia(
  media: MediaRow[],
  files: FileRow[],
  lectures: LectureRow[],
): { media: MediaRow; lectureMedia: MediaRow[]; file: FileRow; lecture: LectureRow | null }[] {
  const liveFiles = new Map(files.filter((f) => f.deleted_at === null).map((f) => [f.id, f]));
  const lectureById = new Map(lectures.map((l) => [l.id, l]));
  return media
    .filter((m) => m.starred_at !== null && m.lecture_id !== null && liveFiles.has(m.lecture_id))
    .map((m) => ({
      media: m,
      lectureMedia: media.filter((o) => o.lecture_id === m.lecture_id),
      file: liveFiles.get(m.lecture_id as string) as FileRow,
      lecture: lectureById.get(m.lecture_id as string) ?? null,
    }));
}

/** Exam packs not in Trash, newest first. */
export function examPackFiles(files: FileRow[]): FileRow[] {
  return files.filter((f) => f.kind === 'exam_pack' && f.deleted_at === null).sort(newestFirst);
}

/** Files of every kind directly in a course (folderId null) or a folder, by title. */
export function filesAtLevel(files: FileRow[], courseId: string, folderId: string | null): FileRow[] {
  return files
    .filter((f) => f.deleted_at === null && f.course_id === courseId && f.folder_id === folderId)
    .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title));
}

/** How many subfolders and files (not in Trash) each of these folders holds directly. */
export function childCounts(
  folders: Pick<FolderRow, 'id' | 'parent_id' | 'deleted_at'>[],
  files: Pick<FileRow, 'id' | 'folder_id' | 'deleted_at'>[],
  folderIds: string[],
): Map<string, number> {
  const counts = new Map(folderIds.map((id) => [id, 0]));
  for (const f of folders) {
    if (f.deleted_at === null && f.parent_id && counts.has(f.parent_id)) counts.set(f.parent_id, counts.get(f.parent_id)! + 1);
  }
  for (const f of files) {
    if (f.deleted_at === null && f.folder_id && counts.has(f.folder_id)) counts.set(f.folder_id, counts.get(f.folder_id)! + 1);
  }
  return counts;
}

/** Files of every kind per course, not counting those in Trash. */
export function itemCounts(files: FileRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const f of files) {
    if (f.deleted_at !== null || !f.course_id) continue;
    counts.set(f.course_id, (counts.get(f.course_id) ?? 0) + 1);
  }
  return counts;
}

// ── Keeping the cache in step with a full answer ────────────────────────

/**
 * Cached ids a complete server answer for a scope no longer contains: rows
 * trashed, moved or deleted elsewhere. They are dropped from the cache (or,
 * for trashed ones, refreshed by the next download).
 */
export function missingFrom<T extends { id: string }>(
  cached: T[],
  inScope: (row: T) => boolean,
  answer: { id: string }[],
): string[] {
  const kept = new Set(answer.map((r) => r.id));
  return cached.filter((r) => inScope(r) && !kept.has(r.id)).map((r) => r.id);
}
