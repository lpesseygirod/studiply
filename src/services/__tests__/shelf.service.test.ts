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
  markOpened,
  resetOpenedForTests,
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
    expect(callsOn('files', 'order')).toContainEqual(['last_opened_at', { ascending: false }]);
    expect(callsOn('files', 'limit')).toContainEqual([5]);
  });

  it('Recent: opened or edited, each file once', async () => {
    answer(
      'files',
      { data: [fileRow('edited', { updated_at: T(5) }), fileRow('opened', { updated_at: T(1), last_opened_at: T(7) })] },
      { data: [fileRow('opened', { updated_at: T(1), last_opened_at: T(7) }), fileRow('old', { updated_at: T(1), last_opened_at: T(2) })] },
    );
    answer('courses', { data: [math] });
    const items = await getRecentItems(5);
    expect(items.map((i) => i.id)).toEqual(['opened', 'edited', 'old']);
    expect(callsOn('files', 'not')).toContainEqual(['last_opened_at', 'is', null]);
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
  it('counts cards due by the end of today', async () => {
    answer('review_schedule', { count: 3 });
    expect(await getReviewDueCount(new Date('2026-10-25T09:00:00'))).toBe(3);
    const [[, due]] = callsOn('review_schedule', 'lte') as [string, string][];
    expect(new Date(due).getDate()).toBe(25);
    expect(new Date(due).getHours()).toBe(23);
    expect(callsOn('review_schedule', 'not')).toContainEqual(['flashcard_id', 'is', null]);
  });

  it('step 9.2: and the lectures due today (their plan: here day 3 of one, the other turned off)', async () => {
    answer('review_schedule', { count: 2 }, { data: [] });
    answer('files', {
      data: [
        { id: 'l1', title: 'Tema 1', kind: 'lecture', course_id: 'math', deleted_at: null, created_at: '2026-11-06T09:00:00' },
        { id: 'l2', title: 'Tema 2', kind: 'lecture', course_id: 'math', deleted_at: null, created_at: '2026-11-06T09:00:00' },
      ],
    });
    answer('lectures', { data: [{ id: 'l1', recorded_at: '2026-11-06T09:00:00', study_reminders: null }, { id: 'l2', recorded_at: '2026-11-06T09:00:00', study_reminders: false }] });
    answer('course_settings', { data: [{ course_id: 'math', exam_date: null, study_reminders: true }] });
    answer('courses', { data: [math] });
    expect(await getReviewDueCount(new Date('2026-11-09T09:00:00'))).toBe(3);
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

describe('markOpened', () => {
  beforeEach(() => resetOpenedForTests());
  const at = (s: number) => new Date(Date.UTC(2026, 9, 26, 10, 0, s));

  it('saves when it was opened, and nothing else', async () => {
    answer('files', { data: [] });
    await markOpened('l1', at(0));
    expect(callsOn('files', 'update')).toEqual([[{ last_opened_at: at(0).toISOString() }]]);
    expect(callsOn('files', 'eq')).toContainEqual(['id', 'l1']);
  });

  it('writes at most once a minute per file', async () => {
    answer('files', { data: [] }, { data: [] }, { data: [] });
    await markOpened('l1', at(0));
    await markOpened('l1', at(30));
    await markOpened('l2', at(30));
    await markOpened('l1', at(61));
    expect(callsOn('files', 'eq')).toEqual([['id', 'l1'], ['id', 'l2'], ['id', 'l1']]);
  });

  it('never fails the screen, and tries again next time after an error', async () => {
    answer('files', { data: null, error: { message: 'denied', code: '42501' } }, { data: [] });
    await expect(markOpened('l1', at(0))).resolves.toBeUndefined();
    await markOpened('l1', at(5));
    expect(callsOn('files', 'update')).toHaveLength(2);
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
