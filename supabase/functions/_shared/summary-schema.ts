/**
 * summary-schema.ts
 * The summary's shape as the API contract (step 7.4; SUMMARY-SPEC "How to
 * generate it"): the JSON Schemas Claude answers in (structured outputs,
 * `output_config.format`). The answers are checked with zod in
 * summary-zod.ts (Lea OK'd zod, 31 Oct), whose shapes a Jest test keeps in
 * agreement with these.
 *
 * Written for structured outputs' subset: every object lists all its fields
 * as required and has additionalProperties: false; no nullable fields ("" or
 * [] stand for "none"; a level of 0 for "no level"); no anyOf: a section's
 * blocks are { type, data }, `data` the block's fields as JSON in a string
 * (the API refused the 22 block shapes in one anyOf with HTTP 400), checked
 * per type with zod; no numeric or length limits.
 *
 * What Claude doesn't write is added by code (summary-pipeline.ts): the
 * header's facts, the derived settings, the coverage counts, and each
 * "From your notes" block's text (copied from the student's notes by id).
 *
 * Without imports, so the app (7.7) and Jest use the same file.
 */

export const SUMMARY_FORMAT = 'studiply-summary-v1';

export type JsonSchema = Record<string, unknown>;

const str: JsonSchema = { type: 'string' };
const int: JsonSchema = { type: 'integer' };
const arr = (items: JsonSchema): JsonSchema => ({ type: 'array', items });
const oneOf = (values: readonly string[]): JsonSchema => ({ type: 'string', enum: [...values] });
function obj(properties: Record<string, JsonSchema>): JsonSchema {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}

export const SUBJECT_TYPES = ['history', 'math', 'finance', 'science', 'law', 'business', 'social', 'programming', 'language', 'philosophy'] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

/** SUMMARY-SPEC's module library. */
export const MODULES = [
  'timeline',
  'causeEffect',
  'keyFigures',
  'formula',
  'workedExample',
  'graphModel',
  'comparison',
  'conceptMap',
  'process',
  'framework',
  'theoryCard',
  'caseCard',
  'argument',
  'code',
  'commonMistakes',
  'vocabulary',
] as const;

export const CALLOUT_KINDS = ['definition', 'example', 'exam', 'warning', 'addedContext'] as const;
export const QUESTION_KINDS = ['recall', 'why', 'apply', 'calculate'] as const;

/** The block types of a section (the spec's list); each one's fields are in summary-zod.ts (BLOCK_DATA). */
export const BLOCK_TYPES = [
  'paragraph',
  'callout',
  'fromNotes',
  'confusedHere',
  'formula',
  'workedExample',
  'timeline',
  'causeEffect',
  'keyFigures',
  'comparison',
  'conceptMap',
  'process',
  'framework',
  'theoryCard',
  'caseCard',
  'argument',
  'code',
  'vocabulary',
  'functionPlot',
  'modelGraph',
  'dataChart',
  'capturedImage',
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

/** A section's block as Claude writes it: its type, and its fields as a JSON object in a string. */
export const PACKED_BLOCK: JsonSchema = obj({ type: oneOf(BLOCK_TYPES), data: str });

/** A section as Claude writes it (in the summary, and alone when one section is written again, step 7.5). */
export const SECTION_SCHEMA: JsonSchema = obj({
  heading: str,
  timestamp: str,
  cueQuestion: str,
  markChips: arr(obj({ markId: str, type: oneOf(['important', 'confused', 'exam']), level: int })),
  blocks: arr(PACKED_BLOCK),
});

const TAKEAWAYS = arr(obj({ text: str, fromMarkIds: arr(str) }));
const SELF_TEST = arr(obj({ question: str, kind: oneOf(QUESTION_KINDS), answer: str, fromMarkId: str }));
const FLASHCARDS = arr(obj({ front: str, back: str }));

/** What Claude writes (call 2, generate). Times are "mm:ss" (or "h:mm:ss"). */
export const SUMMARY_SCHEMA: JsonSchema = obj({
  subjectType: oneOf(SUBJECT_TYPES),
  modulesUsed: arr(oneOf(MODULES)),
  title: str,
  takeaways: TAKEAWAYS,
  sections: arr(SECTION_SCHEMA),
  glossary: arr(obj({ term: str, definition: str })),
  // markId: the student's Exam mark ("" for the professor's own words); level 0 for the professor's.
  examSignals: arr(obj({ text: str, timestamp: str, source: oneOf(['professor', 'studentMark']), markId: str, level: int })),
  questionsDuringClass: arr(obj({ t: str, question: str, shortAnswer: str })),
  selfTest: SELF_TEST,
  flashcards: FLASHCARDS,
  logistics: arr(str),
  unclear: arr(obj({ timestamp: str, note: str })),
});

/** Step 7.5, the lists written again (a high mark's takeaway, self-test question or flashcard was missing). */
export const LISTS_SCHEMA: JsonSchema = obj({ takeaways: TAKEAWAYS, selfTest: SELF_TEST, flashcards: FLASHCARDS });

/**
 * Step 7.6, one part of a long lecture (its topics' sections and what belongs to their span); the
 * whole-summary lists (title, takeaways, self-test, flashcards) come from the wrap-up call.
 */
export const PART_SCHEMA: JsonSchema = obj({
  modulesUsed: (SUMMARY_SCHEMA.properties as Record<string, JsonSchema>).modulesUsed,
  sections: arr(SECTION_SCHEMA),
  glossary: (SUMMARY_SCHEMA.properties as Record<string, JsonSchema>).glossary,
  examSignals: (SUMMARY_SCHEMA.properties as Record<string, JsonSchema>).examSignals,
  questionsDuringClass: (SUMMARY_SCHEMA.properties as Record<string, JsonSchema>).questionsDuringClass,
  logistics: arr(str),
  unclear: (SUMMARY_SCHEMA.properties as Record<string, JsonSchema>).unclear,
});

/** Step 7.6, the wrap-up call after the parts are merged: the whole lecture's title and lists. */
export const WRAPUP_SCHEMA: JsonSchema = obj({ title: str, takeaways: TAKEAWAYS, selfTest: SELF_TEST, flashcards: FLASHCARDS });

/**
 * Step 7.9, Extend and Merge (the approved plan): the lecture being added is written by the generate
 * call with the existing summary in its prompt, and its answer has two more lists:
 * - alreadyCovered: what the lecture says again about a part already there (`anchor`: that block's id,
 *   `quote`: its words the note is about, `note`: what was said this time, `t`: when);
 * - corrections: what the professor corrected (`anchor`: the block corrected, `said`: the correction).
 * Both in ONE string field, `extend`, holding their JSON (checked with zod after, summary-zod.ts
 * ExtendLists), as the blocks' `data` since 7.4: the summary schema is near the API's limit for a
 * compiled grammar, and the two lists as real arrays of objects went over it (the paid run of 31 Oct:
 * "The compiled grammar is too large"). One more string adds next to nothing.
 */
export const EXTEND_FIELD = 'extend';

/** A generate schema (the whole summary, or a long lecture's part) with Extend's lists as one JSON string. */
export function extendSchema(base: JsonSchema): JsonSchema {
  return obj({ ...(base.properties as Record<string, JsonSchema>), [EXTEND_FIELD]: str });
}

/** Step 7.9, Exam pack: a course or unit compressed to what the exam needs, by topic. */
export const EXAM_PACK_SCHEMA: JsonSchema = obj({
  title: str,
  topics: arr(
    obj({
      heading: str,
      examSignals: arr(obj({ text: str, lecture: int, t: str })),
      formulas: arr(obj({ name: str, latex: str, legend: str })),
      keyTerms: arr(obj({ term: str, definition: str })),
      selfTest: SELF_TEST,
    }),
  ),
  flashcards: FLASHCARDS,
});

export const VERDICTS = ['found', 'corrected', 'added'] as const;

/**
 * Step 7.5, the faithfulness check's call: for each number, date or formula code couldn't find in the
 * lecture, whether it is there after all, wrong (with the right words), or added (not from the lecture).
 */
export const VERIFY_SCHEMA: JsonSchema = obj({ items: arr(obj({ id: str, verdict: oneOf(VERDICTS), replacement: str })) });

/**
 * What the classify call answers (call 1): the subject and modules, the topics, and the two signals
 * the summary calculator takes as inputs (7.2, decision E): the professor's exam phrases and the
 * concepts explained 3 or more times, each with its times.
 */
export const CLASSIFY_SCHEMA: JsonSchema = obj({
  subjectType: oneOf(SUBJECT_TYPES),
  modules: arr(oneOf(MODULES)),
  topics: arr(obj({ title: str, start: str, end: str })),
  professorExamPhrases: arr(obj({ t: str, quote: str })),
  repeatedConcepts: arr(obj({ concept: str, times: arr(str) })),
});
