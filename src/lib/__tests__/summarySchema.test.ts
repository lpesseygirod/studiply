/**
 * @jest-environment node
 */
// Step 7.4: the summary's shapes. The API contract is the JSON Schema constants
// (supabase/functions/_shared/summary-schema.ts, structured outputs); the answers are checked with
// zod 4.6.7 (summary-zod.ts, the same file Deno runs: Jest maps 'npm:zod@4.6.7' to the installed
// zod). The two must agree; the constants must stay inside what structured outputs accept.
// The specifier the server files use (Jest maps it to the installed zod; tsconfig's paths for tsc).
import { z } from 'npm:zod@4.6.7';
import { PROBE_SCHEMAS, isLocalSupabase, schemaWeight } from '../../../supabase/functions/_shared/schema-probe';
import { BLOCK_TYPES, CLASSIFY_SCHEMA, EXAM_PACK_SCHEMA, EXTEND_FIELD, LISTS_SCHEMA, PART_SCHEMA, SECTION_SCHEMA, SUMMARY_SCHEMA, VERIFY_SCHEMA, WRAPUP_SCHEMA, extendSchema, type JsonSchema } from '../../../supabase/functions/_shared/summary-schema';
import { BLOCK_DATA, ClassifyAnswer, ExamPackAnswer, ExtendLists, ListsAnswer, PartAnswer, SectionAnswer, SummaryAnswer, VerifyAnswer, WrapUpAnswer, blockGuide, checkBlock, issueLines } from '../../../supabase/functions/_shared/summary-zod';
import { packedSummary, validSummary } from '../../test-utils/summaryFixtures';
import { unsupported, walk } from '../../test-utils/schemaWalk';

/**
 * zod's JSON Schema in the constants' form: no $schema; whole numbers without the safe-integer
 * minimum/maximum zod adds (structured outputs refuse them, so the constants leave them out).
 */
function asContract(schema: z.ZodType): JsonSchema {
  const clean = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(clean);
    if (!node || typeof node !== 'object') return node;
    const { $schema: _s, ...rest } = node as Record<string, unknown>;
    if (rest.type === 'integer') {
      delete rest.minimum;
      delete rest.maximum;
    }
    return Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, clean(v)]));
  };
  return clean(z.toJSONSchema(schema)) as JsonSchema;
}

describe('the API contract (structured outputs)', () => {
  it.each([
    ['summary', SUMMARY_SCHEMA],
    ['classify', CLASSIFY_SCHEMA],
    ['section (7.5 part)', SECTION_SCHEMA],
    ['lists (7.5 part)', LISTS_SCHEMA],
    ['verify (7.5 part)', VERIFY_SCHEMA],
    ['a long lecture’s part (7.6)', PART_SCHEMA],
    ['the wrap-up (7.6)', WRAPUP_SCHEMA],
    ['Extend: the summary with alreadyCovered and corrections (7.9)', extendSchema(SUMMARY_SCHEMA)],
    ['Extend: a long lecture’s part with them (7.9)', extendSchema(PART_SCHEMA)],
    ['the exam pack (7.9)', EXAM_PACK_SCHEMA],
  ])('%s: every object lists all its fields as required, no extra fields; no unsupported keywords, unions or nullable types', (_name, schema) => {
    expect(unsupported(schema)).toEqual([]);
  });

  it('the check itself finds what it should', () => {
    const bad: JsonSchema = { type: 'object', properties: { a: { anyOf: [{ type: 'string' }] }, b: { type: ['string', 'null'] }, c: { type: 'string', maxLength: 3 } }, required: ['a'] };
    expect(unsupported(bad)).toEqual(['$: additionalProperties must be false', '$: every field must be required', '$.a: anyOf', '$.b: a type list (nullable)', '$.c: maxLength']);
  });

  it('a section’s blocks are { type, data }: the 22 types an enum, data a string', () => {
    const block = walk(SUMMARY_SCHEMA).find(([p]) => p === '$.sections[].blocks[]')![1];
    expect(block).toEqual({
      type: 'object',
      properties: { type: { type: 'string', enum: [...BLOCK_TYPES] }, data: { type: 'string' } },
      required: ['type', 'data'],
      additionalProperties: false,
    });
    expect(BLOCK_TYPES).toHaveLength(22);
  });

  it('zod and the constants agree: the outer summary and the classify answer', () => {
    expect(asContract(SummaryAnswer)).toEqual(SUMMARY_SCHEMA);
    expect(asContract(ClassifyAnswer)).toEqual(CLASSIFY_SCHEMA);
  });

  it('zod and the constants agree: the 7.5 part answers (a section, the lists, the verdicts)', () => {
    expect(asContract(SectionAnswer)).toEqual(SECTION_SCHEMA);
    expect(asContract(ListsAnswer)).toEqual(LISTS_SCHEMA);
    expect(asContract(VerifyAnswer)).toEqual(VERIFY_SCHEMA);
    expect(asContract(PartAnswer)).toEqual(PART_SCHEMA);
    expect(asContract(WrapUpAnswer)).toEqual(WRAPUP_SCHEMA);
    // A section written again has the summary's own section shape.
    expect((SUMMARY_SCHEMA.properties as Record<string, JsonSchema>).sections).toEqual({ type: 'array', items: SECTION_SCHEMA });
  });

  it('zod and the constants agree: Extend’s lists and the exam pack (7.9)', () => {
    // Extend's two lists are one JSON string in the schema (the grammar limit), checked with zod after.
    expect(extendSchema(SUMMARY_SCHEMA).required).toEqual([...(SUMMARY_SCHEMA.required as string[]), EXTEND_FIELD]);
    expect((extendSchema(SUMMARY_SCHEMA).properties as Record<string, JsonSchema>)[EXTEND_FIELD]).toEqual({ type: 'string' });
    expect(ExtendLists.safeParse({ alreadyCovered: [{ anchor: 'a', quote: 'q', note: 'n', t: '1:00' }], corrections: [{ anchor: 'a', said: 's', t: '2:00' }] }).success).toBe(true);
    expect(ExtendLists.safeParse({ alreadyCovered: [{ anchor: 'a' }], corrections: [] }).success).toBe(false);
    expect(asContract(ExamPackAnswer)).toEqual(EXAM_PACK_SCHEMA);
  });
});

describe('the grammar size (step 7.9: "The compiled grammar is too large")', () => {
  it('Extend adds one string to the summary and part schemas, no more (two arrays of objects went over the limit)', () => {
    expect(schemaWeight(extendSchema(SUMMARY_SCHEMA))).toBe(schemaWeight(SUMMARY_SCHEMA) + 2);
    expect(schemaWeight(extendSchema(PART_SCHEMA))).toBe(schemaWeight(PART_SCHEMA) + 2);
  });

  it('no schema the server sends is bigger than the accepted 7.4 summary schema plus Extend’s string', () => {
    const limit = schemaWeight(extendSchema(SUMMARY_SCHEMA));
    const sizes = PROBE_SCHEMAS.map((p) => `${p.name}: ${schemaWeight(p.schema)}`);
    console.log(`Schema sizes (rough):\n  ${sizes.join('\n  ')}`);
    for (const p of PROBE_SCHEMAS) expect(schemaWeight(p.schema)).toBeLessThanOrEqual(limit);
  });

  it('the probe covers every schema the engine sends, and refuses anything but local Supabase', () => {
    const sent = [CLASSIFY_SCHEMA, SUMMARY_SCHEMA, extendSchema(SUMMARY_SCHEMA), PART_SCHEMA, extendSchema(PART_SCHEMA), WRAPUP_SCHEMA, SECTION_SCHEMA, LISTS_SCHEMA, VERIFY_SCHEMA, EXAM_PACK_SCHEMA];
    for (const s of sent) expect(PROBE_SCHEMAS.some((p) => JSON.stringify(p.schema) === JSON.stringify(s))).toBe(true);
    expect(['http://kong:8000', 'http://127.0.0.1:54321', 'http://localhost:54321'].map(isLocalSupabase)).toEqual([true, true, true]);
    expect(['https://xmymneartjmdsawlwzyl.supabase.co', undefined, 'nonsense'].map(isLocalSupabase)).toEqual([false, false, false]);
  });
});

describe('the block shapes (zod)', () => {
  it('one per block type', () => {
    expect(Object.keys(BLOCK_DATA)).toEqual([...BLOCK_TYPES]);
  });

  it('the prompt lists each type’s data fields', () => {
    const guide = blockGuide().split('\n');
    expect(guide).toHaveLength(22);
    expect(guide[0]).toBe('- paragraph: { text: string, keyTerms: [string] }');
    expect(guide).toContain('- fromNotes: { noteIds: [string], t: string }');
    expect(guide).toContain('- theoryCard: { author: string, year: integer, claim: string, method: string, finding: string, critique: string }');
    expect(guide).toContain('- modelGraph: { template: "supplyDemand" | "islm" | "normalCurve" | "costCurves", shifts: [{ curve: string, direction: "left" | "right" }], title: string }');
  });

  it('the spec-shaped example: every block fits its type (a type repeated in data is ignored)', () => {
    const blocks = validSummary().sections.flatMap((s) => s.blocks as { type: (typeof BLOCK_TYPES)[number] }[]);
    expect([...new Set(blocks.map((b) => b.type))].sort()).toEqual([...BLOCK_TYPES].sort());
    for (const b of blocks) expect(checkBlock(b.type, b, '$')).toEqual({ ok: true, block: b });
  });

  it('a block’s errors, by path: missing, wrong, extra fields; not an object', () => {
    expect(checkBlock('paragraph', { text: 'x' }, '$.b')).toEqual({ ok: false, errors: [expect.stringMatching(/^\$\.b\.keyTerms: /)] });
    const confused = checkBlock('confusedHere', { markId: 'm', level: 7.5, t: '', explanation: '', steps: [], example: '', practiceQuestion: '', more: 1 }, '$');
    expect(confused).toEqual({ ok: false, errors: [expect.stringMatching(/^\$\.level: /), '$.more: not allowed'] });
    expect(checkBlock('code', [1], '$.b')).toEqual({ ok: false, errors: ['$.b.data: must be an object'] });
  });
});

describe('the outer shape (zod)', () => {
  it('the packed example fits', () => {
    expect(SummaryAnswer.safeParse(packedSummary()).success).toBe(true);
  });

  it('says what is wrong, by path', () => {
    const v = packedSummary() as Record<string, unknown> & ReturnType<typeof packedSummary>;
    v.extra = 1;
    v.takeaways[0].text = 5 as unknown as string;
    v.subjectType = 'astrology' as never;
    delete (v.sections[0] as Partial<(typeof v.sections)[0]>).cueQuestion;
    (v.sections[0].blocks as { type: string; data: string }[]).push({ type: 'hologram', data: '{}' });
    (v.selfTest[0] as Record<string, unknown>).kind = 'guess';
    const r = SummaryAnswer.safeParse(v);
    if (r.success) throw new Error('accepted');
    const lines = issueLines(r.error);
    expect(lines.map((l) => l.split(':')[0]).sort()).toEqual(
      ['$.subjectType', '$.takeaways[0].text', '$.sections[0].cueQuestion', `$.sections[0].blocks[${v.sections[0].blocks.length - 1}].type`, '$.selfTest[0].kind', '$.extra'].sort(),
    );
    expect(lines).toContain('$.extra: not allowed');
  });
});
