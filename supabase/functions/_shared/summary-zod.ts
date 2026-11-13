/**
 * summary-zod.ts
 * Checking Claude's summary answers with zod (Lea OK'd zod on 31 Oct, 4.6.7 pinned):
 * the outer shape of the summary (a section's blocks as { type, data }) and of the classify
 * answer, and each block's data against its type's shape (SUMMARY-SPEC "How to generate it").
 *
 * The API contract stays the JSON Schema constants in summary-schema.ts (structured outputs):
 * z.toJSONSchema writes whole numbers with safe-integer minimum/maximum, which structured outputs
 * refuse. A Jest test (summarySchema.test.ts) checks the two agree.
 *
 * Server-side only: the app never imports zod (Jest maps this specifier to the installed zod).
 */

import { z } from 'npm:zod@4.6.7';
import { BLOCK_TYPES, CALLOUT_KINDS, MODULES, QUESTION_KINDS, SUBJECT_TYPES, SUMMARY_FORMAT, VERDICTS, type BlockType } from './summary-schema.ts';

const str = z.string();
const int = z.number().int();
const num = z.number();
const list = <T extends z.ZodType>(item: T) => z.array(item);
const obj = <T extends z.ZodRawShape>(shape: T) => z.strictObject(shape);

/**
 * What a function plot's expression may hold, as the charts module parses it
 * (docs/charts-work-order-8.2.md, section 2). Anything else isn't drawn.
 */
export const EXPRESSION_GRAMMAR =
  'y in terms of x only: numbers, x, + - * / ^ ( ), pi, e, sin cos tan exp ln log sqrt abs with parentheses; write 2*x not 2x, sin(x) not sin x; -x^2 means -(x^2)';

/**
 * Lea, 6 Nov: a graph redrawn from a photo names the photo (its id in <photos>); "" when not from one.
 * Optional, so summaries stored before still pass.
 */
const fromPhoto = str.describe('the id of the photo this graph is redrawn from, "" if not from a photo').optional();

/** Each block type's data (its fields besides `type`): the spec's block shapes. */
export const BLOCK_DATA = {
  paragraph: obj({ text: str, keyTerms: list(str) }),
  callout: obj({ kind: z.enum(CALLOUT_KINDS), text: str }),
  // The notes' text is copied in by code: Claude only says which lines go here.
  fromNotes: obj({ noteIds: list(str), t: str }),
  confusedHere: obj({ markId: str, level: int, t: str, explanation: str, steps: list(str), example: str, practiceQuestion: str }),
  formula: obj({ latex: str, variables: list(obj({ symbol: str, meaning: str })), whenToUse: str }),
  workedExample: obj({ problem: str, steps: list(obj({ do: str, why: str })), answer: str }),
  timeline: obj({ events: list(obj({ date: str, title: str, detail: str, importance: str })) }),
  causeEffect: obj({ causes: list(str), event: str, effects: list(str) }),
  keyFigures: obj({ people: list(obj({ name: str, role: str, did: str, why: str })) }),
  comparison: obj({ items: list(str), criteria: list(obj({ name: str, values: list(str) })) }),
  conceptMap: obj({ center: str, links: list(obj({ from: str, to: str, label: str })) }),
  process: obj({ steps: list(obj({ name: str, input: str, output: str })) }),
  framework: obj({ name: str, cells: list(obj({ label: str, content: str })) }),
  theoryCard: obj({ author: str, year: int, claim: str, method: str, finding: str, critique: str }),
  caseCard: obj({ facts: str, question: str, decision: str, reasoning: str, lesson: str }),
  argument: obj({ claim: str, premises: list(str), objections: list(obj({ objection: str, reply: str })) }),
  code: obj({ language: str, code: str, output: str }),
  vocabulary: obj({ entries: list(obj({ term: str, meaning: str, example: str })) }),
  // The descriptions are prompt text only (blockGuide); the API sends a block's data as a string.
  functionPlot: obj({
    expression: str.describe(EXPRESSION_GRAMMAR),
    xRange: list(num).describe('two numbers: from, to'),
    mark: list(str).describe('any of "roots", "vertex", "extrema", "yIntercept"'),
    title: str,
    fromPhoto,
  }),
  modelGraph: obj({
    template: z.enum(['supplyDemand', 'islm', 'normalCurve', 'costCurves']),
    shifts: list(obj({ curve: str.describe('D or S; IS or LM; N; MC, ATC or AVC'), direction: z.enum(['left', 'right']) })),
    title: str,
    fromPhoto,
  }),
  // Lea, 6 Nov: pie and scatter too (the graph block draws both); `approx`: a value read between a photo's gridlines.
  dataChart: obj({
    chart: z.enum(['line', 'bar', 'stackedBar', 'histogram', 'pie', 'scatter']),
    title: str,
    xLabel: str,
    yLabel: str,
    series: list(obj({ name: str, points: list(obj({ x: str, y: num, approx: z.boolean().describe('true when read between a photo\'s gridlines').optional() })) })),
    timestamp: str,
    fromPhoto,
  }),
  capturedImage: obj({ imageId: str, timestamp: str, caption: str }),
} satisfies Record<BlockType, z.ZodObject>;

const markChip = obj({ markId: str, type: z.enum(['important', 'confused', 'exam']), level: int });
const takeaways = list(obj({ text: str, fromMarkIds: list(str) }));
const selfTest = list(obj({ question: str, kind: z.enum(QUESTION_KINDS), answer: str, fromMarkId: str }));
const flashcards = list(obj({ front: str, back: str }));

/** A section as Claude writes it: its blocks packed as { type, data }. */
export const SectionAnswer = obj({ heading: str, timestamp: str, cueQuestion: str, markChips: list(markChip), blocks: list(obj({ type: z.enum(BLOCK_TYPES), data: str })) });

const rest = {
  glossary: list(obj({ term: str, definition: str })),
  // markId: the student's Exam mark ("" for the professor's own words); level 0 for the professor's.
  examSignals: list(obj({ text: str, timestamp: str, source: z.enum(['professor', 'studentMark']), markId: str, level: int })),
  questionsDuringClass: list(obj({ t: str, question: str, shortAnswer: str })),
  selfTest,
  flashcards,
  logistics: list(str),
  unclear: list(obj({ timestamp: str, note: str })),
};

/** What Claude writes (call 2, generate): the outer shape, a section's blocks packed as { type, data }. */
export const SummaryAnswer = obj({
  subjectType: z.enum(SUBJECT_TYPES),
  modulesUsed: list(z.enum(MODULES)),
  title: str,
  takeaways,
  sections: list(SectionAnswer),
  ...rest,
});

/** The lists written again. */
export const ListsAnswer = obj({ takeaways, selfTest, flashcards });

/** One part of a long lecture. */
export const PartAnswer = obj({
  modulesUsed: list(z.enum(MODULES)),
  sections: list(SectionAnswer),
  glossary: rest.glossary,
  examSignals: rest.examSignals,
  questionsDuringClass: rest.questionsDuringClass,
  logistics: rest.logistics,
  unclear: rest.unclear,
});

/** The wrap-up after the merge. */
export const WrapUpAnswer = obj({ title: str, takeaways, selfTest, flashcards });

/** Extend's two lists, the JSON inside the generate answer's `extend` string (summary-schema.ts EXTEND_FIELD). */
export const ExtendLists = obj({
  alreadyCovered: list(obj({ anchor: str, quote: str, note: str, t: str })),
  corrections: list(obj({ anchor: str, said: str, t: str })),
});

/** The exam pack. */
export const ExamPackAnswer = obj({
  title: str,
  topics: list(
    obj({
      heading: str,
      examSignals: list(obj({ text: str, lecture: int, t: str })),
      formulas: list(obj({ name: str, latex: str, legend: str })),
      keyTerms: list(obj({ term: str, definition: str })),
      selfTest,
    }),
  ),
  flashcards,
});

/** The faithfulness check's verdicts. */
export const VerifyAnswer = obj({ items: list(obj({ id: str, verdict: z.enum(VERDICTS), replacement: str })) });

/** A stored block (unpacked): its type and its type's fields; a "From your notes" block also carries the notes, copied by code. */
const storedBlock = z.discriminatedUnion(
  'type',
  BLOCK_TYPES.map((t) =>
    (t === 'fromNotes'
      ? BLOCK_DATA.fromNotes.extend({ notes: list(obj({ id: str, t: str, text: str, content: z.unknown() })) })
      : BLOCK_DATA[t]
    ).extend({ type: z.literal(t) }),
  ) as unknown as [z.ZodObject, ...z.ZodObject[]],
);

/** The summary as stored in summaries.result (the quality checks' schema check, also on saved outputs). */
export const StoredSummaryShape = z.object({
  format: z.literal(SUMMARY_FORMAT),
  subjectType: z.enum(SUBJECT_TYPES),
  modulesUsed: list(z.enum(MODULES)),
  appliedSettings: z.record(z.string(), z.unknown()),
  header: obj({ course: str, title: str, number: int, date: str, professor: str, durationMin: int, builtFrom: list(str) }),
  coverage: obj({ noteLines: int, noteLinesUsed: int, marks: int, marksUsed: int }),
  takeaways,
  sections: list(obj({ heading: str, timestamp: str, cueQuestion: str, markChips: list(markChip), blocks: list(storedBlock) })),
  ...rest,
  checks: z.unknown().optional(),
});
export type SummaryAnswerValue = z.infer<typeof SummaryAnswer>;

/** What the classify call answers (call 1). */
export const ClassifyAnswer = obj({
  subjectType: z.enum(SUBJECT_TYPES),
  modules: list(z.enum(MODULES)),
  topics: list(obj({ title: str, start: str, end: str })),
  professorExamPhrases: list(obj({ t: str, quote: str })),
  repeatedConcepts: list(obj({ concept: str, times: list(str) })),
});
export type ClassifyAnswerValue = z.infer<typeof ClassifyAnswer>;

/** zod's issues as "path: what's wrong" lines (`$.sections[0].title: …`), an extra field as "…: not allowed". */
export function issueLines(error: z.ZodError, prefix = '$'): string[] {
  const at = (path: PropertyKey[]) => prefix + path.map((p) => (typeof p === 'number' ? `[${p}]` : `.${String(p)}`)).join('');
  return error.issues.flatMap((issue) =>
    issue.code === 'unrecognized_keys' ? issue.keys.map((k) => `${at([...issue.path, k])}: not allowed`) : [`${at(issue.path)}: ${issue.message}`],
  );
}

/** A block's data checked against its type's shape: the block ({ ...fields, type }), or what's wrong. */
export function checkBlock(type: BlockType, data: unknown, path: string): { ok: true; block: Record<string, unknown> } | { ok: false; errors: string[] } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, errors: [`${path}.data: must be an object`] };
  // A `type` repeated inside data is the block's own; it isn't one of the fields.
  const { type: _type, ...fields } = data as Record<string, unknown>;
  const parsed = BLOCK_DATA[type].safeParse(fields);
  return parsed.success ? { ok: true, block: { ...parsed.data, type } } : { ok: false, errors: issueLines(parsed.error, path) };
}

/** A field's type in words, for the prompt. */
function describe(s: Record<string, unknown>): string {
  // A field's description (e.g. the function plot's grammar) follows its type, in parentheses.
  const note = typeof s.description === 'string' ? ` (${s.description})` : '';
  if (Array.isArray(s.enum)) return (s.enum as string[]).map((v) => `"${v}"`).join(' | ') + note;
  if (s.type === 'array') return `[${describe(s.items as Record<string, unknown>)}]${note}`;
  if (s.type === 'object') return `{ ${Object.entries(s.properties as Record<string, Record<string, unknown>>).map(([k, v]) => `${k}: ${describe(v)}`).join(', ')} }${note}`;
  return String(s.type) + note;
}

/** Each block type with its data's fields, one per line ("- paragraph: { text: string, keyTerms: [string] }"), for the prompt. */
export function blockGuide(): string {
  return BLOCK_TYPES.map((t) => `- ${t}: ${describe(z.toJSONSchema(BLOCK_DATA[t]) as Record<string, unknown>)}`).join('\n');
}
