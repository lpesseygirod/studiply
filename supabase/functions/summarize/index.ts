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
 * { lectureId } (no task)
 *   Step 1.6 skeleton: a fixed test prompt, answering { text, ... }. Phase 7
 *   replaces both with the real summary pipeline.
 *
 * Claude's answer is streamed between here and Anthropic, because summaries
 * are long and a single long request can time out. The cost is logged once
 * in ai_usage. Never logs the prompt, the transcript, files, the answer or keys.
 */

import type Anthropic from 'npm:@anthropic-ai/sdk@0.135.0';
import { answerText, claudeFailure, claudeParams, logClaudeCost, readyForClaude } from '../_shared/anthropic.ts';
import { CLAUDE_MODELS, SUMMARIZE_TEST_PROMPT, validateSummarizeBody } from '../_shared/claude.ts';
import { hasConsent } from '../_shared/guard.ts';
import { corsHeaders, fail, json } from '../_shared/http.ts';
import { lectureLanguage, lectureMedia, lectureTranscript } from '../_shared/lecture-content.ts';
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

/** { lectureId } alone is the test prompt; task 'notes' adds the notes fields. */
function validateBody(body: unknown) {
  const base = validateSummarizeBody(body);
  if (!base.ok) return base;
  const fields = body as Record<string, unknown>;
  if (fields.task === undefined) return { ok: true as const, value: { lectureId: base.value.lectureId, notes: null as NotesRequest | null } };
  if (fields.task !== 'notes') return { ok: false as const, status: 400 as const, code: 'invalid_request' as const, error: 'task must be notes.' };
  const notes = validateNotesFields(base.value.lectureId, fields);
  if (!notes.ok) return notes;
  return { ok: true as const, value: { lectureId: base.value.lectureId, notes: notes.value as NotesRequest | null } };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.');

  let lectureId: string | undefined;
  try {
    const ready = await readyForClaude(req, validateBody, log);
    if (!ready.ok) return ready.response;
    const { claude, db, userId } = ready;
    lectureId = ready.value.lectureId;
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
