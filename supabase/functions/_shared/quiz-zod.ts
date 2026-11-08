/**
 * quiz-zod.ts
 * Step 9.1b-2: checking Claude's quiz answers with zod (as summary-zod.ts): a batch's outer shape, each
 * question's `data` against its type, and a past exam's format. The API contract stays the JSON Schema
 * constants in quiz-schema.ts (a Jest test checks the two agree). Server-side only: the app never
 * imports zod (Jest maps this specifier to the installed zod).
 */

import { z } from 'npm:zod@4.6.7';
import { QUESTION_TYPES, type QuestionType } from './quiz-plan.ts';
import { issueLines } from './summary-zod.ts';

const str = z.string();
const int = z.number().int();
const obj = <T extends z.ZodRawShape>(shape: T) => z.strictObject(shape);

/** Each type's `data`. */
export const QUESTION_DATA = {
  multiple_choice: obj({ options: z.array(str), correct: int }),
  true_false: obj({ correct: z.boolean() }),
  short_answer: obj({ modelAnswer: str, keyPoints: z.array(str) }),
  fill_blank: obj({ text: str, blanks: z.array(obj({ answer: str, accept: z.array(str) })) }),
  long_answer: obj({ modelAnswer: str, keyPoints: z.array(str) }),
  match_pairs: obj({ pairs: z.array(obj({ left: str, right: str })) }),
  order_steps: obj({ steps: z.array(str) }),
  numeric: obj({ answer: z.number(), tolerance: z.number(), relative: z.boolean(), unit: str, decimals: int }),
} satisfies Record<QuestionType, z.ZodObject>;

export type QuestionData = { [K in QuestionType]: z.infer<(typeof QUESTION_DATA)[K]> };

/** A batch as Claude writes it (data still a string). */
export const QuizAnswer = obj({
  questions: z.array(
    obj({
      slot: int,
      type: z.enum(QUESTION_TYPES),
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
export type RawQuestion = z.infer<typeof QuizAnswer>['questions'][number];

export const FormatAnswer = obj({
  language: str,
  questionCount: int,
  types: z.array(obj({ type: z.enum(QUESTION_TYPES), count: int })),
  optionsPerQuestion: int,
  avgQuestionWords: int,
  styleNotes: str,
  examples: z.array(str),
});
export type PastExamFormatRead = z.infer<typeof FormatAnswer>;

/** A batch's answer: its questions (data unparsed), or null when it isn't the shape. */
export function parseQuizAnswer(text: string): RawQuestion[] | null {
  try {
    const parsed = QuizAnswer.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.questions : null;
  } catch {
    return null;
  }
}

/** A question's `data` checked against its type: the fields, or what's wrong. */
export function checkData<T extends QuestionType>(type: T, data: string): { ok: true; data: QuestionData[T] } | { ok: false; errors: string[] } {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return { ok: false, errors: ['data: not JSON'] };
  }
  const parsed = QUESTION_DATA[type].safeParse(value);
  return parsed.success ? { ok: true, data: parsed.data as QuestionData[T] } : { ok: false, errors: issueLines(parsed.error, 'data') };
}

/** A past exam's format answer, or null. */
export function parseFormat(text: string): PastExamFormatRead | null {
  try {
    const parsed = FormatAnswer.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
