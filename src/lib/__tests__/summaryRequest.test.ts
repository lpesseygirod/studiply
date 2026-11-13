/**
 * @jest-environment node
 */
// After the paid run's HTTP 400 on the generate call (classify worked): the exact request
// both calls send, built as the summarize function builds it (runSummary's arguments → claude.ts's
// claudeRequest, which anthropic.ts's claudeParams returns as is), checked against what the API
// accepts with structured outputs (the claude-api reference): the schema's subset, output_config
// holding format and effort, one user turn (no prefill), no citations, a valid image block, and
// max_tokens within the model's output.
import { CLAUDE_EFFORT, CLAUDE_MODELS, FALLBACK_BETA, claudeRequest } from '../../../supabase/functions/_shared/claude';
import { SUMMARY_MAX_TOKENS, photoBlocks, runSummary, slidesBlocks, type Content, type SummaryRunDeps } from '../../../supabase/functions/_shared/summary-pipeline';
import { CLASSIFY_SCHEMA, SUMMARY_SCHEMA } from '../../../supabase/functions/_shared/summary-schema';
import { SLIDER_DEFAULTS } from '../../../supabase/functions/_shared/summary-plan';
import { unsupported } from '../../test-utils/schemaWalk';
import { lectureMaterial, packedSummary } from '../../test-utils/summaryFixtures';

type Message = { role: 'user' | 'assistant'; content: Content };
type Body = ReturnType<typeof claudeRequest<Message>>;

/** The two requests of one run, as summarize/index.ts builds them. */
async function requests() {
  const bodies: Record<string, Body> = {};
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]).toString('base64');
  const deps: SummaryRunDeps = {
    summaryId: 's1',
    lectureId: 'lec-1',
    request: { sliders: SLIDER_DEFAULTS, resources: { slides: true, photos: true, assistant: true } },
    material: async () => lectureMaterial(),
    media: async () => ({ blocks: [...photoBlocks('p1', 12 * 60_000 + 40_000, jpeg), ...slidesBlocks(jpeg)], photos: 1, pdfs: 1 }),
    claude: (call, system, content, schema, maxTokens) => {
      // summarize/index.ts: claudeParams(MODEL, system, [{ role: 'user', content }], { maxTokens, jsonSchema: schema }).
      bodies[call] = claudeRequest<Message>(CLAUDE_MODELS.summary, system, [{ role: 'user', content }], { maxTokens, jsonSchema: schema });
      const text = call === 'classify' ? '{}' : JSON.stringify(packedSummary());
      return { finalMessage: async () => ({ model: CLAUDE_MODELS.summary, stop_reason: 'end_turn', content: [{ type: 'text', text }] }) };
    },
    logCost: async () => ({ costUsd: 0, tokensInput: 0, tokensOutput: 0 }),
    save: async () => {},
    log: () => {},
    failure: () => ({}),
  };
  await runSummary(deps);
  return bodies as { classify: Body; generate: Body };
}

describe('the generate request (the one the API refused)', () => {
  it('the model (Sonnet 5.5 since Lea, 12 Nov), effort and the fallbacks as every other call; max_tokens within its output', async () => {
    const { generate, classify } = await requests();
    expect(generate.model).toBe('claude-sonnet-5-5');
    expect(classify.model).toBe('claude-sonnet-5-5');
    expect(generate.output_config.effort).toBe(CLAUDE_EFFORT);
    expect(generate.betas).toEqual([FALLBACK_BETA]);
    expect(generate.fallbacks).toBe('default');
    expect(generate.max_tokens).toBe(SUMMARY_MAX_TOKENS);
    // The 16k limit was set for Opus 5.5 (up to 32k or more in one answer, thinking included); unchanged on
    // Sonnet 5.5 (Lea, 12 Nov: only the model changes). A cut-off answer is retried once as before.
    expect(generate.max_tokens).toBeLessThanOrEqual(32_000);
    // The same keys as the classify request, which the API accepted.
    expect(Object.keys(generate).sort()).toEqual(Object.keys(classify).sort());
    expect(Object.keys(generate.output_config).sort()).toEqual(['effort', 'format']);
  });

  it('structured outputs: the format in output_config, the schema inside the supported subset', async () => {
    const { generate, classify } = await requests();
    expect(generate.output_config.format).toEqual({ type: 'json_schema', schema: SUMMARY_SCHEMA });
    expect(classify.output_config.format).toEqual({ type: 'json_schema', schema: CLASSIFY_SCHEMA });
    expect(unsupported(SUMMARY_SCHEMA)).toEqual([]);
    // No recursion: the schema serializes (a cycle would throw) and has no $ref.
    expect(() => JSON.stringify(SUMMARY_SCHEMA)).not.toThrow();
    expect(JSON.stringify(SUMMARY_SCHEMA)).not.toContain('$ref');
  });

  it('one user turn: no assistant prefill (structured outputs refuse it), no citations, no thinking settings', async () => {
    const { generate } = await requests();
    expect(generate.messages.map((m) => m.role)).toEqual(['user']);
    const body = JSON.stringify(generate);
    expect(body).not.toContain('"citations"');
    expect(body).not.toContain('"thinking"');
    expect(body).not.toContain('"tools"');
    expect(typeof generate.system).toBe('string');
    expect(generate.system.length).toBeGreaterThan(100);
  });

  it('the content: the photo (named, then a valid base64 JPEG block), the slides (a PDF document block), then the text; no empty text', async () => {
    const { generate } = await requests();
    const content = generate.messages[0].content;
    expect(content.map((b) => b.type)).toEqual(['text', 'image', 'text', 'document', 'text']);
    expect(content[0]).toEqual({ type: 'text', text: 'Photo p1 (taken at 12:40):' });
    expect(content[1]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: expect.stringMatching(/^[A-Za-z0-9+/]+=*$/) } });
    expect(content[3]).toEqual({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: expect.any(String) } });
    for (const b of content.filter((x) => x.type === 'text')) expect(String(b.text).trim().length).toBeGreaterThan(0);
    // Every block has only the keys the API knows for its type.
    for (const b of content) expect(Object.keys(b).sort()).toEqual(b.type === 'text' ? ['text', 'type'] : ['source', 'type']);
  });
});
