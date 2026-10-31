/**
 * summarize — writes a lecture's summary with Claude.
 *
 * POST with the user's access token. The checks in _shared/anthropic.ts run
 * first (401, 400, 404, 403 consent_required, 429 daily_limit).
 *
 * { lectureId, task: 'notes', summaryLevel, recordingMode?, title, includeMedia? }
 *   The old app's structured study notes (step 1.7, _shared/legacy-notes.ts).
 *   The server reads the transcript itself, and with includeMedia the
 *   lecture's photos and PDFs from Storage, which also needs `images`
 *   consent (403 consent_required, scope images). Answers JSON
 *   { note, model, stopReason, usage, costUsd }; 409 no_transcript when
 *   there is nothing to summarize, 413 media_too_large over 24 MB.
 *
 * { lectureId, summaryId } (step 7.4)
 *   The summary of the summarize panel's pending `summaries` row: 202 at
 *   once, then the pipeline (_shared/summary-pipeline.ts: align, classify,
 *   calculate, generate, check) in the background, its status and result
 *   saved on the row. 409 already_started, 404 summary_not_found.
 *
 * { lectureId } (no task)
 *   Step 1.6 skeleton: a fixed test prompt, answering { text, ... }.
 *
 * { probe: 'schemas' } (step 7.9; LOCAL Supabase only, else 404)
 *   Each structured-output schema the engine uses (_shared/schema-probe.ts), sent with a one-line text
 *   and max_tokens 16: { results: [{ name, accepted, … }] }. A rejected schema costs nothing; an
 *   accepted one a fraction of a cent (logged in ai_usage). Signed in; no lecture, no content sent.
 *
 * Claude's answer is streamed between here and Anthropic, because summaries
 * are long and a single long request can time out. The cost is logged once
 * in ai_usage. Never logs the prompt, the transcript, files, the answer or keys.
 */

import Anthropic from 'npm:@anthropic-ai/sdk@0.135.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { answerText, claudeFailure, claudeParams, logClaudeCost, readyForClaude } from '../_shared/anthropic.ts';
import { CLAUDE_MODELS, SUMMARIZE_TEST_PROMPT, SUMMARY_OPERATION, validateSummarizeBody } from '../_shared/claude.ts';
import { hasConsent, ownLecture, signedIn } from '../_shared/guard.ts';
import { PROBE_MAX_TOKENS, PROBE_SCHEMAS, PROBE_SYSTEM, PROBE_USER, isLocalSupabase } from '../_shared/schema-probe.ts';
import { corsHeaders, fail, json } from '../_shared/http.ts';
import { lectureLanguage, lectureMedia, lectureTranscript, summaryMaterial, summaryMedia } from '../_shared/lecture-content.ts';
import { requestOf, runSummary, validateSummaryRunBody, type Content, type CostMeter, type StoredSummary, type SummaryRunDeps } from '../_shared/summary-pipeline.ts';
import { combineRequestOf, runCombine } from '../_shared/summary-combine.ts';
import type { ExtendContext } from '../_shared/summary-extend.ts';
import { SUMMARY_FORMAT } from '../_shared/summary-schema.ts';
import {
  NOTE_SCHEMA,
  NOTES_MAX_TOKENS,
  notesSystemPrompt,
  notesUserText,
  parseNoteResult,
  validateNotesFields,
  type NotesRequest,
} from '../_shared/legacy-notes.ts';

const MODEL = CLAUDE_MODELS.summary;

function log(event: string, details: Record<string, unknown>) {
  console.log(JSON.stringify({ fn: 'summarize', event, ...details }));
}

/** { lectureId } alone is the test prompt; task 'notes' adds the notes fields; summaryId is the summary (7.4). */
function validateBody(body: unknown) {
  const base = validateSummarizeBody(body);
  if (!base.ok) return base;
  const fields = body as Record<string, unknown>;
  if (fields.summaryId !== undefined) {
    const run = validateSummaryRunBody(body);
    if (!run.ok) return run;
    // The row's file: a lecture, or (step 7.9) the Unit summary or Exam pack it is written into.
    return { ok: true as const, value: { lectureId: run.value.lectureId, fileId: run.value.lectureId, notes: null as NotesRequest | null, summaryId: run.value.summaryId as string | null } };
  }
  // The test prompt and the notes are a lecture's (fileId null: readyForClaude checks it's her lecture).
  if (fields.task === undefined) return { ok: true as const, value: { lectureId: base.value.lectureId, fileId: null as string | null, notes: null as NotesRequest | null, summaryId: null as string | null } };
  if (fields.task !== 'notes') return { ok: false as const, status: 400 as const, code: 'invalid_request' as const, error: 'task must be notes.' };
  const notes = validateNotesFields(base.value.lectureId, fields);
  if (!notes.ok) return notes;
  return { ok: true as const, value: { lectureId: base.value.lectureId, fileId: null as string | null, notes: notes.value as NotesRequest | null, summaryId: null as string | null } };
}

declare const EdgeRuntime: { waitUntil<T>(promise: Promise<T>): Promise<T> };

/**
 * The summary (step 7.4): the pending row is claimed (pending → generating, once: a second call is
 * 409), the answer is 202 at once, and the pipeline runs in the background (summary-pipeline.ts),
 * saving its progress and outcome on the row (checking → done | failed) for the app to read.
 */
async function startSummary(ready: { db: SupabaseClient; userId: string; claude: Anthropic }, lectureId: string, summaryId: string): Promise<Response> {
  const { db, userId, claude } = ready;
  const { data: claimed, error } = await db
    .from('summaries')
    .update({ status: 'generating', error: null })
    .eq('id', summaryId)
    .eq('file_id', lectureId)
    .eq('status', 'pending')
    .is('result', null)
    .select('sliders, applied_settings, mode, source_lecture_ids')
    .maybeSingle();
  if (error) throw error;
  if (!claimed) {
    const { data: row } = await db.from('summaries').select('status').eq('id', summaryId).eq('file_id', lectureId).maybeSingle();
    return row ? fail(409, 'already_started', 'This summary is already being written.') : fail(404, 'summary_not_found', 'That summary request was not found.');
  }
  const save = async (patch: Record<string, unknown>) => {
    const { error: saveError } = await db.from('summaries').update(patch).eq('id', summaryId);
    if (saveError) throw saveError;
  };
  const request = requestOf(claimed);
  if (!request) {
    await save({ status: 'failed', error: 'invalid_request' });
    return fail(400, 'invalid_request', 'The summary settings are not readable.');
  }
  // Photos and slides go to Claude only when ticked and with images consent (Apple 5.1.2(i)).
  const withMedia = (request.resources.photos || request.resources.slides) && (await hasConsent(db, 'images'));
  log('summary_started', { lectureId, summaryId, media: withMedia, mode: claimed.mode });

  const claudeCall: SummaryRunDeps['claude'] = (_call, system, content, schema, maxTokens) =>
    claude.beta.messages.stream(claudeParams(MODEL, system, [{ role: 'user', content: content as unknown as Anthropic.Beta.BetaContentBlockParam[] }], { maxTokens, jsonSchema: schema }));
  // Step 7.9: every call's cost is logged (operation summary: it counts for the daily limit), against a real
  // lecture of hers, else null (an Exam pack's or a Unit summary's file, as 6.3 does for a plain document):
  // ai_usage's lecture must be one of her lectures (a foreign key), and a refused row would let the call
  // escape the limit. The meter counts the calls and the rows logged (saved in the result as costLog).
  const lectureOf = new Map<string, Promise<string | null>>();
  const costLecture = (id: string) => {
    if (!lectureOf.has(id)) lectureOf.set(id, ownLecture(db, id).then((l) => (l ? id : null), () => null));
    return lectureOf.get(id)!;
  };
  const meter: CostMeter = { calls: 0, logged: 0 };
  const logCostFor = (id: string) => async (message: unknown) => logClaudeCost(SUMMARY_OPERATION, userId, await costLecture(id), MODEL, message as Anthropic.Beta.BetaMessage);
  /** A lecture's summary with the 7.4–7.6 pipeline, saved on its row; with `extend` (7.9): written against that existing summary. */
  const summaryRun = (forLecture: string, rowId: string, saveRow: (patch: Record<string, unknown>) => Promise<void>, extend?: ExtendContext) =>
    runSummary({
      extend,
      summaryId: rowId,
      lectureId: forLecture,
      request,
      material: () => summaryMaterial(db, forLecture),
      media: async () => (withMedia ? ((await summaryMedia(db, forLecture, request.resources)) as unknown as { blocks: Content; photos: number; pdfs: number }) : { blocks: [], photos: 0, pdfs: 0 }),
      claude: claudeCall,
      logCost: logCostFor(forLecture),
      save: saveRow,
      log,
      failure: claudeFailure,
      meter,
    });

  // Step 7.9: Extend, Merge, Exam pack.
  const combine = claimed.mode === 'new' ? null : combineRequestOf(claimed);
  if (claimed.mode !== 'new' && !combine) {
    await save({ status: 'failed', error: 'invalid_request' });
    return fail(400, 'invalid_request', 'The summary settings are not readable.');
  }
  const run = combine
    ? runCombine({
        summaryId,
        request: combine,
        claude: claudeCall,
        // The row's file: the base lecture ("Add to this summary"), else a Unit summary or Exam pack (null).
        logCost: logCostFor(lectureId),
        save,
        log,
        failure: claudeFailure,
        meter,
        summaryOf: (id) => latestDoneSummary(db, id),
        lectureInfo: (id) => lectureInfo(db, id),
        // The lecture added, written by the generate call with the existing summary in its prompt (the
        // plan); progress on this request's row, the result stored by runCombine.
        extendWith: (id, context) => summaryRun(id, summaryId, save, context),
      })
    : summaryRun(lectureId, summaryId, save);
  EdgeRuntime.waitUntil<unknown>(run);
  return json({ summaryId, status: 'generating' }, 202);
}

/**
 * Step 7.9: the schema probe (local only). Each schema once, no retry (a rejection is final and free);
 * an accepted call's cost logged as any summary call's. The API's message for a rejection is returned
 * (it describes the request's form, never content: there is none).
 */
async function probeSchemas(req: Request): Promise<Response> {
  if (!isLocalSupabase(Deno.env.get('SUPABASE_URL'))) return fail(404, 'not_found', 'Not found.');
  const caller = await signedIn(req);
  if (!caller.ok) return caller.response;
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return fail(500, 'not_configured', 'The study assistant is not set up on the server yet.');
  const claude = new Anthropic({ apiKey, maxRetries: 0, timeout: 60_000 });
  const results: Record<string, unknown>[] = [];
  const meter: CostMeter = { calls: 0, logged: 0 };
  for (const p of PROBE_SCHEMAS) {
    const started = Date.now();
    let message: Anthropic.Beta.BetaMessage;
    try {
      const params = claudeParams(MODEL, PROBE_SYSTEM, [{ role: 'user', content: PROBE_USER }], { maxTokens: PROBE_MAX_TOKENS, jsonSchema: p.schema });
      message = await claude.beta.messages.stream(params).finalMessage();
    } catch (err) {
      const f = claudeFailure(err);
      results.push({ name: p.name, accepted: false, status: f.status, type: f.type ?? f.code, message: f.message ?? '', ms: Date.now() - started });
      continue;
    }
    // Billed: its cost row (a plain probe: no lecture). A failed log is reported, never hidden.
    meter.calls += 1;
    const cost = await logClaudeCost(SUMMARY_OPERATION, caller.userId, null, MODEL, message).catch((err) => {
      log('usage_log_failed', { probe: p.name, message: String((err as Error)?.message ?? err) });
      return null;
    });
    if (cost) meter.logged += 1;
    results.push({ name: p.name, accepted: true, stopReason: message.stop_reason, costUsd: cost?.costUsd ?? null, logged: !!cost, ms: Date.now() - started });
  }
  log('schema_probe', { accepted: meter.calls, logged: meter.logged, rejected: results.filter((r) => !r.accepted).map((r) => r.name) });
  return json({ results, costLog: meter }, 200);
}

/** A lecture's newest finished summary of the new engine (step 7.9), or null. */
async function latestDoneSummary(db: SupabaseClient, lectureId: string): Promise<{ summaryId: string; result: StoredSummary } | null> {
  const { data } = await db.from('summaries').select('id, result').eq('file_id', lectureId).eq('status', 'done').order('created_at', { ascending: false }).limit(10);
  const row = (data ?? []).find((r) => (r.result as { format?: unknown } | null)?.format === SUMMARY_FORMAT);
  return row ? { summaryId: row.id as string, result: row.result as StoredSummary } : null;
}

/** A lecture's title and number in its course (as summaryMaterial counts it). */
async function lectureInfo(db: SupabaseClient, lectureId: string): Promise<{ number: number | null; title: string }> {
  const { data: file } = await db.from('files').select('title, course_id, created_at').eq('id', lectureId).maybeSingle();
  if (!file) return { number: null, title: '' };
  if (!file.course_id) return { number: null, title: String(file.title ?? '') };
  const { count } = await db.from('files').select('id', { count: 'exact', head: true }).eq('course_id', file.course_id).eq('kind', 'lecture').is('deleted_at', null).lte('created_at', file.created_at);
  return { number: count ?? null, title: String(file.title ?? '') };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.');

  let lectureId: string | undefined;
  try {
    // Step 7.9: the schema probe (local only), before the usual checks (it has no lecture).
    const peek = (await req.clone().json().catch(() => null)) as { probe?: unknown } | null;
    if (peek?.probe === 'schemas') return await probeSchemas(req);
    const ready = await readyForClaude(req, validateBody, log);
    if (!ready.ok) return ready.response;
    const { claude, db, userId } = ready;
    lectureId = ready.value.lectureId;
    if (ready.value.summaryId) return await startSummary(ready, lectureId, ready.value.summaryId);
    const notes = ready.value.notes;

    // ── What goes to Claude ──────────────────────────────────────
    let system = 'You are Studiply’s summary engine.';
    let content: Anthropic.Beta.BetaContentBlockParam[] | string = SUMMARIZE_TEST_PROMPT;
    let options: Parameters<typeof claudeParams>[3] = {};
    let transcript = '';
    if (notes) {
      const prepared = await prepareNotes(db, notes);
      if (!prepared.ok) return prepared.response;
      ({ system, content, transcript } = prepared);
      options = { maxTokens: NOTES_MAX_TOKENS[notes.summaryLevel], jsonSchema: NOTE_SCHEMA };
      log('notes_prepared', { lectureId, level: notes.summaryLevel, photos: prepared.photos, pdfs: prepared.pdfs, bytes: prepared.bytes });
    }

    const started = Date.now();
    const stream = claude.beta.messages.stream(claudeParams(MODEL, system, [{ role: 'user', content }], options));
    let final;
    try {
      final = await stream.finalMessage();
    } catch (err) {
      log('claude_failed', { lectureId, ...claudeFailure(err), ms: Date.now() - started });
      const partial = stream.currentMessage;
      if (partial) await logClaudeCost('summary', userId, lectureId, MODEL, partial).catch(() => {});
      return fail(502, 'summary_failed', 'The summary could not be written. Please try again.');
    }

    const cost = await logClaudeCost('summary', userId, lectureId, MODEL, final);
    const usage = { input: cost.tokensInput, output: cost.tokensOutput };

    // With fallbacks on, a refusal here means every model in the chain declined
    if (final.stop_reason === 'refusal') {
      log('refused', { lectureId, model: final.model });
      return fail(422, 'refused', 'Claude can’t summarize this lecture.');
    }

    const answer = answerText(final);
    if (!notes) {
      log('summarized', { lectureId, model: final.model, ...usage, costUsd: cost.costUsd, ms: Date.now() - started });
      return json({ text: answer, model: final.model, stopReason: final.stop_reason, usage, costUsd: cost.costUsd });
    }

    const note = parseNoteResult(answer, notes.title, transcript);
    if (!note) {
      log('notes_unreadable', { lectureId, model: final.model, stopReason: final.stop_reason, ...usage });
      return final.stop_reason === 'max_tokens'
        ? fail(502, 'summary_failed', 'The notes got too long. Try a shorter detail level.')
        : fail(502, 'summary_failed', 'The notes could not be written. Please try again.');
    }
    log('notes_written', { lectureId, model: final.model, ...usage, costUsd: cost.costUsd, ms: Date.now() - started });
    return json({ note, model: final.model, stopReason: final.stop_reason, usage, costUsd: cost.costUsd });
  } catch (err) {
    // Database errors are plain objects with a message, not Error instances
    log('error', { lectureId, message: (err as { message?: string })?.message ?? String(err) });
    return fail(500, 'server_error', 'Something went wrong on the server. Please try again.');
  }
});

type Prepared =
  | { ok: true; system: string; content: Anthropic.Beta.BetaContentBlockParam[]; transcript: string; photos: number; pdfs: number; bytes: number }
  | { ok: false; response: Response };

/** The notes request: transcript, and photos/PDFs when asked for (with images consent). */
async function prepareNotes(db: Parameters<typeof lectureTranscript>[0], notes: NotesRequest): Promise<Prepared> {
  // Photos and slides are a separate consent (Apple 5.1.2(i)); nothing is downloaded without it.
  if (notes.includeMedia && !(await hasConsent(db, 'images'))) {
    return {
      ok: false,
      response: json(
        { code: 'consent_required', scope: 'images', error: 'Allow photos and slides to be sent to Anthropic before including them in the notes.' },
        403,
      ),
    };
  }

  const transcript = await lectureTranscript(db, notes.lectureId);
  if (!transcript) {
    return { ok: false, response: fail(409, 'no_transcript', 'This lecture has no transcript yet. Transcribe it first.') };
  }

  let blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
  let photos = 0;
  let pdfs = 0;
  let bytes = 0;
  if (notes.includeMedia) {
    const media = await lectureMedia(db, notes.lectureId);
    if (!media.ok) {
      return media.reason === 'too_large'
        ? { ok: false, response: fail(413, 'media_too_large', 'These photos and PDFs are too large to send together (24 MB). Remove some and try again.') }
        : { ok: false, response: fail(404, 'media_not_found', 'A photo or PDF of this lecture could not be found. Remove it and try again.') };
    }
    ({ blocks, photos, pdfs, bytes } = media);
  }

  const language = await lectureLanguage(db, notes.lectureId);
  return {
    ok: true,
    system: notesSystemPrompt(notes.summaryLevel, language, notes.recordingMode, photos + pdfs > 0),
    content: [...blocks, { type: 'text', text: notesUserText(notes.title, transcript, photos, pdfs) }],
    transcript,
    photos,
    pdfs,
    bytes,
  };
}
