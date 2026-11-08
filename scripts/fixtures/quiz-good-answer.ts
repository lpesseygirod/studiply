/**
 * A hand-made good quiz answer (step 9.1b-2) on the synthetic Tema 1 lecture (synthetic-lecture.mjs:
 * 30 min of Psicobiología, its Exam mark at 21:05), as Claude would answer a batch: one question per
 * slot, each type once, every check passing. scripts/eval-quizzes.ts plants faults in a copy of it
 * (`--faults`, free); each one must be caught. Synthetic: no real lecture, no student data.
 * TypeScript (not .mjs) so both Deno and Jest import it.
 */

import type { CheckContext, SlotSpec } from '../../supabase/functions/_shared/quiz-checks.ts';
import type { RawQuestion } from '../../supabase/functions/_shared/quiz-zod.ts';

const MIN = 60_000;
const slot = (n: number, over: Partial<SlotSpec>): SlotSpec => ({ n, type: 'multiple_choice', category: 'definition', focus: 'any', difficulty: 'medium', level: 'recall', lectureId: 'synthetic', span: null, ...over });

/** The batch's slots and what the questions may cite: Tema 1 (L1) and a 12-page PDF of notes (F1). */
export function goodContext(): CheckContext {
  return {
    refs: {
      lectures: [{ ref: 'L1', fileId: 'synthetic', durationMs: 30 * MIN, title: 'Tema 1 · La Psicobiología' }],
      files: [{ ref: 'F1', fileId: 'notes-pdf', pages: 12, title: 'Apuntes Tema 1.pdf' }],
    },
    slots: [
      slot(1, {}),
      slot(2, { type: 'true_false', category: 'concept', focus: 'exam', level: 'understand', span: { lectureId: 'synthetic', startMs: 21 * MIN + 5_000, endMs: 21 * MIN + 5_000, label: 'L1 21:05 (Exam mark 9)' } }),
      slot(3, { type: 'fill_blank' }),
      slot(4, { type: 'short_answer', category: 'concept', level: 'understand' }),
      slot(5, { type: 'order_steps', category: 'application', level: 'apply' }),
      slot(6, { type: 'match_pairs' }),
      slot(7, { type: 'numeric', category: 'calculation', level: 'apply', difficulty: 'hard' }),
    ],
    options: 4,
    language: 'es',
    hints: true,
    explanations: true,
    pastStems: ['¿Qué estructura conecta los dos hemisferios cerebrales?'],
  };
}

const q = (slotN: number, type: RawQuestion['type'], prompt: string, data: unknown, t: string, explanation: string): RawQuestion => ({
  slot: slotN,
  type,
  prompt,
  data: JSON.stringify(data),
  explanation,
  hint: 'Recuerda la definición de la profesora.',
  addedContext: '',
  source: { ref: 'L1', t, page: 0 },
  markId: '',
});

/** One good question per slot. */
export function goodAnswer(): RawQuestion[] {
  return [
    q(1, 'multiple_choice', '¿Qué estudia la Psicobiología?', { options: ['La conducta como un proceso biológico', 'Las rocas y los minerales', 'El clima de cada región', 'Los mercados financieros'], correct: 0 }, '0:30', 'La profesora la define como el estudio de la conducta como un proceso biológico.'),
    q(2, 'true_false', 'La Psicobiología responde a cinco preguntas sobre cada conducta.', { correct: true }, '21:00', 'Lo dijo al hablar de lo que entra en el examen.'),
    q(3, 'fill_blank', 'La ___ es la historia evolutiva de una especie.', { text: 'La ___ es la historia evolutiva de una especie.', blanks: [{ answer: 'filogenia', accept: ['filogénesis'] }] }, '20:30', 'Es la definición de filogenia que dio en clase.'),
    q(4, 'short_answer', '¿Qué diferencia hay entre filogenia y ontogenia?', { modelAnswer: 'La filogenia es la historia evolutiva de la especie; la ontogenia, el desarrollo de un individuo desde la concepción.', keyPoints: ['especie', 'individuo'] }, '21:30', 'La profesora las contrapuso en la última parte.'),
    q(5, 'order_steps', 'Ordena las preguntas de la Psicobiología como las presentó la profesora.', { steps: ['Qué estructuras la producen', 'Qué procesos la ponen en marcha', 'Cómo se regula', 'Su finalidad', 'Cómo ha evolucionado'] }, '11:00', 'Las presentó en este orden.'),
    q(6, 'match_pairs', 'Relaciona cada concepto con su definición.', { pairs: [{ left: 'Filogenia', right: 'Historia evolutiva de una especie' }, { left: 'Ontogenia', right: 'Desarrollo de un individuo' }, { left: 'Conducta', right: 'Lo que hace un organismo y podemos observar' }] }, '20:00', 'Son las definiciones de la clase.'),
    q(7, 'numeric', 'Si la varianza genética es 30 y la fenotípica 60, ¿cuál es la heredabilidad?', { answer: 0.5, tolerance: 0.01, relative: false, unit: '', decimals: 2 }, '24:00', 'Se aplica $h^2 = V_G / V_P$: 30 dividido entre 60.'),
  ];
}
