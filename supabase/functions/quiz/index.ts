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
import { FORMAT_SCHEMA } from '../_shared/quiz-schema.ts';
import { QUIZ_STALE_MS, settingsProblem, type QuizSettings } from '../_shared/quiz-settings.ts';
import { parseFormat, type PastExamFormatRead } from '../_shared/quiz-zod.ts';
import type { Content, CostMeter } from '../_shared/summary-pipeline.ts';

const MODEL = CLAUDE_MODELS.quiz;
const FORMAT_MODEL = CLAUDE_MODELS.quizFormat;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function log(event: string, details: Record<string, unknown>) {
  console.log(JSON.stringify({ fn: 'quiz', event, ...details }));
}

type Body = { lectureId: string; quizId: string | null; fileId: string | null; mode: 'generate' | 'format' };

function validateBody(body: unknown): { ok: true; value: Body } | { ok: false; status: 400; code: 'invalid_request'; error: string } {
  const invalid = (error: string) => ({ ok: false as const, status: 400 as const, code: 'invalid_request' as const, error });
  if (!body || typeof body !== 'object') return invalid('Send quizId (or mode format and fileId) as JSON.');
  const b = body as Record<string, unknown>;
  if (b.mode === 'format') {
    if (typeof b.fileId !== 'string' || !UUID.test(b.fileId)) return invalid('fileId must be a file id.');
    return { ok: true, value: { lectureId: '', quizId: null, fileId: b.fileId, mode: 'format' } };
  }
  if (b.mode !== undefined && b.mode !== 'generate') return invalid('mode must be format.');
  if (typeof b.quizId !== 'string' || !UUID.test(b.quizId)) return invalid('quizId must be a quiz id.');
  return { ok: true, value: { lectureId: '', quizId: b.quizId, fileId: null, mode: 'generate' } };
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
    return await startQuiz(db, claude, userId, value.quizId!);
  } catch (err) {
    log('error', { message: (err as { message?: string })?.message ?? String(err) });
    return fail(500, 'server_error', 'Something went wrong on the server. Please try again.');
  }
});
