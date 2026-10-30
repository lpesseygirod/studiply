/**
 * claude.ts
 * Rules for the assistant-chat and summarize Edge Functions, kept free of
 * Deno and network code so Jest can test them (src/lib/__tests__/claude.test.ts).
 */

/**
 * The one place each function's Claude model is set (server-side; the app
 * never chooses). claude-opus-5-5 is Anthropic's recommended default (Oct
 * 2026). assistant-chat uses claude-sonnet-5-5 (Lea, 30 Oct 2026, step 6.1:
 * half the price, quicker in class); summaries stay on Opus. Every model here
 * must be in PRICES below.
 */
export const CLAUDE_MODELS: { assistant: string; summary: string } = {
  assistant: 'claude-sonnet-5-5',
  summary: 'claude-opus-5-5',
};

/**
 * Effort sets how much the model thinks (Opus 5.5 always thinks; its default
 * is medium). Low for both models: valid for Sonnet 5.5 too (checked against
 * the Claude API reference, 30 Oct 2026), and quick enough in class.
 */
export const CLAUDE_EFFORT = 'low' as const;

/** Room for thinking plus the answer; the real limits come with the real prompts. */
export const MAX_TOKENS = 4096;

/** The study assistant's answers are short (read on a phone in class): thinking plus about 400 words. */
export const ASSISTANT_MAX_TOKENS = 2048;

/** Ask Claude on a selection and Flashcards (step 6.3): room for a rewrite of a 6,000-character selection. */
export const ACTION_MAX_TOKENS = 4096;

/**
 * Re-runs a request Claude declines on Anthropic's recommended fallback
 * model for that kind of refusal, inside the same call.
 */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/**
 * The request both functions send (anthropic.ts's claudeParams), built here without the SDK so Jest
 * can check the exact body (step 7.4: summaryRequest.test.ts). `jsonSchema` makes the answer JSON of
 * that shape (structured outputs): it sits in output_config with the effort. One user turn, no
 * assistant prefill (structured outputs refuse prefill), no citations.
 */
export function claudeRequest<M>(model: string, system: string, messages: M[], options: { maxTokens?: number; jsonSchema?: Record<string, unknown> } = {}) {
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
    fallbacks: 'default' as const,
  };
}

/** Placeholder until plans and server-enforced limits arrive in step 10.2. */
export const DAILY_CLAUDE_LIMIT_USD = 3;

// The assistant's real prompts are in ./assistant.ts (step 6.1); this one is replaced in Phase 7 (summary).
export const SUMMARIZE_TEST_PROMPT =
  "This is a connection test of Studiply's summary engine. Reply with one short sentence saying you received it.";

/** US dollars per million tokens (Anthropic's prices, Oct 2026). */
interface Price {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const PRICES: Record<string, Price> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  // Fallback models Anthropic may route a declined request to
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
};

/** A model missing from the table is priced like the dearest one, so a limit is never undercounted. */
const DEAREST: Price = Object.values(PRICES).reduce((a, b) => (b.output > a.output ? b : a));

export function priceOf(model: string): Price {
  return PRICES[model] ?? DEAREST;
}

/** The token counts Claude reports, for the whole answer or for one attempt. */
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/** One attempt in usage.iterations: `message`, or `fallback_message` for the fallback model that answered. */
export interface IterationUsage extends TokenUsage {
  type: string;
  model?: string | null;
}

export interface Cost {
  /** The model that wrote the answer. */
  model: string;
  /** All input tokens of every attempt, cached ones included. */
  tokensInput: number;
  tokensOutput: number;
  /** Rounded like the ai_usage.cost_usd column. */
  costUsd: number;
}

function attemptCost(model: string, usage: TokenUsage): number {
  const price = priceOf(model);
  return (
    (usage.input_tokens * price.input +
      usage.output_tokens * price.output +
      (usage.cache_read_input_tokens ?? 0) * price.cacheRead +
      (usage.cache_creation_input_tokens ?? 0) * price.cacheWrite) /
    1e6
  );
}

const inputTokens = (u: TokenUsage) =>
  u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);

/**
 * What one Claude answer cost. With fallbacks, usage.iterations lists every
 * attempt (a declined one included) and is the billing source; each is priced
 * at its own model, and an entry without a model ran on the requested one.
 * Without iterations, the top-level usage is the answer's model alone.
 */
export function claudeCost(
  requestedModel: string,
  servedModel: string,
  usage: TokenUsage & { iterations?: IterationUsage[] | null },
): Cost {
  const attempts = (usage.iterations ?? []).filter((i) => i.type === 'message' || i.type === 'fallback_message');
  const priced = attempts.length
    ? attempts.map((i) => ({ model: i.model ?? requestedModel, usage: i as TokenUsage }))
    : [{ model: servedModel, usage: usage as TokenUsage }];

  let cost = 0;
  let tokensInput = 0;
  let tokensOutput = 0;
  for (const { model, usage: u } of priced) {
    cost += attemptCost(model, u);
    tokensInput += inputTokens(u);
    tokensOutput += u.output_tokens;
  }
  return { model: servedModel, tokensInput, tokensOutput, costUsd: Math.round(cost * 1e6) / 1e6 };
}

type Invalid = { ok: false; status: 400; code: 'invalid_request'; error: string };
const invalid = (error: string): Invalid => ({ ok: false, status: 400, code: 'invalid_request', error });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Checks a summarize body: { lectureId }. */
export function validateSummarizeBody(body: unknown): { ok: true; value: { lectureId: string } } | Invalid {
  if (!body || typeof body !== 'object') return invalid('Send lectureId as JSON.');
  const { lectureId } = body as Record<string, unknown>;
  if (typeof lectureId !== 'string' || !UUID.test(lectureId)) return invalid('lectureId must be a lecture id.');
  return { ok: true, value: { lectureId } };
}

/**
 * One Server-Sent Events frame. assistant-chat sends `meta` first (a
 * question: its saved ids and window, step 6.1), `delta` { text } for each
 * piece of the answer, then `done` { model, usage, costUsd }, or `error`
 * { code, error } if Claude fails after the stream has started.
 */
export function sseEvent(name: 'meta' | 'delta' | 'done' | 'error', data: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}
