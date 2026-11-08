/**
 * quiz-schema.ts
 * Step 9.1b-2: the structured-output schemas the quiz function sends (JSON Schema constants, as
 * summary-schema.ts): the questions of a batch, and a past exam's format. Built from 7.4's lessons:
 * each question's type-specific fields travel as one JSON string (`data`, checked per type with zod in
 * quiz-zod.ts), so the grammar stays small: no anyOf, nothing nullable. The verify call reuses 7.5's
 * VERIFY_SCHEMA. Without imports but quiz-plan.ts's type list, so the app and Jest use the same file.
 */

import { QUESTION_TYPES } from './quiz-plan.ts';

export type JsonSchema = Record<string, unknown>;

const str: JsonSchema = { type: 'string' };
const int: JsonSchema = { type: 'integer' };
const arr = (items: JsonSchema): JsonSchema => ({ type: 'array', items });
const oneOf = (values: readonly string[]): JsonSchema => ({ type: 'string', enum: [...values] });
function obj(properties: Record<string, JsonSchema>): JsonSchema {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}

/**
 * One question as Claude writes it: its slot, type, prompt, the type's own fields as JSON (`data`),
 * the explanation, a hint ("" when hints are off), what the explanation adds beyond the material
 * (`addedContext`, "" when nothing), its source ("L2" + "14:05" + 0, or "F1" + "" + 7) and the mark it
 * came from ("" if none).
 */
export const QUIZ_SCHEMA: JsonSchema = obj({
  questions: arr(
    obj({
      slot: int,
      type: oneOf(QUESTION_TYPES),
      prompt: str,
      data: str,
      explanation: str,
      hint: str,
      addedContext: str,
      source: obj({ ref: str, t: str, page: int }),
      markId: str,
    }),
  ),
});

/** A past exam's format (Sonnet 5.5, read once per file): never its content beyond 3 example stems. */
export const FORMAT_SCHEMA: JsonSchema = obj({
  language: str,
  questionCount: int,
  types: arr(obj({ type: oneOf(QUESTION_TYPES), count: int })),
  optionsPerQuestion: int,
  avgQuestionWords: int,
  styleNotes: str,
  examples: arr(str),
});

/** What each type's `data` holds, in words, for the prompt (the zod shapes in quiz-zod.ts agree: Jest). */
export const DATA_GUIDE: Record<(typeof QUESTION_TYPES)[number], string> = {
  multiple_choice: '{ "options": [string], "correct": integer (the right option\'s index, from 0) }',
  true_false: '{ "correct": boolean }',
  short_answer: '{ "modelAnswer": string, "keyPoints": [string] }',
  fill_blank: '{ "text": string with ___ for each blank, "blanks": [{ "answer": string, "accept": [string] }] }',
  long_answer: '{ "modelAnswer": string, "keyPoints": [string] }',
  match_pairs: '{ "pairs": [{ "left": string, "right": string }] }',
  order_steps: '{ "steps": [string] in the right order }',
  numeric: '{ "answer": number, "tolerance": number, "relative": boolean (tolerance as a share of the answer), "unit": string, "decimals": integer }',
};
