// Spaced review of lectures (lectureReview.service). The laptop reads the plan's rows from
// Supabase and writes a review at once (review_lecture; Undo: undo_lecture_review); offline it
// refuses. The iPhone reads its own copy (offline too) and keeps a review or a switch there, queued.
// Lea, 9 Nov: a lecture's study reminders, on or off.
import { NetworkError } from '../../lib/cloudRows';
import { answer, callsOn, resetSupabaseMock } from '../../test-utils/supabaseMock';
import { addDays, localDay } from '../../lib/review/lecturePlan';
import { lecturesDueToday, markLectureReviewed, readPlanRows, setStudyReminders, studyRemindersOf, type DueLecture } from '../lectureReview.service';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/supabaseMock').module);
jest.mock('../../lib/connectivity', () => ({ isOffline: jest.fn(() => false) }));
jest.mock('../session.service', () => ({ ensureLectureOnServer: jest.fn(async () => {}) }));
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `new-${++n}` };
});
jest.mock('../../lib/cache/store', () => {
  const state = { enabled: false };
  const local: Record<string, Record<string, Record<string, unknown>>> = {};
  const dirty = new Set<string>();
  return {
    state,
    local,
    dirty,
    get cacheEnabled() {
      return state.enabled;
    },
    cacheUser: () => 'user-1',
    readRows: async (tbl: string) => Object.values(local[tbl] ?? {}),
    readRow: async (tbl: string, id: string) => local[tbl]?.[id] ?? null,
    saveLocalRow: async (tbl: string, row: Record<string, unknown>) => {
      local[tbl] = { ...(local[tbl] ?? {}), [row.id as string]: row };
      dirty.add(`${tbl}:${row.id}`);
    },
    markClean: async (tbl: string, id: string) => {
      dirty.delete(`${tbl}:${id}`);
    },
  };
});
jest.mock('../../lib/sync', () => {
  const state = { enabled: false };
  const handlers: Record<string, { run: (p: unknown) => Promise<void>; merge?: (a: unknown, b: unknown) => unknown }> = {};
  const queued: { kind: string; key: string; payload: unknown }[] = [];
  return {
    state,
    handlers,
    queued,
    get syncEnabled() {
      return state.enabled;
    },
    registerSyncHandler: (kind: string, handler: { run: (p: unknown) => Promise<void> }) => {
      handlers[kind] = handler;
    },
    enqueue: async (op: { kind: string; key: string; payload: unknown }) => {
      queued.push(op);
      return op;
    },
  };
});

const store = jest.requireMock('../../lib/cache/store') as { state: { enabled: boolean }; local: Record<string, Record<string, Record<string, unknown>>>; dirty: Set<string> };
const sync = jest.requireMock('../../lib/sync') as {
  state: { enabled: boolean };
  handlers: Record<string, { run: (p: unknown) => Promise<void>; merge?: (a: unknown, b: unknown) => unknown }>;
  queued: { kind: string; key: string; payload: Record<string, unknown> }[];
};
const connectivity = jest.requireMock('../../lib/connectivity') as { isOffline: jest.Mock };

const NOW = new Date(2026, 10, 13, 9, 0);
const lecture = (over: Partial<DueLecture> = {}): DueLecture => ({
  fileId: 'l1',
  title: 'Tema 1',
  courseId: 'k1',
  course: 'Psicobiología',
  session: { day: '2026-11-13', offset: 3, kind: 'after' },
  label: 'Day 3',
  scheduleId: null,
  lastReviewedAt: null,
  next: { day: '2026-11-17', offset: 7, kind: 'after' },
  ...over,
});
const args = (fn: string) => callsOn(`rpc:${fn}`, 'args').map(([a]) => a as Record<string, unknown>);

beforeEach(() => {
  resetSupabaseMock();
  store.state.enabled = false;
  sync.state.enabled = false;
  sync.queued.length = 0;
  store.dirty.clear();
  for (const k of Object.keys(store.local)) delete store.local[k];
  connectivity.isOffline.mockReturnValue(false);
});

describe('the laptop', () => {
  it('reads the plan’s rows: live lectures, their dates and switch, lecture review rows, exam dates, courses', async () => {
    answer('files', { data: [{ id: 'l1', title: 'Tema 1', kind: 'lecture', course_id: 'k1', deleted_at: null, created_at: '2026-11-10T09:00:00' }] });
    answer('lectures', { data: [{ id: 'l1', recorded_at: '2026-11-10T09:00:00', study_reminders: null }] });
    answer('course_settings', { data: [{ course_id: 'k1', exam_date: null, study_reminders: true }] });
    answer('courses', { data: [{ id: 'k1', name: 'Psicobiología' }] });
    const due = await lecturesDueToday(NOW);
    expect(due.map((d) => [d.title, d.course, d.label])).toEqual([['Tema 1', 'Psicobiología', 'Day 3']]);
    expect(callsOn('files', 'eq')).toContainEqual(['kind', 'lecture']);
    expect(callsOn('files', 'is')).toContainEqual(['deleted_at', null]);
    expect(callsOn('review_schedule', 'not')).toContainEqual(['file_id', 'is', null]);
  });

  it('an error is said, not hidden', async () => {
    answer('lectures', { error: { message: 'no' } });
    await expect(readPlanRows()).rejects.toThrow();
  });

  it('Mark reviewed: review_lecture with a new row id, the time, the next session’s day; Undo puts the earlier review back', async () => {
    const undo = await markLectureReviewed(lecture({ lastReviewedAt: '2026-11-11T18:00:00.000Z' }), NOW);
    const [sent] = args('review_lecture');
    expect(sent).toMatchObject({ p_file_id: 'l1', p_reviewed_at: NOW.toISOString(), p_next_due: new Date(2026, 10, 17).toISOString() });
    expect(sent.p_id).toMatch(/^new-/);
    await undo();
    expect(args('undo_lecture_review')).toEqual([{ p_file_id: 'l1', p_reviewed_at: NOW.toISOString(), p_previous: '2026-11-11T18:00:00.000Z' }]);
  });

  it('an existing review row keeps its id; no next session: tomorrow is noted', async () => {
    await markLectureReviewed(lecture({ scheduleId: 's1', next: null }), NOW);
    expect(args('review_lecture')[0]).toMatchObject({ p_id: 's1', p_next_due: new Date(2026, 10, 14).toISOString() });
  });

  it('offline: refused (NetworkError), nothing sent', async () => {
    connectivity.isOffline.mockReturnValue(true);
    await expect(markLectureReviewed(lecture(), NOW)).rejects.toBeInstanceOf(NetworkError);
    await expect(setStudyReminders('l1', false)).rejects.toBeInstanceOf(NetworkError);
    expect(args('review_lecture')).toEqual([]);
  });

  it('study reminders: written on the lecture; read as its own switch, else the course’s default', async () => {
    await setStudyReminders('l1', false);
    expect(callsOn('lectures', 'update')).toEqual([[{ study_reminders: false }]]);
    expect(callsOn('lectures', 'eq')).toContainEqual(['id', 'l1']);
    answer('lectures', { data: { id: 'l1', recorded_at: null, study_reminders: null } });
    answer('course_settings', { data: { course_id: 'k1', exam_date: null, study_reminders: false } });
    expect(await studyRemindersOf('l1', 'k1')).toEqual({ on: false, own: null, courseDefault: false });
    answer('lectures', { data: { id: 'l1', recorded_at: null, study_reminders: true } });
    expect(await studyRemindersOf('l1', null)).toEqual({ on: true, own: true, courseDefault: true });
  });
});

describe('the iPhone', () => {
  beforeEach(() => {
    store.state.enabled = true;
    sync.state.enabled = true;
    const day = localDay(NOW);
    store.local.files = { l1: { id: 'l1', user_id: 'user-1', title: 'Tema 1', kind: 'lecture', course_id: 'k1', deleted_at: null, created_at: `${addDays(day, -3)}T09:00:00` } };
    store.local.lectures = { l1: { id: 'l1', user_id: 'user-1', recorded_at: null, study_reminders: null } };
    store.local.course_settings = { k1: { id: 'k1', course_id: 'k1', user_id: 'user-1', exam_date: null, study_reminders: true } };
    store.local.courses = { k1: { id: 'k1', user_id: 'user-1', name: 'Psicobiología' } };
  });

  it('the plan from its own copy (offline too): nothing asked of Supabase', async () => {
    connectivity.isOffline.mockReturnValue(true);
    expect((await lecturesDueToday(NOW)).map((d) => d.label)).toEqual(['Day 3']);
    expect(callsOn('files', 'select')).toEqual([]);
  });

  it('Mark reviewed: kept here (no longer due) and queued; sent, then clean', async () => {
    connectivity.isOffline.mockReturnValue(true);
    const [due] = await lecturesDueToday(NOW);
    await markLectureReviewed(due, NOW);
    expect(await lecturesDueToday(NOW)).toEqual([]);
    expect(sync.queued).toHaveLength(1);
    const op = sync.queued[0];
    expect(op).toMatchObject({ kind: 'review_lecture', key: 'lecture-review:l1', payload: { op: 'review', fileId: 'l1', reviewedAt: NOW.toISOString() } });
    const id = op.payload.id as string;
    expect(store.local.review_schedule[id]).toMatchObject({ file_id: 'l1', flashcard_id: null, reps: 1, last_reviewed_at: NOW.toISOString() });
    await sync.handlers.review_lecture.run(op.payload);
    expect(args('review_lecture')[0]).toMatchObject({ p_id: id, p_file_id: 'l1' });
    expect(store.dirty.has(`review_schedule:${id}`)).toBe(false);
  });

  it('Undo: the earlier review back here, queued after (a review and its Undo still waiting: the Undo)', async () => {
    const [due] = await lecturesDueToday(NOW);
    const undo = await markLectureReviewed(due, NOW);
    await undo();
    expect((await lecturesDueToday(NOW)).map((d) => d.fileId)).toEqual(['l1']);
    const [review, back] = sync.queued;
    expect(back.payload).toMatchObject({ op: 'undo', previous: null });
    expect(sync.handlers.review_lecture.merge?.(review.payload, back.payload)).toBe(back.payload);
  });

  it('study reminders off: kept on its lecture here (out of the plan at once) and queued on the lecture’s key', async () => {
    await setStudyReminders('l1', false);
    expect(await lecturesDueToday(NOW)).toEqual([]);
    expect(sync.queued[0]).toMatchObject({ kind: 'lecture_study_reminders', key: 'l1', payload: { lectureId: 'l1', on: false } });
    expect(await studyRemindersOf('l1', 'k1')).toEqual({ on: false, own: false, courseDefault: true });
    await sync.handlers.lecture_study_reminders.run(sync.queued[0].payload);
    expect(callsOn('lectures', 'update')).toEqual([[{ study_reminders: false }]]);
  });
});
