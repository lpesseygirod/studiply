/**
 * shelf.ts
 * One shape for everything the library sections, the sidebar and the
 * course tree list: courses, folders, lectures, PDFs, images and the kinds
 * that come later (documents, unit summaries, exam packs). Pure: mapping
 * rows, ordering, where an item opens, and the short texts under it.
 */

import type { Href } from 'expo-router';

import { statusFromDb, type CourseRow, type FileRow, type FolderRow, type LectureRow } from '../lib/cloudRows';
import type { MediaRow } from '../lib/cache/localQueries';
import type { Folder, Project, Session } from '../types/database';

export type FileKind = 'lecture' | 'document' | 'pdf' | 'image' | 'unit_summary' | 'exam_pack';
/** A photo or PDF inside a lecture (media), in Favorites. */
export type LectureMediaKind = 'lecture_photo' | 'lecture_pdf';
export type ShelfType = 'course' | 'folder' | FileKind | LectureMediaKind;

const FILE_KINDS: readonly string[] = ['lecture', 'document', 'pdf', 'image', 'unit_summary', 'exam_pack'];

export interface ShelfItem {
  id: string;
  type: ShelfType;
  title: string;
  /** The course it is in (a course: itself). null = the "My library" root. */
  courseId: string | null;
  folderId: string | null;
  courseName?: string;
  /** The course's color (a course: its own). */
  color?: string;
  updatedAt: string;
  starredAt: string | null;
  /** Lectures (and a lecture's photos/PDFs: their lecture's status). */
  status?: Session['status'];
  /** A lecture's photo or PDF: the lecture it opens. */
  lectureId?: string;
  lectureTitle?: string;
}

export type CourseInfo = Pick<CourseRow, 'id' | 'name' | 'color'>;

function fileKind(kind: string): FileKind {
  return (FILE_KINDS.includes(kind) ? kind : 'document') as FileKind;
}

export function courseShelfItem(row: CourseRow | (Project & { starred_at: string | null })): ShelfItem {
  return {
    id: row.id,
    type: 'course',
    title: row.name,
    courseId: row.id,
    folderId: null,
    courseName: row.name,
    color: row.color,
    updatedAt: row.updated_at,
    starredAt: row.starred_at,
  };
}

export function folderShelfItem(row: FolderRow, course?: CourseInfo): ShelfItem {
  return {
    id: row.id,
    type: 'folder',
    title: row.name,
    courseId: row.course_id,
    folderId: row.parent_id,
    courseName: course?.name,
    color: course?.color,
    updatedAt: row.updated_at,
    starredAt: row.starred_at,
  };
}

/** A folder as the services return it (Folder), for the course tree. */
export function folderItemFromFolder(folder: Folder): ShelfItem {
  return {
    id: folder.id,
    type: 'folder',
    title: folder.name,
    courseId: folder.project_id || null,
    folderId: folder.parent_folder_id,
    updatedAt: folder.updated_at,
    starredAt: folder.starred_at,
  };
}

export function fileShelfItem(row: FileRow, lecture: LectureRow | null, course?: CourseInfo): ShelfItem {
  const type = fileKind(row.kind);
  return {
    id: row.id,
    type,
    title: row.title,
    courseId: row.course_id,
    folderId: row.folder_id,
    courseName: course?.name,
    color: course?.color,
    updatedAt: row.updated_at,
    starredAt: row.starred_at,
    ...(type === 'lecture' && { status: statusFromDb(lecture?.status ?? 'draft') }),
  };
}

/**
 * A lecture's photo or PDF as the lecture screens name it: its caption, else
 * "Photo 2" by its place among the lecture's photos (oldest first), else
 * "Document" (as fileLabel in source-file.service).
 */
export function lectureMediaLabel(media: MediaRow, lectureMedia: MediaRow[]): string {
  if (media.caption) return media.caption;
  if (media.kind === 'photo') {
    const photos = lectureMedia
      .filter((m) => m.kind === 'photo')
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    return `Photo ${photos.findIndex((m) => m.id === media.id) + 1}`;
  }
  return 'Document';
}

/** "Photo 2 · Clase 1": a favorite photo or PDF with its lecture's name; it opens the lecture. */
export function lectureMediaShelfItem(
  media: MediaRow,
  lectureMedia: MediaRow[],
  lectureFile: FileRow,
  lecture: LectureRow | null,
): ShelfItem {
  return {
    id: media.id,
    type: media.kind === 'photo' ? 'lecture_photo' : 'lecture_pdf',
    title: `${lectureMediaLabel(media, lectureMedia)} · ${lectureFile.title}`,
    courseId: lectureFile.course_id,
    folderId: lectureFile.folder_id,
    updatedAt: media.updated_at,
    starredAt: media.starred_at,
    status: statusFromDb(lecture?.status ?? 'draft'),
    lectureId: lectureFile.id,
    lectureTitle: lectureFile.title,
  };
}

/** Course names and colors, by id, for the items' second line. */
export function withCourses(items: ShelfItem[], courses: CourseInfo[]): ShelfItem[] {
  const byId = new Map(courses.map((c) => [c.id, c]));
  return items.map((item) => {
    const course = item.courseId ? byId.get(item.courseId) : undefined;
    return course ? { ...item, courseName: course.name, color: item.color ?? course.color } : item;
  });
}

/** Newest change first. */
export function byRecent(a: ShelfItem, b: ShelfItem): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

/** Newest star first. */
export function byStarred(a: ShelfItem, b: ShelfItem): number {
  return (b.starredAt ?? '').localeCompare(a.starredAt ?? '');
}

/**
 * The screen an item opens. A lecture opens its notes once they exist, and
 * post-session before that (as on Library). PDFs, images and the kinds
 * without a screen of their own yet open their course at their folder.
 */
export function openTarget(item: ShelfItem): Href {
  switch (item.type) {
    case 'course':
      return `/project/${item.id}`;
    case 'folder':
      return courseAt(item.courseId, item.id);
    case 'lecture':
      return lectureTarget(item.id, item.title, item.status);
    case 'lecture_photo':
    case 'lecture_pdf':
      return lectureTarget(item.lectureId ?? '', item.lectureTitle ?? '', item.status);
    default:
      return courseAt(item.courseId, item.folderId);
  }
}

function lectureTarget(id: string, title: string, status: Session['status'] | undefined): Href {
  return status === 'completed'
    ? `/note/${id}`
    : { pathname: '/record/post-session', params: { sessionId: id, title } };
}

/** A course screen, open at a folder; without a course, Library. */
export function courseAt(courseId: string | null, folderId: string | null): Href {
  if (!courseId) return '/library';
  return folderId ? { pathname: '/project/[id]', params: { id: courseId, folder: folderId } } : `/project/${courseId}`;
}

/** Ionicons names per kind (sidebar tree and section lists). */
export const TYPE_ICON = {
  course: 'folder-outline',
  folder: 'folder-outline',
  lecture: 'document-text-outline',
  document: 'create-outline',
  pdf: 'document-outline',
  image: 'image-outline',
  unit_summary: 'albums-outline',
  exam_pack: 'school-outline',
  lecture_photo: 'image-outline',
  lecture_pdf: 'document-attach-outline',
} as const satisfies Record<ShelfType, string>;

const TYPE_LABEL: Record<ShelfType, string> = {
  course: 'Course',
  folder: 'Folder',
  lecture: 'Lecture',
  document: 'Document',
  pdf: 'PDF',
  image: 'Image',
  unit_summary: 'Unit summary',
  exam_pack: 'Exam pack',
  lecture_photo: 'Photo',
  lecture_pdf: 'PDF',
};

export function typeLabel(type: ShelfType): string {
  return TYPE_LABEL[type];
}

/** "Today", "Yesterday", a weekday within a week, else "23 Oct". */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const days = Math.round(
    (new Date(now.toDateString()).getTime() - new Date(date.toDateString()).getTime()) / 86_400_000,
  );
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days > 1 && days < 7) return date.toLocaleDateString('en-US', { weekday: 'long' });
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function lectureState(status: Session['status'] | undefined): string {
  if (status === 'completed') return 'Summary ready';
  if (status === 'processing' || status === 'transcribing') return 'Processing';
  if (status === 'failed') return 'Needs attention';
  return 'Not processed yet';
}

/** The line under an item: "Today · Summary ready", "Monday · PDF". */
export function itemMeta(item: ShelfItem, now: Date = new Date()): string {
  const what = item.type === 'lecture' ? lectureState(item.status) : typeLabel(item.type);
  return `${dayLabel(item.updatedAt, now)} · ${what}`;
}

/** "Saved · 10:31" today, otherwise "Saved · 23 Oct". */
export function formatSaved(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const sameDay = date.toDateString() === now.toDateString();
  const when = sameDay
    ? date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `Saved · ${when}`;
}
