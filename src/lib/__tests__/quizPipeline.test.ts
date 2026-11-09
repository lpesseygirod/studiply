/**
 * @jest-environment node
 */
// Step 9.1b-2: a quiz written with a fake Claude (supabase/functions/_shared/quiz-pipeline.ts): the
// slots and their spans in the prompt, 1 / 2 / 4 batches for 10 / 25 / 50 questions, the others
// started on the first one's first event, a batch tried once more, a 4xx not, the verify and repair
// calls, a quiz deleted meanwhile stopping before the next call (verify and repair too), the time
// budget, the wrong questions that come back, the fixed shuffle, the cost meter.
import {
  assignSpans,
  QUIZ_BATCH,
  quizMaterialContent,
  REPAIR_BEFORE_MS,
  runQuiz,
  seededShuffle,
  slotLine,
  spansOf,
  VERIFY_BEFORE_MS,
  type AgainQuestion,
  type QuizCall,
  type QuizRunDeps,
  type QuizRunMaterial,
} from '../../../supabase/functions/_shared/quiz-pipeline';
import { QUIZ_SLIDER_DEFAULTS, planQuiz, type QuestionType } from '../../../supabase/functions/_shared/quiz-plan';
import { DEFAULT_CHOICES, type QuizSettings } from '../../../supabase/functions/_shared/quiz-settings';
import { planInputFor } from '../../../supabase/functions/_shared/quiz-input';
import type { ClaudeMessage, Content, StoredSummary } from '../../../supabase/functions/_shared/summary-pipeline';
import { lectureMaterial } from '../../test-utils/summaryFixtures';

const MIN = 60_000;
const QUIZ = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

function settings(count = 2, over: Partial<QuizSettings> = {}): QuizSettings {
  return {
    version: 1,
    sliders: { ...QUIZ_SLIDER_DEFAULTS, count },
    choices: DEFAULT_CHOICES,
    topic: { wholeCourse: true, lectureIds: ['lec-1'] },
    resources: { notes: true, summaries: true, lectureMedia: false, fileIds: [] },
    pastExamIds: [],
    ...over,
  };
}

function material(count = 2, over: Partial<QuizRunMaterial> = {}): QuizRunMaterial {
  const m = lectureMaterial();
  return {
    quizId: QUIZ,
    settings: settings(count),
    facts: {
      courseId: 'course-1',
      courseName: '',
      subjectType: 'science',
      defaults: QUIZ_SLIDER_DEFAULTS,
      folders: [],
      lectures: [{ id: 'lec-1', title: 'Tema 1', folderId: null, durationMs: m.durationMs, hasTranscript: true, hasSummary: false, examSignals: 0, marks: 3, examMarks: 1, confusedMarks: 1, assistantWindows: 1, calculations: null }],
      files: [],
      questions: [],
      answers: [],
    },
    lectures: [{ ref: 'L1', material: m, summary: null }],
    resources: [],
    leftOut: [],
    pastExams: [],
    again: [],
    ...over,
  };
}

/** A slot of the 10-question plan whose numbers are checked (a definition or concept question, not an exercise). */
const PLAIN = (() => {
  const m = material(2);
  return planQuiz(planInputFor(m.facts, m.settings)).slots.find((s) => s.category === 'definition' || s.category === 'concept')!.n;
})();

/** A question that passes every check for its slot line ("S3 | multiple_choice | … | from L1, exam span 6:40 …"). */
function goodQuestion(n: number, type: QuestionType, t: string) {
  const data: Record<QuestionType, unknown> = {
    multiple_choice: { options: ['La conducta', 'Las rocas', 'Los astros', 'El clima'], correct: 0 },
    true_false: { correct: true },
    short_answer: { modelAnswer: 'La conducta humana', keyPoints: ['conducta'] },
    fill_blank: { text: 'La ___ es biológica.', blanks: [{ answer: 'conducta', accept: [] }] },
    long_answer: { modelAnswer: 'La conducta humana es biológica', keyPoints: ['conducta'] },
    match_pairs: { pairs: [{ left: 'a', right: 'uno' }, { left: 'b', right: 'dos' }, { left: 'c', right: 'tres' }] },
    order_steps: { steps: ['uno', 'dos', 'tres'] },
    numeric: { answer: 5, tolerance: 0.5, relative: false, unit: '', decimals: 0 },
  };
  return { slot: n, type, prompt: `Pregunta número ${n} sobre la conducta`, data: JSON.stringify(data[type]), explanation: 'La conducta humana es biológica.', hint: 'Piensa.', addedContext: '', source: { ref: 'L1', t, page: 0 }, markId: '' };
}

/** The slots of a batch's (or repair's) user text. */
function slotsIn(user: string): { n: number; type: QuestionType; t: string }[] {
  return [...user.matchAll(/^S(\d+) \| (\w+) \|.*$/gm)].map((m) => ({ n: Number(m[1]), type: m[2] as QuestionType, t: /span (\d+:\d\d)/.exec(m[0])?.[1] ?? '10:00' }));
}

const message = (text: string, stop = 'end_turn'): ClaudeMessage => ({ model: 'claude-opus-5-5', stop_reason: stop, content: [{ type: 'text', text }] });
const textOfBlock = (block: unknown) => (block as { text: string }).text;
const userOf = (content: Content) => textOfBlock(content.at(-1));

type Answer = (kind: 'batch' | 'verify' | 'repair', user: string, n: number) => ClaudeMessage | Error;
const answerAll: Answer = (kind, user) => (kind === 'verify' ? message(JSON.stringify({ items: [] })) : message(JSON.stringify({ questions: slotsIn(user).map((s) => goodQuestion(s.n, s.type, s.t)) })));

function setup(m: QuizRunMaterial, answer: Answer = answerAll, over: Partial<QuizRunDeps> = {}) {
  const calls: { kind: string; system: string; content: Content; maxTokens: number }[] = [];
  const saves: Record<string, unknown>[] = [];
  const saved: Record<string, unknown>[][] = [];
  const costs: ClaudeMessage[] = [];
  const meter = { calls: 0, logged: 0 };
  const deps: QuizRunDeps = {
    quizId: QUIZ,
    material: async () => m,
    claude: (kind, system, content, _schema, maxTokens): QuizCall => {
      calls.push({ kind, system, content, maxTokens });
      const a = answer(kind, userOf(content), calls.length);
      return {
        finalMessage: async () => {
          if (a instanceof Error) throw a;
          return a;
        },
        currentMessage: a instanceof Error ? undefined : undefined,
        firstEvent: Promise.resolve(),
      };
    },
    logCost: async (msg) => {
      costs.push(msg);
      return { costUsd: 0.01, tokensInput: 1, tokensOutput: 1 };
    },
    save: async (patch) => {
      saves.push(patch);
    },
    saveQuestions: async (rows) => {
      saved.push(rows);
    },
    stillWanted: async () => true,
    touch: async () => {},
    log: () => {},
    failure: (err) => ({ code: 'test', status: (err as { status?: number }).status ?? 0 }),
    meter,
    ...over,
  };
  return { deps, calls, saves, saved, costs, meter };
}

describe('the slots and the prompt', () => {
  it('exam slots get the flagged moments (≤ 3 each), weak slots the weak spots (≤ 2 each); the spans in teaching order', () => {
    const m = material(2);
    const { flagged, weak } = spansOf(m.lectures);
    expect(flagged.map((s) => s.label)).toEqual(['L1 6:40 (Exam mark 9)']);
    expect(weak.map((s) => s.label)).toEqual(['L1 18:30 (Confused 9)', 'L1 24:00–34:00 (a question to the assistant)']);
    const plan = planQuiz(planInputFor(m.facts, m.settings));
    const slots = assignSpans(plan.slots, flagged, weak);
    expect(slots.filter((s) => s.focus === 'exam').every((s) => s.span?.label === 'L1 6:40 (Exam mark 9)')).toBe(true);
    expect(slots.filter((s) => s.focus === 'exam')).toHaveLength(3);
    const weakLabels = slots.filter((s) => s.focus === 'weak').map((s) => s.span!.label);
    expect(weakLabels.filter((l) => l.startsWith('L1 18:30')).length).toBeLessThanOrEqual(2);
    expect(weakLabels.filter((l) => l.startsWith('L1 24:00')).length).toBeLessThanOrEqual(2);
    // More exam slots than room: the rest have no span (any).
    const more = assignSpans([...plan.slots.filter((s) => s.focus === 'exam'), { ...plan.slots[0], n: 99, focus: 'exam' }], flagged, weak);
    expect(more.at(-1)).toMatchObject({ focus: 'any', span: null });
  });

  it('with a summary: its exam signals are the flagged moments (her Exam marks among them)', () => {
    const summary = { examSignals: [{ text: 'Las cinco preguntas', timestamp: '31:05', source: 'professor' }, { text: 'Fig. 1.1', timestamp: '6:40', source: 'studentMark', level: 9 }] } as unknown as StoredSummary;
    const { flagged } = spansOf([{ ref: 'L1', material: lectureMaterial(), summary }]);
    expect(flagged.map((s) => s.label)).toEqual(['L1 6:40 (Exam mark 9)', 'L1 31:05 (the professor: exam)']);
  });

  it('a slot’s line names its type, category, difficulty, level and where it comes from', () => {
    const refs = { lectures: [{ ref: 'L1', fileId: 'lec-1', durationMs: 40 * MIN, title: 'Tema 1' }], files: [] };
    expect(slotLine({ n: 3, type: 'multiple_choice', category: 'definition', focus: 'exam', difficulty: 'hard', level: 'recall', lectureId: 'lec-1', span: { lectureId: 'lec-1', startMs: 400_000, endMs: 400_000, label: 'L1 6:40 (Exam mark 9)' } }, refs)).toBe(
      'S3 | multiple_choice | definition | hard | recall | from L1, exam span 6:40 (Exam mark 9)',
    );
    expect(slotLine({ n: 4, type: 'numeric', category: 'calculation', focus: 'any', difficulty: 'medium', level: 'apply', lectureId: 'lec-1', span: null }, refs)).toBe('S4 | numeric | calculation | medium | apply | from L1, any time');
  });

  it('the material is one cached block (after any PDFs and photos); past ≈ 80k tokens of transcript, only the minutes around the spans of a summarized lecture', () => {
    const m = material(2, { resources: [{ ref: 'F1', fileId: 'f1', title: 'Apuntes', kind: 'pdf', pages: 3, text: null, blocks: [{ type: 'document', source: {} }] }] });
    const { content, windowed } = quizMaterialContent(m, []);
    expect(windowed).toBe(false);
    expect(content.map((b) => b.type)).toEqual(['text', 'document', 'text']);
    expect(content.at(-1)).toMatchObject({ cache_control: { type: 'ephemeral' } });
    expect(textOfBlock(content.at(-1))).toContain('<lecture ref="L1">');
    const long = lectureMaterial({ segments: Array.from({ length: 400 }, (_, i) => ({ startMs: i * 30_000, endMs: (i + 1) * 30_000, text: 'x'.repeat(1000) })) });
    const big = quizMaterialContent(material(2, { lectures: [{ ref: 'L1', material: long, summary: { sections: [] } as unknown as StoredSummary }] }), [{ lectureId: 'lec-1', startMs: 10 * MIN, endMs: 10 * MIN, label: '' }]);
    expect(big.windowed).toBe(true);
    // The lines from 8:00 to 12:00 (±2 min around 10:00), each 30 s.
    expect((textOfBlock(big.content.at(-1)).match(/^\[/gm) ?? []).length).toBe(10);
  });

  it('the fixed shuffle: the same order for the same quiz, every question once', () => {
    const list = Array.from({ length: 20 }, (_, i) => i);
    expect(seededShuffle(list, QUIZ)).toEqual(seededShuffle(list, QUIZ));
    expect([...seededShuffle(list, QUIZ)].sort((a, b) => a - b)).toEqual(list);
    expect(seededShuffle(list, QUIZ)).not.toEqual(list);
  });
});

describe('the run', () => {
  it('10 questions: one batch; the server’s plan saved first; the questions saved in their places; ready with its report and cost log', async () => {
    const t = setup(material(2));
    expect(await runQuiz(t.deps)).toEqual({ status: 'ready', questions: 10 });
    expect(t.calls.map((c) => c.kind)).toEqual(['batch']);
    expect(t.calls[0].maxTokens).toBe(450 * 10 + 3000);
    expect(t.calls[0].system).toContain('Write in Spanish');
    expect(userOf(t.calls[0].content)).toContain('<slots>');
    expect(t.saves[0]).toMatchObject({ question_count: 10, language: 'es', plan: expect.objectContaining({ count: 10 }) });
    const rows = t.saved[0];
    expect(rows.map((r) => r.position)).toEqual([...Array(10).keys()]);
    expect(rows.every((r) => r.quiz_id === QUIZ && r.source_file_id === 'lec-1' && typeof r.answer_text === 'string')).toBe(true);
    expect(rows.filter((r) => r.focus === 'exam').every((r) => r.source_ms === 6 * MIN + 40_000)).toBe(true);
    // Claude wrote every right option first: saved shuffled, each still right, its answer text the same.
    const mc = rows.filter((r) => r.type === 'multiple_choice');
    for (const r of mc) {
      const d = r.data as { options: string[]; correct: number };
      expect([d.options[d.correct], r.answer_text]).toEqual(['La conducta', 'La conducta']);
    }
    if (mc.length >= 2) expect(new Set(mc.map((r) => (r.data as { correct: number }).correct)).size).toBeGreaterThan(1);
    expect(t.saves.at(-1)).toMatchObject({ status: 'ready', error: null, question_count: 10, checks: { version: 1, requested: 10, written: 10, dropped: [], batches: 1, costLog: { calls: 1, logged: 1 } } });
    expect(t.costs).toHaveLength(1);
  });

  it.each([
    [5, 25, 2],
    [10, 50, 4],
  ])('Number of questions %i (%i questions): %i batches of at most QUIZ_BATCH; the later ones start on the first one’s first event', async (count, total, batches) => {
    let release!: () => void;
    const firstEvent = new Promise<void>((resolve) => (release = resolve));
    const t = setup(material(count));
    const claude = t.deps.claude;
    // The first call streams until released (its first event), as a real one does.
    t.deps.claude = (kind, system, content, schema, maxTokens) => {
      const call = claude(kind, system, content, schema, maxTokens);
      if (t.calls.length !== 1) return call;
      return { finalMessage: async () => (await firstEvent, call.finalMessage()), firstEvent };
    };
    const run = runQuiz(t.deps);
    await new Promise((r) => setTimeout(r, 20));
    expect(t.calls).toHaveLength(1);
    release();
    expect(await run).toEqual({ status: 'ready', questions: total });
    expect(t.calls.filter((c) => c.kind === 'batch')).toHaveLength(batches);
    expect(QUIZ_BATCH).toBe(15);
  });

  it('a batch that fails is tried once more; one failing twice leaves its slots to the repair call; that failing too: ready with fewer', async () => {
    const once = setup(material(2), (kind, user, n) => (n === 1 ? new Error('busy') : answerAll(kind, user, n)));
    expect(await runQuiz(once.deps)).toEqual({ status: 'ready', questions: 10 });
    expect(once.calls.map((c) => c.kind)).toEqual(['batch', 'batch']);

    // 25 questions: the second batch never answers, nor the repair.
    const fewer = setup(material(5), (kind, user, n) => (kind === 'batch' && slotsIn(user)[0].n > 1 ? new Error('busy') : kind === 'repair' ? new Error('busy') : answerAll(kind, user, n)));
    expect(await runQuiz(fewer.deps)).toEqual({ status: 'ready', questions: 15 });
    expect(fewer.calls.map((c) => c.kind)).toEqual(['batch', 'batch', 'batch', 'repair']);
    const checks = fewer.saves.at(-1)!.checks as { requested: number; written: number; dropped: { slot: number; reasons: string[] }[] };
    expect(checks).toMatchObject({ requested: 25, written: 15 });
    expect(checks.dropped).toHaveLength(10);
    expect(checks.dropped[0].reasons).toEqual(['not written']);
  });

  it('nothing usable: failed (claude_failed); a 4xx is not tried again (claude_rejected); a refusal (refused)', async () => {
    const down = setup(material(2), () => new Error('down'));
    expect(await runQuiz(down.deps)).toEqual({ status: 'failed', error: 'claude_failed' });
    expect(down.saves.at(-1)).toEqual({ status: 'failed', error: 'claude_failed' });
    const rejected = setup(material(2), () => Object.assign(new Error('bad'), { status: 400 }));
    expect(await runQuiz(rejected.deps)).toEqual({ status: 'failed', error: 'claude_rejected' });
    expect(rejected.calls).toHaveLength(1);
    const refused = setup(material(2), () => message('', 'refusal'));
    expect(await runQuiz(refused.deps)).toEqual({ status: 'failed', error: 'refused' });
  });

  it('a question saying what the material doesn’t: the verify call says so, it’s dropped, and the repair call writes its slot again', async () => {
    const t = setup(material(2), (kind, user, n) => {
      if (kind === 'verify') {
        const ids = [...user.matchAll(/^(u\d+) \|/gm)].map((x) => x[1]);
        return message(JSON.stringify({ items: ids.map((id) => ({ id, verdict: 'added', replacement: '' })) }));
      }
      const qs = slotsIn(user).map((s) => ({ ...goodQuestion(s.n, s.type, s.t), ...(kind === 'batch' && s.n === PLAIN && { prompt: '¿Qué pasó en el año 98765?' }) }));
      return message(JSON.stringify({ questions: qs }));
    });
    expect(await runQuiz(t.deps)).toEqual({ status: 'ready', questions: 10 });
    expect(t.calls.map((c) => c.kind)).toEqual(['batch', 'verify', 'repair']);
    expect(userOf(t.calls[1].content)).toContain('| number | 98765 | in the prompt of question S');
    expect(slotsIn(userOf(t.calls[2].content)).map((s) => s.n)).toEqual([PLAIN]);
    expect(t.saves.at(-1)!.checks).toMatchObject({ dropped: [], repair: { slots: 1, kept: 1 } });
  });

  it('deleted meanwhile: it stops before the next call (a batch, the verify call or the repair call), failed “stopped”', async () => {
    let wanted = 2;
    const t = setup(material(5), answerAll, { stillWanted: async () => wanted-- > 0 });
    expect(await runQuiz(t.deps)).toEqual({ status: 'failed', error: 'stopped' });
    expect(t.saved).toEqual([]);
    expect(t.saves.at(-1)).toEqual({ status: 'failed', error: 'stopped' });

    // Before the verify call.
    let checks = 0;
    const beforeVerify = setup(material(2), (kind, user, n) => (kind === 'batch' ? message(JSON.stringify({ questions: slotsIn(user).map((s) => ({ ...goodQuestion(s.n, s.type, s.t), explanation: s.n === PLAIN ? 'Fueron 98765 casos.' : 'La conducta.' })) })) : answerAll(kind, user, n)), {
      stillWanted: async () => checks++ < 1,
    });
    expect(await runQuiz(beforeVerify.deps)).toEqual({ status: 'failed', error: 'stopped' });
    expect(beforeVerify.calls.map((c) => c.kind)).toEqual(['batch']);

    // Before the repair call.
    let repairChecks = 0;
    const beforeRepair = setup(material(2), (kind, user, n) => (kind === 'batch' ? message(JSON.stringify({ questions: slotsIn(user).slice(1).map((s) => goodQuestion(s.n, s.type, s.t)) })) : answerAll(kind, user, n)), {
      stillWanted: async () => repairChecks++ < 1,
    });
    expect(await runQuiz(beforeRepair.deps)).toEqual({ status: 'failed', error: 'stopped' });
    expect(beforeRepair.calls.map((c) => c.kind)).toEqual(['batch']);
  });

  it('step 10.1: AI switched off meanwhile: it stops before the next call, failed “consent_withdrawn”, nothing more sent', async () => {
    let allowed = 1;
    const t = setup(material(2), answerAll, { consentWithdrawn: async () => allowed-- <= 0 });
    expect(await runQuiz(t.deps)).toEqual({ status: 'failed', error: 'consent_withdrawn' });
    expect(t.calls.map((c) => c.kind)).toEqual(['batch']);
    expect(t.saved).toEqual([]);
    // Still allowed: as before.
    const on = setup(material(2), answerAll, { consentWithdrawn: async () => false });
    expect((await runQuiz(on.deps)).status).toBe('ready');
  });

  it('the time budget: past VERIFY_BEFORE_MS no verify call (its questions dropped), past REPAIR_BEFORE_MS no repair call', async () => {
    let clock = 0;
    const late = (ms: number) => setup(material(2), (kind, user, n) => {
      if (kind === 'batch') {
        clock = ms;
        return message(JSON.stringify({ questions: slotsIn(user).map((s) => ({ ...goodQuestion(s.n, s.type, s.t), explanation: s.n === PLAIN ? 'Fueron 98765 casos.' : 'La conducta.' })) }));
      }
      return answerAll(kind, user, n);
    }, { now: () => clock });
    const noVerify = late(VERIFY_BEFORE_MS + 1);
    expect(await runQuiz(noVerify.deps)).toEqual({ status: 'ready', questions: 9 });
    expect(noVerify.calls.map((c) => c.kind)).toEqual(['batch']);
    expect(noVerify.saves.at(-1)!.checks).toMatchObject({ verify: { skipped: true }, repair: { skipped: true, slots: 1 } });

    clock = 0;
    const noRepair = late(REPAIR_BEFORE_MS + 1);
    await runQuiz(noRepair.deps);
    expect(noRepair.calls.map((c) => c.kind)).toEqual(['batch', 'verify']);
  });

  it('the wrong questions that come back: copied (no AI), marked as coming back, among the others in the fixed order', async () => {
    const again: AgainQuestion[] = [
      { id: 'old-1', type: 'true_false', prompt: '¿La conducta es biológica?', data: { correct: true }, answerText: 'Verdadero', explanation: '', hint: '', addedContext: '', sourceFileId: 'lec-1', sourceMs: 60_000, sourcePage: null, markId: null, difficulty: 'easy' },
      { id: 'old-2', type: 'short_answer', prompt: '¿Qué estudia?', data: { modelAnswer: 'La conducta', keyPoints: [] }, answerText: 'La conducta', explanation: '', hint: '', addedContext: '', sourceFileId: 'lec-1', sourceMs: 120_000, sourcePage: null, markId: null, difficulty: 'medium' },
    ];
    const m = material(2, { again, facts: { ...material(2).facts, questions: [{ id: 'old-1', fromQuestionId: null, sourceFileId: 'lec-1' }, { id: 'old-2', fromQuestionId: null, sourceFileId: 'lec-1' }], answers: [{ questionId: 'old-1', verdict: 'wrong', answeredAt: '2026-11-01' }, { questionId: 'old-2', verdict: 'partly', answeredAt: '2026-11-01' }] } });
    const t = setup(m);
    expect(await runQuiz(t.deps)).toEqual({ status: 'ready', questions: 10 });
    const rows = t.saved[0];
    expect(rows.filter((r) => r.from_question_id).map((r) => [r.from_question_id, r.focus])).toEqual(expect.arrayContaining([['old-1', 'again'], ['old-2', 'again']]));
    expect(rows.filter((r) => r.focus !== 'again')).toHaveLength(8);
    const again2 = setup(m);
    await runQuiz(again2.deps);
    expect(again2.saved[0].map((r) => r.prompt)).toEqual(rows.map((r) => r.prompt));
  });

  it('no lecture to make it from: failed (no_material), no call', async () => {
    const t = setup(material(2, { lectures: [] }));
    expect(await runQuiz(t.deps)).toEqual({ status: 'failed', error: 'no_material' });
    expect(t.calls).toEqual([]);
  });
});
