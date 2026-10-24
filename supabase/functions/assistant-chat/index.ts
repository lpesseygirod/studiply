/**
 * assistant-chat — the study assistant during class, streamed (skeleton).
 *
 * POST { lectureId, message } with the user's access token. The checks in
 * _shared/anthropic.ts run first and answer JSON errors (401, 400, 404,
 * 403 consent_required, 429 daily_limit). Then the answer is Server-Sent
 * Events:
 *   event: delta  { text }                          a piece of the answer
 *   event: done   { model, stopReason, usage, costUsd }
 *   event: error  { code, error }                   instead of done
 * After `error`, the app discards the deltas it got.
 *
 * Step 1.6 skeleton: the message goes to Claude with a fixed test prompt.
 * Phase 6 adds the lecture's time windows and saves assistant_messages.
 *
 * { lectureId, mode: 'clarify', highlightedParts, summary } (step 1.7): the
 * old app's "clarify" — a tutor explains the highlighted parts of a note.
 * The app sends the note's summary (it may not be saved yet); the server
 * adds the start of the transcript. Same events as above.
 *
 * The cost is logged once, when Claude finishes. If the student closes the
 * connection, the answer still runs to the end and is still logged:
 * Anthropic bills it either way. Never logs the message, the answer or keys.
 */

import type Anthropic from 'npm:@anthropic-ai/sdk@0.135.0';
import { claudeFailure, claudeParams, logClaudeCost, readyForClaude } from '../_shared/anthropic.ts';
import { ASSISTANT_TEST_SYSTEM, CLAUDE_MODELS, sseEvent, validateChatBody, validateSummarizeBody } from '../_shared/claude.ts';
import { corsHeaders, fail } from '../_shared/http.ts';
import { lectureLanguage, lectureTranscript } from '../_shared/lecture-content.ts';
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

/** A chat message, or with mode 'clarify' the parts to explain (no message needed). */
function validateBody(body: unknown) {
  const fields = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (fields.mode === undefined) {
    const chat = validateChatBody(body);
    return chat.ok ? { ok: true as const, value: { ...chat.value, clarify: null as ClarifyFields | null } } : chat;
  }
  if (fields.mode !== 'clarify') return { ok: false as const, status: 400 as const, code: 'invalid_request' as const, error: 'mode must be clarify.' };
  const base = validateSummarizeBody(body);
  if (!base.ok) return base;
  const clarify = validateClarifyFields(fields);
  if (!clarify.ok) return clarify;
  return { ok: true as const, value: { lectureId: base.value.lectureId, message: '', clarify: clarify.value as ClarifyFields | null } };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.');

  let ready;
  let system = ASSISTANT_TEST_SYSTEM;
  let prompt = '';
  let maxTokens: number | undefined;
  try {
    ready = await readyForClaude(req, validateBody, log);
    if (!ready.ok) return ready.response;
    const { db, value } = ready;
    prompt = value.message;
    if (value.clarify) {
      const [language, transcript] = await Promise.all([
        lectureLanguage(db, value.lectureId),
        lectureTranscript(db, value.lectureId, CLARIFY_TRANSCRIPT_CHARS),
      ]);
      system = clarifySystemPrompt(language);
      prompt = clarifyUserText(value.clarify.summary, value.clarify.highlightedParts, transcript);
      maxTokens = CLARIFY_MAX_TOKENS;
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
  const send = (name: 'delta' | 'done' | 'error', data: unknown) => {
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

  const work = (async () => {
    const started = Date.now();
    const stream = claude.beta.messages.stream(claudeParams(MODEL, system, [{ role: 'user', content: prompt }], { maxTokens }));
    stream.on('text', (text) => send('delta', { text }));

    let final: Anthropic.Beta.BetaMessage;
    try {
      final = await stream.finalMessage();
    } catch (err) {
      const failure = claudeFailure(err);
      log('claude_failed', { lectureId, ...failure, ms: Date.now() - started });
      // Whatever Claude had already written is billed; log it if the stream got that far
      const partial = stream.currentMessage;
      if (partial) await logClaudeCost('assistant', userId, lectureId, MODEL, partial).catch(() => {});
      send('error', { code: 'assistant_failed', error: 'The assistant could not answer. Please try again.' });
      close();
      return;
    }

    let costUsd: number | null = null;
    let usage = { input: 0, output: 0 };
    try {
      const cost = await logClaudeCost('assistant', userId, lectureId, MODEL, final);
      costUsd = cost.costUsd;
      usage = { input: cost.tokensInput, output: cost.tokensOutput };
    } catch (err) {
      log('usage_log_failed', { lectureId, message: (err as { message?: string })?.message ?? String(err) });
    }

    // With fallbacks on, a refusal here means every model in the chain declined
    if (final.stop_reason === 'refusal') {
      log('refused', { lectureId, model: final.model });
      send('error', { code: 'refused', error: 'The assistant can’t answer that. Try asking another way.' });
    } else {
      log('answered', { lectureId, model: final.model, ...usage, costUsd, ms: Date.now() - started });
      send('done', { model: final.model, stopReason: final.stop_reason, usage, costUsd });
    }
    close();
  })();
  // Keeps the worker alive until the answer is finished and logged, even after the student disconnects
  EdgeRuntime.waitUntil(work);

  return new Response(body, {
    headers: { ...corsHeaders, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
});
