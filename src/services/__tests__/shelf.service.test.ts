// The library sections, the course tree, Review today and starring (step 2.2).
import { NetworkError } from '../../lib/cloudRows';
import { reportFailure, reportReachable, resetConnectivityForTests } from '../../lib/connectivity';
import { answer, callsOn, chains, resetSupabaseMock } from '../../test-utils/supabaseMock';
import { getProjects } from '../project.service';
import {
  getCourseContents,
  getCourseLevel,
  getExamPacks,
  getRecentItems,
  getReviewDueCount,
  getStarredItems,
  setStarredAt,
} from '../shelf.service';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/supabaseMock').module);

const T = (n: number) => `2026-10-${String(n).padStart(2, '0')}T10:00:00.000Z`;
const math = { id: 'math', name: 'Math', color: '#123', is_archived: false, deleted_at: null, starred_at: null, updated_at: T(1) };
const fileRow = (id: string, over: object = {}) => ({
  id, title: id, kind: 'lecture', course_id: 'math', folder_id: null, deleted_at: null, starred_at: null,
  sort_order: 0, created_at: T(1), updated_at: T(1), lectures: null, ...over,
});

beforeEach(() => {
  resetSupabaseMock();
  resetConnectivityForTests();
  reportReachable();
});

describe('sections', () => {
  it('Recent: files of every kind, newest first, with their course', async () => {
    answer('files', { data: [fileRow('pdf', { kind: 'pdf', updated_at: T(5) }), fileRow('l1', { lectures: { id: 'l1', status: 'ready' } })] });
    answer('courses', { data: [math] });
    const items = await getRecentItems(5);
    expect(items.map((i) => [i.id, i.type, i.courseName])).toEqual([
      ['pdf', 'pdf', 'Math'],
      ['l1', 'lecture', 'Math'],
    ]);
    expect(items[1].status).toBe('completed');
    expect(callsOn('files', 'is')).toContainEqual(['deleted_at', null]);
    expect(callsOn('files', 'order')).toContainEqual(['updated_at', { ascending: false }]);
    expect(callsOn('files', 'limit')).toContainEqual([5]);
  });

  it('Favorites: courses, folders and files together, newest first', async () => {
    answer('courses', { data: [{ ...math, starred_at: T(2) }] }, { data: [math] });
    answer('folders', { data: [{ id: 'f', name: 'Funcions', course_id: 'math', parent_id: null, starred_at: T(4), updated_at: T(1) }] });
    answer('files', { data: [fileRow('l1', { starred_at: T(3) })] });
    const items = await getStarredItems();
    expect(items.map((i) => [i.id, i.type])).toEqual([
      ['f', 'folder'],
      ['l1', 'lecture'],
      ['math', 'course'],
    ]);
    expect(items[0].courseName).toBe('Math');
    for (const table of ['courses', 'folders', 'files']) {
      expect(callsOn(table, 'not')).toContainEqual(['starred_at', 'is', null]);
    }
  });

  it('Exam packs: only that kind', async () => {
    answer('files', { data: [fileRow('pack', { kind: 'exam_pack' })] });
    answer('courses', { data: [math] });
    const items = await getExamPacks();
    expect(items.map((i) => i.type)).toEqual(['exam_pack']);
    expect(callsOn('files', 'eq')).toContainEqual(['kind', 'exam_pack']);
  });
});

describe('Favorites with lecture photos', () => {
  it('a favorite photo shows as "Photo 2 · Lecture"; a photo of a trashed lecture is left out', async () => {
    answer('courses', { data: [] }, { data: [math] });
    answer('folders', { data: [] });
    answer(
      'files',
      { data: [] },
      { data: [fileRow('l1', { title: 'Clase 1', lectures: { id: 'l1', status: 'ready' } })] },
    );
    const photo = (id: string, lecture: string, created: number, starred: string | null) => ({
      id, lecture_id: lecture, file_id: null, kind: 'photo', caption: null, starred_at: starred,
      created_at: T(created), updated_at: T(created),
    });
    answer(
      'media',
      { data: [photo('p2', 'l1', 3, T(9)), photo('gone', 'l9', 1, T(8))] },
      { data: [photo('p1', 'l1', 1, null), photo('p2', 'l1', 3, T(9)), photo('gone', 'l9', 1, T(8))] },
    );
    const items = await getStarredItems();
    expect(items.map((i) => [i.type, i.title, i.lectureId])).toEqual([['lecture_photo', 'Photo 2 · Clase 1', 'l1']]);
    expect(items[0].courseName).toBe('Math');
  });

  it('a lecture photo is written on media', async () => {
    await setStarredAt({ type: 'media', id: 'p2' }, T(5));
    expect(callsOn('media', 'update')).toEqual([[{ starred_at: T(5) }]]);
  });
});

describe('getCourseLevel', () => {
  it('a course top level: its folders first, then its files', async () => {
    answer('folders', { data: [{ id: 'f', name: 'Funcions', course_id: 'math', parent_id: null, deleted_at: null, sort_order: 0, starred_at: null, updated_at: T(1) }] });
    answer('files', { data: [fileRow('b'), fileRow('a', { kind: 'pdf' })] });
    const items = await getCourseLevel('math', null);
    expect(items.map((i) => i.id)).toEqual(['f', 'a', 'b']);
    expect(callsOn('folders', 'is')).toContainEqual(['parent_id', null]);
    expect(callsOn('files', 'is')).toContainEqual(['folder_id', null]);
  });

  it('inside a folder', async () => {
    answer('folders', { data: [] });
    answer('files', { data: [fileRow('in', { folder_id: 'f' })] });
    expect((await getCourseLevel('math', 'f')).map((i) => i.id)).toEqual(['in']);
    expect(callsOn('folders', 'eq')).toContainEqual(['parent_id', 'f']);
    expect(callsOn('files', 'eq')).toContainEqual(['folder_id', 'f']);
  });
});

describe('getCourseContents (the course grid)', () => {
  it('folders with their item counts, lectures with their length, without the Project Files lecture', async () => {
    answer(
      'folders',
      { data: [{ id: 'f', name: 'Funcions', course_id: 'math', parent_id: null, deleted_at: null, sort_order: 0, starred_at: null, updated_at: T(1) }] },
      { data: [{ id: 'sub', parent_id: 'f', deleted_at: null }] },
    );
    answer(
      'files',
      {
        data: [
          fileRow('l1', { title: 'Tema 1', lectures: { id: 'l1', status: 'ready', duration_ms: 5_520_000 } }),
          fileRow('pf', { title: 'Project Files', lectures: { id: 'pf', status: 'ready', duration_ms: null } }),
        ],
      },
      { data: [{ id: 'x', folder_id: 'f', deleted_at: null }, { id: 'y', folder_id: 'f', deleted_at: null }] },
    );
    const items = await getCourseContents('math', null);
    expect(items.map((i) => [i.id, i.childCount, i.durationSeconds])).toEqual([
      ['f', 3, undefined],
      ['l1', undefined, 5520],
    ]);
  });
});

describe('getReviewDueCount', () => {
  it('counts reviews due by the end of today', async () => {
    answer('review_schedule', { count: 3 });
    expect(await getReviewDueCount(new Date('2026-10-25T09:00:00'))).toBe(3);
    const [[, due]] = callsOn('review_schedule', 'lte') as [string, string][];
    expect(new Date(due).getDate()).toBe(25);
    expect(new Date(due).getHours()).toBe(23);
  });

  it('unknown (null) on an error or offline, which hides the badge', async () => {
    answer('review_schedule', { error: { message: 'no' } });
    expect(await getReviewDueCount()).toBeNull();
    resetSupabaseMock();
    reportFailure();
    expect(await getReviewDueCount()).toBeNull();
    expect(chains).toHaveLength(0);
  });
});

describe('setStarredAt', () => {
  it('writes starred_at on the right table, and null unstars', async () => {
    await setStarredAt({ type: 'course', id: 'math' }, T(5));
    await setStarredAt({ type: 'folder', id: 'f' }, T(5));
    await setStarredAt({ type: 'file', id: 'l1' }, null);
    expect(callsOn('courses', 'update')).toEqual([[{ starred_at: T(5) }]]);
    expect(callsOn('folders', 'update')).toEqual([[{ starred_at: T(5) }]]);
    expect(callsOn('files', 'update')).toEqual([[{ starred_at: null }]]);
    expect(callsOn('files', 'eq')).toContainEqual(['id', 'l1']);
  });

  it('offline: refuses and writes nothing', async () => {
    reportFailure();
    await expect(setStarredAt({ type: 'file', id: 'l1' }, T(5))).rejects.toBeInstanceOf(NetworkError);
    expect(chains).toHaveLength(0);
  });

  it('a refused write is reported', async () => {
    answer('files', { error: { message: 'denied' } });
    await expect(setStarredAt({ type: 'file', id: 'l1' }, T(5))).rejects.toThrow('Could not add this to Favorites.');
  });
});

describe('course counts', () => {
  it('counts lectures and items (every kind) per course', async () => {
    answer('courses', { data: [math] });
    answer('files', { data: [{ course_id: 'math', kind: 'lecture' }, { course_id: 'math', kind: 'pdf' }, { course_id: 'math', kind: 'image' }] });
    const [course] = await getProjects('u');
    expect(course).toMatchObject({ sessionCount: 1, itemCount: 3 });
  });
});
