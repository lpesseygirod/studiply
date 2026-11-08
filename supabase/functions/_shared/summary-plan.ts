/**
 * summary-plan.ts
 * The summary calculator (step 7.2): SUMMARY-SPEC "How Claude builds the
 * summary" as numbers and rules, with no AI. The summarize function (7.4)
 * gives Claude these exact numbers; the summarize panel (7.3) shows them as
 * a preview line. The same settings always give the same plan.
 *
 * - Derived variables from the 10 sliders: target words (a share of the
 *   transcript by Length), takeaways, explanation mode, prerequisites,
 *   examples, visual budget, exam weighting, self-test size and kinds,
 *   vocabulary, resource use.
 * - Marks: effective level = level × Follow my marks ÷ 7, rounded, kept in
 *   1–10, then its band (low 1–3, mid 4–7, high 8–10) and what it does.
 *   level × slider is an integer, so level × slider ÷ 7 never ends in .5:
 *   the rounding direction never matters.
 * - Signals the student didn't set: an assistant question is a Confused 6
 *   over its window (scaled by Follow my marks: it's her own action), unless
 *   she marked Confused there herself; a concept explained 3+ times is an
 *   Important 6 and the professor's exam phrases are exam signals (both the
 *   lecture's, not scaled). Both are found by the pipeline (7.4) and given here.
 * - The conflict rules.
 *
 * The answers to the spec's open points (advisor, 30 Oct, for Lea to
 * confirm; PROGRESS → Decisions, SUMMARY-SPEC notes): high Exam and Important
 * marks get their self-test question even at Self-test 1; takeaways rise to
 * fit high Important marks, up to 5; at Follow my marks 1 marks are chips
 * only; the exam format sets the question kinds; high-band marks raise the
 * length check's upper bound from 115 % to 120 % of the target.
 *
 * Without imports, so the app (src/) and Jest use the same file.
 */

export const SLIDER_KEYS = [
  'startingPoint',
  'length',
  'depth',
  'examples',
  'visuals',
  'examFocus',
  'selfTest',
  'language',
  'extraResources',
  'followMarks',
] as const;
export type SliderKey = (typeof SLIDER_KEYS)[number];
export type Sliders = Record<SliderKey, number>;

const fromValues = (values: readonly number[]): Sliders =>
  Object.fromEntries(SLIDER_KEYS.map((k, i) => [k, values[i]])) as Sliders;

/** The spec's defaults (The 10 sliders), in slider order. */
export const SLIDER_DEFAULTS: Sliders = fromValues([2, 5, 6, 5, 4, 5, 5, 4, 6, 7]);

export const PRESETS = {
  firstTimeLearning: { label: 'First time learning', sliders: fromValues([1, 6, 9, 8, 6, 3, 4, 2, 7, 6]) },
  quickReview: { label: 'Quick review', sliders: fromValues([6, 2, 3, 2, 3, 6, 6, 6, 3, 7]) },
  examTomorrow: { label: 'Exam tomorrow', sliders: fromValues([5, 4, 5, 4, 4, 10, 10, 7, 6, 9]) },
  reset: { label: 'Reset', sliders: SLIDER_DEFAULTS },
} as const;
export type PresetKey = keyof typeof PRESETS;

/** course_settings' columns → the spec's slider names. */
export function fromCourseSettings(row: {
  slider_starting_point: number;
  slider_length: number;
  slider_depth: number;
  slider_examples: number;
  slider_visuals: number;
  slider_exam_focus: number;
  slider_self_test: number;
  slider_language: number;
  slider_extra_resources: number;
  slider_follow_marks: number;
}): Sliders {
  return {
    startingPoint: row.slider_starting_point,
    length: row.slider_length,
    depth: row.slider_depth,
    examples: row.slider_examples,
    visuals: row.slider_visuals,
    examFocus: row.slider_exam_focus,
    selfTest: row.slider_self_test,
    language: row.slider_language,
    extraResources: row.slider_extra_resources,
    followMarks: row.slider_follow_marks,
  };
}

export type MarkType = 'important' | 'confused' | 'exam';
export type ExamFormat = 'multiple_choice' | 'essay' | 'problem_solving' | 'open_book' | 'oral';
export type Band = 'low' | 'mid' | 'high';
export type QuestionKind = 'recall' | 'why' | 'apply' | 'calculate';

export interface PlanInput {
  sliders: Sliders;
  transcript: { wordCount: number; durationMs: number };
  marks: { id: string; type: MarkType; level: number; atMs: number }[];
  /** Questions to the assistant; a question without a window (typed, whole lecture) is listed but adds no mark. */
  assistant: { id: string; askedAtMs: number | null; windowStartMs: number | null; windowEndMs: number | null }[];
  noteLines: { id: string; atMs: number | null }[];
  examFormat: ExamFormat | null;
  /** "Esto entra en el examen"…, found by the pipeline (7.4). */
  professorSignals?: { atMs: number; text: string }[];
  /** A concept and each time it was explained, found by the pipeline (7.4). */
  repetitions?: { concept: string; timesMs: number[] }[];
}

export interface MarkEffects {
  chip: boolean;
  bold: boolean;
  takeaway: boolean;
  selfTest: boolean;
  examSignal: boolean;
  flashcard: boolean;
  clarify: 'none' | 'sentence' | 'block' | 'stepByStep';
  example: boolean;
  practiceQuestion: boolean;
  /** Conflict rule 5: a high Confused moment gets the full explanation whatever the starting point. */
  fullExplanation: boolean;
}

export interface PlannedMark {
  id: string;
  source: 'student' | 'assistant' | 'repetition';
  type: MarkType;
  level: number;
  effective: number;
  band: Band;
  startMs: number;
  endMs: number;
  effects: MarkEffects;
}

export interface SummaryPlan {
  /** As in the spec's schema. */
  appliedSettings: { targetWords: number; takeaways: number; selfTestCount: number; markStrength: number };
  length: {
    targetWords: number;
    /** The length check: within ±15 % of the target… */
    minWords: number;
    maxWords: number;
    /** …and up to 120 % when a mark is in the high band (conflict rule 2). */
    maxWordsWithHighMarks: number;
    hasHighMarks: boolean;
    /** The student's notes never count against the length (rule 1). */
    notesExcluded: true;
  };
  takeaways: { count: number; markIds: string[] };
  explanation: 'statement' | 'statementWhy' | 'whyHowLinks';
  prerequisites: 'defineAll' | 'defineCourseNew' | 'skipBasics';
  examples: 'none' | 'perThreeSections' | 'perSection' | 'perKeyIdea';
  visuals: 'none' | 'curvesModels' | 'plusTimelinesComparisonsProcesses' | 'perShapedSection';
  /** Lea, 6 Nov: a graph in a photo may be redrawn as a chart (Visuals 5 and up; with photos ticked and the images consent). */
  visualsFromPhotos: boolean;
  examWeighting: 'flagsOnly' | 'signalsSection' | 'examFirst';
  selfTest: { count: number; whyHow: number; kinds: QuestionKind[]; requiredMarkIds: string[] };
  vocabulary: 'plain' | 'definedOnFirstUse' | 'professorExact';
  resources: 'fixSpellings' | 'fillGaps' | 'addLabelled';
  marks: PlannedMark[];
  examSignals: { source: 'professor' | 'studentMark'; atMs: number; text?: string; markId?: string; level?: number }[];
  questionsDuringClass: { id: string; askedAtMs: number | null }[];
  noteLineCount: number;
  rules: {
    notesNeverCut: true;
    /** Rule 3: Exam focus high + Depth high → full depth only on exam-relevant sections. */
    depthOnExamSectionsOnly: boolean;
    /** Rule 4 (a prompt rule): slides and audio disagree → show both and flag it. */
    showBothWhenSourcesDisagree: true;
    /** Lectures over 60 minutes are generated topic by topic, then merged. */
    byTopic: boolean;
  };
  /** For the summarize panel: "≈ 1,440 words · 4 takeaways · 7 questions". */
  preview: string;
}

/** Length: the share of the transcript, in %, for values 1–10. */
export const LENGTH_SHARE_PERCENT = [3, 5, 7, 9, 12, 14, 17, 20, 24, 30] as const;
/** The pipeline's alignment window: a Confused mark this close to a question's window counts as inside it. */
export const ALIGN_MS = 30_000;
const ASSISTANT_CONFUSED_LEVEL = 6;
const REPETITION_IMPORTANT_LEVEL = 6;
const REPETITION_TIMES = 3;
const MAX_TAKEAWAYS = 5;
/** Lea, 6 Nov: from this Visuals level (the mid and high levels), graphs in photos are redrawn. */
export const VISUALS_FROM_PHOTOS = 5;

const KINDS_BY_FORMAT: Record<ExamFormat | 'none', QuestionKind[]> = {
  multiple_choice: ['recall', 'apply'],
  essay: ['why', 'apply'],
  problem_solving: ['calculate', 'apply'],
  open_book: ['apply', 'why'],
  oral: ['why', 'recall'],
  none: ['recall', 'apply'],
};

function isLevel(v: unknown): v is number {
  return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 10;
}

/** 1–3 · 4–7 · 8–10 */
function third<T>(v: number, low: T, mid: T, high: T): T {
  return v <= 3 ? low : v <= 7 ? mid : high;
}

/** 1 · 2–4 · 5–7 · 8–10 */
function fourth<T>(v: number, one: T, low: T, mid: T, high: T): T {
  return v === 1 ? one : v <= 4 ? low : v <= 7 ? mid : high;
}

export function targetWords(length: number, transcriptWords: number): number {
  return Math.round((transcriptWords * LENGTH_SHARE_PERCENT[length - 1]) / 100);
}

export function takeawaysFor(length: number): number {
  return third(length, 3, 4, 5);
}

/** 1 → none; otherwise 2 + (value − 2) × 1.6, rounded (in tenths, so no float drift). */
export function selfTestSize(selfTest: number): number {
  return selfTest === 1 ? 0 : Math.round((20 + (selfTest - 2) * 16) / 10);
}

/** 30 % of the questions are "why/how", rounded half up. */
export function whyHowCount(questions: number): number {
  return Math.round((questions * 3) / 10);
}

/** Effective level = level × (Follow my marks ÷ 7), rounded, kept between 1 and 10. */
export function effectiveLevel(level: number, followMarks: number): number {
  return Math.min(10, Math.max(1, Math.round((level * followMarks) / 7)));
}

export function bandOf(effective: number): Band {
  return third<Band>(effective, 'low', 'mid', 'high');
}

/** What each mark does (the spec's table); at Follow my marks 1 a student's mark is a chip only. */
export function effectsFor(type: MarkType, band: Band, opts: { chipsOnly?: boolean; startingPoint?: number } = {}): MarkEffects {
  const e: MarkEffects = {
    chip: true,
    bold: false,
    takeaway: false,
    selfTest: false,
    examSignal: false,
    flashcard: false,
    clarify: 'none',
    example: false,
    practiceQuestion: false,
    fullExplanation: false,
  };
  if (opts.chipsOnly) return e;
  if (type === 'important') {
    if (band === 'mid') e.bold = true;
    if (band === 'high') e.takeaway = e.selfTest = true;
  } else if (type === 'confused') {
    e.clarify = band === 'low' ? 'sentence' : band === 'mid' ? 'block' : 'stepByStep';
    // Even if the Examples slider is low.
    if (band === 'high') e.example = e.practiceQuestion = true;
    if (band === 'high' && (opts.startingPoint ?? 1) >= 8) e.fullExplanation = true;
  } else {
    if (band !== 'low') e.examSignal = true;
    if (band === 'high') e.selfTest = e.flashcard = true;
  }
  return e;
}

const groupThousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function planSummary(input: PlanInput): SummaryPlan {
  const s = input.sliders;
  for (const k of SLIDER_KEYS) if (!isLevel(s[k])) throw new RangeError(`${k} must be a whole number from 1 to 10`);
  const { wordCount, durationMs } = input.transcript;
  if (!Number.isFinite(wordCount) || wordCount < 0) throw new RangeError('the transcript word count must be 0 or more');
  for (const m of input.marks) if (!isLevel(m.level)) throw new RangeError(`mark ${m.id}: the level must be a whole number from 1 to 10`);

  const plan = (source: PlannedMark['source'], id: string, type: MarkType, level: number, startMs: number, endMs: number, scaled: boolean): PlannedMark => {
    const effective = scaled ? effectiveLevel(level, s.followMarks) : level;
    const band = bandOf(effective);
    const chipsOnly = scaled && s.followMarks === 1;
    return { id, source, type, level, effective, band, startMs, endMs, effects: effectsFor(type, band, { chipsOnly, startingPoint: s.startingPoint }) };
  };

  const marks: PlannedMark[] = input.marks.map((m) => plan('student', m.id, m.type, m.level, m.atMs, m.atMs, true));

  // An assistant question: a Confused 6 over its window, unless she marked Confused there (±30 s).
  const confusedAt = input.marks.filter((m) => m.type === 'confused').map((m) => m.atMs);
  const windows = new Set<string>();
  for (const q of input.assistant) {
    if (q.windowStartMs === null || q.windowEndMs === null) continue;
    const key = `${q.windowStartMs}-${q.windowEndMs}`;
    if (windows.has(key)) continue;
    windows.add(key);
    const start = q.windowStartMs;
    const end = q.windowEndMs;
    if (confusedAt.some((t) => t >= start - ALIGN_MS && t <= end + ALIGN_MS)) continue;
    marks.push(plan('assistant', `assistant:${q.id}`, 'confused', ASSISTANT_CONFUSED_LEVEL, start, end, true));
  }
  // A concept explained 3 or more times: Important 6, the lecture's signal (not scaled).
  for (const r of input.repetitions ?? []) {
    if (r.timesMs.length < REPETITION_TIMES) continue;
    const times = [...r.timesMs].sort((a, b) => a - b);
    marks.push(plan('repetition', `repetition:${r.concept}`, 'important', REPETITION_IMPORTANT_LEVEL, times[0], times[times.length - 1], false));
  }

  const highImportant = marks.filter((m) => m.effects.takeaway).map((m) => m.id);
  const takeawayCount = Math.min(MAX_TAKEAWAYS, Math.max(takeawaysFor(s.length), highImportant.length));

  const required = marks.filter((m) => m.effects.selfTest).map((m) => m.id);
  const selfTestCount = Math.max(selfTestSize(s.selfTest), required.length);

  const target = targetWords(s.length, wordCount);
  const hasHighMarks = marks.some((m) => m.band === 'high');

  const examSignals: SummaryPlan['examSignals'] = [
    ...(input.professorSignals ?? []).map((p) => ({ source: 'professor' as const, atMs: p.atMs, text: p.text })),
    ...marks.filter((m) => m.effects.examSignal).map((m) => ({ source: 'studentMark' as const, atMs: m.startMs, markId: m.id, level: m.effective })),
  ].sort((a, b) => a.atMs - b.atMs);

  const questions = selfTestCount === 0 ? 'no questions' : `${selfTestCount} question${selfTestCount === 1 ? '' : 's'}`;

  return {
    appliedSettings: { targetWords: target, takeaways: takeawayCount, selfTestCount, markStrength: Math.round((s.followMarks / 7) * 100) / 100 },
    length: {
      targetWords: target,
      minWords: Math.round((target * 85) / 100),
      maxWords: Math.round((target * 115) / 100),
      maxWordsWithHighMarks: Math.round((target * 120) / 100),
      hasHighMarks,
      notesExcluded: true,
    },
    takeaways: { count: takeawayCount, markIds: highImportant },
    explanation: third(s.depth, 'statement', 'statementWhy', 'whyHowLinks'),
    prerequisites: third(s.startingPoint, 'defineAll', 'defineCourseNew', 'skipBasics'),
    examples: fourth(s.examples, 'none', 'perThreeSections', 'perSection', 'perKeyIdea'),
    visuals: fourth(s.visuals, 'none', 'curvesModels', 'plusTimelinesComparisonsProcesses', 'perShapedSection'),
    visualsFromPhotos: s.visuals >= VISUALS_FROM_PHOTOS,
    examWeighting: third(s.examFocus, 'flagsOnly', 'signalsSection', 'examFirst'),
    selfTest: { count: selfTestCount, whyHow: whyHowCount(selfTestCount), kinds: KINDS_BY_FORMAT[input.examFormat ?? 'none'], requiredMarkIds: required },
    vocabulary: third(s.language, 'plain', 'definedOnFirstUse', 'professorExact'),
    resources: third(s.extraResources, 'fixSpellings', 'fillGaps', 'addLabelled'),
    marks,
    examSignals,
    questionsDuringClass: input.assistant.map((q) => ({ id: q.id, askedAtMs: q.askedAtMs })),
    noteLineCount: input.noteLines.length,
    rules: {
      notesNeverCut: true,
      depthOnExamSectionsOnly: s.examFocus >= 8 && s.depth >= 8,
      showBothWhenSourcesDisagree: true,
      byTopic: durationMs > 60 * 60 * 1000,
    },
    preview: `≈ ${groupThousands(target)} words · ${takeawayCount} takeaways · ${questions}`,
  };
}
