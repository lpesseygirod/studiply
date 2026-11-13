/**
 * quiz.service.ts
 * Create a quiz: the New quiz panel's data, Save as course default, the quiz saved,
 * the Quiz me tab's list, Delete with Undo; the quiz written by the quiz function.
 *
 * - Making a quiz needs a connection (BUILD-PLAN), so the panel reads Supabase and Create writes there
 *   on both devices: a `quizzes` row (pending, its settings and the calculator's plan) and its
 *   `quiz_sources`.
 * - Then `startQuiz` asks the permissions (the transcript always; photos and PDFs when the
 *   quiz has them: declining that one makes the quiz without them) and starts the quiz function, which
 *   answers at once and writes the quiz in the background; the list follows the row (`quizNow`, every
 *   5 s while it is writing). Start and Try again are the same call: the server claims a pending or
 *   failed quiz, or one left "generating" too long; the app never writes a quiz's status itself.
 *   A past exam's format is read when it is added (`pastExamFormat`), once per file.
 * - The list: the iPhone reads its own copy (`quizzes` is downloaded with the library), so Review
 *   shows the quizzes offline too; the laptop reads Supabase.
 */

import { NetworkError, serviceError } from '../lib/cloudRows';
import { cacheEnabled, readRows } from '../lib/cache/store';
import { remember } from '../lib/cache';
import { isOffline } from '../lib/connectivity';
import { callFunction, FunctionError } from '../lib/functions';
import { newId } from '../lib/mappers';
import { supabase } from '../lib/supabase';
import type { Json } from '../types/supabase';
import { fromQuizCourseSettings, QUIZ_COLUMNS, QUIZ_SLIDER_DEFAULTS, QUIZ_SLIDER_KEYS, toQuizCourseSettings, type PastExamFormatRead, type QuizPlan, type QuizSliders } from '../../supabase/functions/_shared/quiz-plan';
import { settingsProblem, type QuizSettings } from '../../supabase/functions/_shared/quiz-settings';
import { SUMMARY_FORMAT } from '../../supabase/functions/_shared/summary-schema';
import { CALCULATING_MODULES, type MaterialLecture, type QuizMaterial } from '../lib/quiz/panel';
import { NO_CREDITS_NOTE } from '../lib/quiz/status';
import { ConsentDeclinedError, ensureConsent, forgetConsent } from './consent.service';

export type QuizStatus = 'pending' | 'generating' | 'ready' | 'failed';

export interface QuizRow {
  id: string;
  user_id: string;
  course_id: string | null;
  title: string;
  status: QuizStatus;
  error: string | null;
  question_count: number;
  plan?: { count?: number } | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuizListItem {
  id: string;
  title: string;
  status: QuizStatus;
  /** The questions in it (asked for until it is written). */
  questionCount: number;
  /** The questions the plan asked for (a ready quiz may have fewer: some couldn't be checked). */
  requested: number;
  error: string | null;
  courseId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Why it wasn't started this session (permission declined, today's limit, no connection), else null. */
  note: string | null;
}

const QUIZ_COLUMNS_READ = 'id, user_id, course_id, title, status, error, question_count, plan, deleted_at, created_at, updated_at';

/** Why a quiz wasn't started, this app session (the row shows it until it starts). */
const notStarted = new Map<string, string>();

const toItem = (r: QuizRow): QuizListItem => ({
  id: r.id,
  title: r.title,
  status: r.status,
  questionCount: r.question_count,
  requested: typeof r.plan?.count === 'number' ? r.plan.count : r.question_count,
  error: r.error,
  courseId: r.course_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  note: r.status === 'pending' ? (notStarted.get(r.id) ?? (r.error === 'no_credits' ? NO_CREDITS_NOTE : null)) : null,
});

/** Every quiz not deleted, newest first. */
export async function listQuizzes(): Promise<QuizListItem[]> {
  let rows: QuizRow[];
  if (cacheEnabled) {
    rows = await readRows<QuizRow>('quizzes');
  } else {
    const { data, error } = await supabase.from('quizzes').select(QUIZ_COLUMNS_READ).is('deleted_at', null).order('created_at', { ascending: false });
    if (error) throw serviceError(error, 'Could not load your quizzes.');
    rows = (data ?? []) as QuizRow[];
  }
  return rows
    .filter((r) => !r.deleted_at)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(toItem);
}

/** Delete with Undo (the trash: deleted_at). Needs a connection. Returns the undo. */
export async function deleteQuiz(id: string): Promise<() => Promise<void>> {
  if (isOffline()) throw new NetworkError();
  const set = async (deletedAt: string | null, fallback: string) => {
    const { data, error } = await supabase.from('quizzes').update({ deleted_at: deletedAt }).eq('id', id).select(QUIZ_COLUMNS_READ);
    if (error) throw serviceError(error, fallback);
    remember('quizzes', data ?? []);
  };
  await set(new Date().toISOString(), 'Could not delete the quiz.');
  notifyQuizzesChanged();
  return async () => {
    await set(null, 'Could not restore the quiz.');
    notifyQuizzesChanged();
  };
}

// -------------------------------------------------------------------
// The list follows a quiz made or deleted elsewhere (the panel is drawn by the layout)
// -------------------------------------------------------------------
const listeners = new Set<() => void>();
export function onQuizzesChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function notifyQuizzesChanged(): void {
  listeners.forEach((fn) => fn());
}

// -------------------------------------------------------------------
// The panel's data
// -------------------------------------------------------------------

export interface QuizCourse {
  id: string;
  name: string;
}

/** The courses a quiz can be made from (not in the trash), by name. */
export async function quizCourses(): Promise<QuizCourse[]> {
  if (isOffline()) throw new NetworkError();
  const { data, error } = await supabase.from('courses').select('id, name').is('deleted_at', null).order('name');
  if (error) throw serviceError(error, 'Could not load your courses.');
  return (data ?? []) as QuizCourse[];
}

/** The course of the newest quiz, to open the panel on (else none). */
export async function lastQuizCourse(): Promise<string | null> {
  const list = await listQuizzes().catch(() => []);
  return list.find((q) => q.courseId)?.courseId ?? null;
}

/** The course's quiz defaults, else every slider 5 and Number of questions 2. */
export async function quizDefaults(courseId: string): Promise<{ sliders: QuizSliders; subjectType: string | null }> {
  const { data, error } = await supabase.from('course_settings').select(`subject_type, ${QUIZ_SLIDER_KEYS.map((k) => QUIZ_COLUMNS[k]).join(', ')}`).eq('course_id', courseId).maybeSingle();
  if (error || !data) return { sliders: QUIZ_SLIDER_DEFAULTS, subjectType: null };
  const row = data as unknown as Record<string, unknown>;
  return { sliders: fromQuizCourseSettings(row), subjectType: typeof row.subject_type === 'string' ? row.subject_type : null };
}

/** Save as course default: the course's 10 quiz values. Online only. */
export async function saveQuizDefaults(courseId: string, s: QuizSliders): Promise<void> {
  if (isOffline()) throw new NetworkError();
  const { error } = await supabase
    .from('course_settings')
    .update(toQuizCourseSettings(s) as { quiz_difficulty: number })
    .eq('course_id', courseId);
  if (error) throw serviceError(error, 'Could not save the course’s defaults.');
}

type SummaryRead = { file_id: string; result: { format?: unknown; examSignals?: unknown[]; modulesUsed?: unknown[]; subjectType?: unknown } | null; created_at: string };

/** What the panel shows for a course: its lectures (with what makes the quiz's numbers), folders, files and earlier quiz answers. */
export async function loadQuizMaterial(course: QuizCourse): Promise<QuizMaterial> {
  if (isOffline()) throw new NetworkError();
  const [defaults, files, folders] = await Promise.all([
    quizDefaults(course.id),
    supabase.from('files').select('id, title, kind, folder_id, created_at').eq('course_id', course.id).is('deleted_at', null).order('created_at'),
    supabase.from('folders').select('id, name').eq('course_id', course.id).is('deleted_at', null).order('name'),
  ]);
  if (files.error) throw serviceError(files.error, 'Could not load the course.');
  if (folders.error) throw serviceError(folders.error, 'Could not load the course.');
  const all = (files.data ?? []) as { id: string; title: string; kind: string; folder_id: string | null }[];
  const lectureFiles = all.filter((f) => f.kind === 'lecture');
  const ids = lectureFiles.map((f) => f.id);

  const none = { data: [], error: null };
  const [lectures, summaries, marks, questions, quizzes] = await Promise.all([
    ids.length ? supabase.from('lectures').select('id, duration_ms').in('id', ids) : none,
    ids.length ? supabase.from('summaries').select('file_id, result, created_at').in('file_id', ids).eq('status', 'done').order('created_at', { ascending: false }) : none,
    ids.length ? supabase.from('marks').select('lecture_id, type').in('lecture_id', ids) : none,
    ids.length ? supabase.from('assistant_messages').select('lecture_id, window_start_ms, window_end_ms').in('lecture_id', ids).eq('role', 'user').not('window_start_ms', 'is', null) : none,
    supabase.from('quizzes').select('id').eq('course_id', course.id),
  ]);
  for (const r of [lectures, summaries, marks, questions, quizzes]) if (r.error) throw serviceError(r.error, 'Could not load the course.');

  // Transcribed: any segment (one row each, in parallel).
  const transcribed = new Set<string>();
  await Promise.all(
    ids.map(async (id) => {
      const { count } = await supabase.from('transcript_segments').select('id', { count: 'exact', head: true }).eq('lecture_id', id);
      if (count) transcribed.add(id);
    }),
  );

  const duration = new Map(((lectures.data ?? []) as { id: string; duration_ms: number | null }[]).map((l) => [l.id, l.duration_ms ?? 0]));
  const newest = new Map<string, SummaryRead>();
  for (const s of (summaries.data ?? []) as SummaryRead[]) if (s.result?.format === SUMMARY_FORMAT && !newest.has(s.file_id)) newest.set(s.file_id, s);
  const markRows = (marks.data ?? []) as { lecture_id: string; type: string }[];
  const windows = (questions.data ?? []) as { lecture_id: string; window_start_ms: number; window_end_ms: number | null }[];

  const lectureList: MaterialLecture[] = lectureFiles.map((f) => {
    const summary = newest.get(f.id)?.result ?? null;
    const own = markRows.filter((m) => m.lecture_id === f.id);
    const modules = Array.isArray(summary?.modulesUsed) ? summary.modulesUsed : [];
    return {
      id: f.id,
      title: f.title,
      folderId: f.folder_id,
      durationMs: duration.get(f.id) ?? 0,
      hasTranscript: transcribed.has(f.id),
      hasSummary: !!summary,
      examSignals: Array.isArray(summary?.examSignals) ? summary.examSignals.length : 0,
      marks: own.length,
      examMarks: own.filter((m) => m.type === 'exam').length,
      confusedMarks: own.filter((m) => m.type === 'confused').length,
      assistantWindows: new Set(windows.filter((w) => w.lecture_id === f.id).map((w) => `${w.window_start_ms}-${w.window_end_ms}`)).size,
      calculations: summary ? modules.some((x) => CALCULATING_MODULES.includes(String(x))) || ['math', 'finance', 'science', 'programming'].includes(String(summary.subjectType)) : null,
    };
  });

  // Earlier questions of this course's quizzes, and every answer to them.
  const quizIds = ((quizzes.data ?? []) as { id: string }[]).map((q) => q.id);
  let questionRows: { id: string; from_question_id: string | null; source_file_id: string | null }[] = [];
  let answerRows: { question_id: string; verdict: string; answered_at: string }[] = [];
  if (quizIds.length) {
    const q = await supabase.from('quiz_questions').select('id, from_question_id, source_file_id').in('quiz_id', quizIds);
    if (q.error) throw serviceError(q.error, 'Could not load the course.');
    questionRows = q.data ?? [];
    const qIds = questionRows.map((r) => r.id);
    if (qIds.length) {
      const a = await supabase.from('quiz_answers').select('question_id, verdict, answered_at').in('question_id', qIds);
      if (a.error) throw serviceError(a.error, 'Could not load the course.');
      answerRows = a.data ?? [];
    }
  }

  return {
    courseId: course.id,
    courseName: course.name,
    subjectType: defaults.subjectType,
    defaults: defaults.sliders,
    folders: (folders.data ?? []) as { id: string; name: string }[],
    lectures: lectureList,
    files: all.filter((f) => f.kind !== 'lecture').map((f) => ({ id: f.id, title: f.title, kind: f.kind })),
    questions: questionRows.map((r) => ({ id: r.id, fromQuestionId: r.from_question_id, sourceFileId: r.source_file_id })),
    answers: answerRows.map((r) => ({ questionId: r.question_id, verdict: r.verdict, answeredAt: r.answered_at })),
  };
}

// -------------------------------------------------------------------
// Create quiz
// -------------------------------------------------------------------

export interface CreateQuiz {
  courseId: string;
  title: string;
  settings: QuizSettings;
  plan: QuizPlan;
}

/**
 * Saves the quiz: a pending `quizzes` row (its settings and plan) and its sources. No AI is called:
 * the quiz is written later (startQuiz). Every file must be on the server already (an upload from the iPhone
 * may still be on its way).
 */
export async function createQuiz(ask: CreateQuiz): Promise<string> {
  if (isOffline()) throw new NetworkError();
  const problem = settingsProblem(ask.settings);
  if (problem) throw new Error(problem);
  const s = ask.settings;
  const fileIds = [...new Set([...s.topic.lectureIds, ...s.resources.fileIds, ...s.pastExamIds])];
  const { data: present, error: filesError } = await supabase.from('files').select('id').in('id', fileIds);
  if (filesError) throw serviceError(filesError, 'Could not save the quiz.');
  if ((present ?? []).length < fileIds.length) throw new Error('A file you added is still uploading. Try again in a moment.');

  const id = newId();
  const { data, error } = await supabase
    .from('quizzes')
    .insert({
      id,
      course_id: ask.courseId,
      title: ask.title,
      status: 'pending',
      settings: s as unknown as NonNullable<Json>,
      plan: ask.plan as unknown as NonNullable<Json>,
      language: s.choices.language,
      question_count: ask.plan.count,
    })
    .select(QUIZ_COLUMNS_READ);
  if (error) throw serviceError(error, 'Could not save the quiz.');
  const sources = [
    ...s.topic.lectureIds.map((fileId, position) => ({ quiz_id: id, role: 'lecture', file_id: fileId, position })),
    ...s.resources.fileIds.map((fileId, position) => ({ quiz_id: id, role: 'resource', file_id: fileId, position })),
    ...s.pastExamIds.map((fileId, position) => ({ quiz_id: id, role: 'past_exam', file_id: fileId, position })),
  ];
  const { error: sourcesError } = await supabase.from('quiz_sources').insert(sources);
  if (sourcesError) {
    // Not half saved: the quiz goes with its sources or not at all.
    await supabase.from('quizzes').delete().eq('id', id);
    throw serviceError(sourcesError, 'Could not save the quiz.');
  }
  remember('quizzes', data ?? []);
  notifyQuizzesChanged();
  return id;
}

// -------------------------------------------------------------------
// Writing the quiz
// -------------------------------------------------------------------

/** One quiz's row as it is now (the list reads it every 5 s while the quiz is being written); kept in the iPhone's copy. */
export async function quizNow(id: string): Promise<QuizListItem | null> {
  const { data, error } = await supabase.from('quizzes').select(QUIZ_COLUMNS_READ).eq('id', id).maybeSingle();
  if (error) throw serviceError(error, 'Could not read the quiz.');
  if (!data) return null;
  remember('quizzes', [data]);
  return toItem(data as unknown as QuizRow);
}

const IMAGE_KINDS = ['pdf', 'image'];

/** Whether a quiz sends photos or PDFs: a PDF or photo added (resource or past exam), or the lectures' own slides and photos. */
async function quizNeedsImages(id: string): Promise<boolean> {
  const { data, error } = await supabase.from('quizzes').select('settings').eq('id', id).single();
  if (error) throw serviceError(error, 'Could not read the quiz.');
  const s = data.settings as unknown as QuizSettings;
  const added = [...(s.resources?.fileIds ?? []), ...(s.pastExamIds ?? [])];
  if (added.length) {
    const files = await supabase.from('files').select('kind').in('id', added);
    if (files.error) throw serviceError(files.error, 'Could not read the quiz.');
    if ((files.data ?? []).some((f) => IMAGE_KINDS.includes(f.kind))) return true;
  }
  if (!s.resources?.lectureMedia || !s.topic?.lectureIds?.length) return false;
  const media = await supabase.from('media').select('id').in('lecture_id', s.topic.lectureIds).in('kind', ['photo', 'slides']).limit(1);
  if (media.error) throw serviceError(media.error, 'Could not read the quiz.');
  return (media.data ?? []).length > 0;
}

/** Why a start failed, in the row's words. */
export function startProblem(err: unknown): string {
  if (err instanceof ConsentDeclinedError) return 'Nothing was sent: Studiply needs your permission';
  if (err instanceof FunctionError && err.code === 'daily_limit') return 'Today’s limit is reached; try again tomorrow';
  if (err instanceof FunctionError && err.code === 'no_credits') return NO_CREDITS_NOTE;
  if (err instanceof NetworkError || (err instanceof FunctionError && err.unreachable)) return 'Needs a connection';
  return err instanceof Error && err.message ? err.message : 'It couldn’t be started';
}

/**
 * Starts writing a quiz (Create, Start, Try again): the permissions first (the transcript; photos and
 * PDFs only when the quiz has them, and declining that one still writes it, without them), then the
 * quiz function, which answers at once. A failure is noted on the row ("Saved · not started") and thrown.
 */
export async function startQuiz(id: string): Promise<void> {
  try {
    if (isOffline()) throw new NetworkError();
    await ensureConsent('assistant_summary');
    if (await quizNeedsImages(id)) {
      await ensureConsent('images').catch((err) => {
        if (!(err instanceof ConsentDeclinedError)) throw err;
      });
    }
    await callFunction('quiz', { quizId: id });
    notStarted.delete(id);
  } catch (err) {
    // Already being written (twice, or from another device): the list follows the row.
    if (err instanceof FunctionError && err.code === 'already_started') {
      notStarted.delete(id);
      return;
    }
    // Withdrawn on another device: asked again next time.
    if (err instanceof FunctionError && err.code === 'consent_required') forgetConsent();
    notStarted.set(id, startProblem(err));
    throw err;
  } finally {
    if (!isOffline()) await quizNow(id).catch(() => null);
    notifyQuizzesChanged();
  }
}

/**
 * A past exam's format (its length and question types), read once per file by the quiz function and
 * saved on the file: the saved one when there is one. Asks the permission it needs first (a PDF or a
 * photo: photos and PDFs too); declining throws ConsentDeclinedError.
 */
export async function pastExamFormat(fileId: string): Promise<PastExamFormatRead> {
  if (isOffline()) throw new NetworkError();
  const { data, error } = await supabase.from('files').select('kind, past_exam_format').eq('id', fileId).maybeSingle();
  if (error) throw serviceError(error, 'Could not read the exam.');
  if (data?.past_exam_format) return data.past_exam_format as unknown as PastExamFormatRead;
  await ensureConsent('assistant_summary');
  if (data && IMAGE_KINDS.includes(data.kind)) await ensureConsent('images');
  try {
    const res = await callFunction<{ format: PastExamFormatRead }>('quiz', { mode: 'format', fileId });
    return res.format;
  } catch (err) {
    if (err instanceof FunctionError && err.code === 'consent_required') forgetConsent();
    throw err;
  }
}
