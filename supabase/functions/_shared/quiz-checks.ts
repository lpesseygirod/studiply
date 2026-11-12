/**
 * quiz-checks.ts
 * The checks on each question Claude writes, in code (the approved plan, §3), and what is
 * done when one fails. Pure: no Deno or network code (Jest: src/lib/__tests__/quizChecks.test.ts).
 *
 * - shape: the type's `data` (zod, quiz-zod.ts); the slot exists and is answered once;
 * - its slot: the slot's type; an exam or weak slot's source time inside its span (±90 s); a slot
 *   for a lecture from that lecture; any source one of the chosen lectures or resources;
 * - form: multiple choice with the expected number of options, one correct, all distinct; pairs and
 *   steps 3 or more and distinct; numeric finite with a tolerance above 0; every blank answered;
 * - source: L# a chosen lecture and its time within the lecture; F# a resource and its page within it;
 * - duplicates (prompts compared without case, accents, spaces or punctuation): the second goes; a
 *   question that copies a past exam's example stem goes (past exams give the format only);
 * - faithfulness (the summary checks' finder): every number, date and formula of the prompt, the right answer and
 *   the explanation in the material; what code can't find goes to one verify call. A calculation or
 *   application question's numbers are an exercise's (made up to practise on, as the summary checks' exercise rule):
 *   only its formulas are checked. "added" in the explanation moves that sentence to Added context;
 *   "added" in the prompt or the right answer drops the question; "corrected" fixes the explanation
 *   or the prompt in place, a numeric answer when it reads as one number, else drops it;
 * - language: the summary checks' stopword check on each question long enough to tell.
 */

import { stamp } from './assistant.ts';
import type { Category, Focus, QuestionType } from './quiz-plan.ts';
import { checkData, type QuestionData, type RawQuestion } from './quiz-zod.ts';
import { dates, detectLanguage, digitNumbers, inlineFormulas, normalizeLatex, numberReadings, stampMs, STOPWORDS, type Sources } from './summary-checks.ts';

/** A source time this far outside its span still counts (the professor says it again a little later). */
export const SPAN_SLACK_MS = 90_000;
export const MIN_PAIRS = 3;
export const MIN_STEPS = 3;
/** Multiple choice without a past exam: this many options. */
export const DEFAULT_OPTIONS = 4;
/** A question shorter than this isn't judged for its language. */
const LANGUAGE_MIN_WORDS = 12;

/** A slot as the prompt gives it: the calculator's, with its span (exam and weak slots) and its lecture's ref. */
export interface SlotSpec {
  n: number;
  type: QuestionType;
  category: Category;
  focus: Focus;
  difficulty: 'easy' | 'medium' | 'hard';
  level: 'recall' | 'understand' | 'apply';
  /** The lecture it should come from (an `any` slot spread by length, or its span's), else null. */
  lectureId: string | null;
  span: { lectureId: string; startMs: number; endMs: number; label: string } | null;
}

/** What the questions may cite: the lectures as L1, L2…, the resources as F1, F2… */
export interface QuizRefs {
  lectures: { ref: string; fileId: string; durationMs: number; title: string }[];
  /** `pages`: a PDF's page count, 1 for a photo, null for a text document (any page, or 0). */
  files: { ref: string; fileId: string; pages: number | null; title: string }[];
}

export interface CheckContext {
  refs: QuizRefs;
  slots: SlotSpec[];
  /** The options a multiple-choice question has (the past exam's, else DEFAULT_OPTIONS). */
  options: number;
  /** The quiz's language code, for the language check (null: not checked). */
  language: string | null;
  hints: boolean;
  explanations: boolean;
  /** The past exams' example stems (their format's): a question that copies one goes (format only, never content). */
  pastStems?: string[];
}

/** A past exam's stem this long or longer counts as copied when a question contains it. */
const MIN_STEM = 20;

/** A question as it will be saved (quiz_questions), before its place in the quiz. */
export interface QuizQuestion {
  slot: number;
  type: QuestionType;
  prompt: string;
  data: Record<string, unknown>;
  answerText: string;
  explanation: string;
  hint: string;
  addedContext: string;
  sourceFileId: string;
  sourceMs: number | null;
  sourcePage: number | null;
  markId: string | null;
  focus: Focus | 'again';
  difficulty: 'easy' | 'medium' | 'hard';
  /** The category of its slot (for the exercise rule). */
  category: Category;
  fromQuestionId?: string | null;
}

export type Checked = { ok: true; question: QuizQuestion } | { ok: false; slot: number; reasons: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const words = (text: string) => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** A prompt as compared for duplicates: lower case, no accents, letters and digits only. */
export function normalizePrompt(prompt: string): string {
  return prompt
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const TRUE_FALSE: Record<string, [string, string]> = {
  es: ['Verdadero', 'Falso'],
  ca: ['Cert', 'Fals'],
  fr: ['Vrai', 'Faux'],
  de: ['Wahr', 'Falsch'],
  it: ['Vero', 'Falso'],
  pt: ['Verdadeiro', 'Falso'],
  en: ['True', 'False'],
};

/** The right answer as plain text (the results and the review card), in the quiz's language where it has words of its own. */
export function answerTextOf(type: QuestionType, data: Record<string, unknown>, language: string | null): string {
  const d = data as Record<string, never>;
  switch (type) {
    case 'multiple_choice':
      return String((d.options as string[])[d.correct as number] ?? '');
    case 'true_false': {
      const [yes, no] = TRUE_FALSE[(language ?? 'en').split('-')[0]] ?? TRUE_FALSE.en;
      return d.correct ? yes : no;
    }
    case 'short_answer':
    case 'long_answer':
      return String(d.modelAnswer ?? '');
    case 'fill_blank':
      return (d.blanks as { answer: string }[]).map((b) => b.answer).join(' · ');
    case 'match_pairs':
      return (d.pairs as { left: string; right: string }[]).map((p) => `${p.left} → ${p.right}`).join('; ');
    case 'order_steps':
      return (d.steps as string[]).map((s, i) => `${i + 1}. ${s}`).join(' ');
    case 'numeric': {
      const n = d as unknown as QuestionData['numeric'];
      const tol = n.relative ? `${Math.round(n.tolerance * 1000) / 10} %` : `${n.tolerance}${n.unit ? ` ${n.unit}` : ''}`;
      return `${n.answer}${n.unit ? ` ${n.unit}` : ''} (± ${tol})`;
    }
  }
}

const distinct = (list: string[]) => new Set(list.map((x) => normalizePrompt(x))).size === list.length;

/** What's wrong with a question's form for its type (empty: nothing). */
export function formProblems(type: QuestionType, data: Record<string, unknown>, options: number): string[] {
  const out: string[] = [];
  const d = data as Record<string, never>;
  if (type === 'multiple_choice') {
    const opts = d.options as string[];
    if (opts.length !== options) out.push(`${opts.length} options (${options} expected)`);
    if (!Number.isInteger(d.correct) || (d.correct as number) < 0 || (d.correct as number) >= opts.length) out.push('the right option is not one of the options');
    if (!distinct(opts) || opts.some((o) => !o.trim())) out.push('options repeated or empty');
  } else if (type === 'match_pairs') {
    const pairs = d.pairs as { left: string; right: string }[];
    if (pairs.length < MIN_PAIRS) out.push(`${pairs.length} pairs (at least ${MIN_PAIRS})`);
    if (!distinct(pairs.map((p) => p.left)) || !distinct(pairs.map((p) => p.right))) out.push('pairs repeated');
  } else if (type === 'order_steps') {
    const steps = d.steps as string[];
    if (steps.length < MIN_STEPS) out.push(`${steps.length} steps (at least ${MIN_STEPS})`);
    if (!distinct(steps)) out.push('steps repeated');
  } else if (type === 'numeric') {
    const n = d as unknown as QuestionData['numeric'];
    if (!Number.isFinite(n.answer)) out.push('the answer is not a number');
    if (!(Number.isFinite(n.tolerance) && n.tolerance > 0)) out.push('the tolerance must be above 0');
  } else if (type === 'fill_blank') {
    const blanks = d.blanks as { answer: string }[];
    const holes = (String(d.text).match(/_{3,}/g) ?? []).length;
    if (!blanks.length || blanks.some((b) => !b.answer.trim())) out.push('a blank without its answer');
    if (holes !== blanks.length) out.push(`${holes} blanks in the text, ${blanks.length} answers`);
  } else if (type === 'short_answer' || type === 'long_answer') {
    if (!String(d.modelAnswer).trim()) out.push('no model answer');
  }
  return out;
}

/**
 * One question checked against its slot, its form and its source: the question as it will be saved,
 * or its slot and why not. `marks`: the ids of her marks (a markId Claude gives must be one).
 */
export function checkQuestion(raw: RawQuestion, ctx: CheckContext, marks: ReadonlySet<string> = new Set()): Checked {
  const slot = ctx.slots.find((s) => s.n === raw.slot);
  if (!slot) return { ok: false, slot: raw.slot, reasons: [`slot ${raw.slot} doesn’t exist`] };
  const reasons: string[] = [];
  if (raw.type !== slot.type) reasons.push(`type ${raw.type}, the slot is ${slot.type}`);
  if (!raw.prompt.trim()) reasons.push('no question');
  const parsed = checkData(raw.type, raw.data);
  if (!parsed.ok) return { ok: false, slot: slot.n, reasons: [...reasons, ...parsed.errors] };
  const data = parsed.data as Record<string, unknown>;
  reasons.push(...formProblems(raw.type, data, ctx.options));

  // The source.
  let sourceFileId = '';
  let sourceMs: number | null = null;
  let sourcePage: number | null = null;
  const ref = raw.source.ref.trim().toUpperCase();
  const lecture = ctx.refs.lectures.find((l) => l.ref === ref);
  const file = ctx.refs.files.find((f) => f.ref === ref);
  if (lecture) {
    sourceFileId = lecture.fileId;
    sourceMs = stampMs(raw.source.t);
    if (sourceMs === null) reasons.push(`no time for ${ref}`);
    else if (sourceMs > lecture.durationMs) reasons.push(`${raw.source.t} is after ${ref}’s end (${stamp(lecture.durationMs)})`);
  } else if (file) {
    sourceFileId = file.fileId;
    if (file.pages !== null) {
      if (!Number.isInteger(raw.source.page) || raw.source.page < 1 || raw.source.page > file.pages) reasons.push(`page ${raw.source.page} is not in ${ref} (${file.pages} pages)`);
      else sourcePage = raw.source.page;
    } else if (raw.source.page >= 1) sourcePage = raw.source.page;
  } else reasons.push(`unknown source ${raw.source.ref || '(none)'}`);

  // Its slot's span or lecture.
  if (slot.span && lecture) {
    const inSpan = lecture.fileId === slot.span.lectureId && sourceMs !== null && sourceMs >= slot.span.startMs - SPAN_SLACK_MS && sourceMs <= slot.span.endMs + SPAN_SLACK_MS;
    if (!inSpan) reasons.push(`not from its ${slot.focus} span (${slot.span.label})`);
  } else if (slot.span && !lecture) reasons.push(`not from its ${slot.focus} span (${slot.span.label})`);
  else if (slot.lectureId && sourceFileId && sourceFileId !== slot.lectureId && !file) reasons.push('from another lecture than its slot’s');

  // Never a past exam's question (the advisor's decision, 2 Nov: past exams give the format only).
  const prompt = normalizePrompt(raw.prompt);
  if ((ctx.pastStems ?? []).map(normalizePrompt).some((stem) => stem.length >= MIN_STEM && prompt.includes(stem))) reasons.push('copies a past exam’s question');

  // Language (a question long enough to tell).
  const text = `${raw.prompt} ${raw.explanation}`;
  if (ctx.language && words(text) >= LANGUAGE_MIN_WORDS) {
    const lang = detectLanguage(text, ctx.language);
    if (lang && lang !== ctx.language) reasons.push(`written in ${lang}, the quiz is in ${ctx.language}`);
  }

  if (reasons.length) return { ok: false, slot: slot.n, reasons };
  const markId = raw.markId && UUID.test(raw.markId) && marks.has(raw.markId) ? raw.markId : null;
  return {
    ok: true,
    question: {
      slot: slot.n,
      type: raw.type,
      prompt: raw.prompt.trim(),
      data,
      answerText: answerTextOf(raw.type, data, ctx.language),
      explanation: ctx.explanations ? raw.explanation.trim() : '',
      // A hint that gives the answer away goes; the question stays (advisor, 8 Nov).
      hint: ctx.hints && !hintGivesAway(raw.hint, answerTextOf(raw.type, data, ctx.language), raw.prompt, ctx.language) ? raw.hint.trim() : '',
      addedContext: raw.addedContext.trim(),
      sourceFileId,
      sourceMs,
      sourcePage,
      markId,
      focus: slot.focus,
      difficulty: slot.difficulty,
      category: slot.category,
    },
  };
}

// ---------- hints and the options' order (advisor, 8 Nov) ----------

/** A word as compared: lower case, no accents. */
const plainWord = (w: string) => w.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Words this long or longer that share their first STEM letters count as the same word ("genético" / "genética"). */
const STEM = 5;
const sameWord = (a: string, b: string) => a === b || (a.length >= STEM && b.length >= STEM && a.slice(0, STEM) === b.slice(0, STEM));

/** A text's content words: its words and numbers without the language's function words (and 1–2 letter words). */
export function contentWords(text: string, language: string | null): string[] {
  const stop = new Set((STOPWORDS[(language ?? '').split('-')[0]] ?? []).map(plainWord));
  return plainWord(text)
    .split(/[^\p{L}\p{N}.,]+/u)
    .map((w) => w.replace(/^[.,]+|[.,]+$/g, ''))
    .filter((w) => (w.length >= 3 || /^\d/.test(w)) && !stop.has(w));
}

/**
 * Whether a hint gives its question's answer away: it has a content word of the right answer (or the
 * same word in another form, "genético" for "genética") that the question itself doesn't. A
 * paraphrase with other words ("utilidad" for "finalidad") can't be told by code: the prompt's rule
 * asks for none. True/false answers aren't words to give away.
 */
export function hintGivesAway(hint: string, answer: string, prompt: string, language: string | null): boolean {
  if (!hint.trim() || !answer.trim()) return false;
  const asked = contentWords(prompt, language);
  const key = contentWords(answer, language).filter((w) => !asked.some((p) => sameWord(p, w)));
  const said = contentWords(hint, language);
  return key.some((w) => said.some((h) => sameWord(h, w)));
}

/**
 * A multiple-choice question's options in a fixed shuffled order (seeded by the quiz and its slot, as
 * the questions' order), its right option moved with them: Claude tends to put the right one first.
 * Its answer text stays the same. Other types are returned as they are.
 */
export function shuffleOptions(q: QuizQuestion, seed: string, shuffle: <T>(list: readonly T[], seed: string) => T[]): QuizQuestion {
  if (q.type !== 'multiple_choice') return q;
  const d = q.data as { options: string[]; correct: number };
  const order = shuffle(d.options.map((_, i) => i), seed);
  const data = { ...q.data, options: order.map((i) => d.options[i]), correct: order.indexOf(d.correct) };
  return { ...q, data, answerText: answerTextOf('multiple_choice', data, null) };
}

/** The questions with a second copy of a prompt (or of a slot) dropped: those kept, and the slots dropped. */
export function dropDuplicates(questions: QuizQuestion[], seen: Set<string> = new Set()): { kept: QuizQuestion[]; dropped: { slot: number; reasons: string[] }[] } {
  const kept: QuizQuestion[] = [];
  const dropped: { slot: number; reasons: string[] }[] = [];
  const slots = new Set<number>();
  for (const q of questions) {
    const key = normalizePrompt(q.prompt);
    if (seen.has(key)) dropped.push({ slot: q.slot, reasons: ['the same question twice'] });
    else if (slots.has(q.slot)) dropped.push({ slot: q.slot, reasons: [`slot ${q.slot} answered twice`] });
    else {
      seen.add(key);
      slots.add(q.slot);
      kept.push(q);
    }
  }
  return { kept, dropped };
}

// ---------- faithfulness ----------

export type QuizField = 'prompt' | 'answer' | 'explanation';

/** A number, date or formula code couldn't find in the material: which question and where. */
export interface QuizUnverified {
  id: string;
  slot: number;
  field: QuizField;
  kind: 'number' | 'date' | 'formula';
  value: string;
  sentence: string;
}

/** Calculation and application questions are exercises: their numbers are made up to practise on. */
const EXERCISE_CATEGORIES = new Set<Category>(['calculation', 'application']);

const sentenceOf = (text: string, value: string) => text.split(/(?<=[.!?])\s+/).find((s) => s.includes(value)) ?? text;
const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** The texts of a question code checks, by field (the right answer as text; a numeric answer as its number). */
function fieldTexts(q: QuizQuestion): [QuizField, string][] {
  const answer = q.type === 'numeric' ? String((q.data as QuestionData['numeric']).answer) : q.type === 'true_false' ? '' : q.answerText;
  return [
    ['prompt', q.prompt],
    ['answer', answer],
    ['explanation', q.explanation],
  ];
}

/** Every number, date and formula of the questions not found in the material (the summary checks' finder). */
export function quizFaithfulness(questions: QuizQuestion[], src: Sources): { checked: number; unverified: QuizUnverified[] } {
  const unverified: QuizUnverified[] = [];
  let checked = 0;
  const add = (q: QuizQuestion, field: QuizField, kind: QuizUnverified['kind'], value: string, text: string) =>
    unverified.push({ id: `u${unverified.length + 1}`, slot: q.slot, field, kind, value, sentence: sentenceOf(text, value) });
  for (const q of questions) {
    const exercise = EXERCISE_CATEGORIES.has(q.category);
    for (const [field, text] of fieldTexts(q)) {
      if (!text) continue;
      for (const f of inlineFormulas(text)) {
        checked += 1;
        const nums = digitNumbers(f.replace(/[a-z\\_^{}]+/gi, ' '));
        if (!src.formulas.has(normalizeLatex(f)) && !(nums.length > 0 && nums.every((n) => n.readings.some((r) => src.numbers.has(r))))) add(q, field, 'formula', f, text);
      }
      if (exercise) continue;
      const prose = text.replace(/\$[^$]+\$/g, ' ');
      for (const n of digitNumbers(prose)) {
        checked += 1;
        if (!n.readings.some((r) => src.numbers.has(round(r)))) add(q, field, 'number', n.token, text);
      }
      for (const d of dates(prose)) {
        checked += 1;
        if (!src.dates.has(d)) add(q, field, 'date', d, text);
      }
    }
  }
  return { checked, unverified };
}

/**
 * The verify call's verdicts applied (the approved plan): the questions kept (fixed, or their added
 * sentence moved to Added context), and the slots dropped with why.
 */
export function applyQuizVerdicts(
  questions: QuizQuestion[],
  items: QuizUnverified[],
  verdicts: { id: string; verdict: string; replacement: string }[],
  language: string | null,
): { kept: QuizQuestion[]; dropped: { slot: number; reasons: string[] }[]; corrected: number; labelled: number; found: number } {
  const out = questions.map((q) => ({ ...q, data: { ...q.data } }));
  const drop = new Map<number, string[]>();
  let corrected = 0;
  let labelled = 0;
  let found = 0;
  for (const v of verdicts) {
    const item = items.find((u) => u.id === v.id);
    const q = item && out.find((x) => x.slot === item.slot);
    if (!item || !q) continue;
    if (v.verdict === 'found') {
      found += 1;
      continue;
    }
    const why = (reason: string) => drop.set(q.slot, [...(drop.get(q.slot) ?? []), reason]);
    const replacement = v.replacement.trim();
    if (item.field === 'explanation') {
      if (v.verdict === 'corrected' && replacement && q.explanation.includes(item.value)) {
        q.explanation = q.explanation.replace(item.value, replacement);
        corrected += 1;
      } else if (v.verdict === 'added' && q.explanation.includes(item.sentence)) {
        q.explanation = q.explanation.replace(item.sentence, '').replace(/\s{2,}/g, ' ').trim();
        q.addedContext = [q.addedContext, item.sentence].filter(Boolean).join(' ');
        labelled += 1;
      }
    } else if (item.field === 'prompt') {
      if (v.verdict === 'corrected' && replacement && q.prompt.includes(item.value)) {
        q.prompt = q.prompt.replace(item.value, replacement);
        corrected += 1;
      } else why(`the question says ${item.value}, which the material doesn’t`);
    } else {
      // The right answer itself: a numeric answer corrected to one plain number is fixed; else the question goes.
      const readings = numberReadings(replacement.replace(/^-/, ''));
      if (v.verdict === 'corrected' && q.type === 'numeric' && readings.length === 1) {
        const n = replacement.startsWith('-') ? -readings[0] : readings[0];
        q.data = { ...q.data, answer: n };
        q.answerText = answerTextOf('numeric', q.data, language);
        corrected += 1;
      } else why(`the right answer (${item.value}) isn’t supported by the material`);
    }
  }
  return {
    kept: out.filter((q) => !drop.has(q.slot)),
    dropped: [...drop].map(([slot, reasons]) => ({ slot, reasons })),
    corrected,
    labelled,
    found,
  };
}

/** Words of a question for the verify call's line (Q-number, field, value, sentence). */
export function verifyItemsText(items: QuizUnverified[]): string {
  return items.map((u) => `${u.id} | ${u.kind} | ${u.value.replace(/[<>]/g, ' ')} | in the ${u.field} of question S${u.slot}: ${u.sentence.replace(/[<>]/g, ' ')}`).join('\n');
}

/** The numbers of a material's own words (a text resource), added to its sources. */
export function addTextNumbers(src: Sources, texts: string[]): Sources {
  const numbers = new Set(src.numbers);
  const dateSet = new Set(src.dates);
  for (const t of texts) {
    digitNumbers(t).forEach((n) => n.readings.forEach((r) => numbers.add(r)));
    dates(t).forEach((d) => dateSet.add(d));
  }
  return { ...src, numbers, dates: dateSet };
}
