// The library sections and course tree answered from cached rows (step 2.2).
import type { CourseRow, FileRow, FolderRow } from '../../cloudRows';
import { examPackFiles, filesAtLevel, itemCounts, recentFiles, starredRows } from '../localQueries';

const T = (n: number) => `2026-10-${String(n).padStart(2, '0')}T10:00:00.000Z`;

function course(id: string, over: Partial<CourseRow> = {}): CourseRow {
  return {
    id, user_id: 'u', name: id, color: '#fff', icon: 'folder', sort_order: 0, is_archived: false,
    starred_at: null, deleted_at: null, created_at: T(1), updated_at: T(1), ...over,
  } as CourseRow;
}
function folder(id: string, over: Partial<FolderRow> = {}): FolderRow {
  return {
    id, user_id: 'u', course_id: 'math', parent_id: null, name: id, sort_order: 0, starred_at: null,
    deleted_at: null, created_at: T(1), updated_at: T(1), ...over,
  } as FolderRow;
}
function file(id: string, over: Partial<FileRow> = {}): FileRow {
  return {
    id, user_id: 'u', course_id: 'math', folder_id: null, kind: 'lecture', title: id, sort_order: 0,
    starred_at: null, last_opened_at: null, deleted_at: null, created_at: T(1), updated_at: T(1), ...over,
  } as FileRow;
}

describe('recentFiles', () => {
  it('lists every kind, newest change first, without Trash, up to the limit', () => {
    const files = [
      file('old', { updated_at: T(2) }),
      file('pdf', { kind: 'pdf', updated_at: T(5) }),
      file('trashed', { updated_at: T(9), deleted_at: T(9) }),
      file('image', { kind: 'image', updated_at: T(4) }),
    ];
    expect(recentFiles(files, 2).map((f) => f.id)).toEqual(['pdf', 'image']);
    expect(recentFiles(files, 10).map((f) => f.id)).toEqual(['pdf', 'image', 'old']);
  });
});

describe('starredRows', () => {
  it('keeps starred rows that are not in Trash or archived', () => {
    const rows = starredRows(
      [course('a', { starred_at: T(3) }), course('b'), course('c', { starred_at: T(3), is_archived: true }), course('d', { starred_at: T(3), deleted_at: T(4) })],
      [folder('f', { starred_at: T(2) }), folder('g', { starred_at: T(2), deleted_at: T(3) })],
      [file('l', { starred_at: T(1) }), file('m'), file('n', { starred_at: T(1), deleted_at: T(2) })],
    );
    expect(rows.courses.map((c) => c.id)).toEqual(['a']);
    expect(rows.folders.map((f) => f.id)).toEqual(['f']);
    expect(rows.files.map((f) => f.id)).toEqual(['l']);
  });
});

describe('examPackFiles', () => {
  it('only exam packs, newest first', () => {
    const files = [file('p1', { kind: 'exam_pack', updated_at: T(1) }), file('l'), file('p2', { kind: 'exam_pack', updated_at: T(3) }), file('p3', { kind: 'exam_pack', deleted_at: T(2) })];
    expect(examPackFiles(files).map((f) => f.id)).toEqual(['p2', 'p1']);
  });
});

describe('filesAtLevel', () => {
  it('files of every kind directly in the course or folder, by order then title', () => {
    const files = [
      file('b'),
      file('a', { kind: 'pdf' }),
      file('in-folder', { folder_id: 'f' }),
      file('other-course', { course_id: 'science' }),
      file('first', { sort_order: -1 }),
    ];
    expect(filesAtLevel(files, 'math', null).map((f) => f.id)).toEqual(['first', 'a', 'b']);
    expect(filesAtLevel(files, 'math', 'f').map((f) => f.id)).toEqual(['in-folder']);
  });
});

describe('itemCounts', () => {
  it('counts files of every kind per course, not Trash or the library root', () => {
    const counts = itemCounts([
      file('l'),
      file('p', { kind: 'pdf' }),
      file('t', { deleted_at: T(2) }),
      file('s', { course_id: 'science', kind: 'image' }),
      file('root', { course_id: null }),
    ]);
    expect(Object.fromEntries(counts)).toEqual({ math: 2, science: 1 });
  });
});
