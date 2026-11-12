/**
 * quiz-plan.ts
 * The quiz calculator (BUILD-PLAN "Create a quiz"): the New quiz panel's 10 sliders and
 * choices as numbers, with no AI, as summary-plan.ts is for summaries. The panel shows its preview
 * line; the quiz function gives Claude its slots, one per question to write, and checks the
 * answer against them. Where sliders pull against each other (Definitions, Calculations, Theory vs
 * practice) this decides the mix, not the AI. The same settings always give the same plan.
 *
 * - Number of questions: 5 × the slider (1 → 5 … 10 → 50).
 * - Wrong answers that come back go first: min(pending, ⌈30 %⌉, at least 2), copies of the old
 *   questions (no AI). The rest are new slots.
 * - The mix: four categories, raw weights definition D − 1, calculation C − 1 (0 when the material
 *   has no calculations), concept 10 − T, application T − 1; practice halves definitions at most
 *   (× (1 − (T − 1)/18)), theory halves calculations at most (× (1 − (10 − T)/18)). Shares × the new
 *   slots, rounded by largest remainder (ties in category order), so the counts always add up.
 * - Exam focus: round(new × (E − 1)/9) from flagged moments, at most 3 per moment; at 10 every new
 *   question, and the quiz gets shorter when too few moments are flagged (a notice says so).
 * - My weak spots: round(new × 0.6 × (W − 1)/9), at most 2 per weak spot, within what is left.
 * - Difficulty: a fixed easy/medium/hard table; Trap answers and Detail: three bands each; Memory vs
 *   understanding: the share of definition and concept questions asked as recall.
 * - Types: only the chosen ones, each category its eligible types (a category with none hands its
 *   slots on), spread to match the past exam's type shares when there is one, else evenly.
 *
 * Integer arithmetic throughout (weights are whole numbers), so no float rounding can differ between
 * the app and the server. Without imports, so the app (src/) and Jest use the same file.
 */

export const QUIZ_SLIDER_KEYS = [
  'difficulty',
  'count',
  'definitions',
  'calculations',
  'theoryPractice',
  'examFocus',
  'weakSpots',
  'traps',
  'memoryUnderstanding',
  'detail',
] as const;
export type QuizSliderKey = (typeof QUIZ_SLIDER_KEYS)[number];
export type QuizSliders = Record<QuizSliderKey, number>;

const fromValues = (values: readonly number[]): QuizSliders =>
  Object.fromEntries(QUIZ_SLIDER_KEYS.map((k, i) => [k, values[i]])) as QuizSliders;

/** Every slider 5, Number of questions 2 (10 questions): the advisor's decision, 2 Nov. */
export const QUIZ_SLIDER_DEFAULTS: QuizSliders = fromValues([5, 2, 5, 5, 5, 5, 5, 5, 5, 5]);

export const QUIZ_PRESETS = {
  quickCheck: { label: 'Quick check', sliders: fromValues([3, 2, 7, 5, 5, 5, 5, 3, 5, 3]) },
  examTomorrow: { label: 'Exam tomorrow', sliders: fromValues([7, 5, 5, 5, 5, 10, 8, 5, 5, 5]) },
  deepUnderstanding: { label: 'Deep understanding', sliders: fromValues([5, 2, 5, 5, 7, 5, 5, 5, 9, 5]) },
  reset: { label: 'Reset', sliders: QUIZ_SLIDER_DEFAULTS },
} as const;
export type QuizPresetKey = keyof typeof QUIZ_PRESETS;

/** course_settings' quiz_* columns, in slider order. */
export const QUIZ_COLUMNS: Record<QuizSliderKey, string> = {
  difficulty: 'quiz_difficulty',
  count: 'quiz_count',
  definitions: 'quiz_definitions',
  calculations: 'quiz_calculations',
  theoryPractice: 'quiz_theory_practice',
  examFocus: 'quiz_exam_focus',
  weakSpots: 'quiz_weak_spots',
  traps: 'quiz_traps',
  memoryUnderstanding: 'quiz_memory_understanding',
  detail: 'quiz_detail',
};

/** course_settings' row → the sliders (a missing or invalid value: the default). */
export function fromQuizCourseSettings(row: Record<string, unknown>): QuizSliders {
  return Object.fromEntries(
    QUIZ_SLIDER_KEYS.map((k) => {
      const v = row[QUIZ_COLUMNS[k]];
      return [k, isLevel(v) ? v : QUIZ_SLIDER_DEFAULTS[k]];
    }),
  ) as QuizSliders;
}

/** The sliders → course_settings' columns (Save as course default). */
export function toQuizCourseSettings(s: QuizSliders): Record<string, number> {
  return Object.fromEntries(QUIZ_SLIDER_KEYS.map((k) => [QUIZ_COLUMNS[k], s[k]]));
}

/** BUILD-PLAN's question types, in its order (the database's quiz_questions.type). */
export const QUESTION_TYPES = ['multiple_choice', 'true_false', 'short_answer', 'fill_blank', 'long_answer', 'match_pairs', 'order_steps', 'numeric'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: 'multiple choice',
  true_false: 'true/false',
  short_answer: 'short answer',
  fill_blank: 'fill in the blank',
  long_answer: 'long answer',
  match_pairs: 'match pairs',
  order_steps: 'steps in order',
  numeric: 'calculation',
};

/** Ticked when the panel opens: all but long answers (the slowest to answer and the dearest to grade). */
export const DEFAULT_TYPES: QuestionType[] = QUESTION_TYPES.filter((t) => t !== 'long_answer');

export const CATEGORIES = ['definition', 'calculation', 'concept', 'application'] as const;
export type Category = (typeof CATEGORIES)[number];

/** Which types can ask each kind of question. */
export const ELIGIBLE: Record<Category, readonly QuestionType[]> = {
  definition: ['multiple_choice', 'fill_blank', 'match_pairs', 'short_answer', 'true_false'],
  calculation: ['numeric', 'multiple_choice'],
  concept: ['multiple_choice', 'true_false', 'short_answer', 'long_answer'],
  application: ['multiple_choice', 'order_steps', 'short_answer', 'long_answer', 'numeric'],
};

/** Where a category's slots go when none of its types is chosen (the first that has one). */
export const HAND_ON: Record<Category, readonly Category[]> = {
  definition: ['concept', 'application', 'calculation'],
  calculation: ['application', 'concept', 'definition'],
  concept: ['application', 'definition', 'calculation'],
  application: ['concept', 'definition', 'calculation'],
};

/** About how long each type takes to answer, in seconds (the preview's time and the time limit's start). */
export const SECONDS_PER_TYPE: Record<QuestionType, number> = {
  true_false: 20,
  multiple_choice: 45,
  fill_blank: 45,
  order_steps: 60,
  match_pairs: 90,
  short_answer: 90,
  numeric: 150,
  long_answer: 360,
};
/** A question that comes back (its type isn't known here). */
export const AGAIN_SECONDS = 60;

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** Easy / medium / hard in %, for Difficulty 1–10. */
export const DIFFICULTY_TABLE: readonly (readonly [number, number, number])[] = [
  [70, 30, 0],
  [60, 35, 5],
  [50, 40, 10],
  [40, 45, 15],
  [30, 50, 20],
  [20, 50, 30],
  [15, 45, 40],
  [10, 40, 50],
  [5, 35, 60],
  [0, 30, 70],
];

/** A flagged moment gives at most this many questions; a weak spot this many. */
export const PER_FLAGGED_SPAN = 3;
export const PER_WEAK_SPOT = 2;

export type Focus = 'exam' | 'weak' | 'any';
export type Level = 'recall' | 'understand' | 'apply';

/** What a past exam's format gives the calculator (read by the quiz function). */
export interface PastExamFormat {
  questionCount: number;
  types: { type: QuestionType; count: number }[];
}

/** A past exam's format as read and saved on its file (files.past_exam_format; quiz-zod.ts FormatAnswer). */
export interface PastExamFormatRead extends PastExamFormat {
  language: string;
  optionsPerQuestion: number;
  avgQuestionWords: number;
  styleNotes: string;
  examples: string[];
}

export interface QuizPlanInput {
  sliders: QuizSliders;
  /** The question types ticked (at least one). */
  types: readonly QuestionType[];
  pastExam?: PastExamFormat | null;
  /** The material has numbers or formulas to calculate with. */
  hasCalculations: boolean;
  /** The lectures chosen, in teaching order (new questions are spread over them by length). */
  lectures: { id: string; durationMs: number }[];
  /** Moments flagged for the exam: Exam marks and the professor's exam phrases. */
  flaggedSpans: number;
  /** Confused marks and questions to the assistant. */
  weakSpots: number;
  /** Questions answered wrong or partly before, not right since (for these lectures). */
  pendingWrong: number;
  wrongComeBack: boolean;
  /** At most this many questions (the count the quiz was paid for; the server's run only). */
  maxCount?: number;
}

export interface QuizSlot {
  /** 1-based. */
  n: number;
  category: Category;
  type: QuestionType;
  difficulty: Difficulty;
  focus: Focus;
  level: Level;
  /** For a slot with no focus: the lecture it should come from (spread by length); else null. */
  lectureId: string | null;
}

export interface QuizPlan {
  /** 5 × Number of questions. */
  requested: number;
  /** The questions in the quiz: the ones that come back plus the new ones. */
  count: number;
  again: number;
  /** New questions (slots). */
  fresh: number;
  exam: number;
  weak: number;
  categories: Record<Category, number>;
  difficulty: Record<Difficulty, number>;
  /** New questions per type. */
  types: Partial<Record<QuestionType, number>>;
  traps: 'obvious' | 'plausible' | 'nearMiss';
  detail: 'bigIdeas' | 'keyPoints' | 'details';
  /** Definition and concept questions asked as recall (the rest: why / how). */
  recall: number;
  slots: QuizSlot[];
  minutes: number;
  /** Said under the preview, e.g. when Exam focus 10 shortens the quiz. */
  notice: string | null;
  /** "25 questions · 8 multiple choice · 5 short answer · 4 calculation · … · 3 come back · ≈ 31 min" */
  preview: string;
}

function isLevel(v: unknown): v is number {
  return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 10;
}

/** 1–3 · 4–7 · 8–10 */
function third<T>(v: number, low: T, mid: T, high: T): T {
  return v <= 3 ? low : v <= 7 ? mid : high;
}

/** num ÷ den rounded half up, in integers. */
export function roundDiv(num: number, den: number): number {
  return Math.floor((2 * num + den) / (2 * den));
}

/**
 * `total` split by whole-number `weights`: each gets the floor of its share, then the largest
 * remainders one more (ties: the earlier). A zero weight gets nothing. Always sums to `total`
 * (when any weight is positive).
 */
export function largestRemainder(weights: readonly number[], total: number): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => w * total);
  const counts = exact.map((x) => Math.floor(x / sum));
  let left = total - counts.reduce((a, b) => a + b, 0);
  const order = weights
    .map((_, i) => i)
    .filter((i) => weights[i] > 0)
    .sort((a, b) => (exact[b] % sum) - (exact[a] % sum) || a - b);
  for (const i of order) {
    if (left <= 0) break;
    counts[i] += 1;
    left -= 1;
  }
  return counts;
}

/**
 * Counts laid out evenly: index k appears counts[k] times, spread over the sequence (at each step
 * the one furthest behind its share; ties: the earlier).
 */
export function spread(counts: readonly number[]): number[] {
  const n = counts.reduce((a, b) => a + b, 0);
  const used = counts.map(() => 0);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let best = -1;
    let bestLag = -Infinity;
    counts.forEach((c, k) => {
      if (used[k] >= c) return;
      const lag = c * (i + 1) - used[k] * n;
      if (lag > bestLag) {
        best = k;
        bestLag = lag;
      }
    });
    used[best] += 1;
    out.push(best);
  }
  return out;
}

/** The mix's weights, × 18 so they are whole numbers. */
export function categoryWeights(s: QuizSliders, hasCalculations: boolean): Record<Category, number> {
  const T = s.theoryPractice;
  return {
    definition: (s.definitions - 1) * (18 - (T - 1)),
    calculation: hasCalculations ? (s.calculations - 1) * (18 - (10 - T)) : 0,
    concept: (10 - T) * 18,
    application: (T - 1) * 18,
  };
}

/**
 * Several past exams' formats as the one the calculator takes: their average length
 * (rounded half up) and their type counts summed (the shares are what count). Null when none.
 */
export function mergeFormats(formats: readonly PastExamFormat[]): PastExamFormat | null {
  const usable = formats.filter((f) => Number.isInteger(f.questionCount) && f.questionCount > 0);
  if (!usable.length) return null;
  const counts = new Map<QuestionType, number>();
  for (const f of usable) for (const t of f.types) if (QUESTION_TYPES.includes(t.type) && t.count > 0) counts.set(t.type, (counts.get(t.type) ?? 0) + Math.round(t.count));
  return {
    questionCount: roundDiv(usable.reduce((n, f) => n + f.questionCount, 0), usable.length),
    types: QUESTION_TYPES.filter((t) => counts.has(t)).map((type) => ({ type, count: counts.get(type)! })),
  };
}

/** The Number of questions value nearest a past exam's count (5 per step). */
export function countValueFor(questionCount: number): number {
  return Math.min(10, Math.max(1, roundDiv(questionCount, 5)));
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function planQuiz(input: QuizPlanInput): QuizPlan {
  const s = input.sliders;
  for (const k of QUIZ_SLIDER_KEYS) if (!isLevel(s[k])) throw new RangeError(`${k} must be a whole number from 1 to 10`);
  const allowed = QUESTION_TYPES.filter((t) => input.types.includes(t));
  if (!allowed.length) throw new RangeError('pick at least one question type');
  for (const n of [input.flaggedSpans, input.weakSpots, input.pendingWrong]) {
    if (!Number.isInteger(n) || n < 0) throw new RangeError('the counts must be whole numbers, 0 or more');
  }

  // How many: the ones that come back first, then the new ones.
  if (input.maxCount !== undefined && (!Number.isInteger(input.maxCount) || input.maxCount < 1)) throw new RangeError('maxCount must be a whole number, 1 or more');
  const requested = Math.min(5 * s.count, input.maxCount ?? Infinity);
  const again = input.wrongComeBack && input.pendingWrong > 0 ? Math.min(input.pendingWrong, requested, Math.max(2, Math.ceil((requested * 3) / 10))) : 0;
  let fresh = requested - again;
  let notice: string | null = null;

  const examCapacity = input.flaggedSpans * PER_FLAGGED_SPAN;
  let exam: number;
  if (s.examFocus === 10) {
    if (examCapacity === 0) {
      exam = 0;
      notice = 'Nothing is flagged for the exam in these lectures: the quiz asks about everything.';
    } else {
      if (examCapacity < fresh) {
        fresh = examCapacity;
        notice = `Only ${plural(input.flaggedSpans, 'moment')} ${input.flaggedSpans === 1 ? 'is' : 'are'} flagged for the exam: ${plural(again + fresh, 'question')}.`;
      }
      exam = fresh;
    }
  } else {
    exam = Math.min(roundDiv(fresh * (s.examFocus - 1), 9), examCapacity);
  }
  const weak = Math.min(roundDiv(fresh * 6 * (s.weakSpots - 1), 90), input.weakSpots * PER_WEAK_SPOT, fresh - exam);
  const anyFocus = fresh - exam - weak;

  // The mix, then categories with none of their types chosen hand their slots on.
  const weights = categoryWeights(s, input.hasCalculations);
  const split = largestRemainder(
    CATEGORIES.map((c) => weights[c]),
    fresh,
  );
  const categories = Object.fromEntries(CATEGORIES.map((c, i) => [c, split[i]])) as Record<Category, number>;
  const usable = (c: Category) => ELIGIBLE[c].some((t) => allowed.includes(t));
  for (const c of CATEGORIES) {
    if (!categories[c] || usable(c)) continue;
    const to = HAND_ON[c].find(usable);
    if (!to) throw new RangeError('no chosen type can ask these questions');
    categories[to] += categories[c];
    categories[c] = 0;
  }

  // Type targets: the past exam's shares among the chosen types, else even.
  const examCounts = allowed.map((t) => (input.pastExam?.types ?? []).filter((x) => x.type === t).reduce((n, x) => n + Math.max(0, Math.round(x.count)), 0));
  const typeWeights = examCounts.some((n) => n > 0) ? examCounts : allowed.map(() => 1);
  const targets = largestRemainder(typeWeights, fresh);
  const target = new Map(allowed.map((t, i) => [t, targets[i]]));
  const used = new Map<QuestionType, number>(allowed.map((t) => [t, 0]));
  // The most constrained categories choose first.
  const order = [...CATEGORIES].sort((a, b) => ELIGIBLE[a].filter((t) => allowed.includes(t)).length - ELIGIBLE[b].filter((t) => allowed.includes(t)).length || CATEGORIES.indexOf(a) - CATEGORIES.indexOf(b));
  const typesOf = {} as Record<Category, QuestionType[]>;
  for (const c of order) {
    const candidates = ELIGIBLE[c].filter((t) => allowed.includes(t));
    const picked: QuestionType[] = [];
    for (let i = 0; i < categories[c]; i++) {
      const best = [...candidates].sort(
        (a, b) =>
          target.get(b)! - used.get(b)! - (target.get(a)! - used.get(a)!) ||
          used.get(a)! - used.get(b)! ||
          QUESTION_TYPES.indexOf(a) - QUESTION_TYPES.indexOf(b),
      )[0];
      picked.push(best);
      used.set(best, used.get(best)! + 1);
    }
    // Interleaved within the category (not all of one type first).
    const kinds = QUESTION_TYPES.filter((t) => picked.includes(t));
    typesOf[c] = spread(kinds.map((t) => picked.filter((p) => p === t).length)).map((k) => kinds[k]);
  }

  // Difficulty, focus, recall and lectures, each spread over the slots.
  const diffCounts = largestRemainder(DIFFICULTY_TABLE[s.difficulty - 1], fresh);
  const recallPool = categories.definition + categories.concept;
  const recall = roundDiv(recallPool * (10 - s.memoryUnderstanding), 9);
  const lectures = input.lectures;
  let lectureCounts: number[] = [];
  if (lectures.length) {
    const base = anyFocus >= lectures.length ? 1 : 0;
    const rest = largestRemainder(
      lectures.map((l) => Math.max(1, Math.round(l.durationMs / 1000))),
      anyFocus - base * lectures.length,
    );
    lectureCounts = rest.map((n) => n + base);
  }

  const categorySeq = spread(CATEGORIES.map((c) => categories[c])).map((k) => CATEGORIES[k]);
  const diffSeq = spread(diffCounts).map((k) => DIFFICULTIES[k]);
  const focusSeq = spread([exam, weak, anyFocus]).map((k) => (['exam', 'weak', 'any'] as const)[k]);
  const levelSeq = spread([recall, recallPool - recall]).map((k) => (k === 0 ? 'recall' : 'understand') as Level);
  const lectureSeq = spread(lectureCounts).map((k) => lectures[k].id);
  const next = { definition: 0, calculation: 0, concept: 0, application: 0 } as Record<Category, number>;
  let levelAt = 0;
  let lectureAt = 0;
  const slots: QuizSlot[] = categorySeq.map((category, i) => {
    const type = typesOf[category][next[category]++];
    const level: Level = category === 'definition' || category === 'concept' ? levelSeq[levelAt++] : 'apply';
    const focus = focusSeq[i];
    return { n: i + 1, category, type, difficulty: diffSeq[i], focus, level, lectureId: focus === 'any' ? (lectureSeq[lectureAt++] ?? null) : null };
  });

  const types: Partial<Record<QuestionType, number>> = {};
  for (const slot of slots) types[slot.type] = (types[slot.type] ?? 0) + 1;
  const seconds = slots.reduce((n, slot) => n + SECONDS_PER_TYPE[slot.type], 0) + again * AGAIN_SECONDS;
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  const count = again + fresh;

  const listed = QUESTION_TYPES.filter((t) => types[t])
    .sort((a, b) => types[b]! - types[a]! || QUESTION_TYPES.indexOf(a) - QUESTION_TYPES.indexOf(b))
    .map((t) => `${types[t]} ${QUESTION_TYPE_LABELS[t]}`);
  const preview = [
    plural(count, 'question'),
    ...listed.slice(0, 3),
    ...(listed.length > 3 ? ['…'] : []),
    ...(again ? [`${again} come back`] : []),
    `≈ ${minutes} min`,
  ].join(' · ');

  return {
    requested,
    count,
    again,
    fresh,
    exam,
    weak,
    categories,
    difficulty: { easy: diffCounts[0], medium: diffCounts[1], hard: diffCounts[2] },
    types,
    traps: third(s.traps, 'obvious', 'plausible', 'nearMiss'),
    detail: third(s.detail, 'bigIdeas', 'keyPoints', 'details'),
    recall,
    slots,
    minutes,
    notice,
    preview,
  };
}
