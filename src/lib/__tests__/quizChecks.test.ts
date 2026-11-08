/**
 * @jest-environment node
 */
// Step 9.1b-2: the checks on each question Claude writes (supabase/functions/_shared/quiz-checks.ts):
// its slot (type, span, lecture), its form per type, its source (lecture and time, file and page),
// the language, duplicates, faithfulness (what goes to the verify call; an exercise's numbers don't),
// and the verify call's verdicts (Added context, a right answer not supported dropped, a fix).
import {
  answerTextOf,
  applyQuizVerdicts,
  checkQuestion,
  contentWords,
  dropDuplicates,
  hintGivesAway,
  shuffleOptions,
  formProblems,
  normalizePrompt,
  quizFaithfulness,
  SPAN_SLACK_MS,
  type CheckContext,
  type QuizQuestion,
  type SlotSpec,
} from '../../../supabase/functions/_shared/quiz-checks';
import { seededShuffle } from '../../../supabase/functions/_shared/quiz-pipeline';
import type { RawQuestion } from '../../../supabase/functions/_shared/quiz-zod';
import type { Sources } from '../../../supabase/functions/_shared/summary-checks';

const MIN = 60_000;
const slot = (n: number, over: Partial<SlotSpec> = {}): SlotSpec => ({ n, type: 'multiple_choice', category: 'definition', focus: 'any', difficulty: 'medium', level: 'recall', lectureId: 'lec-1', span: null, ...over });
const ctx: CheckContext = {
  refs: {
    lectures: [
      { ref: 'L1', fileId: 'lec-1', durationMs: 45 * MIN, title: 'Tema 1' },
      { ref: 'L2', fileId: 'lec-2', durationMs: 30 * MIN, title: 'Tema 2' },
    ],
    files: [
      { ref: 'F1', fileId: 'file-pdf', pages: 12, title: 'Apuntes.pdf' },
      { ref: 'F2', fileId: 'file-doc', pages: null, title: 'Resumen' },
    ],
  },
  slots: [
    slot(1),
    slot(2, { type: 'numeric', category: 'calculation', level: 'apply', lectureId: 'lec-2' }),
    slot(3, { type: 'true_false', category: 'concept', focus: 'exam', lectureId: 'lec-1', span: { lectureId: 'lec-1', startMs: 6 * MIN + 40_000, endMs: 6 * MIN + 40_000, label: 'L1 6:40 (Exam mark 9)' } }),
    slot(4, { type: 'match_pairs' }),
    slot(5, { type: 'order_steps', category: 'application' }),
    slot(6, { type: 'fill_blank' }),
    slot(7, { type: 'short_answer', category: 'concept' }),
  ],
  options: 4,
  language: 'es',
  hints: true,
  explanations: true,
};
const raw = (n: number, type: RawQuestion['type'], data: unknown, over: Partial<RawQuestion> = {}): RawQuestion => ({
  slot: n,
  type,
  prompt: '¿Qué estudia la Psicobiología?',
  data: JSON.stringify(data),
  explanation: 'La profesora lo explicó al principio.',
  hint: 'Piensa en lo que dijo al principio.',
  addedContext: '',
  source: { ref: 'L1', t: '12:00', page: 0 },
  markId: '',
  ...over,
});
const MC = { options: ['La conducta', 'Las rocas', 'Los astros', 'El clima'], correct: 0 };
const reasons = (r: ReturnType<typeof checkQuestion>) => (r.ok ? [] : r.reasons);

describe('a question that fits its slot', () => {
  it('is kept as it will be saved: its source as lecture and ms, the answer as text, the slot’s focus and difficulty', () => {
    const r = checkQuestion(raw(1, 'multiple_choice', MC), ctx);
    expect(r).toEqual({
      ok: true,
      question: expect.objectContaining({ slot: 1, type: 'multiple_choice', answerText: 'La conducta', sourceFileId: 'lec-1', sourceMs: 12 * MIN, sourcePage: null, focus: 'any', difficulty: 'medium', hint: 'Piensa en lo que dijo al principio.', markId: null }),
    });
  });

  it('hints and explanations off: left empty; a markId only when it is one of her marks', () => {
    const off = checkQuestion(raw(1, 'multiple_choice', MC, { markId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' }), { ...ctx, hints: false, explanations: false }, new Set(['3f2504e0-4f89-41d3-9a0c-0305e82c3301']));
    expect(off.ok && [off.question.hint, off.question.explanation, off.question.markId]).toEqual(['', '', '3f2504e0-4f89-41d3-9a0c-0305e82c3301']);
    const unknown = checkQuestion(raw(1, 'multiple_choice', MC, { markId: 'not-a-mark' }), ctx);
    expect(unknown.ok && unknown.question.markId).toBeNull();
  });

  it('a file’s page: within the PDF; a text document takes any page (or 0)', () => {
    expect(checkQuestion(raw(1, 'multiple_choice', MC, { source: { ref: 'F1', t: '', page: 7 } }), ctx)).toMatchObject({ ok: true, question: { sourceFileId: 'file-pdf', sourcePage: 7, sourceMs: null } });
    expect(checkQuestion(raw(1, 'multiple_choice', MC, { source: { ref: 'f2', t: '', page: 0 } }), ctx)).toMatchObject({ ok: true, question: { sourceFileId: 'file-doc', sourcePage: null } });
  });
});

describe('what fails, and why (the repair call reads the reasons)', () => {
  it('a slot that doesn’t exist, a type not the slot’s, data not of its type', () => {
    expect(reasons(checkQuestion(raw(9, 'multiple_choice', MC), ctx))).toEqual(['slot 9 doesn’t exist']);
    expect(reasons(checkQuestion(raw(1, 'true_false', { correct: true }), ctx))).toEqual(['type true_false, the slot is multiple_choice']);
    expect(reasons(checkQuestion(raw(1, 'multiple_choice', { options: 'a, b' }), ctx))[0]).toMatch(/^data\./);
    expect(reasons(checkQuestion({ ...raw(1, 'multiple_choice', MC), data: '{not json' }, ctx))).toEqual(['data: not JSON']);
  });

  it('the source: a time after the lecture’s end, an unknown ref, a page past the PDF’s end', () => {
    expect(reasons(checkQuestion(raw(1, 'multiple_choice', MC, { source: { ref: 'L1', t: '50:00', page: 0 } }), ctx))).toEqual(['50:00 is after L1’s end (45:00)']);
    expect(reasons(checkQuestion(raw(1, 'multiple_choice', MC, { source: { ref: 'F9', t: '', page: 1 } }), ctx))).toEqual(['unknown source F9']);
    expect(reasons(checkQuestion(raw(1, 'multiple_choice', MC, { source: { ref: 'F1', t: '', page: 13 } }), ctx))).toEqual(['page 13 is not in F1 (12 pages)']);
    expect(reasons(checkQuestion(raw(1, 'multiple_choice', MC, { source: { ref: 'L1', t: 'pronto', page: 0 } }), ctx))).toEqual(['no time for L1']);
  });

  it('an exam slot: from its span (±90 s), not elsewhere in the lecture nor another lecture', () => {
    const at = (t: string, ref = 'L1') => checkQuestion(raw(3, 'true_false', { correct: true }, { prompt: 'La conducta es biológica.', source: { ref, t, page: 0 } }), ctx);
    expect(at('6:40').ok).toBe(true);
    expect(at('8:10').ok).toBe(true);
    expect(SPAN_SLACK_MS).toBe(90_000);
    expect(reasons(at('8:11'))).toEqual(['not from its exam span (L1 6:40 (Exam mark 9))']);
    expect(reasons(at('6:40', 'L2'))).toEqual(['not from its exam span (L1 6:40 (Exam mark 9))']);
  });

  it('a slot for one lecture: from that lecture (a resource is fine)', () => {
    const numeric = { answer: 1276.28, tolerance: 0.5, relative: false, unit: '€', decimals: 2 };
    expect(reasons(checkQuestion(raw(2, 'numeric', numeric, { source: { ref: 'L1', t: '3:00', page: 0 } }), ctx))).toEqual(['from another lecture than its slot’s']);
    expect(checkQuestion(raw(2, 'numeric', numeric, { source: { ref: 'L2', t: '3:00', page: 0 } }), ctx).ok).toBe(true);
    expect(checkQuestion(raw(2, 'numeric', numeric, { source: { ref: 'F1', t: '', page: 2 } }), ctx).ok).toBe(true);
  });

  it('a question that copies a past exam’s example stem (case and accents aside) goes; a short stem doesn’t count', () => {
    const withStems = { ...ctx, pastStems: ['¿Cuáles son las cinco preguntas de la Psicobiología?', 'Defina'] };
    expect(reasons(checkQuestion(raw(1, 'multiple_choice', MC, { prompt: 'cuales son las cinco preguntas de la psicobiologia' }), withStems))).toEqual(['copies a past exam’s question']);
    expect(checkQuestion(raw(1, 'multiple_choice', MC, { prompt: 'Defina la conducta.' }), withStems).ok).toBe(true);
  });

  it('written in another language than the quiz’s (a question long enough to tell)', () => {
    const english = raw(1, 'multiple_choice', MC, { prompt: 'Which of these is what the professor said that psychobiology studies in the first part of the lecture?', explanation: 'She said it at the start of the class.' });
    expect(reasons(checkQuestion(english, ctx))).toEqual(['written in en, the quiz is in es']);
  });
});

describe('the form, per type', () => {
  it.each([
    ['multiple_choice', { options: ['a', 'b', 'c'], correct: 0 }, ['3 options (4 expected)']],
    ['multiple_choice', { options: ['a', 'b', 'c', 'd'], correct: 4 }, ['the right option is not one of the options']],
    ['multiple_choice', { options: ['La conducta', 'la conducta', 'c', 'd'], correct: 0 }, ['options repeated or empty']],
    ['match_pairs', { pairs: [{ left: 'a', right: '1' }, { left: 'b', right: '2' }] }, ['2 pairs (at least 3)']],
    ['match_pairs', { pairs: [{ left: 'a', right: '1' }, { left: 'a', right: '2' }, { left: 'c', right: '3' }] }, ['pairs repeated']],
    ['order_steps', { steps: ['uno', 'dos', 'dos'] }, ['steps repeated']],
    ['numeric', { answer: 3, tolerance: 0, relative: false, unit: '', decimals: 0 }, ['the tolerance must be above 0']],
    ['fill_blank', { text: 'La ___ es ___.', blanks: [{ answer: 'conducta', accept: [] }] }, ['2 blanks in the text, 1 answers']],
    ['fill_blank', { text: 'La ___ es biológica.', blanks: [{ answer: ' ', accept: [] }] }, ['a blank without its answer']],
    ['short_answer', { modelAnswer: '', keyPoints: [] }, ['no model answer']],
  ] as const)('%s %j: %j', (type, data, problems) => expect(formProblems(type, data as Record<string, unknown>, 4)).toEqual(problems));

  it('each type’s right answer as text (true/false in the quiz’s language)', () => {
    expect(answerTextOf('true_false', { correct: true }, 'es')).toBe('Verdadero');
    expect(answerTextOf('true_false', { correct: false }, 'en')).toBe('False');
    expect(answerTextOf('match_pairs', { pairs: [{ left: 'a', right: '1' }, { left: 'b', right: '2' }] }, 'es')).toBe('a → 1; b → 2');
    expect(answerTextOf('order_steps', { steps: ['x', 'y'] }, 'es')).toBe('1. x 2. y');
    expect(answerTextOf('fill_blank', { text: '___ y ___', blanks: [{ answer: 'a', accept: [] }, { answer: 'b', accept: [] }] }, 'es')).toBe('a · b');
    expect(answerTextOf('numeric', { answer: 1276.28, tolerance: 0.5, relative: false, unit: '€', decimals: 2 }, 'es')).toBe('1276.28 € (± 0.5 €)');
    expect(answerTextOf('numeric', { answer: 10, tolerance: 0.01, relative: true, unit: '', decimals: 0 }, 'es')).toBe('10 (± 1 %)');
  });
});

describe('advisor, 8 Nov: a hint that gives the answer away goes (the question stays)', () => {
  it('a content word of the right answer (or the same word in another form) the question doesn’t have', () => {
    expect(hintGivesAway('Lo genético va en el numerador.', 'La varianza genética dividida por la varianza fenotípica', '¿Cómo se calcula la heredabilidad?', 'es')).toBe(true);
    expect(hintGivesAway('Empieza por «filo».', 'filogenia', 'La ___ es la historia evolutiva de una especie.', 'es')).toBe(false);
    expect(hintGivesAway('Piensa en la filogenia.', 'filogenia', 'La ___ es la historia evolutiva de una especie.', 'es')).toBe(true);
    expect(hintGivesAway('Divide 30 entre 60: da 0.5.', '0.5 (± 0.01)', '¿Cuál es la heredabilidad?', 'es')).toBe(true);
  });

  it('not: the question’s own words, function words, a pointer to the moment or the concept family; a paraphrase can’t be told by code (the prompt asks for none)', () => {
    expect(hintGivesAway('Recuerda cómo se calcula la heredabilidad en clase.', 'La heredabilidad', '¿Qué es la heredabilidad?', 'es')).toBe(false);
    expect(hintGivesAway('Recuerda lo que dijo al final de la clase.', 'La varianza genética dividida por la fenotípica', '¿Cómo se calcula la heredabilidad?', 'es')).toBe(false);
    expect(hintGivesAway('Piensa en la utilidad de la conducta.', 'Su finalidad', '¿Qué pregunta trata del valor adaptativo?', 'es')).toBe(false);
    expect(hintGivesAway('', 'filogenia', 'p', 'es')).toBe(false);
    expect(contentWords('La varianza de la conducta, 0,5.', 'es')).toEqual(['varianza', 'conducta', '0,5']);
  });

  it('checkQuestion leaves such a hint out and keeps the question', () => {
    const r = checkQuestion(raw(1, 'multiple_choice', MC, { hint: 'Tiene que ver con la conducta.' }), ctx);
    expect(r).toMatchObject({ ok: true, question: { hint: '' } });
    const kept = checkQuestion(raw(1, 'multiple_choice', MC, { hint: 'Recuerda la primera definición de la clase.' }), ctx);
    expect(kept.ok && kept.question.hint).toBe('Recuerda la primera definición de la clase.');
  });
});

describe('advisor, 8 Nov: multiple-choice options shuffled at save', () => {
  const mcQuestion = (slot: number): QuizQuestion => ({
    slot,
    type: 'multiple_choice',
    prompt: `Pregunta ${slot}`,
    data: { options: ['Correcta', 'Otra uno', 'Otra dos', 'Otra tres'], correct: 0 },
    answerText: 'Correcta',
    explanation: '',
    hint: '',
    addedContext: '',
    sourceFileId: 'lec-1',
    sourceMs: 0,
    sourcePage: null,
    markId: null,
    focus: 'any',
    difficulty: 'medium',
    category: 'definition',
  });

  it('over a 10-question quiz the right option lands in several places, its answer text unchanged, the same every time', () => {
    const quiz = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    const out = Array.from({ length: 10 }, (_, i) => shuffleOptions(mcQuestion(i + 1), `${quiz}:${i + 1}`, seededShuffle));
    const places = out.map((q) => (q.data as { correct: number }).correct);
    expect(new Set(places).size).toBeGreaterThanOrEqual(3);
    for (const q of out) {
      const d = q.data as { options: string[]; correct: number };
      expect(d.options[d.correct]).toBe('Correcta');
      expect(q.answerText).toBe('Correcta');
      expect([...d.options].sort()).toEqual(['Correcta', 'Otra dos', 'Otra tres', 'Otra uno']);
    }
    expect(Array.from({ length: 10 }, (_, i) => shuffleOptions(mcQuestion(i + 1), `${quiz}:${i + 1}`, seededShuffle).data)).toEqual(out.map((q) => q.data));
  });

  it('other types as they are (pairs and steps are kept in their right order: the taking screen shuffles them, 9.1b-3)', () => {
    const steps = { ...mcQuestion(1), type: 'order_steps' as const, data: { steps: ['a', 'b', 'c'] } };
    expect(shuffleOptions(steps, 'x', seededShuffle)).toBe(steps);
  });
});

describe('duplicates', () => {
  it('the same question twice (case, accents and punctuation aside) and a slot answered twice: the second goes', () => {
    const q = (slot: number, prompt: string) => ({ slot, prompt }) as QuizQuestion;
    expect(normalizePrompt('¿Qué es la CONDUCTA?')).toBe('que es la conducta');
    const r = dropDuplicates([q(1, '¿Qué es la conducta?'), q(2, 'Que es la conducta'), q(1, 'Otra pregunta')]);
    expect(r.kept.map((x) => x.slot)).toEqual([1]);
    expect(r.dropped).toEqual([
      { slot: 2, reasons: ['the same question twice'] },
      { slot: 1, reasons: ['slot 1 answered twice'] },
    ]);
  });
});

describe('faithfulness and the verify call’s verdicts', () => {
  const src: Sources = { numbers: new Set([1859, 5]), dates: new Set(), formulas: new Set(), photos: new Set() };
  const question = (over: Partial<QuizQuestion>): QuizQuestion => ({
    slot: 1,
    type: 'short_answer',
    prompt: '¿Cuántas preguntas tiene la Psicobiología?',
    data: { modelAnswer: 'Cinco', keyPoints: [] },
    answerText: 'Cinco',
    explanation: 'Son 5 preguntas.',
    hint: '',
    addedContext: '',
    sourceFileId: 'lec-1',
    sourceMs: 0,
    sourcePage: null,
    markId: null,
    focus: 'any',
    difficulty: 'medium',
    category: 'concept',
    ...over,
  });

  it('a number the material doesn’t have goes to the verify call (by field); one it has doesn’t', () => {
    const f = quizFaithfulness([question({ prompt: '¿Qué publicó Darwin en 1859?', explanation: 'Fue en 1859, con 1250 ejemplares.' })], src);
    expect(f.unverified).toEqual([{ id: 'u1', slot: 1, field: 'explanation', kind: 'number', value: '1250', sentence: 'Fue en 1859, con 1250 ejemplares.' }]);
  });

  it('a calculation or application question’s numbers are an exercise’s: not checked (its formulas are)', () => {
    const calc = question({ category: 'calculation', type: 'numeric', prompt: 'Con $VF = 2000 \\cdot 1.05^3$, ¿cuánto vale VF?', data: { answer: 2315.25, tolerance: 0.5, relative: false, unit: '€', decimals: 2 }, answerText: '2315.25 €', explanation: 'Se aplica 2000 por 1,05 al cubo.' });
    const f = quizFaithfulness([calc], src);
    expect(f.unverified.map((u) => [u.kind, u.value])).toEqual([['formula', 'VF = 2000 \\cdot 1.05^3']]);
  });

  it('verdicts: added in the explanation → Added context; corrected → fixed; a right answer not supported → dropped; a numeric answer corrected → fixed', () => {
    const qs = [
      question({ slot: 1, explanation: 'Son 5 preguntas. La primera es de 1890.' }),
      question({ slot: 2, prompt: 'En 1888 Darwin publicó…', explanation: '' }),
      question({ slot: 3, answerText: '7 preguntas', explanation: '' }),
      question({ slot: 4, type: 'numeric', data: { answer: 12, tolerance: 0.5, relative: false, unit: '', decimals: 0 }, answerText: '12 (± 0.5)', explanation: '' }),
    ];
    const items = [
      { id: 'u1', slot: 1, field: 'explanation' as const, kind: 'number' as const, value: '1890', sentence: 'La primera es de 1890.' },
      { id: 'u2', slot: 2, field: 'prompt' as const, kind: 'number' as const, value: '1888', sentence: 'En 1888 Darwin publicó…' },
      { id: 'u3', slot: 3, field: 'answer' as const, kind: 'number' as const, value: '7', sentence: '7 preguntas' },
      { id: 'u4', slot: 4, field: 'answer' as const, kind: 'number' as const, value: '12', sentence: '12' },
    ];
    const r = applyQuizVerdicts(qs, items, [
      { id: 'u1', verdict: 'added', replacement: '' },
      { id: 'u2', verdict: 'corrected', replacement: '1859' },
      { id: 'u3', verdict: 'added', replacement: '' },
      { id: 'u4', verdict: 'corrected', replacement: '15' },
    ], 'es');
    expect(r.kept.map((q) => q.slot)).toEqual([1, 2, 4]);
    expect(r.kept[0]).toMatchObject({ explanation: 'Son 5 preguntas.', addedContext: 'La primera es de 1890.' });
    expect(r.kept[1].prompt).toBe('En 1859 Darwin publicó…');
    expect(r.kept[2]).toMatchObject({ data: { answer: 15 }, answerText: '15 (± 0.5)' });
    expect(r.dropped).toEqual([{ slot: 3, reasons: ['the right answer (7) isn’t supported by the material'] }]);
    expect(r).toMatchObject({ corrected: 2, labelled: 1, found: 0 });
  });

  it('a prompt the material doesn’t support ("added"): the question goes', () => {
    const r = applyQuizVerdicts([question({ prompt: 'En 1888…' })], [{ id: 'u1', slot: 1, field: 'prompt', kind: 'number', value: '1888', sentence: 'En 1888…' }], [{ id: 'u1', verdict: 'added', replacement: '' }], 'es');
    expect(r.kept).toEqual([]);
  });
});
