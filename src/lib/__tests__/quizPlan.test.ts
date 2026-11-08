/**
 * @jest-environment node
 */
// Step 9.1b: the quiz calculator (supabase/functions/_shared/quiz-plan.ts): the 10 sliders as
// numbers, the mix where Definitions, Calculations and Theory vs practice pull against each other,
// Exam focus and My weak spots, the wrong answers that come back, the types (with a past exam's
// format), the preview line. Table tests, as summaryPlan.test.ts.
import {
  CATEGORIES,
  DEFAULT_TYPES,
  DIFFICULTY_TABLE,
  QUESTION_TYPES,
  QUIZ_PRESETS,
  QUIZ_SLIDER_DEFAULTS,
  QUIZ_SLIDER_KEYS,
  categoryWeights,
  countValueFor,
  fromQuizCourseSettings,
  largestRemainder,
  mergeFormats,
  planQuiz,
  roundDiv,
  spread,
  toQuizCourseSettings,
  type QuestionType,
  type QuizPlanInput,
  type QuizSliders,
} from '../../../supabase/functions/_shared/quiz-plan';

const MIN = 60_000;
const input = (over: Partial<QuizPlanInput> = {}, sliders: Partial<QuizSliders> = {}): QuizPlanInput => ({
  sliders: { ...QUIZ_SLIDER_DEFAULTS, ...sliders },
  types: QUESTION_TYPES,
  pastExam: null,
  hasCalculations: true,
  lectures: [{ id: 'L1', durationMs: 90 * MIN }],
  flaggedSpans: 0,
  weakSpots: 0,
  pendingWrong: 0,
  wrongComeBack: true,
  ...over,
});
const plan = (over: Partial<QuizPlanInput> = {}, sliders: Partial<QuizSliders> = {}) => planQuiz(input(over, sliders));
const mix = (p: ReturnType<typeof planQuiz>) => CATEGORIES.map((c) => p.categories[c]);

describe('the sliders', () => {
  it('has 10 sliders; the defaults are every slider 5 and Number of questions 2', () => {
    expect(QUIZ_SLIDER_KEYS).toHaveLength(10);
    expect(QUIZ_SLIDER_DEFAULTS).toEqual({ difficulty: 5, count: 2, definitions: 5, calculations: 5, theoryPractice: 5, examFocus: 5, weakSpots: 5, traps: 5, memoryUnderstanding: 5, detail: 5 });
  });

  it.each([
    [1, 5],
    [2, 10],
    [3, 15],
    [4, 20],
    [5, 25],
    [6, 30],
    [7, 35],
    [8, 40],
    [9, 45],
    [10, 50],
  ])('Number of questions %i → %i questions', (count, questions) => {
    const p = plan({}, { count });
    expect(p.requested).toBe(questions);
    expect(p.count).toBe(questions);
    expect(p.slots).toHaveLength(questions);
    expect(p.slots.map((s) => s.n)).toEqual(Array.from({ length: questions }, (_, i) => i + 1));
  });

  it('the presets are whole values 1–10 for every slider', () => {
    for (const preset of Object.values(QUIZ_PRESETS)) for (const k of QUIZ_SLIDER_KEYS) expect(preset.sliders[k]).toBeGreaterThanOrEqual(1);
    expect(QUIZ_PRESETS.examTomorrow.sliders.examFocus).toBe(10);
    expect(QUIZ_PRESETS.examTomorrow.sliders.count).toBe(5);
    expect(QUIZ_PRESETS.deepUnderstanding.sliders.memoryUnderstanding).toBe(9);
    expect(QUIZ_PRESETS.reset.sliders).toEqual(QUIZ_SLIDER_DEFAULTS);
  });

  it('course_settings round trip; a missing or wrong value is the default', () => {
    const s: QuizSliders = { difficulty: 7, count: 4, definitions: 2, calculations: 9, theoryPractice: 3, examFocus: 10, weakSpots: 1, traps: 8, memoryUnderstanding: 6, detail: 4 };
    expect(fromQuizCourseSettings(toQuizCourseSettings(s))).toEqual(s);
    expect(toQuizCourseSettings(s)).toMatchObject({ quiz_difficulty: 7, quiz_count: 4, quiz_theory_practice: 3, quiz_memory_understanding: 6 });
    expect(fromQuizCourseSettings({ quiz_difficulty: 11, quiz_count: null })).toEqual(QUIZ_SLIDER_DEFAULTS);
  });

  it('a past exam’s count sets Number of questions to the nearest value', () => {
    expect([1, 5, 7, 8, 20, 22, 23, 48, 50, 80].map(countValueFor)).toEqual([1, 1, 1, 2, 4, 4, 5, 10, 10, 10]);
  });

  it('refuses a value outside 1–10, no question type, or a negative count', () => {
    expect(() => plan({}, { traps: 0 })).toThrow(RangeError);
    expect(() => plan({}, { count: 11 })).toThrow(RangeError);
    expect(() => plan({}, { detail: 2.5 })).toThrow(RangeError);
    expect(() => plan({ types: [] })).toThrow('pick at least one question type');
    expect(() => plan({ pendingWrong: -1 })).toThrow(RangeError);
  });
});

describe('helpers', () => {
  it('roundDiv rounds half up in whole numbers', () => {
    expect([roundDiv(9, 2), roundDiv(7, 2), roundDiv(10, 9), roundDiv(45, 90), roundDiv(44, 90)]).toEqual([5, 4, 1, 1, 0]);
  });

  it('largestRemainder always adds up; ties go to the earlier', () => {
    expect(largestRemainder([1, 1, 1], 10)).toEqual([4, 3, 3]);
    expect(largestRemainder([84, 30, 54, 108], 25)).toEqual([7, 3, 5, 10]);
    expect(largestRemainder([0, 5, 0], 7)).toEqual([0, 7, 0]);
    expect(largestRemainder([0, 0], 7)).toEqual([0, 0]);
    for (let total = 0; total <= 50; total++) expect(largestRemainder([3, 7, 11, 0, 2], total).reduce((a, b) => a + b, 0)).toBe(total);
  });

  it('spread interleaves the counts evenly', () => {
    expect(spread([2, 2])).toEqual([0, 1, 0, 1]);
    expect(spread([1, 3])).toEqual([1, 0, 1, 1]);
    expect(spread([0, 3, 0])).toEqual([1, 1, 1]);
    expect(spread([])).toEqual([]);
  });
});

describe('the mix: Definitions, Calculations and Theory vs practice pull against each other', () => {
  it('the worked example: D 8, C 3, T 7, 25 questions → 7 definition · 3 calculation · 5 concept · 10 application', () => {
    expect(categoryWeights({ ...QUIZ_SLIDER_DEFAULTS, definitions: 8, calculations: 3, theoryPractice: 7 }, true)).toEqual({ definition: 84, calculation: 30, concept: 54, application: 108 });
    expect(mix(plan({}, { definitions: 8, calculations: 3, theoryPractice: 7, count: 5 }))).toEqual([7, 3, 5, 10]);
  });

  it.each([
    // [definitions, calculations, theoryPractice, count, expected mix]
    ['the defaults', 5, 5, 5, 2, [2, 2, 3, 3]],
    ['every slider at 1: all theory, a quiz is never empty', 1, 1, 1, 2, [0, 0, 10, 0]],
    ['all practice', 1, 1, 10, 2, [0, 0, 0, 10]],
    ['Definitions 10 with all practice: halved', 10, 1, 10, 2, [3, 0, 0, 7]],
    ['Definitions 10 with all theory: whole', 10, 1, 1, 2, [5, 0, 5, 0]],
    ['Calculations 10 with all theory: halved', 1, 10, 1, 2, [0, 3, 7, 0]],
    ['Calculations 10 with all practice: whole', 1, 10, 10, 2, [0, 5, 0, 5]],
    ['Definitions and Calculations 10, the middle, 50 questions', 10, 10, 5, 10, [16, 14, 11, 9]],
  ] as const)('%s', (_name, definitions, calculations, theoryPractice, count, expected) => {
    expect(mix(plan({}, { definitions, calculations, theoryPractice, count }))).toEqual(expected);
  });

  it('no calculations in the material: Calculations counts for nothing', () => {
    expect(plan({ hasCalculations: false }, { calculations: 10 }).categories.calculation).toBe(0);
  });

  it('the counts always add up to the new questions', () => {
    for (const definitions of [1, 4, 10]) {
      for (const theoryPractice of [1, 6, 10]) {
        for (let count = 1; count <= 10; count++) {
          const p = plan({}, { definitions, theoryPractice, count, calculations: 7 });
          expect(mix(p).reduce((a, b) => a + b, 0)).toBe(p.fresh);
          expect(p.difficulty.easy + p.difficulty.medium + p.difficulty.hard).toBe(p.fresh);
          expect(p.exam + p.weak + p.slots.filter((s) => s.focus === 'any').length).toBe(p.fresh);
        }
      }
    }
  });
});

describe('Exam focus, My weak spots, the wrong answers that come back', () => {
  it('Exam focus: (E − 1)/9 of the new questions from flagged moments', () => {
    expect(plan({ flaggedSpans: 10 }, { examFocus: 1 }).exam).toBe(0);
    expect(plan({ flaggedSpans: 10 }, { examFocus: 5 }).exam).toBe(4); // 10 × 4/9 = 4.4
    expect(plan({ flaggedSpans: 10 }, { examFocus: 9 }).exam).toBe(9); // 10 × 8/9 = 8.9
  });

  it('at most 3 questions per flagged moment', () => {
    expect(plan({ flaggedSpans: 1 }, { examFocus: 9, count: 4 }).exam).toBe(3);
  });

  it('Exam focus 10 asks only what was flagged', () => {
    const p = plan({ flaggedSpans: 10 }, { examFocus: 10, count: 5 });
    expect(p.exam).toBe(25);
    expect(p.slots.every((s) => s.focus === 'exam')).toBe(true);
    expect(p.notice).toBeNull();
  });

  it('Exam focus 10 with too few flagged moments: a shorter quiz, and a notice', () => {
    const p = plan({ flaggedSpans: 4 }, { examFocus: 10, count: 5 });
    expect([p.requested, p.count, p.exam]).toEqual([25, 12, 12]);
    expect(p.notice).toBe('Only 4 moments are flagged for the exam: 12 questions.');
    expect(p.preview.startsWith('12 questions · ')).toBe(true);
    expect(plan({ flaggedSpans: 1 }, { examFocus: 10 }).notice).toBe('Only 1 moment is flagged for the exam: 3 questions.');
  });

  it('Exam focus 10 with nothing flagged: everything, and says so', () => {
    const p = plan({ flaggedSpans: 0 }, { examFocus: 10 });
    expect([p.count, p.exam]).toEqual([10, 0]);
    expect(p.notice).toBe('Nothing is flagged for the exam in these lectures: the quiz asks about everything.');
  });

  it('My weak spots: 0.6 × (W − 1)/9, at most 2 per weak spot, within what is left', () => {
    expect(plan({ weakSpots: 20 }, { weakSpots: 1 }).weak).toBe(0);
    expect(plan({ weakSpots: 20 }, { weakSpots: 10, count: 5 }).weak).toBe(15); // 25 × 0.6
    expect(plan({ weakSpots: 20 }, { weakSpots: 6, count: 5 }).weak).toBe(8); // 25 × 0.6 × 5/9 = 8.3
    expect(plan({ weakSpots: 2 }, { weakSpots: 10, count: 5 }).weak).toBe(4);
    const both = plan({ flaggedSpans: 20, weakSpots: 20 }, { examFocus: 10, weakSpots: 10 });
    expect([both.exam, both.weak]).toEqual([10, 0]);
  });

  it.each([
    // [count slider, pending wrong, come back]
    [1, 5, 2], // 5 questions: at least 2
    [2, 1, 1], // only one is pending
    [2, 9, 3], // 30 % of 10
    [5, 20, 8], // ⌈30 % of 25⌉
    [10, 40, 15],
  ])('Number of questions %i with %i pending wrong: %i come back', (count, pendingWrong, again) => {
    const p = plan({ pendingWrong }, { count });
    expect(p.again).toBe(again);
    expect(p.count).toBe(5 * count);
    expect(p.slots).toHaveLength(5 * count - again);
    expect(p.preview).toContain(`${again} come back`);
  });

  it('the switch off: none come back', () => {
    expect(plan({ pendingWrong: 9, wrongComeBack: false }).again).toBe(0);
  });
});

describe('difficulty, traps, detail, memory vs understanding', () => {
  it('the difficulty table sums to 100 % on every row', () => {
    expect(DIFFICULTY_TABLE).toHaveLength(10);
    for (const row of DIFFICULTY_TABLE) expect(row[0] + row[1] + row[2]).toBe(100);
  });

  it.each([
    [1, 20, [14, 6, 0]],
    [5, 20, [6, 10, 4]],
    [10, 20, [0, 6, 14]],
    [3, 10, [5, 4, 1]],
  ])('Difficulty %i, %i questions → easy · medium · hard %j', (difficulty, questions, expected) => {
    const p = plan({}, { difficulty, count: questions / 5 });
    expect([p.difficulty.easy, p.difficulty.medium, p.difficulty.hard]).toEqual(expected);
    expect(p.slots.filter((s) => s.difficulty === 'hard')).toHaveLength(expected[2]);
  });

  it.each([
    [1, 'obvious', 'bigIdeas'],
    [3, 'obvious', 'bigIdeas'],
    [4, 'plausible', 'keyPoints'],
    [7, 'plausible', 'keyPoints'],
    [8, 'nearMiss', 'details'],
    [10, 'nearMiss', 'details'],
  ] as const)('Trap answers and Detail %i → %s, %s', (v, traps, detail) => {
    const p = plan({}, { traps: v, detail: v });
    expect([p.traps, p.detail]).toEqual([traps, detail]);
  });

  it('Memory vs understanding: the share of definition and concept questions asked as recall', () => {
    const memory = plan({}, { memoryUnderstanding: 1, count: 4 });
    const pool = memory.categories.definition + memory.categories.concept;
    expect(memory.recall).toBe(pool);
    expect(plan({}, { memoryUnderstanding: 10, count: 4 }).recall).toBe(0);
    const p = plan({}, { memoryUnderstanding: 5, count: 4 });
    expect(p.slots.filter((s) => s.level === 'recall')).toHaveLength(p.recall);
    expect(p.slots.filter((s) => s.category === 'application' || s.category === 'calculation').every((s) => s.level === 'apply')).toBe(true);
  });
});

describe('question types', () => {
  const typesOf = (p: ReturnType<typeof planQuiz>) => p.slots.map((s) => s.type);

  it('only the chosen types, each slot a type its category can ask', () => {
    const p = plan({ types: DEFAULT_TYPES }, { count: 10 });
    expect(typesOf(p).every((t) => DEFAULT_TYPES.includes(t))).toBe(true);
    expect(typesOf(p)).not.toContain('long_answer');
    const eligible: Record<string, QuestionType[]> = {
      definition: ['multiple_choice', 'fill_blank', 'match_pairs', 'short_answer', 'true_false'],
      calculation: ['numeric', 'multiple_choice'],
      concept: ['multiple_choice', 'true_false', 'short_answer', 'long_answer'],
      application: ['multiple_choice', 'order_steps', 'short_answer', 'long_answer', 'numeric'],
    };
    for (const s of p.slots) expect(eligible[s.category]).toContain(s.type);
  });

  it('without a past exam the chosen types are spread evenly (as the categories allow)', () => {
    const p = plan({ types: ['multiple_choice', 'true_false', 'short_answer'] }, { count: 6 });
    expect(p.types).toEqual({ multiple_choice: 10, true_false: 10, short_answer: 10 });
  });

  it('a category with none of its types chosen hands its slots on', () => {
    // Only match pairs: every slot becomes a definition question.
    const pairs = plan({ types: ['match_pairs'] });
    expect(pairs.categories).toEqual({ definition: 10, calculation: 0, concept: 0, application: 0 });
    expect(new Set(typesOf(pairs))).toEqual(new Set(['match_pairs']));
    // Only steps in order: everything becomes application.
    expect(plan({ types: ['order_steps'] }).categories.application).toBe(10);
    // Only numeric, calculations off: the concept slots go to application.
    expect(plan({ types: ['numeric'], hasCalculations: false }).categories).toEqual({ definition: 0, calculation: 0, concept: 0, application: 10 });
  });

  it('a past exam’s type shares are matched among the chosen types', () => {
    const pastExam = { questionCount: 22, types: [{ type: 'multiple_choice' as const, count: 20 }, { type: 'long_answer' as const, count: 2 }] };
    const p = plan({ pastExam, types: ['multiple_choice', 'long_answer'] }, { count: countValueFor(22), definitions: 5, calculations: 1, theoryPractice: 5 });
    expect(p.count).toBe(20);
    expect(p.types).toEqual({ multiple_choice: 18, long_answer: 2 });
  });

  it('the same settings always give the same plan', () => {
    const a = plan({ flaggedSpans: 3, weakSpots: 4, pendingWrong: 2, lectures: [{ id: 'L1', durationMs: 90 * MIN }, { id: 'L2', durationMs: 45 * MIN }] }, { count: 7, difficulty: 8 });
    const b = plan({ flaggedSpans: 3, weakSpots: 4, pendingWrong: 2, lectures: [{ id: 'L1', durationMs: 90 * MIN }, { id: 'L2', durationMs: 45 * MIN }] }, { count: 7, difficulty: 8 });
    expect(a).toEqual(b);
  });
});

describe('lectures, time and the preview line', () => {
  it('new questions without a focus are spread over the lectures by length, at least one each', () => {
    const p = plan({ lectures: [{ id: 'L1', durationMs: 90 * MIN }, { id: 'L2', durationMs: 30 * MIN }, { id: 'L3', durationMs: 5 * MIN }] }, { count: 4, examFocus: 1, weakSpots: 1 });
    const per = (id: string) => p.slots.filter((s) => s.lectureId === id).length;
    expect([per('L1'), per('L2'), per('L3')]).toEqual([13, 5, 2]);
    expect(p.slots.every((s) => s.lectureId !== null)).toBe(true);
  });

  it('a slot with a focus has no lecture (its flagged moment or weak spot decides)', () => {
    const p = plan({ flaggedSpans: 10 }, { examFocus: 10 });
    expect(p.slots.every((s) => s.lectureId === null)).toBe(true);
  });

  it('the time: each type’s seconds, a minute for each that comes back', () => {
    const p = plan({ types: ['true_false'], pendingWrong: 3 }, { count: 2 });
    // 7 true/false × 20 s + 3 × 60 s = 320 s → 6 min
    expect(p.minutes).toBe(6);
  });

  it('the preview line', () => {
    expect(plan({ types: ['multiple_choice'] }).preview).toBe('10 questions · 10 multiple choice · ≈ 8 min');
    const p = plan({ pendingWrong: 3 }, { count: 5 });
    expect(p.preview).toMatch(/^25 questions · \d+ [a-z/ ]+ · \d+ [a-z/ ]+ · \d+ [a-z/ ]+ · … · 3 come back · ≈ \d+ min$/);
  });
});

describe('step 9.1b-2: several past exams as one format', () => {
  it('their average length (rounded half up) and their types summed; none read: null', () => {
    expect(
      mergeFormats([
        { questionCount: 12, types: [{ type: 'multiple_choice', count: 8 }, { type: 'true_false', count: 4 }] },
        { questionCount: 15, types: [{ type: 'multiple_choice', count: 10 }, { type: 'short_answer', count: 5 }] },
      ]),
    ).toEqual({ questionCount: 14, types: [{ type: 'multiple_choice', count: 18 }, { type: 'true_false', count: 4 }, { type: 'short_answer', count: 5 }] });
    expect(mergeFormats([])).toBeNull();
    expect(mergeFormats([{ questionCount: 0, types: [] }])).toBeNull();
    // Its length is the Number of questions value nearest it (Lea's list, 2 Nov: the length is the count).
    expect(countValueFor(14)).toBe(3);
  });
});
