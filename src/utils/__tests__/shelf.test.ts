import type { CourseRow, FileRow, FolderRow, LectureRow } from '../../lib/cloudRows';
import {
  byRecent,
  byStarred,
  courseShelfItem,
  dayLabel,
  fileShelfItem,
  folderShelfItem,
  formatSaved,
  itemMeta,
  openTarget,
  withCourses,
  type ShelfItem,
} from '../shelf';

const T = '2026-10-25T10:31:00';
const now = new Date('2026-10-25T18:00:00');

const course = { id: 'math', name: 'Math', color: '#123', starred_at: T, updated_at: T } as CourseRow;
const folder = { id: 'f', name: 'Funcions', course_id: 'math', parent_id: null, starred_at: null, updated_at: T } as FolderRow;
const file = (over: Partial<FileRow>) =>
  ({ id: 'x', title: 'X', kind: 'lecture', course_id: 'math', folder_id: 'f', starred_at: null, updated_at: T, ...over }) as FileRow;

describe('shelf items', () => {
  it('maps courses, folders and every file kind', () => {
    expect(courseShelfItem(course)).toMatchObject({ type: 'course', title: 'Math', courseId: 'math', color: '#123', starredAt: T });
    expect(folderShelfItem(folder, course)).toMatchObject({ type: 'folder', title: 'Funcions', courseId: 'math', courseName: 'Math' });
    for (const kind of ['lecture', 'document', 'pdf', 'image', 'unit_summary', 'exam_pack']) {
      expect(fileShelfItem(file({ kind }), null).type).toBe(kind);
    }
    expect(fileShelfItem(file({ kind: 'something-new' }), null).type).toBe('document');
    expect(fileShelfItem(file({}), { status: 'ready' } as LectureRow).status).toBe('completed');
    expect(fileShelfItem(file({ kind: 'pdf' }), null).status).toBeUndefined();
  });

  it('adds course names and colors', () => {
    const [item] = withCourses([fileShelfItem(file({}), null)], [{ id: 'math', name: 'Math', color: '#123' }]);
    expect(item).toMatchObject({ courseName: 'Math', color: '#123' });
  });

  it('orders by change and by star', () => {
    const a = { updatedAt: '2026-10-01', starredAt: '2026-10-05' } as ShelfItem;
    const b = { updatedAt: '2026-10-03', starredAt: '2026-10-02' } as ShelfItem;
    expect([a, b].sort(byRecent)).toEqual([b, a]);
    expect([b, a].sort(byStarred)).toEqual([a, b]);
  });
});

describe('openTarget', () => {
  const item = (over: Partial<ShelfItem>) => ({ id: 'x', title: 'X', courseId: 'math', folderId: 'f', ...over }) as ShelfItem;
  it('opens each kind where it lives', () => {
    expect(openTarget(item({ type: 'course', id: 'math' }))).toBe('/project/math');
    expect(openTarget(item({ type: 'folder', id: 'f2' }))).toEqual({ pathname: '/project/[id]', params: { id: 'math', folder: 'f2' } });
    expect(openTarget(item({ type: 'lecture', status: 'completed' }))).toBe('/note/x');
    expect(openTarget(item({ type: 'lecture', status: 'draft' }))).toEqual({
      pathname: '/record/post-session',
      params: { sessionId: 'x', title: 'X' },
    });
    expect(openTarget(item({ type: 'pdf' }))).toEqual({ pathname: '/project/[id]', params: { id: 'math', folder: 'f' } });
    expect(openTarget(item({ type: 'exam_pack', folderId: null }))).toBe('/project/math');
    expect(openTarget(item({ type: 'image', courseId: null, folderId: null }))).toBe('/library');
  });
});

describe('texts', () => {
  it('names the day', () => {
    expect(dayLabel('2026-10-25T08:00:00', now)).toBe('Today');
    expect(dayLabel('2026-10-24T23:00:00', now)).toBe('Yesterday');
    expect(dayLabel('2026-10-21T10:00:00', now)).toBe('Wednesday');
    expect(dayLabel('2026-10-02T10:00:00', now)).toBe('2 Oct');
  });

  it('says what an item is under its title', () => {
    expect(itemMeta({ type: 'lecture', status: 'completed', updatedAt: T } as ShelfItem, now)).toBe('Today · Summary ready');
    expect(itemMeta({ type: 'lecture', status: 'transcribing', updatedAt: T } as ShelfItem, now)).toBe('Today · Processing');
    expect(itemMeta({ type: 'pdf', updatedAt: '2026-10-24T10:00:00' } as ShelfItem, now)).toBe('Yesterday · PDF');
    expect(itemMeta({ type: 'exam_pack', updatedAt: T } as ShelfItem, now)).toBe('Today · Exam pack');
  });

  it('says when a document was saved', () => {
    expect(formatSaved(T, now)).toBe('Saved · 10:31');
    expect(formatSaved('2026-10-23T09:00:00', now)).toBe('Saved · 23 Oct');
  });
});
