// What Recently Deleted lists (step 3.5): kinds, places, days, and which
// items get a line of their own.
import { daysLeft, deletedAgo, fileTrashKind, trashKindLabel, trashPlace, visibleTrash, type NamedCourse, type NamedFolder, type TrashedRow } from '../trash';

const T1 = '2026-10-20T10:00:00.000Z';
const T2 = '2026-10-22T09:00:00.000Z';
const courses = new Map<string, NamedCourse>([
  ['math', { id: 'math', name: 'Math', deleted_at: null }],
  ['bio', { id: 'bio', name: 'Bio', deleted_at: T2 }],
]);
const folders = new Map<string, NamedFolder>([
  ['tema1', { id: 'tema1', name: 'Tema 1', parent_id: null, deleted_at: T1 }],
  ['sub', { id: 'sub', name: 'Sub', parent_id: 'tema1', deleted_at: T1 }],
  ['tema2', { id: 'tema2', name: 'Tema 2', parent_id: null, deleted_at: null }],
]);
const row = (over: Partial<TrashedRow>): TrashedRow => ({
  id: 'x', type: 'session', kind: 'lecture', name: 'x', deletedAt: T1, courseId: 'math', folderId: null, ...over,
});

describe('kinds', () => {
  it('a file is shown as what it is, never as "Session"', () => {
    expect(['lecture', 'pdf', 'image', 'document', 'exam_pack'].map((k) => trashKindLabel(fileTrashKind(k)))).toEqual([
      'Lecture', 'PDF', 'Photo', 'Document', 'Exam pack',
    ]);
    expect(trashKindLabel('course')).toBe('Course');
    expect(fileTrashKind('something-new')).toBe('document');
  });
});

describe('trashPlace', () => {
  it('course › folders, top first; a course has none', () => {
    expect(trashPlace(row({ folderId: 'sub' }), courses, folders)).toBe('Math › Tema 1 › Sub');
    expect(trashPlace(row({ folderId: null }), courses, folders)).toBe('Math');
    expect(trashPlace(row({ type: 'project', kind: 'course' }), courses, folders)).toBeNull();
    expect(trashPlace(row({ courseId: null, folderId: null }), courses, folders)).toBeNull();
  });

  it('a loop in the folders never hangs', () => {
    const loop = new Map<string, NamedFolder>([
      ['a', { id: 'a', name: 'A', parent_id: 'b', deleted_at: null }],
      ['b', { id: 'b', name: 'B', parent_id: 'a', deleted_at: null }],
    ]);
    expect(trashPlace(row({ folderId: 'a' }), courses, loop)).toBe('Math › B › A');
  });
});

describe('visibleTrash (like Finder: what went with its folder or course is inside that line)', () => {
  it('a folder deleted with its subfolder and files: one line', () => {
    const rows = [
      row({ id: 'tema1', type: 'folder', kind: 'folder', folderId: null }),
      row({ id: 'sub', type: 'folder', kind: 'folder', folderId: 'tema1' }),
      row({ id: 'l1', folderId: 'sub' }),
    ];
    expect(visibleTrash(rows, courses, folders).map((r) => r.id)).toEqual(['tema1']);
  });

  it('something deleted on its own earlier keeps its own line', () => {
    const rows = [row({ id: 'tema1', type: 'folder', kind: 'folder' }), row({ id: 'early', folderId: 'tema1', deletedAt: '2026-10-19T08:00:00.000Z' })];
    expect(visibleTrash(rows, courses, folders).map((r) => r.id)).toEqual(['tema1', 'early']);
  });

  it('a course deleted with its contents: one line', () => {
    const rows = [row({ id: 'bio', type: 'project', kind: 'course', courseId: 'bio', deletedAt: T2 }), row({ id: 'l2', courseId: 'bio', deletedAt: T2 })];
    expect(visibleTrash(rows, courses, folders).map((r) => r.id)).toEqual(['bio']);
  });

  it('a file deleted on its own in a live folder: its own line', () => {
    expect(visibleTrash([row({ id: 'l3', folderId: 'tema2', deletedAt: T2 })], courses, folders).map((r) => r.id)).toEqual(['l3']);
  });
});

describe('days', () => {
  const now = new Date('2026-10-26T12:00:00');
  it('deleted today / yesterday / N days ago', () => {
    expect(deletedAgo('2026-10-26T08:00:00', now)).toBe('Deleted today');
    expect(deletedAgo('2026-10-25T23:00:00', now)).toBe('Deleted yesterday');
    expect(deletedAgo('2026-10-23T08:00:00', now)).toBe('Deleted 3 days ago');
  });

  it('days left until the nightly clean-up (30 days after deletion), never negative', () => {
    expect(daysLeft('2026-10-26T12:00:00', now)).toBe(30);
    expect(daysLeft('2026-09-30T12:00:00', now)).toBe(4);
    expect(daysLeft('2026-09-01T12:00:00', now)).toBe(0);
  });
});
