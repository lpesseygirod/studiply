/**
 * anthropic.ts
 * What assistant-chat and summarize share: the checks before any text is
 * sent to Anthropic, the Claude client, the request settings and the cost log.
 *
 * The SDK retries what can fix itself (no connection, 408, 409, 429, 5xx)
 * twice with backoff. A 401 means the server's key is wrong, so it fails at
 * once, as in openai.ts.
 */

import Anthropic from 'npm:@anthropic-ai/sdk@0.135.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { claudeCost, claudeRequest, type Cost } from './claude.ts';
import { claudeGate } from './claude-gate.ts';
import { hasConsent, logUsage, ownFile, ownLecture, ownQuiz, signedIn, usedToday } from './guard.ts';
import { fail } from './http.ts';

const TIMEOUT_MS = 120_000;

type Operation = 'assistant' | 'summary' | 'quiz';

export type Ready<T> =
  | { ok: true; db: SupabaseClient; userId: string; claude: Anthropic; value: T }
  | { ok: false; response: Response };

/**
 * In order: signed in → server has a key → valid body → own lecture (or,
 * with `fileId`, own document) → assistant/summary consent → under today's
 * limit. Nothing reaches
 * Anthropic unless all of them pass.
 */
export async function readyForClaude<T extends { lectureId: string; fileId?: string | null; quizId?: string | null }>(
  req: Request,
  validate: (body: unknown) => { ok: true; value: T } | { ok: false; status: number; code: string; error: string },
  log: (event: string, details: Record<string, unknown>) => void,
): Promise<Ready<T>> {
  const caller = await signedIn(req);
  if (!caller.ok) return caller;
  const { db, userId } = caller;

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  // The checks themselves are in claude-gate.ts (pure: Jest runs them).
  const gate = await claudeGate<T>({
    hasKey: !!apiKey,
    body: apiKey ? await req.json().catch(() => null) : null,
    validate,
    ownFile: (fileId) => ownFile(db, fileId),
    ownLecture: (lectureId) => ownLecture(db, lectureId),
    ownQuiz: (quizId) => ownQuiz(db, quizId),
    hasConsent: () => hasConsent(db, 'assistant_summary'),
    spentToday: (operations) => usedToday(db, [...operations], 'cost_usd'),
    log,
  });
  if (!gate.ok) return { ok: false, response: fail(gate.status, gate.code, gate.error) };

  const claude = new Anthropic({ apiKey: apiKey!, maxRetries: 2, timeout: TIMEOUT_MS });
  return { ok: true, db, userId, claude, value: gate.value };
}

/**
 * The request settings both functions use, with server-side fallbacks on.
 * `jsonSchema` makes the answer JSON of that shape (structured outputs).
 */
export function claudeParams(
  model: string,
  system: string,
  messages: Anthropic.Beta.BetaMessageParam[],
  options: { maxTokens?: number; jsonSchema?: Record<string, unknown> } = {},
) {
  // Built in claude.ts (no SDK there), so Jest checks the very body sent.
  return claudeRequest(model, system, messages, options) satisfies
    | Anthropic.Beta.MessageCreateParamsStreaming
    | Omit<Anthropic.Beta.MessageCreateParamsStreaming, 'stream'>;
}

/** Prices one answer and logs it once in ai_usage. */
export async function logClaudeCost(
  operation: Operation,
  userId: string,
  /** null: a plain document's (step 6.3), not a lecture's. */
  lectureId: string | null,
  requestedModel: string,
  message: Anthropic.Beta.BetaMessage,
): Promise<Cost> {
  const cost = claudeCost(requestedModel, message.model, message.usage);
  await logUsage({
    user_id: userId,
    lecture_id: lectureId,
    operation,
    provider: 'anthropic',
    model: cost.model,
    tokens_input: cost.tokensInput,
    tokens_output: cost.tokensOutput,
    cost_usd: cost.costUsd,
  });
  return cost;
}

/** The answer's text blocks joined; other blocks (thinking, fallback markers) are left out. */
export function answerText(message: Anthropic.Beta.BetaMessage): string {
  return message.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

/**
 * A short, loggable description of why a Claude call failed, from the SDK's typed errors: the status,
 * and the API's own error type and message (e.g. invalid_request_error "…schema…"), cut to 300
 * characters. These describe the request's form, never its content; the request itself is never logged.
 */
export function claudeFailure(err: unknown): { status: number; code: string; type?: string; message?: string } {
  // Step 10.1: the call that wasn't made because AI was switched off (consent-gate.ts): permanent.
  if ((err as { code?: string } | null)?.code === 'consent_withdrawn') return { status: 403, code: 'consent_withdrawn' };
  if (err instanceof Anthropic.APIConnectionTimeoutError) return { status: 0, code: 'timeout' };
  if (err instanceof Anthropic.APIConnectionError) return { status: 0, code: 'network_error' };
  if (err instanceof Anthropic.APIError) {
    const body = (err.error ?? {}) as { type?: string; message?: string; error?: { type?: string; message?: string } };
    const type = body.error?.type ?? body.type;
    const message = String(body.error?.message ?? body.message ?? '').slice(0, 300);
    return { status: err.status ?? 0, code: `http_${err.status}`, ...(type && { type }), ...(message && { message }) };
  }
  return { status: 0, code: 'unknown' };
}
