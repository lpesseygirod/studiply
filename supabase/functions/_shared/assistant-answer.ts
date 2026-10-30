/**
 * assistant-answer.ts
 * How assistant-chat answers a question (step 6.1), with the lecture's reads,
 * the saved messages and Claude passed in, so Jest runs it with fakes
 * (src/lib/__tests__/assistantAnswer.test.ts) and nothing here imports the
 * SDK or Deno.
 *
 *  1. prepareQuestion: reads the transcript (joined), notes, marks, the
 *     lecture's language and the last questions; picks the window; builds
 *     the prompt; saves the question and an answer row `streaming`, both
 *     with the window. Fails before anything is streamed (a JSON 500).
 *  2. streamAnswer: `meta` first (the saved ids, the window, how far the
 *     lecture is transcribed), the answer's pieces as `delta`, then `done`
 *     or `error`. The answer row gets its text and `done`, or `error` (with
 *     what was written so far). The cost is logged once, also for a failed
 *     or abandoned answer (Anthropic bills it either way).
 */

import {
  assistantSystemPrompt,
  assistantUserText,
  historyTurns,
  knownUpTo,
  questionWindow,
  type AssistantRequest,
  type MarkAt,
  type MessageRow,
  type NoteLine,
  type QuickPrompt,
  type TimedSegment,
  type Window,
} from './assistant.ts';

export interface LectureReads {
  segments(): Promise<TimedSegment[]>;
  notes(): Promise<NoteLine[]>;
  marks(): Promise<MarkAt[]>;
  language(): Promise<string | null>;
  /** The lecture's assistant messages so far, oldest first. */
  history(): Promise<MessageRow[]>;
}

export interface AnswerFields {
  content: string;
  status: 'done' | 'error';
  model: string | null;
}

export interface MessageStore {
  /** Saves the question and its answer row (`streaming`); returns their ids. */
  start(p: { question: string; quickPrompt: QuickPrompt | null; askedAtMs: number; window: Window; model: string }): Promise<{
    questionId: string;
    answerId: string;
  }>;
  finish(answerId: string, fields: AnswerFields): Promise<void>;
}

export interface Meta {
  questionId: string;
  answerId: string;
  window: Window;
  knownUpToMs: number;
}

export interface Prepared {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  meta: Meta;
}

export async function prepareQuestion(request: AssistantRequest, reads: LectureReads, store: MessageStore, model: string): Promise<Prepared> {
  const [segments, notes, marks, language, history] = await Promise.all([
    reads.segments(),
    reads.notes(),
    reads.marks(),
    reads.language(),
    reads.history(),
  ]);
  const knownUpToMs = knownUpTo(segments);
  const nowMs = request.nowMs ?? knownUpToMs;
  const window = questionWindow(request.quickPrompt, nowMs);
  const material = assistantUserText({ quickPrompt: request.quickPrompt, message: request.message, window, knownUpToMs, segments, notes, marks });
  const saved = await store.start({ question: material.question, quickPrompt: request.quickPrompt, askedAtMs: nowMs, window, model });
  return {
    system: assistantSystemPrompt(language),
    messages: [...historyTurns(history), { role: 'user', content: material.text }],
    meta: { ...saved, window, knownUpToMs },
  };
}

/** What this uses of a Claude answer (the SDK's BetaMessage). */
export interface FinalMessage {
  model: string;
  stop_reason: string | null;
  content: { type: string; text?: string }[];
}

/** What this uses of the SDK's message stream. */
export interface ClaudeStream {
  on(event: 'text', listener: (text: string) => void): unknown;
  finalMessage(): Promise<FinalMessage>;
  readonly currentMessage?: FinalMessage;
}

export interface StreamDeps {
  lectureId: string;
  stream: ClaudeStream;
  send: (name: 'meta' | 'delta' | 'done' | 'error', data: unknown) => void;
  close: () => void;
  /** Prices and logs one answer in ai_usage. */
  logCost: (message: FinalMessage) => Promise<{ costUsd: number; tokensInput: number; tokensOutput: number }>;
  /** Why a Claude call failed, for the logs. */
  failure: (err: unknown) => Record<string, unknown>;
  log: (event: string, details: Record<string, unknown>) => void;
  /** Sent first (a question; clarify has none). */
  meta?: Meta;
  /** Saves the answer row (a question; clarify isn't saved). */
  finish?: (fields: AnswerFields) => Promise<void>;
  now?: () => number;
}

const textOf = (m: FinalMessage) =>
  m.content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('');

export async function streamAnswer(deps: StreamDeps): Promise<void> {
  const now = deps.now ?? Date.now;
  const started = now();
  const { lectureId } = deps;
  const save = async (fields: AnswerFields) => {
    if (!deps.finish) return;
    await deps.finish(fields).catch((err) => deps.log('save_failed', { lectureId, message: (err as { message?: string })?.message ?? String(err) }));
  };

  if (deps.meta) deps.send('meta', deps.meta);
  let written = '';
  deps.stream.on('text', (text) => {
    written += text;
    deps.send('delta', { text });
  });

  let final: FinalMessage;
  try {
    final = await deps.stream.finalMessage();
  } catch (err) {
    deps.log('claude_failed', { lectureId, ...deps.failure(err), ms: now() - started });
    // Whatever Claude had already written is billed; log it if the stream got that far
    const partial = deps.stream.currentMessage;
    if (partial) await deps.logCost(partial).catch(() => {});
    await save({ content: written, status: 'error', model: partial?.model ?? null });
    deps.send('error', { code: 'assistant_failed', error: 'The assistant could not answer. Please try again.' });
    deps.close();
    return;
  }

  let costUsd: number | null = null;
  let usage = { input: 0, output: 0 };
  try {
    const cost = await deps.logCost(final);
    costUsd = cost.costUsd;
    usage = { input: cost.tokensInput, output: cost.tokensOutput };
  } catch (err) {
    deps.log('usage_log_failed', { lectureId, message: (err as { message?: string })?.message ?? String(err) });
  }

  // With fallbacks on, a refusal here means every model in the chain declined
  if (final.stop_reason === 'refusal') {
    deps.log('refused', { lectureId, model: final.model });
    await save({ content: '', status: 'error', model: final.model });
    deps.send('error', { code: 'refused', error: 'The assistant can’t answer that. Try asking another way.' });
  } else {
    deps.log('answered', { lectureId, model: final.model, ...usage, costUsd, ms: now() - started });
    await save({ content: textOf(final) || written, status: 'done', model: final.model });
    deps.send('done', { model: final.model, stopReason: final.stop_reason, usage, costUsd });
  }
  deps.close();
}
