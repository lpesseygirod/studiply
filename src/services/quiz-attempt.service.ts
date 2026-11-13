/**
 * quiz-attempt.service.ts
 * Taking a quiz (the approved plan, docs/reports/plan-9.1b-3.md): the quiz with its
 * questions and attempts, an attempt started or resumed, an answer saved (graded in code at once:
 * quiz-grade.ts), the short and long answers sent to Sonnet (the quiz function's grade mode), an
 * attempt finished (its unanswered questions written as wrong), a grade she changes, a file source
 * opened at its page.
 *
 * - The laptop reads and writes Supabase (online only, as the web always does).
 * - The iPhone reads its own copy (quiz_questions, quiz_attempts and quiz_answers are downloaded with
 *   the library) and writes there, queued in order: `quiz_attempt` (the attempt: started, finished),
 *   `quiz_answer` (one per question: the latest wins, her grade changes too), `quiz_grade` (the grading
 *   call, after its answers). A quiz is taken offline; short and long answers wait ("Grading when online").
 * - The database's triggers keep the score and make the review cards, on every device.
 */

import { Platform } from 'react-native';

import { NetworkError, serviceError } from '../lib/cloudRows';
import { cacheEnabled, cacheUser, markClean, readRows, saveLocalRow, type CacheableRow } from '../lib/cache/store';
import { requestPull } from '../lib/cache/library';
import { isOffline } from '../lib/connectivity';
import { callFunction, FunctionError } from '../lib/functions';
import { newId } from '../lib/mappers';
import { supabase } from '../lib/supabase';
import { enqueue, PermanentSyncError, registerSyncHandler, syncEnabled } from '../lib/sync';
import { syncError } from '../lib/sync/errors';
import { AI_GRADED, gradeAnswer, verdictPoints, type QuizResponse, type Verdict } from '../../supabase/functions/_shared/quiz-grade';
import type { QuizSettings } from '../../supabase/functions/_shared/quiz-settings';
import { attemptScore, type AnswerRow, type AttemptRow, type TakeQuestion } from '../lib/quiz/session';
import type { Json } from '../types/supabase';
import { Buckets, getSignedUrl } from './cloud-storage.service';
import { ConsentDeclinedError, ensureConsent, forgetConsent } from './consent.service';
import { notifyQuizzesChanged } from './quiz.service';

export interface TakingQuiz {
  id: string;
  title: string;
  status: string;
  course_id: string | null;
  language: string | null;
  settings: QuizSettings;
}

export interface SourceFile {
  id: string;
  title: string;
  kind: string;
}

export interface MarkInfo {
  id: string;
  type: 'important' | 'confused' | 'exam';
  level: number;
  t_ms: number;
}

export interface TakingData {
  quiz: TakingQuiz;
  /** For the laptop's top bar ("Review today · Psicobiología"). */
  courseName: string | null;
  questions: TakeQuestion[];
  /** Newest first. */
  attempts: AttemptRow[];
  /** The files the questions cite (lectures, PDFs, photos, documents). */
  files: Map<string, SourceFile>;
  /** Her marks the questions came from (read when online: the iPhone's copy has no marks). */
  marks: Map<string, MarkInfo>;
}

const QUESTION_COLUMNS = 'id, quiz_id, position, type, prompt, data, answer_text, explanation, hint, added_context, source_file_id, source_ms, source_page, mark_id, focus, difficulty';
const ATTEMPT_COLUMNS = 'id, user_id, quiz_id, status, started_at, finished_at, duration_ms, grading, pass_threshold, max_points, points, score, passed, created_at, updated_at';
const ANSWER_COLUMNS = 'id, user_id, attempt_id, question_id, response, verdict, points, reason, graded_by, original_verdict, hint_used, time_ms, answered_at, updated_at';

const local = () => cacheEnabled && syncEnabled;
const newestFirst = (a: AttemptRow, b: AttemptRow) => (b.started_at ?? '').localeCompare(a.started_at ?? '');

/** The quiz, its questions, its attempts (newest first), the files and marks they cite. */
export async function loadTaking(quizId: string): Promise<TakingData> {
  let quiz: TakingQuiz | null;
  let questions: TakeQuestion[];
  let attempts: AttemptRow[];
  let files: SourceFile[];
  if (cacheEnabled) {
    quiz = (await readRows<TakingQuiz & { deleted_at: string | null }>('quizzes')).find((q) => q.id === quizId && !q.deleted_at) ?? null;
    questions = await readRows<TakeQuestion>('quiz_questions', quizId);
    attempts = await readRows<AttemptRow>('quiz_attempts', quizId);
    files = await readRows<SourceFile>('files');
  } else {
    if (isOffline()) throw new NetworkError();
    const [q, qs, at] = await Promise.all([
      supabase.from('quizzes').select('id, title, status, course_id, language, settings').eq('id', quizId).is('deleted_at', null).maybeSingle(),
      supabase.from('quiz_questions').select(QUESTION_COLUMNS).eq('quiz_id', quizId).order('position'),
      supabase.from('quiz_attempts').select(ATTEMPT_COLUMNS).eq('quiz_id', quizId),
    ]);
    for (const r of [q, qs, at]) if (r.error) throw serviceError(r.error, 'Could not load the quiz.');
    quiz = (q.data as unknown as TakingQuiz | null) ?? null;
    questions = (qs.data ?? []) as unknown as TakeQuestion[];
    attempts = (at.data ?? []) as unknown as AttemptRow[];
    const ids = [...new Set(questions.map((x) => x.source_file_id).filter((x): x is string => !!x))];
    const f = ids.length ? await supabase.from('files').select('id, title, kind').in('id', ids) : { data: [], error: null };
    if (f.error) throw serviceError(f.error, 'Could not load the quiz.');
    files = (f.data ?? []) as SourceFile[];
  }
  if (!quiz) throw new Error('That quiz was not found.');
  let courseName: string | null = null;
  if (quiz.course_id) {
    if (cacheEnabled) courseName = (await readRows<{ id: string; name: string }>('courses')).find((x) => x.id === quiz.course_id)?.name ?? null;
    else courseName = ((await supabase.from('courses').select('name').eq('id', quiz.course_id).maybeSingle()).data as { name: string } | null)?.name ?? null;
  }
  const markIds = [...new Set(questions.map((x) => x.mark_id).filter((x): x is string => !!x))];
  const marks = new Map<string, MarkInfo>();
  if (markIds.length && !isOffline()) {
    const m = await supabase.from('marks').select('id, type, level, t_ms').in('id', markIds);
    if (!m.error) for (const row of (m.data ?? []) as MarkInfo[]) marks.set(row.id, row);
  }
  return {
    quiz,
    courseName,
    questions: [...questions].sort((a, b) => a.position - b.position),
    attempts: [...attempts].sort(newestFirst),
    files: new Map(files.map((f) => [f.id, f])),
    marks,
  };
}

/** Every quiz's attempts, by quiz (the list's Resume and "Last: 7.5 / 10"). */
export async function attemptsByQuiz(): Promise<Map<string, AttemptRow[]>> {
  let rows: AttemptRow[];
  if (cacheEnabled) rows = await readRows<AttemptRow>('quiz_attempts');
  else {
    const { data, error } = await supabase.from('quiz_attempts').select(ATTEMPT_COLUMNS);
    if (error) throw serviceError(error, 'Could not load your quizzes.');
    rows = (data ?? []) as unknown as AttemptRow[];
  }
  const by = new Map<string, AttemptRow[]>();
  for (const a of rows) by.set(a.quiz_id, [...(by.get(a.quiz_id) ?? []), a]);
  return by;
}

/** An attempt's answers, by question. */
export async function attemptAnswers(attemptId: string): Promise<Map<string, AnswerRow>> {
  let rows: AnswerRow[];
  if (cacheEnabled) rows = await readRows<AnswerRow>('quiz_answers', attemptId);
  else {
    const { data, error } = await supabase.from('quiz_answers').select(ANSWER_COLUMNS).eq('attempt_id', attemptId);
    if (error) throw serviceError(error, 'Could not load the answers.');
    rows = (data ?? []) as unknown as AnswerRow[];
  }
  return new Map(rows.map((a) => [a.question_id, a]));
}

async function userId(): Promise<string> {
  const cached = cacheUser();
  if (cached) return cached;
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user?.id;
  if (!id) throw new Error('Please sign in again.');
  return id;
}

/** An attempt or answer written: on the iPhone kept here and queued, on the laptop at once. */
async function writeAttempt(row: AttemptRow): Promise<void> {
  if (local()) {
    await saveLocalRow('quiz_attempts', row as unknown as CacheableRow);
    await enqueue<AttemptRow>({ kind: 'quiz_attempt', key: `quiz-attempt:${row.id}`, payload: row });
    return;
  }
  if (isOffline()) throw new NetworkError();
  const { error } = await supabase.from('quiz_attempts').upsert(attemptPayload(row));
  if (error) throw serviceError(error, 'Could not save the attempt.');
}

async function writeAnswer(row: AnswerRow): Promise<void> {
  if (local()) {
    await saveLocalRow('quiz_answers', row as unknown as CacheableRow);
    await enqueue<AnswerRow>({ kind: 'quiz_answer', key: `quiz-answer:${row.attempt_id}:${row.question_id}`, payload: row });
    return;
  }
  if (isOffline()) throw new NetworkError();
  const { error } = await supabase.from('quiz_answers').upsert(answerPayload(row), { onConflict: 'attempt_id,question_id' });
  if (error) throw serviceError(error, 'Could not save the answer.');
}

/** What is sent of an attempt (the score is the trigger's). */
const attemptPayload = (r: AttemptRow) => ({ id: r.id, quiz_id: r.quiz_id, status: r.status, started_at: r.started_at, finished_at: r.finished_at, duration_ms: r.duration_ms, grading: r.grading, pass_threshold: r.pass_threshold, max_points: r.max_points });
const answerPayload = (r: AnswerRow) => ({
  id: r.id,
  attempt_id: r.attempt_id,
  question_id: r.question_id,
  // Unanswered: {} (the column is never SQL null).
  response: (r.response ?? {}) as unknown as NonNullable<Json>,
  verdict: r.verdict,
  points: r.points,
  reason: r.reason,
  graded_by: r.graded_by,
  original_verdict: r.original_verdict,
  hint_used: r.hint_used,
  time_ms: r.time_ms,
  answered_at: r.answered_at,
});

/** A new attempt of the quiz: its grading from the quiz's settings, worth one point a question. */
export async function startAttempt(quiz: TakingQuiz, questions: TakeQuestion[], now: Date = new Date()): Promise<AttemptRow> {
  const g = quiz.settings.choices.grading;
  const row: AttemptRow = {
    id: newId(),
    user_id: await userId(),
    quiz_id: quiz.id,
    status: 'in_progress',
    started_at: now.toISOString(),
    finished_at: null,
    duration_ms: null,
    grading: g.kind === 'passFail' ? 'pass_fail' : 'score',
    pass_threshold: g.kind === 'passFail' ? g.threshold : 60,
    max_points: questions.length,
    points: 0,
    score: 0,
    passed: null,
  };
  await writeAttempt(row);
  // The list's Take becomes Resume.
  notifyQuizzesChanged();
  return row;
}

/**
 * Her answer to a question, graded in code at once (a short answer code can't match and every long
 * answer: pending, for Sonnet). An empty one is wrong. The same question answered again replaces it.
 */
export async function saveAnswer(
  attempt: AttemptRow,
  question: TakeQuestion,
  response: QuizResponse | null,
  opts: { existing?: AnswerRow; hintUsed?: boolean; timeMs?: number | null; now?: Date } = {},
): Promise<AnswerRow> {
  const graded = gradeAnswer(question.type, question.data, response);
  const row: AnswerRow = {
    id: opts.existing?.id ?? newId(),
    user_id: attempt.user_id,
    attempt_id: attempt.id,
    question_id: question.id,
    response,
    verdict: graded.verdict,
    points: graded.points,
    reason: '',
    graded_by: graded.verdict === 'pending' ? null : 'code',
    original_verdict: null,
    hint_used: !!opts.hintUsed,
    time_ms: opts.timeMs ?? null,
    answered_at: (opts.now ?? new Date()).toISOString(),
  };
  await writeAnswer(row);
  return row;
}

/** Finish: every question left unanswered written as wrong (Lea's decision 1), the attempt closed. */
export async function finishAttempt(
  attempt: AttemptRow,
  answered: AnswerRow[],
  left: TakeQuestion[],
  now: Date = new Date(),
): Promise<{ attempt: AttemptRow; added: AnswerRow[] }> {
  const added: AnswerRow[] = [];
  for (const q of left) added.push(await saveAnswer(attempt, q, null, { now }));
  // The score as the trigger makes it, for the iPhone's list until the server's comes down.
  const row: AttemptRow = {
    ...attempt,
    ...attemptScore([...answered, ...added], attempt),
    status: 'finished',
    finished_at: now.toISOString(),
    duration_ms: Math.max(0, now.getTime() - Date.parse(attempt.started_at)),
  };
  await writeAttempt(row);
  notifyQuizzesChanged();
  return { attempt: row, added };
}

/**
 * Her grade on an answer (any, also one still being graded): it keeps the first grade it had
 * (original_verdict, once) and is never overwritten by the AI (which grades only pending answers).
 */
export async function changeGrade(answer: AnswerRow, verdict: Verdict): Promise<AnswerRow> {
  // The grade before her first change (null: she graded it before code or the AI did).
  const original = answer.graded_by === 'student' ? answer.original_verdict : answer.verdict === 'pending' ? null : answer.verdict;
  const row: AnswerRow = { ...answer, verdict, points: verdictPoints(verdict), graded_by: 'student', original_verdict: original };
  await writeAnswer(row);
  // The list's "Last: 7.5 / 10".
  notifyQuizzesChanged();
  return row;
}

/** `extras`: grading uses the assistant & extras allowance, used up for now. */
export type GradingState = 'done' | 'grading' | 'offline' | 'needs_permission' | 'limit' | 'extras' | 'failed';

/** Whether an attempt has answers waiting for Sonnet. */
export const waitingForAi = (questions: TakeQuestion[], answers: Map<string, AnswerRow>) =>
  questions.some((q) => AI_GRADED.includes(q.type) && answers.get(q.id)?.verdict === 'pending');

/**
 * The attempt's short and long answers still pending, sent to Sonnet: asks the permission first (her
 * written answers go to Anthropic, as the transcript does). On the iPhone the call is queued after
 * its answers (offline: when online); on the laptop it is made now. The state to say on screen.
 */
export async function gradeAttempt(quizId: string, attemptId: string): Promise<GradingState> {
  if (isOffline()) {
    if (local()) await enqueue({ kind: 'quiz_grade', key: `quiz-grade:${attemptId}`, payload: { quizId, attemptId } });
    return 'offline';
  }
  try {
    await ensureConsent('assistant_summary');
  } catch (err) {
    if (err instanceof ConsentDeclinedError) return 'needs_permission';
    throw err;
  }
  if (local()) {
    await enqueue({ kind: 'quiz_grade', key: `quiz-grade:${attemptId}`, payload: { quizId, attemptId } });
    return 'grading';
  }
  return callGrade(quizId, attemptId);
}

async function callGrade(quizId: string, attemptId: string): Promise<GradingState> {
  try {
    await callFunction('quiz', { mode: 'grade', quizId, attemptId });
    return 'done';
  } catch (err) {
    if (err instanceof FunctionError && err.code === 'consent_required') {
      forgetConsent();
      return 'needs_permission';
    }
    if (err instanceof FunctionError && err.code === 'daily_limit') return 'limit';
    if (err instanceof FunctionError && err.code === 'extras_limit') return 'extras';
    if (err instanceof FunctionError && err.unreachable) return 'offline';
    return 'failed';
  }
}

// -------------------------------------------------------------------
// The iPhone's queue
// -------------------------------------------------------------------

registerSyncHandler<AttemptRow>('quiz_attempt', {
  run: async (row) => {
    const { error } = await supabase.from('quiz_attempts').upsert(attemptPayload(row));
    if (error) throw syncError(error, 'Could not save the attempt.');
    await markClean('quiz_attempts', row.id);
  },
  // Started, then finished: the later one.
  merge: (_earlier, later) => later,
});

registerSyncHandler<AnswerRow>('quiz_answer', {
  run: async (row) => {
    const { error } = await supabase.from('quiz_answers').upsert(answerPayload(row), { onConflict: 'attempt_id,question_id' });
    if (error) throw syncError(error, 'Could not save the answer.');
    await markClean('quiz_answers', row.id);
  },
  // An answer and then her grade change: the later one.
  merge: (_earlier, later) => later,
});

registerSyncHandler<{ quizId: string; attemptId: string }>('quiz_grade', {
  run: async ({ quizId, attemptId }) => {
    const state = await callGrade(quizId, attemptId);
    // No permission, today's limit or the extras allowance used up: left pending (the results offer Grade
    // now, and her own grade); offline: tried again.
    if (state === 'needs_permission' || state === 'limit' || state === 'extras') throw new PermanentSyncError(`grading: ${state}`);
    if (state === 'offline' || state === 'failed') throw new Error(`grading: ${state}`);
    // The grades come with the next download.
    await requestPull(true);
  },
  merge: (_earlier, later) => later,
});

// -------------------------------------------------------------------
// A file source
// -------------------------------------------------------------------

/**
 * A PDF or photo a question cites, opened: on the laptop in a new tab at its page (Chrome's viewer goes
 * to #page=N); on the iPhone in the system preview (it can't open at a page: the chip says it, Lea's
 * decision 2). False when the file isn't there.
 */
export async function openSourceFile(fileId: string, page: number | null): Promise<boolean> {
  if (isOffline()) throw new NetworkError();
  // The tab is opened at the click (a tab opened after a wait is blocked as a pop-up), then sent to the file.
  const tab = Platform.OS === 'web' ? window.open('', '_blank') : null;
  try {
    const { data, error } = await supabase.from('media').select('kind, storage_path').eq('file_id', fileId).not('storage_path', 'is', null).limit(1).maybeSingle();
    if (error) throw serviceError(error, 'Could not open the file.');
    if (!data?.storage_path) {
      tab?.close();
      return false;
    }
    const photo = data.kind === 'photo';
    const url = await getSignedUrl(photo ? Buckets.photos : Buckets.slides, data.storage_path);
    if (Platform.OS === 'web') {
      const at = page && !photo ? `${url}#page=${page}` : url;
      if (tab) {
        tab.opener = null;
        tab.location.href = at;
      } else window.open(at, '_blank', 'noopener');
      return true;
    }
    const FileSystem = await import('expo-file-system/legacy');
    const Sharing = await import('expo-sharing');
    const { uri } = await FileSystem.downloadAsync(url, `${FileSystem.cacheDirectory}quiz-source-${fileId}.${photo ? 'jpg' : 'pdf'}`);
    await Sharing.shareAsync(uri);
    return true;
  } catch (err) {
    tab?.close();
    throw err;
  }
}
