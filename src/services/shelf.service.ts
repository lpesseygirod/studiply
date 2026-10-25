/**
 * shelf.service.ts
 * The library sections (Recent, Favorites, Exam packs), one level of a course
 * for the sidebar tree, the Review today count, and starring.
 *
 * Reads go through the iPhone's cache like the other services, so the
 * sections open offline. Review today is online only: the study tables
 * aren't cached (it shows no count offline). Starring is online only.
 */

import { supabase } from '../lib/supabase';
import { NetworkError, serviceError, type CourseRow, type FileRow, type FolderRow, type LectureFileRow, type LectureRow } from '../lib/cloudRows';
import { notifyLibraryUpdated, readRows, readThrough, remember, withLocalRows } from '../lib/cache';
import {
  examPackFiles,
  filesAtLevel,
  foldersIn,
  recentFiles,
  starredLectureMedia,
  starredRows,
  type MediaRow,
} from '../lib/cache/localQueries';
import { isOffline } from '../lib/connectivity';
import {
  byRecent,
  byStarred,
  courseShelfItem,
  fileShelfItem,
  folderShelfItem,
  lectureMediaShelfItem,
  withCourses,
  type CourseInfo,
  type ShelfItem,
} from '../utils/shelf';

const FILE_SELECT = '*, lectures(*)';

function splitLectures(rows: LectureFileRow[]): { files: FileRow[]; lectures: LectureRow[] } {
  return {
    files: rows.map(({ lectures: _lecture, ...file }) => file as FileRow),
    lectures: rows.flatMap((r) => (r.lectures ? [r.lectures] : [])),
  };
}

function rememberFiles(rows: LectureFileRow[]): { files: FileRow[]; lectures: LectureRow[] } {
  const split = splitLectures(rows);
  remember('files', split.files);
  remember('lectures', split.lectures);
  return split;
}

function fileItems(files: FileRow[], lectures: LectureRow[]): ShelfItem[] {
  const byId = new Map(lectures.map((l) => [l.id, l]));
  return files.map((f) => fileShelfItem(f, byId.get(f.id) ?? null));
}

/** Every course's name and color (also archived or trashed ones), for the items' second line. */
async function courseInfo(): Promise<CourseInfo[]> {
  return readThrough(
    async () => {
      const { data, error } = await supabase.from('courses').select('*');
      if (error) throw serviceError(error, 'Could not load your courses.');
      remember('courses', data);
      return data as CourseRow[];
    },
    () => readRows<CourseRow>('courses'),
  );
}

async function cachedFiles(): Promise<{ files: FileRow[]; lectures: LectureRow[] }> {
  const [files, lectures] = await Promise.all([readRows<FileRow>('files'), readRows<LectureRow>('lectures')]);
  return { files, lectures };
}

// -------------------------------------------------------------------
// Recent
// -------------------------------------------------------------------

/** Files of every kind, newest change first (lectures made offline on this iPhone included). */
export async function getRecentItems(limit = 20): Promise<ShelfItem[]> {
  const [items, courses] = await Promise.all([
    readThrough(
      async () => {
        const { data, error } = await supabase
          .from('files')
          .select(FILE_SELECT)
          .is('deleted_at', null)
          .order('updated_at', { ascending: false })
          .limit(limit);
        if (error) throw serviceError(error, 'Could not load your recent files.');
        const split = rememberFiles(data as LectureFileRow[]);
        const files = await withLocalRows('files', split.files, (f) => f.deleted_at === null);
        const lectures = await withLocalRows('lectures', split.lectures, (l) => files.some((f) => f.id === l.id));
        return fileItems(recentFiles(files, limit), lectures);
      },
      async () => {
        const { files, lectures } = await cachedFiles();
        return fileItems(recentFiles(files, limit), lectures);
      },
    ),
    courseInfo().catch(() => []),
  ]);
  return withCourses(items, courses).sort(byRecent);
}

// -------------------------------------------------------------------
// Favorites (the starred_at column)
// -------------------------------------------------------------------

/**
 * Favorite courses, folders, files and photos/PDFs inside lectures ("Photo 2
 * · Clase 1", opening the lecture), newest first.
 */
export async function getStarredItems(): Promise<ShelfItem[]> {
  const rows = await readThrough(
    async () => {
      const [courses, folders, files, media] = await Promise.all([
        supabase.from('courses').select('*').not('starred_at', 'is', null).is('deleted_at', null).eq('is_archived', false),
        supabase.from('folders').select('*').not('starred_at', 'is', null).is('deleted_at', null),
        supabase.from('files').select(FILE_SELECT).not('starred_at', 'is', null).is('deleted_at', null),
        supabase.from('media').select('*').not('starred_at', 'is', null).not('lecture_id', 'is', null),
      ]);
      const error = courses.error ?? folders.error ?? files.error ?? media.error;
      if (error) throw serviceError(error, 'Could not load your favorites.');
      remember('courses', courses.data ?? []);
      remember('folders', folders.data ?? []);
      const split = rememberFiles((files.data ?? []) as LectureFileRow[]);
      return {
        courses: (courses.data ?? []) as CourseRow[],
        folders: (folders.data ?? []) as FolderRow[],
        ...split,
        lectureMedia: await lectureMediaOf((media.data ?? []) as MediaRow[]),
      };
    },
    async () => {
      const [courses, folders, media, { files, lectures }] = await Promise.all([
        readRows<CourseRow>('courses'),
        readRows<FolderRow>('folders'),
        readRows<MediaRow>('media'),
        cachedFiles(),
      ]);
      return { ...starredRows(courses, folders, files), lectures, lectureMedia: starredLectureMedia(media, files, lectures) };
    },
  );
  const courses = await courseInfo().catch(() => []);
  const items = [
    ...rows.courses.map(courseShelfItem),
    ...rows.folders.map((f) => folderShelfItem(f)),
    ...fileItems(rows.files, rows.lectures),
    ...rows.lectureMedia.map((m) => lectureMediaShelfItem(m.media, m.lectureMedia, m.file, m.lecture)),
  ];
  return withCourses(items, courses).sort(byStarred);
}

/** Favorite lecture photos/PDFs with their lecture (not in Trash) and its other media. */
async function lectureMediaOf(starred: MediaRow[]): Promise<ReturnType<typeof starredLectureMedia>> {
  const ids = [...new Set(starred.map((m) => m.lecture_id).filter((id): id is string => !!id))];
  if (ids.length === 0) return [];
  const [lectureFiles, siblings] = await Promise.all([
    supabase.from('files').select(FILE_SELECT).in('id', ids).is('deleted_at', null),
    supabase.from('media').select('*').in('lecture_id', ids),
  ]);
  const error = lectureFiles.error ?? siblings.error;
  if (error) throw serviceError(error, 'Could not load your favorites.');
  const { files, lectures } = rememberFiles((lectureFiles.data ?? []) as LectureFileRow[]);
  remember('media', siblings.data ?? []);
  return starredLectureMedia((siblings.data ?? []) as MediaRow[], files, lectures);
}

// -------------------------------------------------------------------
// Exam packs (made in Phase 7)
// -------------------------------------------------------------------

export async function getExamPacks(): Promise<ShelfItem[]> {
  const items = await readThrough(
    async () => {
      const { data, error } = await supabase
        .from('files')
        .select(FILE_SELECT)
        .eq('kind', 'exam_pack')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });
      if (error) throw serviceError(error, 'Could not load your exam packs.');
      const { files, lectures } = rememberFiles(data as LectureFileRow[]);
      return fileItems(files, lectures);
    },
    async () => {
      const { files, lectures } = await cachedFiles();
      return fileItems(examPackFiles(files), lectures);
    },
  );
  return withCourses(items, await courseInfo().catch(() => []));
}

// -------------------------------------------------------------------
// One level of a course, for the sidebar tree
// -------------------------------------------------------------------

/** A course's top level (folderId null) or a folder's contents: folders first, then files by title. */
export async function getCourseLevel(courseId: string, folderId: string | null): Promise<ShelfItem[]> {
  return readThrough(
    async () => {
      let folderQuery = supabase.from('folders').select('*').eq('course_id', courseId).is('deleted_at', null);
      folderQuery = folderId === null ? folderQuery.is('parent_id', null) : folderQuery.eq('parent_id', folderId);
      let fileQuery = supabase.from('files').select(FILE_SELECT).eq('course_id', courseId).is('deleted_at', null);
      fileQuery = folderId === null ? fileQuery.is('folder_id', null) : fileQuery.eq('folder_id', folderId);
      const [folders, files] = await Promise.all([folderQuery, fileQuery]);
      const error = folders.error ?? files.error;
      if (error) throw serviceError(error, 'Could not load this course.');
      remember('folders', folders.data ?? []);
      const split = rememberFiles((files.data ?? []) as LectureFileRow[]);
      const local = await withLocalRows('files', split.files, (f) => f.deleted_at === null && f.course_id === courseId && f.folder_id === folderId);
      const lectures = await withLocalRows('lectures', split.lectures, (l) => local.some((f) => f.id === l.id));
      return [
        ...foldersIn((folders.data ?? []) as FolderRow[], courseId, folderId).map((f) => folderShelfItem(f)),
        ...fileItems(filesAtLevel(local, courseId, folderId), lectures),
      ];
    },
    async () => {
      const [folders, { files, lectures }] = await Promise.all([readRows<FolderRow>('folders'), cachedFiles()]);
      return [
        ...foldersIn(folders, courseId, folderId).map((f) => folderShelfItem(f)),
        ...fileItems(filesAtLevel(files, courseId, folderId), lectures),
      ];
    },
  );
}

// -------------------------------------------------------------------
// Review today (Phase 9 fills the schedule)
// -------------------------------------------------------------------

/** Reviews due by the end of today; null when it can't be known (offline, error). */
export async function getReviewDueCount(now: Date = new Date()): Promise<number | null> {
  if (isOffline()) return null;
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  try {
    const { count, error } = await supabase
      .from('review_schedule')
      .select('id', { count: 'exact', head: true })
      .lte('due_at', endOfDay.toISOString());
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

// -------------------------------------------------------------------
// Add to / Remove from Favorites (online only)
// -------------------------------------------------------------------

export type StarTarget = { type: 'course' | 'folder' | 'file' | 'media'; id: string };

const STAR_TABLE = { course: 'courses', folder: 'folders', file: 'files', media: 'media' } as const;

/**
 * Stars (a time) or unstars (null) a course, folder or file. Undo passes the
 * item's previous value back, so an older favorite keeps its place in Favorites.
 */
export async function setStarredAt(target: StarTarget, starredAt: string | null): Promise<void> {
  if (isOffline()) throw new NetworkError();
  const table = STAR_TABLE[target.type];
  const { data, error } = await supabase.from(table).update({ starred_at: starredAt }).eq('id', target.id).select('*');
  if (error) throw serviceError(error, starredAt ? 'Could not add this to Favorites.' : 'Could not remove this from Favorites.');
  remember(table, data ?? []);
  notifyLibraryUpdated();
}
