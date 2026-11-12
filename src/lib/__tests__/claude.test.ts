import {
  CLAUDE_MODELS,
  DAILY_CLAUDE_LIMIT_USD,
  claudeCost,
  priceOf,
  sseEvent,
  validateSummarizeBody,
} from '../../../supabase/functions/_shared/claude';

const LECTURE = 'd0000000-0000-4000-8000-000000000001';

describe('claudeCost', () => {
  it('prices a plain answer at its model', () => {
    // 1000 in × $4/M + 500 out × $20/M = 0.004 + 0.01
    expect(claudeCost('claude-opus-5-5', 'claude-opus-5-5', { input_tokens: 1000, output_tokens: 500 })).toEqual({
      model: 'claude-opus-5-5',
      tokensInput: 1000,
      tokensOutput: 500,
      costUsd: 0.014,
    });
  });

  it('counts cached input at the cache prices', () => {
    const cost = claudeCost('claude-opus-5-5', 'claude-opus-5-5', {
      input_tokens: 100,
      output_tokens: 0,
      cache_read_input_tokens: 10_000, // × $0.20/M = 0.002
      cache_creation_input_tokens: 1000, // × $5/M = 0.005
    });
    expect(cost.costUsd).toBe(0.0074);
    expect(cost.tokensInput).toBe(11_100);
  });

  it('prices every fallback attempt at its own model', () => {
    const cost = claudeCost('claude-opus-5-5', 'claude-opus-4-8', {
      input_tokens: 1000,
      output_tokens: 200,
      iterations: [
        // the declined attempt on the requested model (model null)
        { type: 'message', model: null, input_tokens: 1000, output_tokens: 0 },
        { type: 'fallback_message', model: 'claude-opus-4-8', input_tokens: 1000, output_tokens: 200 },
      ],
    });
    // 0.004 (declined) + 0.005 + 0.005 (fallback at $5/$25)
    expect(cost).toEqual({ model: 'claude-opus-4-8', tokensInput: 2000, tokensOutput: 200, costUsd: 0.014 });
  });

  it('uses the top-level usage when iterations is empty', () => {
    const cost = claudeCost('claude-opus-5-5', 'claude-opus-5-5', {
      input_tokens: 1000,
      output_tokens: 0,
      iterations: [],
    });
    expect(cost.costUsd).toBe(0.004);
  });

  it('rounds to millionths of a dollar', () => {
    expect(claudeCost('claude-opus-5-5', 'claude-opus-5-5', { input_tokens: 1, output_tokens: 1 }).costUsd).toBe(
      0.000024,
    );
  });
});

describe('priceOf', () => {
  it('prices an unknown model like the dearest known one', () => {
    expect(priceOf('claude-new-model').output).toBeGreaterThanOrEqual(priceOf('claude-opus-5-5').output);
  });
});

describe('validateSummarizeBody', () => {
  it('accepts a lecture id', () => {
    expect(validateSummarizeBody({ lectureId: LECTURE })).toEqual({ ok: true, value: { lectureId: LECTURE } });
  });

  it('refuses a bad lecture id with 400', () => {
    expect(validateSummarizeBody({ lectureId: 'x' })).toMatchObject({ ok: false, status: 400 });
  });
});

describe('sseEvent', () => {
  it('formats one Server-Sent Events frame', () => {
    expect(sseEvent('delta', { text: 'Hi\nthere' })).toBe('event: delta\ndata: {"text":"Hi\\nthere"}\n\n');
  });
});

describe('constants', () => {
  it('match the decisions in docs/PROGRESS.md', () => {
    // The study assistant on Sonnet 5.5 (Lea, 30 Oct 2026); summaries on Sonnet 5.5 too (Lea, 12 Nov).
    // Step 9.1b-2: Opus writes quizzes, Sonnet reads a past exam's format (advisor, 2 Nov).
    expect(CLAUDE_MODELS).toEqual({ assistant: 'claude-sonnet-5-5', summary: 'claude-sonnet-5-5', quiz: 'claude-opus-5-5', quizFormat: 'claude-sonnet-5-5', quizGrade: 'claude-sonnet-5-5' });
    // Every configured model has its own price (none falls back to the dearest)
    for (const model of Object.values(CLAUDE_MODELS)) expect(priceOf(model)).not.toBe(priceOf('claude-not-in-the-table'));
    expect(priceOf('claude-sonnet-5-5')).toEqual({ input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 });
    expect(DAILY_CLAUDE_LIMIT_USD).toBe(3);
  });
});
