/**
 * assistant-chat — the study assistant during class, streamed (step 6.1).
 *
 * POST { lectureId, message?, quickPrompt?, nowMs? } with the user's access
 * token: a typed question (`message`), a quick prompt (`quickPrompt`:
 * last_10_min, just_said, last_term, missing; with an optional `message`),
 * and the recording's clock when asked (`nowMs`; without it, the end of
 * the transcript). The checks in _shared/anthropic.ts run first and answer
 * JSON errors (401, 400, 404, 403 consent_required, 429 daily_limit). Then
 * the answer is Server-Sent Events:
 *   event: meta   { questionId, answerId, window: { startMs, endMs }, knownUpToMs }
 *   event: delta  { text }                          a piece of the answer
 *   event: done   { model, stopReason, usage, costUsd }
 *   event: error  { code, error }                   instead of done
 * After `error`, the app discards the deltas it got.
 *
 * The answer is based on the lecture's transcript so far (joined like the
 * app's), notes and marks in the question's window, and the last three
 * questions and answers (_shared/assistant.ts, _shared/assistant-answer.ts).
 * It is in the lecture's language and cites times as [m:ss]. The question
 * and the answer are saved to assistant_messages with their window; the
 * answer row is `streaming` until it ends `done` or `error`.
 *
 * Step 6.3, answered as JSON (not streamed), shaped by structured outputs and
 * checked before it is returned; nothing is saved (the app shows it as a
 * suggestion the student accepts or rejects):
 *   { mode: 'selection', fileId, action, text, context? } → { suggestion } or
 *     { cards } — Ask Claude on a selection in any of the student's documents
 *     (simpler, example, deeper, flashcard, rewrite);
 *   { mode: 'flashcards', lectureId, answerId } → { cards } — from a saved answer.
 * Refused (422 refused), cut off (502 too_long) or unreadable (502 unreadable):
 * an error, nothing to apply.
 *
 * { lectureId, mode: 'clarify', highlightedParts, summary } (step 1.7): the
 * old app's "clarify" — a tutor explains the highlighted parts of a note.
 * The app sends the note's summary (it may not be saved yet); the server
 * adds the start of the transcript. Same events, without meta; not saved.
 *
 * The cost is logged once, when Claude finishes. If the student closes the
 * connection, the answer still runs to the end, is saved and is logged:
 * Anthropic bills it either way. Never logs the message, the answer or keys.
 */

import type Anthropic from 'npm:@anthropic-ai/sdk@0.135.0';
import { claudeFailure, claudeParams, logClaudeCost, readyForClaude, type Ready } from '../_shared/anthropic.ts';
import {
  CARDS_SCHEMA,
  SELECTION_ACTIONS,
  SUGGESTION_SCHEMA,
  flashcardsSystemPrompt,
  flashcardsUserText,
  selectionSystemPrompt,
  selectionUserText,
  validateAssistantBody,
  validateFlashcardsBody,
  validateSelectionBody,
  type AssistantRequest,
  type FlashcardsRequest,
  type SelectionRequest,
} from '../_shared/assistant.ts';
import { runJsonAction, type ClaudeCall } from '../_shared/assistant-actions.ts';
import { prepareQuestion, streamAnswer, type AnswerFields, type ClaudeStream, type FinalMessage, type Meta } from '../_shared/assistant-answer.ts';
import { ACTION_MAX_TOKENS, ASSISTANT_MAX_TOKENS, CLAUDE_MODELS, sseEvent, validateSummarizeBody } from '../_shared/claude.ts';
import { ownLecture } from '../_shared/guard.ts';
import { corsHeaders, fail, json } from '../_shared/http.ts';
import { lectureLanguage, lectureReads, lectureTranscript, messageStore, savedAnswer } from '../_shared/lecture-content.ts';
import {
  CLARIFY_MAX_TOKENS,
  CLARIFY_TRANSCRIPT_CHARS,
  clarifySystemPrompt,
  clarifyUserText,
  validateClarifyFields,
  type ClarifyFields,
} from '../_shared/legacy-notes.ts';

const MODEL = CLAUDE_MODELS.assistant;

/**
 * The Supabase runtime's global (supabase/edge-runtime). Its published type
 * file (jsr:@supabase/functions-js/edge-runtime.d.ts) doesn't load under
 * `deno check` 2.9, so only the one function used here is declared.
 */
declare const EdgeRuntime: { waitUntil<T>(promise: Promise<T>): Promise<T> };

function log(event: string, details: Record<string, unknown>) {
  console.log(JSON.stringify({ fn: 'assistant-chat', event, ...details }));
}

type Body = {
  lectureId: string;
  /** Mode 'selection': the document (any kind), checked instead of a lecture. */
  fileId?: string | null;
  question: AssistantRequest | null;
  clarify: ClarifyFields | null;
  selection?: SelectionRequest | null;
  flashcards?: FlashcardsRequest | null;
};

const none = { question: null, clarify: null, selection: null, flashcards: null };

/** A question (typed or quick); mode 'clarify', 'selection' or 'flashcards' (step 6.3). */
function validateBody(body: unknown) {
  const fields = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (fields.mode === undefined) {
    const question = validateAssistantBody(body);
    return question.ok ? { ok: true as const, value: { ...none, lectureId: question.value.lectureId, question: question.value } as Body } : question;
  }
  if (fields.mode === 'selection') {
    const s = validateSelectionBody(body);
    return s.ok ? { ok: true as const, value: { ...none, lectureId: s.value.fileId, fileId: s.value.fileId, selection: s.value } as Body } : s;
  }
  if (fields.mode === 'flashcards') {
    const f = validateFlashcardsBody(body);
    return f.ok ? { ok: true as const, value: { ...none, lectureId: f.value.lectureId, flashcards: f.value } as Body } : f;
  }
  if (fields.mode !== 'clarify') {
    return { ok: false as const, status: 400 as const, code: 'invalid_request' as const, error: 'mode must be clarify, selection or flashcards.' };
  }
  const base = validateSummarizeBody(body);
  if (!base.ok) return base;
  const clarify = validateClarifyFields(fields);
  if (!clarify.ok) return clarify;
  return { ok: true as const, value: { ...none, lectureId: base.value.lectureId, clarify: clarify.value as ClarifyFields } as Body };
}

/**
 * Step 6.3: Ask Claude on a selection, or Flashcards from a saved answer. One JSON answer of a fixed
 * shape (structured outputs, effort low, fallbacks on), checked before it is returned; the app shows
 * it as a suggestion to accept or reject. Consent, the daily limit and the cost log as for questions.
 */
async function action(ready: Extract<Ready<Body>, { ok: true }>): Promise<Response> {
  const { claude, db, userId, value } = ready;
  let system: string;
  let text: string;
  let kind: 'suggestion' | 'cards';
  let costLectureId: string | null;
  if (value.selection) {
    const s = value.selection;
    system = selectionSystemPrompt(s.action);
    text = selectionUserText(s);
    kind = SELECTION_ACTIONS[s.action].result === 'cards' ? 'cards' : 'suggestion';
    // ai_usage.lecture_id is a lecture's: a plain document's cost is logged without one.
    costLectureId = (await ownLecture(db, s.fileId)) ? s.fileId : null;
  } else {
    const f = value.flashcards!;
    const saved = await savedAnswer(db, f.lectureId, f.answerId);
    if (!saved) return fail(404, 'answer_not_found', 'That answer was not found.');
    system = flashcardsSystemPrompt();
    text = flashcardsUserText(saved.question, saved.answer);
    kind = 'cards';
    costLectureId = f.lectureId;
  }
  const params = claudeParams(MODEL, system, [{ role: 'user', content: text }], {
    maxTokens: ACTION_MAX_TOKENS,
    jsonSchema: kind === 'cards' ? CARDS_SCHEMA : SUGGESTION_SCHEMA,
  });
  const result = await runJsonAction(kind, {
    call: claude.beta.messages.stream(params) as unknown as ClaudeCall,
    logCost: (message: FinalMessage) => logClaudeCost('assistant', userId, costLectureId, MODEL, message as unknown as Anthropic.Beta.BetaMessage),
    failure: claudeFailure,
    log,
    fileId: value.lectureId,
  });
  return result.status === 200 ? json(result.body) : fail(result.status, result.body.code, result.body.error);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.');

  let ready;
  let system = '';
  let messages: Anthropic.Beta.BetaMessageParam[] = [];
  let maxTokens: number | undefined;
  let meta: Meta | undefined;
  let finish: ((fields: AnswerFields) => Promise<void>) | undefined;
  try {
    ready = await readyForClaude(req, validateBody, log);
    if (!ready.ok) return ready.response;
    const { db, value } = ready;
    if (value.selection || value.flashcards) return await action(ready);
    if (value.clarify) {
      const [language, transcript] = await Promise.all([
        lectureLanguage(db, value.lectureId),
        lectureTranscript(db, value.lectureId, CLARIFY_TRANSCRIPT_CHARS),
      ]);
      system = clarifySystemPrompt(language);
      messages = [{ role: 'user', content: clarifyUserText(value.clarify.summary, value.clarify.highlightedParts, transcript) }];
      maxTokens = CLARIFY_MAX_TOKENS;
    } else if (value.question) {
      // Read, window, prompt, and the question saved before anything is sent to Claude.
      const store = messageStore(db, value.lectureId);
      const prepared = await prepareQuestion(value.question, lectureReads(db, value.lectureId), store, MODEL);
      system = prepared.system;
      messages = prepared.messages;
      maxTokens = ASSISTANT_MAX_TOKENS;
      meta = prepared.meta;
      const answerId = prepared.meta.answerId;
      finish = (fields) => store.finish(answerId, fields);
    }
  } catch (err) {
    log('error', { message: (err as { message?: string })?.message ?? String(err) });
    return fail(500, 'server_error', 'Something went wrong on the server. Please try again.');
  }
  const { claude, userId, value } = ready;
  const { lectureId } = value;

  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let open = true;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      open = false;
      log('client_closed', { lectureId });
    },
  });
  const send = (name: 'meta' | 'delta' | 'done' | 'error', data: unknown) => {
    if (!open) return;
    try {
      controller.enqueue(encoder.encode(sseEvent(name, data)));
    } catch {
      open = false;
    }
  };
  const close = () => {
    if (!open) return;
    open = false;
    try {
      controller.close();
    } catch {
      // already closed by the client
    }
  };

  const work = streamAnswer({
    lectureId,
    stream: claude.beta.messages.stream(claudeParams(MODEL, system, messages, { maxTokens })) as unknown as ClaudeStream,
    send,
    close,
    logCost: (message: FinalMessage) => logClaudeCost('assistant', userId, lectureId, MODEL, message as unknown as Anthropic.Beta.BetaMessage),
    failure: claudeFailure,
    log,
    meta,
    finish,
  });
  // Keeps the worker alive until the answer is finished, saved and logged, even after the student disconnects
  EdgeRuntime.waitUntil(work);

  return new Response(body, {
    headers: { ...corsHeaders, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
});
