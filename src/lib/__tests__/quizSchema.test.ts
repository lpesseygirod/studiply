/**
 * @jest-environment node
 */
// Step 9.1b-2: the quiz function's structured-output schemas (quiz-schema.ts) and their zod twins
// (quiz-zod.ts) agree; they stay small (below the section rewrite's, which the API takes): nothing
// nullable, no anyOf; the probe sends them; the prompt's field guide matches each type's zod shape.
import { FORMAT_SCHEMA, QUIZ_SCHEMA, DATA_GUIDE, type JsonSchema } from '../../../supabase/functions/_shared/quiz-schema';
import { QUESTION_DATA, QuizAnswer, FormatAnswer, checkData, parseFormat, parseQuizAnswer } from '../../../supabase/functions/_shared/quiz-zod';
import { QUESTION_TYPES } from '../../../supabase/functions/_shared/quiz-plan';
import { PROBE_SCHEMAS, schemaWeight } from '../../../supabase/functions/_shared/schema-probe';
import { SECTION_SCHEMA } from '../../../supabase/functions/_shared/summary-schema';

/** Every key a schema allows at each level (to compare with zod's). */
function keys(s: JsonSchema): unknown {
  if (s.type === 'object') return Object.fromEntries(Object.entries(s.properties as Record<string, JsonSchema>).map(([k, v]) => [k, keys(v)]));
  if (s.type === 'array') return [keys(s.items as JsonSchema)];
  return s.type;
}
const walk = (s: JsonSchema, visit: (n: JsonSchema) => void) => {
  visit(s);
  if (s.properties) Object.values(s.properties as Record<string, JsonSchema>).forEach((p) => walk(p, visit));
  if (s.items) walk(s.items as JsonSchema, visit);
};

describe('the quiz schemas', () => {
  it('lighter than the section rewrite’s, nothing nullable, no anyOf, every object closed', () => {
    for (const s of [QUIZ_SCHEMA, FORMAT_SCHEMA]) {
      expect(schemaWeight(s)).toBeLessThan(schemaWeight(SECTION_SCHEMA));
      walk(s, (n) => {
        expect(n.anyOf).toBeUndefined();
        expect(Array.isArray(n.type)).toBe(false);
        if (n.type === 'object') expect(n).toMatchObject({ additionalProperties: false, required: Object.keys(n.properties as object) });
      });
    }
  });

  it('the probe sends them', () => {
    expect(PROBE_SCHEMAS.map((p) => p.schema)).toEqual(expect.arrayContaining([QUIZ_SCHEMA, FORMAT_SCHEMA]));
  });

  it('a batch answer and a format: the JSON Schema and zod take the same fields', () => {
    const q = { slot: 1, type: 'true_false', prompt: 'p', data: '{"correct":true}', explanation: '', hint: '', addedContext: '', source: { ref: 'L1', t: '1:00', page: 0 }, markId: '' };
    expect(keys(QUIZ_SCHEMA)).toEqual({ questions: [{ slot: 'integer', type: 'string', prompt: 'string', data: 'string', explanation: 'string', hint: 'string', addedContext: 'string', source: { ref: 'string', t: 'string', page: 'integer' }, markId: 'string' }] });
    expect(QuizAnswer.safeParse({ questions: [q] }).success).toBe(true);
    expect(QuizAnswer.safeParse({ questions: [{ ...q, extra: 1 }] }).success).toBe(false);
    expect(parseQuizAnswer(JSON.stringify({ questions: [q] }))).toHaveLength(1);
    expect(parseQuizAnswer('{"questions": [{}]}')).toBeNull();
    const f = { language: 'es', questionCount: 12, types: [{ type: 'multiple_choice', count: 8 }], optionsPerQuestion: 4, avgQuestionWords: 18, styleNotes: '', examples: ['¿Qué…?'] };
    expect(Object.keys(keys(FORMAT_SCHEMA) as object)).toEqual(Object.keys(FormatAnswer.shape));
    expect(parseFormat(JSON.stringify(f))).toEqual(f);
    expect(parseFormat('{}')).toBeNull();
  });

  it('every type’s data: in the guide, checked by zod (a good one passes, a wrong one fails)', () => {
    expect(Object.keys(DATA_GUIDE)).toEqual([...QUESTION_TYPES]);
    expect(Object.keys(QUESTION_DATA)).toEqual([...QUESTION_TYPES]);
    for (const t of QUESTION_TYPES) for (const field of Object.keys(QUESTION_DATA[t].shape)) expect(DATA_GUIDE[t]).toContain(`"${field}"`);
    expect(checkData('numeric', JSON.stringify({ answer: 3, tolerance: 0.1, relative: false, unit: 'm', decimals: 1 })).ok).toBe(true);
    expect(checkData('numeric', JSON.stringify({ answer: '3' }))).toMatchObject({ ok: false });
  });
});
