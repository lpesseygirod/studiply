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
import {
  CLAUDE_EFFORT,
  DAILY_CLAUDE_LIMIT_USD,
  FALLBACK_BETA,
  MAX_TOKENS,
  claudeCost,
  type Cost,
} from './claude.ts';
import { hasConsent, logUsage, ownFile, ownLecture, signedIn, usedToday } from './guard.ts';
import { fail } from './http.ts';

const TIMEOUT_MS = 120_000;

type Operation = 'assistant' | 'summary';

export type Ready<T> =
  | { ok: true; db: SupabaseClient; userId: string; claude: Anthropic; value: T }
  | { ok: false; response: Response };

/**
 * In order: signed in → server has a key → valid body → own lecture (or,
 * with `fileId`, own document) → assistant/summary consent → under today's
 * limit. Nothing reaches
 * Anthropic unless all of them pass.
 */
export async function readyForClaude<T extends { lectureId: string; fileId?: string | null }>(
  req: Request,
  validate: (body: unknown) => { ok: true; value: T } | { ok: false; status: number; code: string; error: string },
  log: (event: string, details: Record<string, unknown>) => void,
): Promise<Ready<T>> {
  const caller = await signedIn(req);
  if (!caller.ok) return caller;
  const { db, userId } = caller;

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    log('not_configured', {});
    return { ok: false, response: fail(500, 'not_configured', 'The study assistant is not set up on the server yet.') };
  }

  const body = await req.json().catch(() => null);
  const valid = validate(body);
  if (!valid.ok) return { ok: false, response: fail(valid.status, valid.code, valid.error) };
  const { lectureId, fileId } = valid.value;

  // A document of any kind (step 6.3, Ask Claude on a selection), else a lecture.
  if (fileId) {
    if (!(await ownFile(db, fileId))) return { ok: false, response: fail(404, 'file_not_found', 'That document was not found.') };
  } else if (!(await ownLecture(db, lectureId))) {
    return { ok: false, response: fail(404, 'lecture_not_found', 'That lecture was not found.') };
  }

  // Consent to send notes and transcripts to Anthropic (Apple 5.1.2(i))
  if (!(await hasConsent(db, 'assistant_summary'))) {
    return {
      ok: false,
      response: fail(
        403,
        'consent_required',
        'Allow the study assistant and summaries in Settings before Studiply sends your class to Anthropic.',
      ),
    };
  }

  if ((await usedToday(db, ['assistant', 'summary'], 'cost_usd')) >= DAILY_CLAUDE_LIMIT_USD) {
    log('daily_limit', { lectureId });
    return {
      ok: false,
      response: fail(429, 'daily_limit', 'You have reached today’s limit for the assistant and summaries. Try again tomorrow.'),
    };
  }

  const claude = new Anthropic({ apiKey, maxRetries: 2, timeout: TIMEOUT_MS });
  return { ok: true, db, userId, claude, value: valid.value };
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
  return {
    model,
    max_tokens: options.maxTokens ?? MAX_TOKENS,
    system,
    messages,
    output_config: {
      effort: CLAUDE_EFFORT,
      ...(options.jsonSchema && { format: { type: 'json_schema' as const, schema: options.jsonSchema } }),
    },
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
  } satisfies Anthropic.Beta.MessageCreateParamsStreaming | Omit<Anthropic.Beta.MessageCreateParamsStreaming, 'stream'>;
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

/** A short, loggable description of why a Claude call failed, from the SDK's typed errors. */
export function claudeFailure(err: unknown): { status: number; code: string } {
  if (err instanceof Anthropic.APIConnectionTimeoutError) return { status: 0, code: 'timeout' };
  if (err instanceof Anthropic.APIConnectionError) return { status: 0, code: 'network_error' };
  if (err instanceof Anthropic.APIError) return { status: err.status ?? 0, code: `http_${err.status}` };
  return { status: 0, code: 'unknown' };
}
