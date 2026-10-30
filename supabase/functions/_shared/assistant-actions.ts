/**
 * assistant-actions.ts
 * Ask Claude on a selection and Flashcards from an answer (step 6.3): one
 * Claude call whose answer is JSON of a fixed shape (structured outputs),
 * checked against that shape before anything uses it. With Claude passed
 * in, so Jest runs it with fakes (src/lib/__tests__/assistantActions.test.ts).
 *
 *  - A refusal (every model of the fallback chain declined), an answer cut
 *    off at max_tokens, and JSON that isn't the shape are clear errors: the
 *    app applies nothing.
 *  - The cost is logged once, also when the answer is unusable or Claude
 *    failed mid-way (Anthropic bills what it wrote).
 */

import { parseCards, parseSuggestion, type Card } from './assistant.ts';
import type { FinalMessage } from './assistant-answer.ts';

/** What this uses of a Claude message stream: its end, and what it had written if it failed. */
export interface ClaudeCall {
  finalMessage(): Promise<FinalMessage>;
  readonly currentMessage?: FinalMessage;
}

export interface ActionDeps {
  call: ClaudeCall;
  logCost: (message: FinalMessage) => Promise<{ costUsd: number; tokensInput: number; tokensOutput: number }>;
  failure: (err: unknown) => Record<string, unknown>;
  log: (event: string, details: Record<string, unknown>) => void;
  /** For the logs. */
  fileId: string;
  now?: () => number;
}

export type ActionResult =
  | { status: 200; body: { suggestion?: string; cards?: Card[]; model: string; usage: { input: number; output: number }; costUsd: number | null } }
  | { status: 422 | 502; body: { code: string; error: string } };

const textOf = (m: FinalMessage) =>
  m.content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('');

export async function runJsonAction(kind: 'suggestion' | 'cards', deps: ActionDeps): Promise<ActionResult> {
  const now = deps.now ?? Date.now;
  const started = now();
  const { fileId } = deps;
  let final: FinalMessage;
  try {
    final = await deps.call.finalMessage();
  } catch (err) {
    deps.log('claude_failed', { fileId, kind, ...deps.failure(err), ms: now() - started });
    const partial = deps.call.currentMessage;
    if (partial) await deps.logCost(partial).catch(() => {});
    return { status: 502, body: { code: 'assistant_failed', error: 'Claude could not answer. Please try again.' } };
  }

  let costUsd: number | null = null;
  let usage = { input: 0, output: 0 };
  try {
    const cost = await deps.logCost(final);
    costUsd = cost.costUsd;
    usage = { input: cost.tokensInput, output: cost.tokensOutput };
  } catch (err) {
    deps.log('usage_log_failed', { fileId, message: (err as { message?: string })?.message ?? String(err) });
  }

  // With fallbacks on, a refusal here means every model in the chain declined
  if (final.stop_reason === 'refusal') {
    deps.log('refused', { fileId, kind, model: final.model });
    return { status: 422, body: { code: 'refused', error: 'Claude can’t help with this text. Nothing was changed.' } };
  }
  if (final.stop_reason === 'max_tokens') {
    deps.log('too_long', { fileId, kind, model: final.model, ...usage });
    return { status: 502, body: { code: 'too_long', error: 'The answer got too long and was cut off. Nothing was changed; try a shorter selection.' } };
  }

  const text = textOf(final);
  const value = kind === 'suggestion' ? parseSuggestion(text) : parseCards(text);
  if (!value) {
    deps.log('unreadable', { fileId, kind, model: final.model, stopReason: final.stop_reason, ...usage });
    return { status: 502, body: { code: 'unreadable', error: 'Claude’s answer could not be read. Nothing was changed; please try again.' } };
  }
  deps.log('action_answered', { fileId, kind, model: final.model, ...usage, costUsd, ms: now() - started });
  return {
    status: 200,
    body: { ...(kind === 'suggestion' ? { suggestion: value as string } : { cards: value as Card[] }), model: final.model, usage, costUsd },
  };
}
