/**
 * @jest-environment node
 */
// Step 7.2: the summary calculator (supabase/functions/_shared/summary-plan.ts)
// against every example and band boundary in SUMMARY-SPEC "How Claude builds
// the summary", case by case, and the open points' answers (advisor, 30 Oct).
import {
  LENGTH_SHARE_PERCENT,
  PRESETS,
  SLIDER_DEFAULTS,
  SLIDER_KEYS,
  bandOf,
  effectiveLevel,
  effectsFor,
  fromCourseSettings,
  planSummary,
  selfTestSize,
  takeawaysFor,
  targetWords,
  whyHowCount,
  type PlanInput,
  type Sliders,
} from '../../../supabase/functions/_shared/summary-plan';

const MIN = 60_000;
const input = (over: Partial<PlanInput> = {}, sliders: Partial<Sliders> = {}): PlanInput => ({
  sliders: { ...SLIDER_DEFAULTS, ...sliders },
  // The spec's example: a 90-minute lecture of 12,000 words.
  transcript: { wordCount: 12_000, durationMs: 90 * MIN },
  marks: [],
  assistant: [],
  noteLines: [],
  examFormat: null,
  ...over,
});
const plan = (over: Partial<PlanInput> = {}, sliders: Partial<Sliders> = {}) => planSummary(input(over, sliders));
const mark = (id: string, type: 'important' | 'confused' | 'exam', level: number, atMin = 10) => ({ id, type, level, atMs: atMin * MIN });

describe('derived variables from the sliders', () => {
  it.each([
    [1, 360],
    [2, 600],
    [3, 840],
    [4, 1080],
    [5, 1440],
    [6, 1680],
    [7, 2040],
    [8, 2400],
    [9, 2880],
    [10, 3600],
  ])('target length: Length %i on 12,000 words → %i', (length, words) => {
    expect(targetWords(length, 12_000)).toBe(words);
    expect(plan({}, { length }).appliedSettings.targetWords).toBe(words);
  });

  it('the shares are the spec’s (3 … 30 %); 0 words → 0; the notes don’t count', () => {
    expect(LENGTH_SHARE_PERCENT).toEqual([3, 5, 7, 9, 12, 14, 17, 20, 24, 30]);
    expect(targetWords(5, 0)).toBe(0);
    const p = plan({ noteLines: Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, atMs: i * MIN })) });
    expect(p.appliedSettings.targetWords).toBe(1440);
    expect(p.length.notesExcluded).toBe(true);
    expect(p.rules.notesNeverCut).toBe(true);
    expect(p.noteLineCount).toBe(40);
  });

  it('the length check: ±15 % of the target', () => {
    expect(plan().length).toMatchObject({ targetWords: 1440, minWords: 1224, maxWords: 1656, maxWordsWithHighMarks: 1728, hasHighMarks: false });
  });

  it.each([
    [1, 3],
    [2, 3],
    [3, 3],
    [4, 4],
    [5, 4],
    [6, 4],
    [7, 4],
    [8, 5],
    [9, 5],
    [10, 5],
  ])('takeaways: Length %i → %i', (length, n) => {
    expect(takeawaysFor(length)).toBe(n);
    expect(plan({}, { length }).takeaways.count).toBe(n);
  });

  it.each([
    [1, 'statement', 'defineAll', 'plain', 'fixSpellings', 'flagsOnly'],
    [3, 'statement', 'defineAll', 'plain', 'fixSpellings', 'flagsOnly'],
    [4, 'statementWhy', 'defineCourseNew', 'definedOnFirstUse', 'fillGaps', 'signalsSection'],
    [7, 'statementWhy', 'defineCourseNew', 'definedOnFirstUse', 'fillGaps', 'signalsSection'],
    [8, 'whyHowLinks', 'skipBasics', 'professorExact', 'addLabelled', 'examFirst'],
    [10, 'whyHowLinks', 'skipBasics', 'professorExact', 'addLabelled', 'examFirst'],
  ])('at %i: explanation %s · prerequisites %s · vocabulary %s · resources %s · exam weighting %s', (v, explanation, prerequisites, vocabulary, resources, examWeighting) => {
    const p = plan({}, { depth: v, startingPoint: v, language: v, extraResources: v, examFocus: v });
    expect([p.explanation, p.prerequisites, p.vocabulary, p.resources, p.examWeighting]).toEqual([explanation, prerequisites, vocabulary, resources, examWeighting]);
  });

  it.each([
    [1, 'none', 'none'],
    [2, 'perThreeSections', 'curvesModels'],
    [4, 'perThreeSections', 'curvesModels'],
    [5, 'perSection', 'plusTimelinesComparisonsProcesses'],
    [7, 'perSection', 'plusTimelinesComparisonsProcesses'],
    [8, 'perKeyIdea', 'perShapedSection'],
    [10, 'perKeyIdea', 'perShapedSection'],
  ])('at %i: examples %s · visuals %s', (v, examples, visuals) => {
    const p = plan({}, { examples: v, visuals: v });
    expect([p.examples, p.visuals]).toEqual([examples, visuals]);
  });

  it('the defaults give the spec’s example column', () => {
    const p = plan();
    expect(p.appliedSettings).toEqual({ targetWords: 1440, takeaways: 4, selfTestCount: 7, markStrength: 1 });
    expect(p.explanation).toBe('statementWhy'); // Statement + why
    expect(p.prerequisites).toBe('defineAll'); // Every term defined
    expect(p.examples).toBe('perSection'); // One per section
    expect(p.visuals).toBe('curvesModels'); // Curves and models only
    expect(p.examWeighting).toBe('signalsSection'); // Exam signals section
    expect(p.selfTest.count).toBe(7); // 7 questions
    expect(p.vocabulary).toBe('definedOnFirstUse'); // Defined on first use
    expect(p.resources).toBe('fillGaps'); // Slides fill gaps
    expect(effectiveLevel(7, SLIDER_DEFAULTS.followMarks)).toBe(7); // 7/10 stays 7
    expect(p.preview).toBe('≈ 1,440 words · 4 takeaways · 7 questions');
  });

  it.each([
    [1, 0],
    [2, 2],
    [3, 4],
    [4, 5],
    [5, 7],
    [6, 8],
    [7, 10],
    [8, 12],
    [9, 13],
    [10, 15],
  ])('self-test size: %i → %i', (v, n) => {
    expect(selfTestSize(v)).toBe(n);
    expect(plan({}, { selfTest: v }).selfTest.count).toBe(n);
  });

  it.each([
    [0, 0],
    [2, 1],
    [4, 1],
    [5, 2],
    [7, 2],
    [8, 2],
    [10, 3],
    [12, 4],
    [13, 4],
    [15, 5],
  ])('30 %% why/how: %i questions → %i', (n, why) => {
    expect(whyHowCount(n)).toBe(why);
  });

  it.each([
    ['multiple_choice', ['recall', 'apply']],
    ['essay', ['why', 'apply']],
    ['problem_solving', ['calculate', 'apply']],
    ['open_book', ['apply', 'why']],
    ['oral', ['why', 'recall']],
    [null, ['recall', 'apply']],
  ] as const)('the exam format %s sets the question kinds; 30 %% why/how always', (examFormat, kinds) => {
    const p = plan({ examFormat }, { selfTest: 10 });
    expect(p.selfTest.kinds).toEqual(kinds);
    expect(p.selfTest.whyHow).toBe(5);
  });
});

describe('mark strength and bands', () => {
  it.each([
    [7, 7, 7],
    [8, 10, 10], // 11.4, kept at 10
    [1, 1, 1], // 0.14, kept at 1
    [10, 1, 1],
    [5, 10, 7],
    [3, 10, 4],
    [6, 10, 9],
    [6, 5, 4],
    [10, 7, 10],
    [4, 7, 4],
  ])('level %i at Follow my marks %i → %i', (level, slider, effective) => {
    expect(effectiveLevel(level, slider)).toBe(effective);
  });

  it('never a .5 to round: level × slider ÷ 7 over all 100 pairs', () => {
    for (let level = 1; level <= 10; level++)
      for (let slider = 1; slider <= 10; slider++) {
        const x = (level * slider) / 7;
        expect(Math.abs(x - Math.floor(x) - 0.5)).toBeGreaterThan(1e-9);
      }
  });

  it('markStrength: 1.0 at 7, 1.43 at 10, 0.14 at 1', () => {
    expect(plan().appliedSettings.markStrength).toBe(1);
    expect(plan({}, { followMarks: 10 }).appliedSettings.markStrength).toBe(1.43);
    expect(plan({}, { followMarks: 1 }).appliedSettings.markStrength).toBe(0.14);
  });

  it.each([
    [1, 'low'],
    [3, 'low'],
    [4, 'mid'],
    [7, 'mid'],
    [8, 'high'],
    [10, 'high'],
  ])('effective %i → %s', (e, band) => {
    expect(bandOf(e)).toBe(band);
  });

  it('Confused 7 with Follow my marks 7 → mid: a "You were confused here" block', () => {
    const [m] = plan({ marks: [mark('m1', 'confused', 7)] }).marks;
    expect(m).toMatchObject({ effective: 7, band: 'mid', effects: { clarify: 'block', practiceQuestion: false } });
  });
});

describe('what each mark does (all 9 cells)', () => {
  const none = { bold: false, takeaway: false, selfTest: false, examSignal: false, flashcard: false, clarify: 'none', example: false, practiceQuestion: false };
  it.each([
    ['important', 'low', {}],
    ['important', 'mid', { bold: true }],
    ['important', 'high', { takeaway: true, selfTest: true }],
    ['confused', 'low', { clarify: 'sentence' }],
    ['confused', 'mid', { clarify: 'block' }],
    ['confused', 'high', { clarify: 'stepByStep', example: true, practiceQuestion: true }],
    ['exam', 'low', {}],
    ['exam', 'mid', { examSignal: true }],
    ['exam', 'high', { examSignal: true, selfTest: true, flashcard: true }],
  ] as const)('%s · %s', (type, band, extra) => {
    expect(effectsFor(type, band)).toMatchObject({ chip: true, ...none, ...extra, fullExplanation: false });
  });

  it('a high Confused mark gets an example and a practice question even with Examples 1', () => {
    const p = plan({ marks: [mark('m1', 'confused', 9)] }, { examples: 1 });
    expect(p.examples).toBe('none');
    expect(p.marks[0].effects).toMatchObject({ clarify: 'stepByStep', example: true, practiceQuestion: true });
  });

  it('the spec’s request example: Confused 7 → mid, Important 8 → takeaway + self-test, Exam 9 → signal + question + flashcard', () => {
    const p = plan({ marks: [mark('m1', 'confused', 7, 18.5), mark('m2', 'important', 8, 31), mark('m3', 'exam', 9, 6.6)] });
    expect(p.marks.map((m) => [m.id, m.band])).toEqual([
      ['m1', 'mid'],
      ['m2', 'high'],
      ['m3', 'high'],
    ]);
    expect(p.takeaways.markIds).toEqual(['m2']);
    expect(p.selfTest.requiredMarkIds).toEqual(['m2', 'm3']);
    expect(p.examSignals).toEqual([{ source: 'studentMark', atMs: 6.6 * MIN, markId: 'm3', level: 9 }]);
    expect(p.marks.find((m) => m.id === 'm3')?.effects.flashcard).toBe(true);
  });

  it('Follow my marks 1: chips only (decision G), whatever the level', () => {
    const p = plan({ marks: [mark('m1', 'confused', 10), mark('m2', 'important', 10), mark('m3', 'exam', 10)] }, { followMarks: 1 });
    for (const m of p.marks) expect(m.effects).toMatchObject({ chip: true, ...none });
    expect(p.examSignals).toEqual([]);
    expect(p.length.hasHighMarks).toBe(false);
  });

  it('Follow my marks 10 boosts: Important 6 → 9, high', () => {
    expect(plan({ marks: [mark('m1', 'important', 6)] }, { followMarks: 10 }).marks[0]).toMatchObject({ effective: 9, band: 'high', effects: { takeaway: true } });
  });
});

describe('the open points (advisor, 30 Oct)', () => {
  it('A: high Exam / Important marks get their self-test questions even at Self-test 1', () => {
    expect(plan({}, { selfTest: 1 }).selfTest.count).toBe(0);
    const p = plan({ marks: [mark('e1', 'exam', 9), mark('e2', 'exam', 8), mark('i1', 'important', 5)] }, { selfTest: 1 });
    expect(p.selfTest).toMatchObject({ count: 2, requiredMarkIds: ['e1', 'e2'], whyHow: 1 });
    // Inside the slider's count when it's already enough, not on top.
    expect(plan({ marks: [mark('e1', 'exam', 9)] }).selfTest.count).toBe(7);
  });

  it('B: takeaways rise to fit high Important marks, up to 5; all of them are listed', () => {
    const highs = (n: number) => Array.from({ length: n }, (_, i) => mark(`i${i}`, 'important', 9, i));
    expect(plan({ marks: highs(2) }).takeaways.count).toBe(4);
    expect(plan({ marks: highs(5) }).takeaways.count).toBe(5);
    const p = plan({ marks: highs(7) }, { length: 1 });
    expect(p.takeaways.count).toBe(5);
    expect(p.takeaways.markIds).toHaveLength(7);
    expect(p.appliedSettings.takeaways).toBe(5);
  });

  it('C: a high-band mark allows up to 120 % of the target', () => {
    const p = plan({ marks: [mark('m1', 'confused', 8)] });
    expect(p.length).toMatchObject({ hasHighMarks: true, maxWords: 1656, maxWordsWithHighMarks: 1728 });
    expect(plan({ marks: [mark('m1', 'confused', 7)] }).length.hasHighMarks).toBe(false);
  });

  it('D: an assistant question is a Confused 6 over its window, unless she marked Confused there (±30 s)', () => {
    const q = { id: 'q1', askedAtMs: 34.33 * MIN, windowStartMs: 24.2 * MIN, windowEndMs: 34.2 * MIN };
    const p = plan({ assistant: [q] });
    expect(p.marks).toEqual([
      expect.objectContaining({ id: 'assistant:q1', source: 'assistant', type: 'confused', level: 6, effective: 6, band: 'mid', startMs: q.windowStartMs, endMs: q.windowEndMs }),
    ]);
    expect(p.questionsDuringClass).toEqual([{ id: 'q1', askedAtMs: q.askedAtMs }]);
    // Her own Confused mark inside, or 20 s before the window: no extra mark; the question stays listed.
    for (const at of [30 * MIN, q.windowStartMs - 20_000]) {
      const marked = plan({ assistant: [q], marks: [{ id: 'm1', type: 'confused', level: 4, atMs: at }] });
      expect(marked.marks.map((m) => m.id)).toEqual(['m1']);
      expect(marked.questionsDuringClass).toHaveLength(1);
    }
    // 40 s before, or an Important / Exam mark inside: still added.
    expect(plan({ assistant: [q], marks: [{ id: 'm1', type: 'confused', level: 4, atMs: q.windowStartMs - 40_000 }] }).marks).toHaveLength(2);
    expect(plan({ assistant: [q], marks: [mark('m1', 'important', 5, 30), mark('m2', 'exam', 5, 30)] }).marks).toHaveLength(3);
    // The same window twice: one mark. No window (a typed question): listed, no mark.
    expect(plan({ assistant: [q, { ...q, id: 'q2' }] }).marks).toHaveLength(1);
    const typed = plan({ assistant: [{ id: 'q3', askedAtMs: 5 * MIN, windowStartMs: null, windowEndMs: null }] });
    expect(typed.marks).toEqual([]);
    expect(typed.questionsDuringClass).toHaveLength(1);
  });

  it('D2: Follow my marks scales the assistant question (her action)…', () => {
    const q = { id: 'q1', askedAtMs: 10 * MIN, windowStartMs: 0, windowEndMs: 10 * MIN };
    expect(plan({ assistant: [q] }, { followMarks: 10 }).marks[0]).toMatchObject({ effective: 9, band: 'high', effects: { clarify: 'stepByStep', practiceQuestion: true } });
    expect(plan({ assistant: [q] }, { followMarks: 1 }).marks[0]).toMatchObject({ effective: 1, band: 'low', effects: { clarify: 'none' } });
  });

  it('D2: …but not repetition: a concept explained 3+ times is Important 6 (mid) at any Follow my marks', () => {
    const repetitions = [
      { concept: 'filogenia', timesMs: [40 * MIN, 5 * MIN, 20 * MIN] },
      { concept: 'ontogenia', timesMs: [3 * MIN, 9 * MIN] },
    ];
    for (const followMarks of [1, 7, 10]) {
      const p = plan({ repetitions }, { followMarks });
      expect(p.marks).toEqual([
        expect.objectContaining({ id: 'repetition:filogenia', source: 'repetition', type: 'important', level: 6, effective: 6, band: 'mid', startMs: 5 * MIN, endMs: 40 * MIN }),
      ]);
      expect(p.marks[0].effects.bold).toBe(true);
    }
  });

  it('E: the professor’s exam phrases come in as signals, unscaled, listed with the student’s Exam marks by time', () => {
    const p = plan({ professorSignals: [{ atMs: 50 * MIN, text: 'Esto entra en el examen' }], marks: [mark('m3', 'exam', 6, 20), mark('m4', 'exam', 2, 30)] }, { followMarks: 1 });
    expect(p.examSignals).toEqual([{ source: 'professor', atMs: 50 * MIN, text: 'Esto entra en el examen' }]);
    const q = plan({ professorSignals: [{ atMs: 50 * MIN, text: 'Esto entra en el examen' }], marks: [mark('m3', 'exam', 6, 20), mark('m4', 'exam', 2, 30)] });
    expect(q.examSignals).toEqual([
      { source: 'studentMark', atMs: 20 * MIN, markId: 'm3', level: 6 },
      { source: 'professor', atMs: 50 * MIN, text: 'Esto entra en el examen' },
    ]);
  });
});

describe('when rules conflict', () => {
  it.each([
    [8, 8, true],
    [10, 10, true],
    [7, 8, false],
    [8, 7, false],
  ])('3: Exam focus %i + Depth %i → depth on exam sections only: %s', (examFocus, depth, only) => {
    expect(plan({}, { examFocus, depth }).rules.depthOnExamSectionsOnly).toBe(only);
  });

  it('5: Starting point high + a high Confused mark → that moment gets the full explanation, only that one', () => {
    const marks = [mark('m1', 'confused', 9), mark('m2', 'confused', 5)];
    const p = plan({ marks }, { startingPoint: 8 });
    expect(p.prerequisites).toBe('skipBasics');
    expect(p.marks.map((m) => m.effects.fullExplanation)).toEqual([true, false]);
    expect(plan({ marks }, { startingPoint: 7 }).marks[0].effects.fullExplanation).toBe(false);
  });

  it('4: slides and audio disagree → show both (a rule for the prompt); over 60 minutes → by topic', () => {
    expect(plan().rules).toMatchObject({ showBothWhenSourcesDisagree: true, byTopic: true });
    expect(plan({ transcript: { wordCount: 6000, durationMs: 60 * MIN } }).rules.byTopic).toBe(false);
  });
});

describe('presets, course settings and bad input', () => {
  it('the presets set all 10 sliders to the spec’s values', () => {
    const values = (s: Sliders) => SLIDER_KEYS.map((k) => s[k]);
    expect(values(PRESETS.firstTimeLearning.sliders)).toEqual([1, 6, 9, 8, 6, 3, 4, 2, 7, 6]);
    expect(values(PRESETS.quickReview.sliders)).toEqual([6, 2, 3, 2, 3, 6, 6, 6, 3, 7]);
    expect(values(PRESETS.examTomorrow.sliders)).toEqual([5, 4, 5, 4, 4, 10, 10, 7, 6, 9]);
    expect(values(PRESETS.reset.sliders)).toEqual([2, 5, 6, 5, 4, 5, 5, 4, 6, 7]);
  });

  it.each([
    ['firstTimeLearning', '≈ 1,680 words · 4 takeaways · 5 questions'],
    ['quickReview', '≈ 600 words · 3 takeaways · 8 questions'],
    ['examTomorrow', '≈ 1,080 words · 4 takeaways · 15 questions'],
    ['reset', '≈ 1,440 words · 4 takeaways · 7 questions'],
  ] as const)('%s on 12,000 words: %s', (key, preview) => {
    expect(planSummary({ ...input(), sliders: PRESETS[key].sliders }).preview).toBe(preview);
  });

  it('the preview line: one question, no questions', () => {
    expect(plan({ marks: [mark('e1', 'exam', 9)] }, { selfTest: 1 }).preview).toBe('≈ 1,440 words · 4 takeaways · 1 question');
    expect(plan({}, { selfTest: 1 }).preview).toBe('≈ 1,440 words · 4 takeaways · no questions');
  });

  it('course_settings’ columns → the sliders', () => {
    expect(
      fromCourseSettings({
        slider_starting_point: 1,
        slider_length: 2,
        slider_depth: 3,
        slider_examples: 4,
        slider_visuals: 5,
        slider_exam_focus: 6,
        slider_self_test: 7,
        slider_language: 8,
        slider_extra_resources: 9,
        slider_follow_marks: 10,
      }),
    ).toEqual({ startingPoint: 1, length: 2, depth: 3, examples: 4, visuals: 5, examFocus: 6, selfTest: 7, language: 8, extraResources: 9, followMarks: 10 });
  });

  it.each([0, 11, 5.5, NaN])('a slider of %s is refused', (v) => {
    expect(() => plan({}, { length: v })).toThrow(RangeError);
  });

  it('a mark level outside 1–10 and a negative word count are refused', () => {
    expect(() => plan({ marks: [mark('m1', 'exam', 0)] })).toThrow(/level/);
    expect(() => plan({ marks: [mark('m1', 'exam', 11)] })).toThrow(/level/);
    expect(() => plan({ transcript: { wordCount: -1, durationMs: 0 } })).toThrow(/word count/);
  });
});
