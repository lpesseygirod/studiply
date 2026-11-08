/**
 * @jest-environment node
 */
// Step 9.1b-2: starting a quiz (quiz.service.ts): the permissions in order (photos and PDFs only when
// the quiz has them, and declining that one still starts it), then the quiz function; a failure noted
// on the row (Saved · not started, and why) and thrown; already started is fine; a withdrawn
// permission forgotten. The app never writes a quiz's status. A past exam's format: the saved one,
// else read once (with the permission it needs).
import { resetTables, rowsOf, serverWrite } from '../../test-utils/fakeTables';
import { listQuizzes, pastExamFormat, quizNow, startQuiz } from '../quiz.service';

jest.mock('../../lib/supabase', () => jest.requireActual('../../test-utils/fakeTables').module);
jest.mock('../../lib/connectivity', () => ({ isOffline: jest.fn(() => false) }));
jest.mock('../../lib/cache/store', () => ({ cacheEnabled: false, readRows: jest.fn(async () => []) }));
jest.mock('../../lib/cache', () => ({ remember: jest.fn() }));
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
  return { FunctionError, callFunction: jest.fn(async () => ({ status: 'generating' })) };
});
jest.mock('../consent.service', () => {
  class ConsentDeclinedError extends Error {}
  return { ConsentDeclinedError, ensureConsent: jest.fn(async () => {}), forgetConsent: jest.fn() };
});

const functions = jest.requireMock('../../lib/functions') as { callFunction: jest.Mock; FunctionError: new (m: string, s: number, c: string, u?: boolean) => Error };
const consent = jest.requireMock('../consent.service') as { ensureConsent: jest.Mock; forgetConsent: jest.Mock; ConsentDeclinedError: new () => Error };
const connectivity = jest.requireMock('../../lib/connectivity') as { isOffline: jest.Mock };
const cache = jest.requireMock('../../lib/cache') as { remember: jest.Mock };

const QUIZ = 'quiz-1';
const settings = (over: Record<string, unknown> = {}) => ({ version: 1, topic: { wholeCourse: false, lectureIds: ['lec-1'] }, resources: { notes: true, summaries: true, lectureMedia: false, fileIds: [] }, pastExamIds: [], ...over });
const quizRow = (over: Record<string, unknown> = {}) =>
  serverWrite('quizzes', { id: QUIZ, title: 'Psico · Tema 1', status: 'pending', error: null, question_count: 10, plan: { count: 10 }, settings: settings(), deleted_at: null, course_id: 'c1', ...over });

beforeEach(() => {
  resetTables();
  jest.clearAllMocks();
  connectivity.isOffline.mockReturnValue(false);
  functions.callFunction.mockImplementation(async () => ({ status: 'generating' }));
  consent.ensureConsent.mockImplementation(async () => {});
});

describe('startQuiz', () => {
  it('the transcript permission, then the quiz function with the quiz; the row read again; the app writes no status', async () => {
    quizRow();
    await startQuiz(QUIZ);
    expect(consent.ensureConsent.mock.calls).toEqual([['assistant_summary']]);
    expect(functions.callFunction).toHaveBeenCalledWith('quiz', { quizId: QUIZ });
    expect(cache.remember).toHaveBeenCalledWith('quizzes', [expect.objectContaining({ id: QUIZ })]);
    expect(rowsOf('quizzes')[0].status).toBe('pending');
  });

  it('photos and PDFs asked only when the quiz has them; declining that one still starts it (without them)', async () => {
    serverWrite('files', { id: 'f-pdf', kind: 'pdf', title: 'Examen.pdf' });
    quizRow({ settings: settings({ pastExamIds: ['f-pdf'] }) });
    consent.ensureConsent.mockImplementation(async (scope: string) => {
      if (scope === 'images') throw new consent.ConsentDeclinedError();
    });
    await startQuiz(QUIZ);
    expect(consent.ensureConsent.mock.calls).toEqual([['assistant_summary'], ['images']]);
    expect(functions.callFunction).toHaveBeenCalled();

    // The lectures' own slides and photos, when ticked and there are some.
    consent.ensureConsent.mockClear();
    serverWrite('media', { id: 'm1', lecture_id: 'lec-1', kind: 'photo' });
    quizRow({ settings: settings({ resources: { notes: true, summaries: true, lectureMedia: true, fileIds: [] } }) });
    await startQuiz(QUIZ);
    expect(consent.ensureConsent.mock.calls).toEqual([['assistant_summary'], ['images']]);
  });

  it('declining the transcript permission: nothing sent, the row says why (Saved · not started), thrown', async () => {
    quizRow();
    consent.ensureConsent.mockImplementation(async () => {
      throw new consent.ConsentDeclinedError();
    });
    await expect(startQuiz(QUIZ)).rejects.toBeInstanceOf(consent.ConsentDeclinedError);
    expect(functions.callFunction).not.toHaveBeenCalled();
    expect((await listQuizzes())[0]).toMatchObject({ status: 'pending', note: 'Nothing was sent: Studiply needs your permission' });
  });

  it('today’s limit, no connection: noted; already started: fine; a withdrawn permission: forgotten', async () => {
    quizRow();
    functions.callFunction.mockRejectedValueOnce(new functions.FunctionError('limit', 429, 'daily_limit'));
    await expect(startQuiz(QUIZ)).rejects.toThrow();
    expect((await listQuizzes())[0].note).toBe('Today’s limit is reached; try again tomorrow');
    connectivity.isOffline.mockReturnValue(true);
    await expect(startQuiz(QUIZ)).rejects.toThrow();
    expect((await listQuizzes())[0].note).toBe('Needs a connection');
    connectivity.isOffline.mockReturnValue(false);
    functions.callFunction.mockRejectedValueOnce(new functions.FunctionError('busy', 409, 'already_started'));
    await expect(startQuiz(QUIZ)).resolves.toBeUndefined();
    expect((await listQuizzes())[0].note).toBeNull();
    functions.callFunction.mockRejectedValueOnce(new functions.FunctionError('no', 403, 'consent_required'));
    await expect(startQuiz(QUIZ)).rejects.toThrow();
    expect(consent.forgetConsent).toHaveBeenCalled();
  });
});

describe('the row while it is written', () => {
  it('quizNow: its state as the list shows it (the plan’s count as asked for), kept in the iPhone’s copy', async () => {
    quizRow({ status: 'ready', question_count: 9 });
    expect(await quizNow(QUIZ)).toMatchObject({ status: 'ready', questionCount: 9, requested: 10, note: null });
    expect(cache.remember).toHaveBeenCalled();
    expect(await quizNow('nope')).toBeNull();
  });
});

describe('pastExamFormat', () => {
  const FORMAT = { language: 'es', questionCount: 12, types: [{ type: 'multiple_choice', count: 12 }], optionsPerQuestion: 4, avgQuestionWords: 15, styleNotes: '', examples: [] };

  it('the saved one, with no call and no question', async () => {
    serverWrite('files', { id: 'f1', kind: 'document', title: 'Examen 2025', past_exam_format: FORMAT });
    expect(await pastExamFormat('f1')).toEqual(FORMAT);
    expect(functions.callFunction).not.toHaveBeenCalled();
    expect(consent.ensureConsent).not.toHaveBeenCalled();
  });

  it('else read by the quiz function (a PDF after the photos-and-PDFs permission too)', async () => {
    serverWrite('files', { id: 'f2', kind: 'pdf', title: 'Examen.pdf', past_exam_format: null });
    functions.callFunction.mockResolvedValueOnce({ format: FORMAT });
    expect(await pastExamFormat('f2')).toEqual(FORMAT);
    expect(functions.callFunction).toHaveBeenCalledWith('quiz', { mode: 'format', fileId: 'f2' });
    expect(consent.ensureConsent.mock.calls).toEqual([['assistant_summary'], ['images']]);
  });
});
