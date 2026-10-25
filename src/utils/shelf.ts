/**
 * shelf.ts
 * One shape for everything the library sections, the sidebar and the
 * course tree list: courses, folders, lectures, PDFs, images and the kinds
 * that come later (documents, unit summaries, exam packs). Pure: mapping
 * rows, ordering, where an item opens, and the short texts under it.
 */

import type { Href } from 'expo-router';

import { statusFromDb, type CourseRow, type FileRow, type FolderRow, type LectureRow } from '../lib/cloudRows';
import type { Folder, Project, Session } from '../types/database';

export type FileKind = 'lecture' | 'document' | 'pdf' | 'image' | 'unit_summary' | 'exam_pack';
export type ShelfType = 'course' | 'folder' | FileKind;

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
  /** Lectures only. */
  status?: Session['status'];
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
      return item.status === 'completed'
        ? `/note/${item.id}`
        : { pathname: '/record/post-session', params: { sessionId: item.id, title: item.title } };
    default:
      return courseAt(item.courseId, item.folderId);
  }
}

/** A course screen, open at a folder; without a course, Library. */
export function courseAt(courseId: string | null, folderId: string | null): Href {
  if (!courseId) return '/library';
  return folderId ? { pathname: '/project/[id]', params: { id: courseId, folder: folderId } } : `/project/${courseId}`;
}

const TYPE_LABEL: Record<ShelfType, string> = {
  course: 'Course',
  folder: 'Folder',
  lecture: 'Lecture',
  document: 'Document',
  pdf: 'PDF',
  image: 'Image',
  unit_summary: 'Unit summary',
  exam_pack: 'Exam pack',
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
