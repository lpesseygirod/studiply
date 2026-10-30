/**
 * assistant.service.ts
 * The study assistant from the app (step 6.2): the lecture's earlier
 * questions and answers (assistant_messages, saved by assistant-chat),
 * how far its transcript goes, and asking, with the answer streamed in
 * (supabase/functions/assistant-chat, step 6.1).
 *
 * The stream: `meta` (the saved ids, the window, how far the lecture is
 * transcribed), the answer's pieces, then `done`; or `error`, and then the
 * pieces already shown are dropped (the streaming contract). A lost
 * connection mid-way ends it the same way; the server still finishes and
 * saves the answer, so it is there the next time the conversation loads.
 *
 * With EXPO_PUBLIC_MOCK_AI=1 (development) nothing is sent: a canned answer
 * streams in from here.
 */

import { isMockAiForced } from '../lib/aiMode';
import { serviceError } from '../lib/cloudRows';
import { FunctionError, streamFunction } from '../lib/functions';
import { supabase } from '../lib/supabase';
import { QUICK_PROMPTS, questionWindow, stamp, type QuickPrompt } from '../../supabase/functions/_shared/assistant';
import { ensureConsent, forgetConsent } from './consent.service';

export type { QuickPrompt };
export { QUICK_PROMPTS };

/** The quick prompts in DESIGN's order (iphone-04, desktop-01). */
export const QUICK_PROMPT_ORDER: QuickPrompt[] = ['last_10_min', 'just_said', 'last_term', 'missing'];

export interface AssistantWindow {
  startMs: number;
  endMs: number;
}

/** One question and its answer, as the chat shows them. */
export interface ChatTurn {
  /** The question's id (a local one until the server has saved it). */
  id: string;
  /** The answer's saved id (Flashcards from it, step 6.3); known once `meta` arrived. */
  answerId?: string;
  question: string;
  quickPrompt: QuickPrompt | null;
  window: AssistantWindow | null;
  answer: string;
  status: 'streaming' | 'done' | 'error';
  /** Why it failed, for the student. */
  error?: string;
}

interface MessageRow {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reply_to: string | null;
  quick_prompt: string | null;
  window_start_ms: number | null;
  window_end_ms: number | null;
  status: 'streaming' | 'done' | 'error';
}

const asQuick = (key: string | null): QuickPrompt | null => (key && key in QUICK_PROMPTS ? (key as QuickPrompt) : null);

/**
 * Rows (oldest first) as turns: each question with its latest answer. A question
 * asked again (Retry) shows once, with its newest answer.
 */
export function turnsFromRows(rows: MessageRow[]): ChatTurn[] {
  const answers = new Map<string, MessageRow>();
  for (const r of rows) if (r.role === 'assistant' && r.reply_to) answers.set(r.reply_to, r);
  const turns: ChatTurn[] = [];
  for (const q of rows) {
    if (q.role !== 'user') continue;
    const a = answers.get(q.id);
    const turn: ChatTurn = {
      id: q.id,
      ...(a && { answerId: a.id }),
      question: q.content,
      quickPrompt: asQuick(q.quick_prompt),
      window: q.window_start_ms !== null && q.window_end_ms !== null ? { startMs: q.window_start_ms, endMs: q.window_end_ms } : null,
      answer: a?.status === 'error' ? '' : (a?.content ?? ''),
      status: !a ? 'error' : a.status,
      error: !a || a.status === 'error' ? 'This question wasn’t answered.' : undefined,
    };
    // Retry asks the same question again: the newer pair replaces the older one in the list.
    const same = turns.findIndex((t) => t.question === turn.question && t.quickPrompt === turn.quickPrompt);
    if (same !== -1 && same === turns.length - 1) turns[same] = turn;
    else turns.push(turn);
  }
  return turns;
}

/** The lecture's questions and answers so far, oldest first. */
export async function loadConversation(lectureId: string): Promise<ChatTurn[]> {
  const { data, error } = await supabase
    .from('assistant_messages')
    .select('id, role, content, reply_to, quick_prompt, window_start_ms, window_end_ms, status')
    .eq('lecture_id', lectureId)
    .order('created_at', { ascending: true })
    .limit(400);
  if (error) throw serviceError(error, 'Could not load the conversation.');
  return turnsFromRows((data ?? []) as MessageRow[]);
}

/** Where the lecture's transcript ends on the server (ms), 0 when nothing is transcribed. */
export async function transcribedUpTo(lectureId: string): Promise<number> {
  const { data, error } = await supabase
    .from('transcript_segments')
    .select('end_ms')
    .eq('lecture_id', lectureId)
    .order('end_ms', { ascending: false })
    .limit(1);
  if (error) throw serviceError(error, 'Could not read the transcript.');
  return (data?.[0]?.end_ms as number | undefined) ?? 0;
}

export interface AskInput {
  lectureId: string;
  message: string;
  quickPrompt: QuickPrompt | null;
  /** The recording's clock while this lecture records; null after class (the transcript's end). */
  nowMs: number | null;
}

export interface AskHandlers {
  meta: (meta: { questionId: string; answerId: string; window: AssistantWindow; knownUpToMs: number }) => void;
  delta: (text: string) => void;
  done: () => void;
}

/**
 * Asks and streams the answer into `handlers`. Rejects (FunctionError, or ConsentDeclinedError
 * when the student says "Not now") instead of calling `done` if anything fails.
 */
export async function askAssistant(input: AskInput, handlers: AskHandlers, signal?: AbortSignal): Promise<void> {
  if (isMockAiForced()) return simulatedAnswer(input, handlers, signal);
  await ensureConsent('assistant_summary');
  let finished = false;
  let failure: FunctionError | null = null;
  try {
    await streamFunction(
      'assistant-chat',
      { lectureId: input.lectureId, message: input.message || undefined, quickPrompt: input.quickPrompt ?? undefined, nowMs: input.nowMs ?? undefined },
      (frame) => {
        const data = (frame.data ?? {}) as Record<string, unknown>;
        if (frame.event === 'meta') handlers.meta(data as unknown as Parameters<AskHandlers['meta']>[0]);
        else if (frame.event === 'delta' && typeof data.text === 'string') handlers.delta(data.text);
        else if (frame.event === 'done') finished = true;
        else if (frame.event === 'error') {
          failure = new FunctionError(
            typeof data.error === 'string' ? data.error : 'The assistant could not answer. Please try again.',
            200,
            typeof data.code === 'string' ? data.code : 'assistant_failed',
          );
        }
      },
      { signal },
    );
  } catch (err) {
    // Consent withdrawn on another device: asked again next time.
    if (err instanceof FunctionError && err.code === 'consent_required') forgetConsent();
    throw err;
  }
  if (failure) throw failure;
  if (!finished) throw new FunctionError('The answer was cut off. Please try again.', 200, 'incomplete');
  handlers.done();
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });

/** Development without AI calls: a canned answer citing a time inside its window, in pieces. */
async function simulatedAnswer(input: AskInput, handlers: AskHandlers, signal?: AbortSignal): Promise<void> {
  const known = input.nowMs ?? 0;
  const window = questionWindow(input.quickPrompt, input.nowMs ?? known);
  const id = `simulated-${Date.now()}`;
  handlers.meta({ questionId: `${id}-q`, answerId: `${id}-a`, window, knownUpToMs: known });
  const cite = stamp(Math.round((window.startMs + window.endMs) / 2000) * 1000);
  const text = `(Simulated answer.) **${QUICK_PROMPTS[input.quickPrompt ?? 'last_10_min'].label}**: the professor explained the main idea of this stretch.\n\n1. **First point:** what it is.\n2. **Second point:** why it matters.\n\nAt [${cite}] she said it will be on the exam.`;
  for (const piece of text.match(/.{1,24}/gs) ?? []) {
    await sleep(60, signal);
    handlers.delta(piece);
  }
  handlers.done();
}
