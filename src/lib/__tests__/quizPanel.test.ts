/**
 * @jest-environment node
 */
// Step 9.1b-1: the New quiz panel's rules (src/lib/quiz/panel.ts) and the settings check
// (supabase/functions/_shared/quiz-settings.ts): what the calculator is given for the lectures chosen,
// the wrong answers that come back, Calculations greyed or not, the counts line, the title.
import { countsLine, durationText, hasCalculations, pendingWrong, planInputFor, quizTitle, suggestedMinutes, type MaterialLecture, type QuizMaterial } from '../quiz/panel';
import { QUIZ_SLIDER_DEFAULTS, planQuiz } from '../../../supabase/functions/_shared/quiz-plan';
import { DEFAULT_CHOICES, SETTINGS_VERSION, settingsProblem, type QuizSettings } from '../../../supabase/functions/_shared/quiz-settings';

const MIN = 60_000;
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const lecture = (n: number, over: Partial<MaterialLecture> = {}): MaterialLecture => ({
  id: id(n),
  title: `Tema ${n}`,
  folderId: null,
  durationMs: 90 * MIN,
  hasTranscript: true,
  hasSummary: true,
  examSignals: 2,
  marks: 5,
  examMarks: 1,
  confusedMarks: 2,
  assistantWindows: 1,
  calculations: null,
  ...over,
});
const material = (over: Partial<QuizMaterial> = {}): QuizMaterial => ({
  courseId: id(100),
  courseName: 'Corporate Finance',
  subjectType: null,
  defaults: QUIZ_SLIDER_DEFAULTS,
  folders: [],
  lectures: [lecture(1), lecture(2, { hasSummary: false, examSignals: 0, examMarks: 3 }), lecture(3)],
  files: [{ id: id(50), title: 'Apuntes.pdf', kind: 'pdf' }],
  questions: [],
  answers: [],
  ...over,
});
const settings = (over: Partial<QuizSettings> = {}): QuizSettings => ({
  version: SETTINGS_VERSION,
  sliders: QUIZ_SLIDER_DEFAULTS,
  choices: DEFAULT_CHOICES,
  topic: { wholeCourse: false, lectureIds: [id(1), id(2)] },
  resources: { notes: true, summaries: true, lectureMedia: true, fileIds: [] },
  pastExamIds: [],
  ...over,
});

describe('what the calculator is given', () => {
  it('the lectures chosen (in teaching order), their flagged moments and weak spots', () => {
    const input = planInputFor(material(), settings({ topic: { wholeCourse: false, lectureIds: [id(2), id(1)] } }));
    expect(input.lectures).toEqual([
      { id: id(1), durationMs: 90 * MIN },
      { id: id(2), durationMs: 90 * MIN },
    ]);
    // Tema 1: its summary's 2 exam signals; Tema 2 (no summary): its 3 Exam marks.
    expect(input.flaggedSpans).toBe(5);
    // 2 Confused marks and 1 question window each.
    expect(input.weakSpots).toBe(6);
    expect(input.pastExam).toBeNull();
    expect(input.types).toEqual(DEFAULT_CHOICES.types);
    expect(input.wrongComeBack).toBe(true);
  });

  it('gives a plan the panel can show', () => {
    expect(planQuiz(planInputFor(material(), settings())).preview).toMatch(/^10 questions · /);
  });
});

describe('Calculations means something here', () => {
  it.each([
    ['a calculating subject', 'finance', [null], true],
    ['a summary with formulas', 'history', [true], true],
    ['summaries without', 'history', [false, false], false],
    ['no subject, no summary: unknown counts as yes', null, [null], true],
    ['no subject, summaries without', null, [false, null], false],
  ] as const)('%s', (_name, subjectType, calcs, expected) => {
    expect(hasCalculations({ subjectType }, calcs.map((calculations, i) => lecture(i + 1, { calculations })))).toBe(expected);
  });
});

describe('the wrong answers that come back', () => {
  const q = (n: number, from: number | null, file: number | null) => ({ id: id(n), fromQuestionId: from === null ? null : id(from), sourceFileId: file === null ? null : id(file) });
  const a = (n: number, verdict: string, at: string) => ({ questionId: id(n), verdict, answeredAt: at });
  const questions = [q(10, null, 1), q(11, null, 1), q(12, null, 2), q(13, null, 50), q(14, null, null), q(20, 10, 1)];

  it('wrong or partly, and not right since (any copy), from these files', () => {
    const answers = [
      a(10, 'wrong', '2026-11-01T10:00:00Z'),
      a(11, 'partly', '2026-11-01T10:00:00Z'),
      a(12, 'wrong', '2026-11-01T10:00:00Z'),
      a(13, 'wrong', '2026-11-01T10:00:00Z'),
      a(14, 'wrong', '2026-11-01T10:00:00Z'),
      // Question 10 came back as 20 and was right this time.
      a(20, 'correct', '2026-11-02T10:00:00Z'),
    ];
    expect(pendingWrong(questions, answers, [id(1)])).toEqual([id(11)]);
    expect(pendingWrong(questions, answers, [id(1), id(2), id(50)])).toEqual([id(11), id(12), id(13)]);
  });

  it('wrong again in its copy: still pending', () => {
    const answers = [a(10, 'correct', '2026-11-01T10:00:00Z'), a(20, 'wrong', '2026-11-02T10:00:00Z')];
    expect(pendingWrong(questions, answers, [id(1)])).toEqual([id(10)]);
  });

  it('a grade she changed to correct: not pending', () => {
    expect(pendingWrong(questions, [a(11, 'correct', '2026-11-01T10:00:00Z')], [id(1)])).toEqual([]);
  });

  it('counted for the calculator', () => {
    const m = material({ questions, answers: [a(11, 'wrong', '2026-11-01T10:00:00Z'), a(13, 'wrong', '2026-11-01T10:00:00Z')] });
    expect(planInputFor(m, settings()).pendingWrong).toBe(1);
    expect(planInputFor(m, settings({ resources: { notes: true, summaries: true, lectureMedia: true, fileIds: [id(50)] } })).pendingWrong).toBe(2);
  });
});

describe('the panel’s words', () => {
  it('the counts line', () => {
    const m = material();
    expect(countsLine(m, m.lectures.slice(0, 2))).toBe('Corporate Finance · 2 lectures · 3 h 00 min · 10 marks (4 Exam · 4 Confused)');
    expect(countsLine(m, [])).toBe('Corporate Finance · 0 lectures · no marks');
    expect(countsLine(m, [lecture(1, { marks: 0, durationMs: 45 * MIN })])).toBe('Corporate Finance · 1 lecture · 45 min · no marks');
  });

  it('durations', () => {
    expect([durationText(45 * MIN), durationText(185 * MIN), durationText(60 * MIN)]).toEqual(['45 min', '3 h 05 min', '1 h 00 min']);
  });

  it('the quiz’s title', () => {
    const m = material();
    expect(quizTitle('Corporate Finance', m.lectures, true)).toBe('Corporate Finance · whole course');
    expect(quizTitle('Corporate Finance', [m.lectures[0]], false)).toBe('Corporate Finance · Tema 1');
    expect(quizTitle('Corporate Finance', m.lectures.slice(0, 2), false)).toBe('Corporate Finance · 2 lectures');
    expect(quizTitle('x'.repeat(300), [m.lectures[0]], false)).toHaveLength(200);
  });

  it('the time limit starts at the estimate, up to the next 5 minutes', () => {
    expect([suggestedMinutes(1), suggestedMinutes(8), suggestedMinutes(10), suggestedMinutes(31)]).toEqual([5, 10, 10, 35]);
  });
});

describe('the settings check', () => {
  it('passes the panel’s defaults', () => {
    expect(settingsProblem(settings())).toBeNull();
  });

  it.each([
    ['no question type', settings({ choices: { ...DEFAULT_CHOICES, types: [] } }), 'Pick at least one question type.'],
    ['an unknown type', settings({ choices: { ...DEFAULT_CHOICES, types: ['essay' as never] } }), 'Pick at least one question type.'],
    ['no lecture', settings({ topic: { wholeCourse: false, lectureIds: [] } }), 'Pick at least one lecture.'],
    ['a slider at 0', settings({ sliders: { ...QUIZ_SLIDER_DEFAULTS, traps: 0 } }), 'Each slider is a whole number from 1 to 10.'],
    ['a total of 0 minutes', settings({ choices: { ...DEFAULT_CHOICES, timeLimit: { kind: 'total', minutes: 0 } } }), 'The time limit is 1–300 minutes.'],
    ['5 seconds a question', settings({ choices: { ...DEFAULT_CHOICES, timeLimit: { kind: 'perQuestion', seconds: 5 } } }), 'The time per question is 10–1800 seconds.'],
    ['a pass mark of 120 %', settings({ choices: { ...DEFAULT_CHOICES, grading: { kind: 'passFail', threshold: 120 } } }), 'The pass mark is 1–100 %.'],
    ['a pass mark being typed (empty)', settings({ choices: { ...DEFAULT_CHOICES, grading: { kind: 'passFail', threshold: NaN } } }), 'The pass mark is 1–100 %.'],
    ['a language name', settings({ choices: { ...DEFAULT_CHOICES, language: 'Spanish' } }), 'Unknown language.'],
    ['a file that isn’t an id', settings({ pastExamIds: ['Parcial.pdf'] }), 'Unknown file.'],
  ])('refuses %s', (_name, s, message) => {
    expect(settingsProblem(s)).toBe(message);
  });
});
