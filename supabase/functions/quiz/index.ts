/**
 * quiz — writes a quiz with Claude (step 9.1b-2; the approved plan, docs/reports/plan-9.1b-2.md).
 *
 * POST with the user's access token. The checks in _shared/anthropic.ts run first (401, 400, 404,
 * 403 consent_required, 429 daily_limit), with the quiz (or the file) as what must be hers.
 *
 * { quizId }
 *   The New quiz panel's quiz: claimed (pending or failed → generating; also one left "generating"
 *   with no news for QUIZ_STALE_MS, so Try again works after a run the platform stopped), its old
 *   questions removed, 202 at once; then written in the background (_shared/quiz-pipeline.ts), its
 *   status, plan, questions and checks saved for the app to read. 409 already_started, 404
 *   quiz_not_found. Past exams whose format wasn't read yet are read first.
 *
 * { mode: 'format', fileId }
 *   A past exam's format, read on Sonnet 5.5 and saved on its file (files.past_exam_format) once:
 *   { format }. A PDF or photo needs the images consent too (403 consent_required, scope images).
 *
 * { mode: 'grade', quizId, attemptId } (step 9.1b-3)
 *   The attempt's short and long answers still pending, graded on Sonnet 5.5 (quiz-grading.ts), each
 *   written only while still pending (her own grade wins): { graded, left }. 502 grading_failed
 *   leaves them pending, to be tried again.
 *
 * Photos and PDFs go to Claude only with the images consent (Apple 5.1.2(i)); without it the quiz is
 * written from the rest, and its checks say what was left out. Every call's cost is logged in
 * ai_usage (operation quiz, against the quiz's first lecture; a format read against none). Never logs
 * the prompt, the material, the questions or keys.
 */

import Anthropic from 'npm:@anthropic-ai/sdk@0.135.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { claudeFailure, claudeParams, logClaudeCost, readyForClaude } from '../_shared/anthropic.ts';
import { CLAUDE_MODELS, QUIZ_OPERATION } from '../_shared/claude.ts';
import { hasConsent } from '../_shared/guard.ts';
import { corsHeaders, fail, json } from '../_shared/http.ts';
import { fileContent, needsImages, quizRunMaterial } from '../_shared/quiz-content.ts';
import { FORMAT_MAX_TOKENS, FORMAT_SYSTEM, formatUserText, runQuiz, type QuizCall, type QuizRunDeps } from '../_shared/quiz-pipeline.ts';
import { FORMAT_SCHEMA, GRADE_SCHEMA } from '../_shared/quiz-schema.ts';
import { QUIZ_STALE_MS, settingsProblem, type QuizSettings } from '../_shared/quiz-settings.ts';
import { parseFormat, parseGrades, type PastExamFormatRead } from '../_shared/quiz-zod.ts';
import { AI_GRADED, responseText, type QuizQuestionType, type QuizResponse } from '../_shared/quiz-grade.ts';
import { gradeMaxTokens, gradeSystemPrompt, gradeUpdates, gradeUserText, type ToGrade } from '../_shared/quiz-grading.ts';
import type { Content, CostMeter } from '../_shared/summary-pipeline.ts';

const MODEL = CLAUDE_MODELS.quiz;
const FORMAT_MODEL = CLAUDE_MODELS.quizFormat;
const GRADE_MODEL = CLAUDE_MODELS.quizGrade;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function log(event: string, details: Record<string, unknown>) {
  console.log(JSON.stringify({ fn: 'quiz', event, ...details }));
}

type Body = { lectureId: string; quizId: string | null; fileId: string | null; attemptId: string | null; mode: 'generate' | 'format' | 'grade' };

function validateBody(body: unknown): { ok: true; value: Body } | { ok: false; status: 400; code: 'invalid_request'; error: string } {
  const invalid = (error: string) => ({ ok: false as const, status: 400 as const, code: 'invalid_request' as const, error });
  if (!body || typeof body !== 'object') return invalid('Send quizId (or mode format and fileId) as JSON.');
  const b = body as Record<string, unknown>;
  if (b.mode === 'format') {
    if (typeof b.fileId !== 'string' || !UUID.test(b.fileId)) return invalid('fileId must be a file id.');
    return { ok: true, value: { lectureId: '', quizId: null, fileId: b.fileId, attemptId: null, mode: 'format' } };
  }
  if (b.mode !== undefined && b.mode !== 'generate' && b.mode !== 'grade') return invalid('mode must be format or grade.');
  if (typeof b.quizId !== 'string' || !UUID.test(b.quizId)) return invalid('quizId must be a quiz id.');
  if (b.mode === 'grade') {
    if (typeof b.attemptId !== 'string' || !UUID.test(b.attemptId)) return invalid('attemptId must be an attempt id.');
    return { ok: true, value: { lectureId: '', quizId: b.quizId, fileId: null, attemptId: b.attemptId, mode: 'grade' } };
  }
  return { ok: true, value: { lectureId: '', quizId: b.quizId, fileId: null, attemptId: null, mode: 'generate' } };
}

/**
 * { mode: 'grade', quizId, attemptId } (step 9.1b-3): the attempt's short and long answers still
 * pending, graded by Sonnet 5.5 (quiz-grading.ts: it sees only each question, its model answer, its
 * key points and her answer). Each grade is written only where the answer is still pending, so her
 * own grade, set meanwhile, wins. { graded, left }.
 */
async function gradeNow(db: SupabaseClient, claude: Anthropic, userId: string, quizId: string, attemptId: string): Promise<Response> {
  const { data: attempt, error } = await db.from('quiz_attempts').select('id').eq('id', attemptId).eq('quiz_id', quizId).maybeSingle();
  if (error) throw error;
  if (!attempt) return fail(404, 'attempt_not_found', 'That attempt was not found.');
  const { data: quiz, error: quizError } = await db.from('quizzes').select('language, settings').eq('id', quizId).single();
  if (quizError) throw quizError;
  const { data: pending, error: pendingError } = await db.from('quiz_answers').select('id, question_id, response').eq('attempt_id', attemptId).eq('verdict', 'pending');
  if (pendingError) throw pendingError;
  if (!pending?.length) return json({ graded: 0, left: 0 });
  const { data: questions, error: questionsError } = await db.from('quiz_questions').select('id, type, prompt, data').in('id', pending.map((a) => a.question_id));
  if (questionsError) throw questionsError;
  const byId = new Map((questions ?? []).map((q) => [String(q.id), q]));
  const items: ToGrade[] = [];
  for (const a of pending) {
    const q = byId.get(String(a.question_id));
    if (!q || !AI_GRADED.includes(q.type as QuizQuestionType)) continue;
    const d = (q.data ?? {}) as { modelAnswer?: string; keyPoints?: string[] };
    items.push({ answerId: String(a.id), question: String(q.prompt), modelAnswer: String(d.modelAnswer ?? ''), keyPoints: d.keyPoints ?? [], answer: responseText(q.type as QuizQuestionType, q.data as Record<string, unknown>, a.response as QuizResponse) });
  }
  if (!items.length) return json({ graded: 0, left: pending.length });
  const firstLecture = (quiz.settings as QuizSettings | null)?.topic?.lectureIds?.[0] ?? null;
  const stream = streamCall(claude, GRADE_MODEL)(gradeSystemPrompt((quiz.language as string | null) ?? null), [{ type: 'text', text: gradeUserText(items) }], GRADE_SCHEMA, gradeMaxTokens(items.length));
  let message: Anthropic.Beta.BetaMessage;
  try {
    message = (await stream.finalMessage()) as unknown as Anthropic.Beta.BetaMessage;
  } catch (err) {
    log('grade_failed', { quizId, attemptId, ...claudeFailure(err) });
    const partial = stream.currentMessage as unknown as Anthropic.Beta.BetaMessage | undefined;
    if (partial) await logClaudeCost(QUIZ_OPERATION, userId, firstLecture, GRADE_MODEL, partial).catch(() => {});
    return fail(502, 'grading_failed', 'The answers couldn’t be graded. They will be tried again.');
  }
  await logClaudeCost(QUIZ_OPERATION, userId, firstLecture, GRADE_MODEL, message).catch((err) => log('usage_log_failed', { quizId, message: String((err as Error)?.message ?? err) }));
  const text = message.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('');
  const grades = message.stop_reason === 'refusal' ? null : parseGrades(text);
  if (!grades) {
    log('grade_unreadable', { quizId, attemptId, stopReason: message.stop_reason });
    return fail(502, 'grading_failed', 'The answers couldn’t be graded. They will be tried again.');
  }
  let graded = 0;
  for (const u of gradeUpdates(items, grades)) {
    // Only while it is still pending: her own grade, set meanwhile, wins.
    const { data: written, error: writeError } = await db.from('quiz_answers').update(u.patch).eq('id', u.answerId).eq('verdict', 'pending').select('id');
    if (writeError) throw writeError;
    graded += written?.length ?? 0;
  }
  log('graded', { quizId, attemptId, sent: items.length, graded });
  return json({ graded, left: items.length - graded });
}

declare const EdgeRuntime: { waitUntil<T>(promise: Promise<T>): Promise<T> };

/** The Claude calls a run makes, streamed; each with a promise of its first event (the others start on it). */
function streamCall(claude: Anthropic, model: string) {
  return (system: string, content: Content, schema: Record<string, unknown>, maxTokens: number): QuizCall => {
    const stream = claude.beta.messages.stream(claudeParams(model, system, [{ role: 'user', content: content as unknown as Anthropic.Beta.BetaContentBlockParam[] }], { maxTokens, jsonSchema: schema }));
    const firstEvent = new Promise<void>((resolve) => {
      stream.on('streamEvent', () => resolve());
      stream.on('end', () => resolve());
      stream.on('error', () => resolve());
    });
    return Object.assign(stream, { firstEvent }) as unknown as QuizCall;
  };
}

/** A past exam's format: read once (Sonnet), saved on its file. Null when it can't be (no consent, unreadable). */
async function readFormat(
  db: SupabaseClient,
  claude: Anthropic,
  userId: string,
  file: { id: string; kind: string; title: string },
  images: boolean,
  meter?: CostMeter,
): Promise<{ format: PastExamFormatRead } | { error: 'consent_required' | 'unreadable' | 'missing' }> {
  if (needsImages(file.kind) && !images) return { error: 'consent_required' };
  const got = await fileContent(db, file, images);
  if ('leftOut' in got) return { error: got.leftOut === 'images' ? 'consent_required' : 'missing' };
  const content: Content = [...got.blocks, { type: 'text', text: formatUserText(file.title, got.text) }];
  const stream = streamCall(claude, FORMAT_MODEL)(FORMAT_SYSTEM, content, FORMAT_SCHEMA, FORMAT_MAX_TOKENS);
  let message: Anthropic.Beta.BetaMessage;
  try {
    message = (await stream.finalMessage()) as unknown as Anthropic.Beta.BetaMessage;
  } catch (err) {
    log('format_failed', { fileId: file.id, ...claudeFailure(err) });
    const partial = stream.currentMessage as unknown as Anthropic.Beta.BetaMessage | undefined;
    if (partial) await logClaudeCost(QUIZ_OPERATION, userId, null, FORMAT_MODEL, partial).catch(() => {});
    return { error: 'unreadable' };
  }
  if (meter) meter.calls += 1;
  await logClaudeCost(QUIZ_OPERATION, userId, null, FORMAT_MODEL, message)
    .then(() => meter && (meter.logged += 1))
    .catch((err) => log('usage_log_failed', { fileId: file.id, message: String((err as Error)?.message ?? err) }));
  const text = message.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('');
  const format = message.stop_reason === 'refusal' ? null : parseFormat(text);
  if (!format) return { error: 'unreadable' };
  const { error } = await db.from('files').update({ past_exam_format: format }).eq('id', file.id);
  if (error) throw error;
  log('format_read', { fileId: file.id, questions: format.questionCount });
  return { format };
}

/** { mode: 'format', fileId }: read now (the panel asks when a past exam is added). */
async function formatNow(db: SupabaseClient, claude: Anthropic, userId: string, fileId: string): Promise<Response> {
  const { data: file, error } = await db.from('files').select('id, kind, title').eq('id', fileId).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  if (!file) return fail(404, 'file_not_found', 'That document was not found.');
  const images = needsImages(String(file.kind)) ? await hasConsent(db, 'images') : false;
  const read = await readFormat(db, claude, userId, { id: String(file.id), kind: String(file.kind), title: String(file.title) }, images);
  if ('format' in read) return json({ format: read.format });
  if (read.error === 'consent_required') return json({ code: 'consent_required', scope: 'images', error: 'Allow photos and PDFs to be sent to Anthropic before Studiply reads this exam.' }, 403);
  if (read.error === 'missing') return fail(404, 'file_not_found', 'That document’s file was not found.');
  return fail(502, 'format_unreadable', 'Studiply couldn’t read this exam’s format. Please try again.');
}

/** { quizId }: claimed once, 202, then written in the background. */
async function startQuiz(db: SupabaseClient, claude: Anthropic, userId: string, quizId: string): Promise<Response> {
  const staleBefore = new Date(Date.now() - QUIZ_STALE_MS).toISOString();
  const { data: claimed, error } = await db
    .from('quizzes')
    .update({ status: 'generating', error: null, checks: null })
    .eq('id', quizId)
    .is('deleted_at', null)
    // The time quoted: it has dots and colons (PostgREST's logic-tree syntax).
    .or(`status.in.(pending,failed),and(status.eq.generating,updated_at.lt."${staleBefore}")`)
    .select('id, settings, course_id')
    .maybeSingle();
  if (error) throw error;
  if (!claimed) {
    const { data: row } = await db.from('quizzes').select('status').eq('id', quizId).maybeSingle();
    return row ? fail(409, 'already_started', 'This quiz is already being written.') : fail(404, 'quiz_not_found', 'That quiz was not found.');
  }
  const save = async (patch: Record<string, unknown>) => {
    const { error: saveError } = await db.from('quizzes').update(patch).eq('id', quizId);
    if (saveError) throw saveError;
  };
  const settings = claimed.settings as QuizSettings;
  const problem = settingsProblem(settings);
  if (problem) {
    await save({ status: 'failed', error: 'invalid_request' });
    return fail(400, 'invalid_request', problem);
  }
  // A retry starts clean: the questions written before go.
  const { error: clearError } = await db.from('quiz_questions').delete().eq('quiz_id', quizId);
  if (clearError) throw clearError;

  // Photos and PDFs go to Claude only with the images consent (Apple 5.1.2(i)).
  const images = await hasConsent(db, 'images');
  const meter: CostMeter = { calls: 0, logged: 0 };
  const firstLecture = settings.topic.lectureIds[0] ?? null;
  const call = streamCall(claude, MODEL);
  const deps: QuizRunDeps = {
    quizId,
    material: async () => {
      // A past exam whose format wasn't read yet (added on another device, or its read failed) is read first.
      if (settings.pastExamIds.length) {
        const { data: unread, error: unreadError } = await db.from('files').select('id, kind, title').in('id', settings.pastExamIds).is('past_exam_format', null).is('deleted_at', null);
        if (unreadError) throw unreadError;
        for (const f of unread ?? []) {
          if (!(await deps.stillWanted())) break;
          await readFormat(db, claude, userId, { id: String(f.id), kind: String(f.kind), title: String(f.title) }, images, meter);
        }
      }
      return quizRunMaterial(db, quizId, settings, (claimed.course_id as string | null) ?? null, images);
    },
    claude: (_kind, system, content, schema, maxTokens) => call(system, content, schema, maxTokens),
    // Against the quiz's first lecture (every quiz has one: the panel's rule; ai_usage.lecture_id is nullable anyway).
    logCost: (message) => logClaudeCost(QUIZ_OPERATION, userId, firstLecture, MODEL, message as unknown as Anthropic.Beta.BetaMessage),
    save,
    saveQuestions: async (rows) => {
      const { error: deleteError } = await db.from('quiz_questions').delete().eq('quiz_id', quizId);
      if (deleteError) throw deleteError;
      if (!rows.length) return;
      const { error: insertError } = await db.from('quiz_questions').insert(rows);
      if (insertError) throw insertError;
    },
    stillWanted: async () => {
      const { data } = await db.from('quizzes').select('deleted_at').eq('id', quizId).maybeSingle();
      return !!data && !data.deleted_at;
    },
    // Step 10.1: AI switched off meanwhile → stop before the next call.
    consentWithdrawn: async () => !(await hasConsent(db, 'assistant_summary').catch(() => true)),
    touch: async () => {
      await db.from('quizzes').update({ status: 'generating' }).eq('id', quizId).eq('status', 'generating');
    },
    log,
    failure: claudeFailure,
    meter,
  };
  log('quiz_started', { quizId, images, lectures: settings.topic.lectureIds.length, resources: settings.resources.fileIds.length, pastExams: settings.pastExamIds.length });
  EdgeRuntime.waitUntil<unknown>(runQuiz(deps));
  return json({ quizId, status: 'generating' }, 202);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.');
  try {
    const ready = await readyForClaude(req, validateBody, log);
    if (!ready.ok) return ready.response;
    const { claude, db, userId, value } = ready;
    if (value.mode === 'format') return await formatNow(db, claude, userId, value.fileId!);
    if (value.mode === 'grade') return await gradeNow(db, claude, userId, value.quizId!, value.attemptId!);
    return await startQuiz(db, claude, userId, value.quizId!);
  } catch (err) {
    log('error', { message: (err as { message?: string })?.message ?? String(err) });
    return fail(500, 'server_error', 'Something went wrong on the server. Please try again.');
  }
});
