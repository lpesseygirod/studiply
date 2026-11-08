/**
 * @jest-environment node
 */
// Step 9.1b-3: taking a quiz (quiz-attempt.service.ts). The laptop writes Supabase at once; the iPhone
// keeps each write and queues it (quiz_attempt, quiz_answer: one per question, the latest wins;
// quiz_grade after them). Answers graded in code on save; unanswered questions written wrong at Finish
// (Lea's decision 1); her grade keeps the first one it changed; Sonnet asked only with the permission.
import { resetTables, rowsOf, serverWrite } from '../../test-utils/fakeTables';
import { attemptsByQuiz, changeGrade, finishAttempt, gradeAttempt, loadTaking, saveAnswer, startAttempt, type TakingQuiz } from '../quiz-attempt.service';
import type { TakeQuestion } from '../../lib/quiz/session';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/fakeTables').module);
jest.mock('../../lib/connectivity', () => ({ isOffline: jest.fn(() => false) }));
jest.mock('../../lib/cache/store', () => ({
  cacheEnabled: false,
  cacheUser: jest.fn(() => null),
  markClean: jest.fn(async () => {}),
  readRows: jest.fn(async () => []),
  saveLocalRow: jest.fn(async () => {}),
}));
jest.mock('../../lib/cache/library', () => ({ requestPull: jest.fn(async () => {}) }));
jest.mock('../../lib/sync', () => {
  class PermanentSyncError extends Error {}
  return { syncEnabled: false, enqueue: jest.fn(async () => ({})), registerSyncHandler: jest.fn(), PermanentSyncError };
});
jest.mock('../../lib/sync/errors', () => ({ syncError: (_e: unknown, m: string) => new Error(m) }));
jest.mock('../../lib/functions', () => {
  class FunctionError extends Error {
    code: string;
    unreachable: boolean;
    constructor(message: string, _status: number, code: string, unreachable = false) {
      super(message);
      this.code = code;
      this.unreachable = unreachable;
    }
  }
  return { FunctionError, callFunction: jest.fn(async () => ({ graded: 1, left: 0 })) };
});
jest.mock('../consent.service', () => {
  class ConsentDeclinedError extends Error {}
  return { ConsentDeclinedError, ensureConsent: jest.fn(async () => {}), forgetConsent: jest.fn() };
});
jest.mock('../cloud-storage.service', () => ({ Buckets: { photos: 'photos', slides: 'slides' }, getSignedUrl: jest.fn(async () => 'https://signed') }));
jest.mock('../quiz.service', () => ({ notifyQuizzesChanged: jest.fn() }));
jest.mock('../../lib/mappers', () => {
  let n = 0;
  return { newId: () => `id-${++n}` };
});

type Handler = { run: (p: unknown) => Promise<void>; merge?: (a: unknown, b: unknown) => unknown };
const sync = jest.requireMock('../../lib/sync') as { syncEnabled: boolean; enqueue: jest.Mock; registerSyncHandler: jest.Mock; PermanentSyncError: new (m: string) => Error };
const store = jest.requireMock('../../lib/cache/store') as { cacheEnabled: boolean; cacheUser: jest.Mock; saveLocalRow: jest.Mock; markClean: jest.Mock; readRows: jest.Mock };
const library = jest.requireMock('../../lib/cache/library') as { requestPull: jest.Mock };
const functions = jest.requireMock('../../lib/functions') as { callFunction: jest.Mock; FunctionError: new (m: string, s: number, c: string, u?: boolean) => Error };
const consent = jest.requireMock('../consent.service') as { ensureConsent: jest.Mock; forgetConsent: jest.Mock; ConsentDeclinedError: new () => Error };
const connectivity = jest.requireMock('../../lib/connectivity') as { isOffline: jest.Mock };
// Registered once, when the service is first imported.
const handlers = new Map<string, Handler>(sync.registerSyncHandler.mock.calls.map(([kind, h]: [string, Handler]) => [kind, h]));

const QUIZ = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const quiz = (grading: object = { kind: 'score' }): TakingQuiz => ({
  id: QUIZ,
  title: 'Tema 1',
  status: 'ready',
  course_id: 'c1',
  language: 'es',
  settings: { choices: { grading, timeLimit: { kind: 'none' }, answers: 'afterEach', hints: true, explanations: true } } as never,
});
const question = (id: string, type: TakeQuestion['type'], data: Record<string, unknown>): TakeQuestion => ({
  id,
  quiz_id: QUIZ,
  position: 0,
  type,
  prompt: id,
  data,
  answer_text: '',
  explanation: '',
  hint: '',
  added_context: '',
  source_file_id: null,
  source_ms: null,
  source_page: null,
  mark_id: null,
  focus: '',
  difficulty: 'medium',
});
const mc = question('q-mc', 'multiple_choice', { options: ['a', 'b'], correct: 1 });
const short = question('q-short', 'short_answer', { modelAnswer: 'La memoria' });
const long = question('q-long', 'long_answer', { modelAnswer: '…', keyPoints: [] });

const iPhone = (on: boolean) => {
  sync.syncEnabled = on;
  store.cacheEnabled = on;
  store.cacheUser.mockReturnValue(on ? 'user-1' : null);
};

beforeEach(() => {
  resetTables();
  jest.clearAllMocks();
  iPhone(false);
  connectivity.isOffline.mockReturnValue(false);
  consent.ensureConsent.mockImplementation(async () => {});
  functions.callFunction.mockImplementation(async () => ({ graded: 1, left: 0 }));
});

describe('the laptop (written at once)', () => {
  it('an attempt: its grading from the quiz, one point a question, in progress', async () => {
    const a = await startAttempt(quiz({ kind: 'passFail', threshold: 70 }), [mc, short, long]);
    expect(rowsOf('quiz_attempts')).toEqual([expect.objectContaining({ id: a.id, quiz_id: QUIZ, status: 'in_progress', grading: 'pass_fail', pass_threshold: 70, max_points: 3 })]);
    // The score is the trigger's: never sent.
    expect(rowsOf('quiz_attempts')[0]).not.toHaveProperty('score');
  });

  it('answers graded in code on save; a short answer code can’t match and a long one wait for the AI; the same question again replaces it', async () => {
    const a = await startAttempt(quiz(), [mc, short, long]);
    const first = await saveAnswer(a, mc, { choice: 0 }, { hintUsed: true, timeMs: 4000 });
    expect(first).toMatchObject({ verdict: 'wrong', points: 0, graded_by: 'code', hint_used: true, time_ms: 4000 });
    const again = await saveAnswer(a, mc, { choice: 1 }, { existing: first });
    expect(again).toMatchObject({ id: first.id, verdict: 'correct', points: 1 });
    expect(rowsOf('quiz_answers').filter((r) => r.question_id === mc.id)).toHaveLength(1);
    expect(await saveAnswer(a, short, { text: 'recordar' })).toMatchObject({ verdict: 'pending', graded_by: null });
    expect(await saveAnswer(a, short, { text: 'la memoria' })).toMatchObject({ verdict: 'correct' });
    expect(await saveAnswer(a, long, { text: 'Un párrafo.' })).toMatchObject({ verdict: 'pending' });
  });

  it('Finish: every question left written as wrong ({} as its response), the attempt finished with its length', async () => {
    const a = await startAttempt(quiz(), [mc, short, long], new Date('2026-11-08T10:00:00Z'));
    const answered = [await saveAnswer(a, mc, { choice: 1 })];
    const done = await finishAttempt(a, answered, [short, long], new Date('2026-11-08T10:06:40Z'));
    expect(done.added.map((x) => [x.question_id, x.verdict, x.points])).toEqual([
      ['q-short', 'wrong', 0],
      ['q-long', 'wrong', 0],
    ]);
    expect(rowsOf('quiz_answers').find((r) => r.question_id === 'q-long')?.response).toEqual({});
    expect(done.attempt).toMatchObject({ status: 'finished', finished_at: '2026-11-08T10:06:40.000Z', duration_ms: 400_000, points: 1, score: 3.3 });
    expect(rowsOf('quiz_attempts')[0]).toMatchObject({ status: 'finished', duration_ms: 400_000 });
  });

  it('her grade: the first grade kept once (was: Wrong), never pending; points follow', async () => {
    const a = await startAttempt(quiz(), [mc, long]);
    const wrong = await saveAnswer(a, mc, { choice: 0 });
    const mine = await changeGrade(wrong, 'correct');
    expect(mine).toMatchObject({ verdict: 'correct', points: 1, graded_by: 'student', original_verdict: 'wrong' });
    expect(await changeGrade(mine, 'partly')).toMatchObject({ verdict: 'partly', points: 0.5, original_verdict: 'wrong' });
    // Graded by her while the AI was still grading it: no grade before hers.
    const pending = await saveAnswer(a, long, { text: 'x y z' });
    expect(await changeGrade(pending, 'wrong')).toMatchObject({ original_verdict: null, graded_by: 'student' });
    expect(rowsOf('quiz_answers').find((r) => r.question_id === 'q-long')).toMatchObject({ verdict: 'wrong', graded_by: 'student' });
  });

  it('grading: the transcript permission, then the quiz function’s grade mode', async () => {
    expect(await gradeAttempt(QUIZ, 'att-1')).toBe('done');
    expect(consent.ensureConsent).toHaveBeenCalledWith('assistant_summary');
    expect(functions.callFunction).toHaveBeenCalledWith('quiz', { mode: 'grade', quizId: QUIZ, attemptId: 'att-1' });
  });

  it('declined: nothing sent; withdrawn on the server: forgotten; the limit; unreachable; offline: nothing tried', async () => {
    consent.ensureConsent.mockImplementationOnce(async () => {
      throw new consent.ConsentDeclinedError();
    });
    expect(await gradeAttempt(QUIZ, 'att-1')).toBe('needs_permission');
    expect(functions.callFunction).not.toHaveBeenCalled();

    functions.callFunction.mockRejectedValueOnce(new functions.FunctionError('x', 403, 'consent_required'));
    expect(await gradeAttempt(QUIZ, 'att-1')).toBe('needs_permission');
    expect(consent.forgetConsent).toHaveBeenCalled();
    functions.callFunction.mockRejectedValueOnce(new functions.FunctionError('x', 429, 'daily_limit'));
    expect(await gradeAttempt(QUIZ, 'att-1')).toBe('limit');
    functions.callFunction.mockRejectedValueOnce(new functions.FunctionError('x', 0, 'network', true));
    expect(await gradeAttempt(QUIZ, 'att-1')).toBe('offline');
    functions.callFunction.mockRejectedValueOnce(new functions.FunctionError('x', 502, 'grading_failed'));
    expect(await gradeAttempt(QUIZ, 'att-1')).toBe('failed');

    functions.callFunction.mockClear();
    connectivity.isOffline.mockReturnValue(true);
    expect(await gradeAttempt(QUIZ, 'att-1')).toBe('offline');
    expect(functions.callFunction).not.toHaveBeenCalled();
    expect(sync.enqueue).not.toHaveBeenCalled();
  });

  it('the quiz, its questions in order, its attempts newest first, the files they cite; another’s or a deleted one not found', async () => {
    serverWrite('quizzes', { id: QUIZ, title: 'Tema 1', status: 'ready', course_id: 'c1', language: 'es', settings: {}, deleted_at: null });
    serverWrite('courses', { id: 'c1', name: 'Psicobiología' });
    serverWrite('quiz_questions', { ...mc, position: 1, source_file_id: 'f1' });
    serverWrite('quiz_questions', { ...short, position: 0 });
    serverWrite('files', { id: 'f1', title: 'Lecture 3', kind: 'lecture' });
    serverWrite('quiz_attempts', { id: 'old', quiz_id: QUIZ, status: 'finished', started_at: '2026-11-01T10:00:00Z' });
    serverWrite('quiz_attempts', { id: 'new', quiz_id: QUIZ, status: 'in_progress', started_at: '2026-11-08T10:00:00Z' });
    const d = await loadTaking(QUIZ);
    expect(d.questions.map((q) => q.id)).toEqual(['q-short', 'q-mc']);
    expect(d.attempts.map((a) => a.id)).toEqual(['new', 'old']);
    expect(d.files.get('f1')).toMatchObject({ title: 'Lecture 3', kind: 'lecture' });
    expect(d.courseName).toBe('Psicobiología');
    expect((await attemptsByQuiz()).get(QUIZ)).toHaveLength(2);
    await expect(loadTaking('another')).rejects.toThrow('not found');
  });
});

describe('the iPhone (kept here, queued in order)', () => {
  it('the attempt and each answer saved here and queued; one queue key per question (the latest wins)', async () => {
    iPhone(true);
    const a = await startAttempt(quiz(), [mc, short]);
    const first = await saveAnswer(a, mc, { choice: 0 });
    await saveAnswer(a, mc, { choice: 1 }, { existing: first });
    expect(rowsOf('quiz_attempts')).toHaveLength(0);
    expect(rowsOf('quiz_answers')).toHaveLength(0);
    expect(store.saveLocalRow).toHaveBeenCalledWith('quiz_attempts', expect.objectContaining({ id: a.id, user_id: 'user-1' }));
    expect(sync.enqueue.mock.calls.map(([op]) => [op.kind, op.key])).toEqual([
      ['quiz_attempt', `quiz-attempt:${a.id}`],
      ['quiz_answer', `quiz-answer:${a.id}:q-mc`],
      ['quiz_answer', `quiz-answer:${a.id}:q-mc`],
    ]);
  });

  it('grading is queued after the answers (with the permission asked online); offline queued without asking', async () => {
    iPhone(true);
    expect(await gradeAttempt(QUIZ, 'att-1')).toBe('grading');
    expect(consent.ensureConsent).toHaveBeenCalled();
    expect(sync.enqueue).toHaveBeenLastCalledWith({ kind: 'quiz_grade', key: 'quiz-grade:att-1', payload: { quizId: QUIZ, attemptId: 'att-1' } });
    expect(functions.callFunction).not.toHaveBeenCalled();

    consent.ensureConsent.mockClear();
    connectivity.isOffline.mockReturnValue(true);
    expect(await gradeAttempt(QUIZ, 'att-1')).toBe('offline');
    expect(consent.ensureConsent).not.toHaveBeenCalled();
    expect(sync.enqueue).toHaveBeenCalledTimes(2);
  });

  it('the queue: an answer upserted by attempt and question and marked clean; the later of two wins', async () => {
    const run = handlers.get('quiz_answer')!;
    const row = { id: 'ans-1', user_id: 'user-1', attempt_id: 'att-1', question_id: 'q-mc', response: { choice: 1 }, verdict: 'correct', points: 1, reason: '', graded_by: 'code', original_verdict: null, hint_used: false, time_ms: null, answered_at: '2026-11-08T10:00:00Z' };
    await run.run(row);
    await run.run({ ...row, verdict: 'wrong', points: 0, graded_by: 'student', original_verdict: 'correct' });
    expect(rowsOf('quiz_answers')).toEqual([expect.objectContaining({ id: 'ans-1', verdict: 'wrong', graded_by: 'student' })]);
    expect(store.markClean).toHaveBeenCalledWith('quiz_answers', 'ans-1');
    expect(run.merge?.({ v: 1 }, { v: 2 })).toEqual({ v: 2 });
    // An unanswered one goes up as {} (the column is never SQL null).
    await run.run({ ...row, id: 'ans-2', question_id: 'q-long', response: null });
    expect(rowsOf('quiz_answers').find((r) => r.id === 'ans-2')?.response).toEqual({});
  });

  it('the queued grading: done → the grades downloaded; no permission or the limit → kept as failed; offline → tried again', async () => {
    const grade = handlers.get('quiz_grade')!;
    await grade.run({ quizId: QUIZ, attemptId: 'att-1' });
    expect(library.requestPull).toHaveBeenCalledWith(true);
    functions.callFunction.mockRejectedValueOnce(new functions.FunctionError('x', 429, 'daily_limit'));
    await expect(grade.run({ quizId: QUIZ, attemptId: 'att-1' })).rejects.toBeInstanceOf(sync.PermanentSyncError);
    functions.callFunction.mockRejectedValueOnce(new functions.FunctionError('x', 0, 'network', true));
    const err = await grade.run({ quizId: QUIZ, attemptId: 'att-1' }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(sync.PermanentSyncError);
  });
});
