import type { CourseRow, FileRow, FolderRow, LectureRow, SummaryRow } from '../../cloudRows';
import {
  activeCourses,
  audioOf,
  confirmedNotes,
  courseMedia,
  foldersIn,
  latestNote,
  lectureCounts,
  lecturesIn,
  lecturesWithNotes,
  libraryFilesIn,
  missingFrom,
  type AudioChunkRow,
  type MediaRow,
} from '../localQueries';

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
function lecture(id: string): LectureRow {
  return { id, user_id: 'u', status: 'ready', updated_at: T(1) } as LectureRow;
}
function summary(id: string, fileId: string, over: Partial<SummaryRow> = {}, confirmed = true): SummaryRow {
  return {
    id, user_id: 'u', file_id: fileId, created_at: T(1), updated_at: T(1),
    result: { format: 'legacy-note-v1', isConfirmed: confirmed }, ...over,
  } as SummaryRow;
}

describe('courses', () => {
  it('lists active courses newest first, with a limit', () => {
    const courses = [
      course('old', { updated_at: T(1) }),
      course('new', { updated_at: T(5) }),
      course('archived', { is_archived: true, updated_at: T(9) }),
      course('trashed', { deleted_at: T(3), updated_at: T(9) }),
    ];
    expect(activeCourses(courses).map((c) => c.id)).toEqual(['new', 'old']);
    expect(activeCourses(courses, 1).map((c) => c.id)).toEqual(['new']);
  });

  it('counts lectures per course, not trashed ones or documents', () => {
    const counts = lectureCounts([
      file('a'), file('b'), file('c', { deleted_at: T(2) }), file('d', { kind: 'pdf' }), file('e', { course_id: 'bio' }),
    ]);
    expect(counts.get('math')).toBe(2);
    expect(counts.get('bio')).toBe(1);
  });
});

describe('folders', () => {
  const folders = [
    folder('b-top', { name: 'B' }),
    folder('a-top', { name: 'A' }),
    folder('first', { name: 'Z', sort_order: -1 }),
    folder('child', { parent_id: 'a-top' }),
    folder('gone', { deleted_at: T(2) }),
    folder('other', { course_id: 'bio' }),
  ];

  it('top level by sort order, then name', () => {
    expect(foldersIn(folders, 'math', null).map((f) => f.id)).toEqual(['first', 'a-top', 'b-top']);
  });

  it('one parent, or every folder of the course', () => {
    expect(foldersIn(folders, 'math', 'a-top').map((f) => f.id)).toEqual(['child']);
    expect(foldersIn(folders, 'math', undefined)).toHaveLength(4);
  });
});

describe('lectures', () => {
  const files = [
    file('root', { updated_at: T(2) }),
    file('in-folder', { folder_id: 'f1', updated_at: T(4) }),
    file('bio', { course_id: 'bio', updated_at: T(9) }),
    file('trashed', { deleted_at: T(3) }),
    file('Project Files', { title: 'Project Files', created_at: T(5) }),
    file('Project Files older', { title: 'Project Files', created_at: T(2) }),
  ];
  const lectures = files.map((f) => lecture(f.id));

  it('filters by course and folder (null = no folder) and joins the lecture row', () => {
    const rows = lecturesIn(files, lectures, { courseId: 'math', folderId: null });
    expect(rows.map((r) => r.id)).toEqual(['root', 'Project Files', 'Project Files older']);
    expect(rows[0].lectures?.id).toBe('root');
    expect(lecturesIn(files, lectures, { folderId: 'f1' }).map((r) => r.id)).toEqual(['in-folder']);
  });

  it('recent lectures across courses, newest first', () => {
    expect(lecturesIn(files, lectures, {}, 2).map((r) => r.id)).toEqual(['bio', 'in-folder']);
  });
});

describe('notes', () => {
  const summaries = [
    summary('n-old', 'l1', { created_at: T(1) }),
    summary('n-new', 'l1', { created_at: T(3) }),
    summary('draft', 'l2', {}, false),
    summary('other-format', 'l3', { result: { format: 'blocks' } }),
    summary('trashed', 'l4'),
  ];

  it("the lecture's newest note, none when the lecture is trashed", () => {
    expect(latestNote(summaries, file('l1'))?.id).toBe('n-new');
    expect(latestNote(summaries, file('l3'))).toBeNull();
    expect(latestNote(summaries, file('l1', { deleted_at: T(2) }))).toBeNull();
    expect(latestNote(summaries, null)).toBeNull();
  });

  it('which lectures have a confirmed note', () => {
    expect(lecturesWithNotes(summaries, ['l1', 'l2', 'l3', 'x'])).toEqual(new Set(['l1']));
  });

  it('confirmed notes of lectures not in Trash', () => {
    const files = [file('l1'), file('l2'), file('l4', { deleted_at: T(5) })];
    expect(confirmedNotes(summaries, files).map((s) => s.id)).toEqual(['n-new', 'n-old']);
  });
});

describe('recordings and media', () => {
  it('audio still in Storage, in recording order', () => {
    const chunks = [
      { id: 'c1', lecture_id: 'l1', seq: 1, storage_path: 'p1' },
      { id: 'c0', lecture_id: 'l1', seq: 0, storage_path: 'p0' },
      { id: 'deleted', lecture_id: 'l1', seq: 2, storage_path: null },
      { id: 'other', lecture_id: 'l2', seq: 0, storage_path: 'x' },
    ] as AudioChunkRow[];
    expect(audioOf(chunks, 'l1').map((c) => c.id)).toEqual(['c0', 'c1']);
  });

  it("photos and PDFs of a course's lectures, newest first", () => {
    const media = [
      { id: 'm1', lecture_id: 'l1', kind: 'photo', created_at: T(1) },
      { id: 'm2', lecture_id: 'l1', kind: 'slides', created_at: T(2) },
      { id: 'audio', lecture_id: 'l1', kind: 'audio', created_at: T(3) },
      { id: 'trashed', lecture_id: 'l2', kind: 'photo', created_at: T(4) },
    ] as MediaRow[];
    const files = [file('l1'), file('l2', { deleted_at: T(1) })];
    expect(courseMedia(media, files, 'math').map((m) => m.id)).toEqual(['m2', 'm1']);
  });
});

describe('missingFrom', () => {
  it('cached rows of the scope that a complete answer no longer has', () => {
    const cached = [folder('kept'), folder('moved'), folder('elsewhere', { course_id: 'bio' })];
    expect(missingFrom(cached, (f) => f.course_id === 'math', [{ id: 'kept' }])).toEqual(['moved']);
  });
});

describe('library files (offline reading)', () => {
  const files = [
    file('pdf-root', { kind: 'pdf', title: 'b.pdf' }),
    file('img-root', { kind: 'image', title: 'a.png' }),
    file('in-folder', { kind: 'pdf', folder_id: 'f1' }),
    file('lecture', { kind: 'lecture' }),
    file('trashed', { kind: 'pdf', deleted_at: T(3) }),
    file('other-course', { kind: 'pdf', course_id: 'bio' }),
  ];
  const media = [
    { id: 'm1', file_id: 'pdf-root', lecture_id: null },
    { id: 'm2', file_id: 'img-root', lecture_id: null },
    { id: 'm3', file_id: null, lecture_id: 'lecture' },
  ] as MediaRow[];

  it('pdf and image files of the place, by name, with their own media only', () => {
    const rows = libraryFilesIn(files, media, 'math', null);
    expect(rows.map((r) => r.id)).toEqual(['img-root', 'pdf-root']);
    expect(rows[0].media.map((m) => m.id)).toEqual(['m2']);
    expect(libraryFilesIn(files, media, 'math', 'f1').map((r) => r.id)).toEqual(['in-folder']);
  });
});
