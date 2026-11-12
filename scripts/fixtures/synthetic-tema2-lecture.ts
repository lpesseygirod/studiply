/**
 * The second synthetic lecture (for Extend with next lecture, Merge, Exam pack) as a fixture (the
 * format of supabase/functions/_shared/summary-fixture.ts): 20 min of Psicobiología in Spanish, the
 * lecture after Tema 1 (synthetic-lecture.mjs), in the same course. Made to test "no repeats":
 * - new material (the neuron, the synapse, the action potential);
 * - a concept of Tema 1 said again (what behaviour is): a repeat, a comment on Tema 1's text;
 * - an exam statement about a part of Tema 1 (the five questions): a repeat, a comment saying so;
 * - a correction of Tema 1 (natural selection: Darwin *and* Wallace): an Update callout.
 * Stable ids, so a saved summary can be checked again later. No photos (a cheaper paid run).
 * TypeScript (not .mjs) so both Deno (scripts/eval-summaries.ts) and Jest import it.
 */

const MIN = 60_000;

const NEURONA = {
  neuron: [
    'La neurona es la célula básica del sistema nervioso.',
    'Cada neurona tiene un soma, dendritas que reciben señales y un axón que las envía.',
    'La vaina de mielina rodea el axón y hace que el impulso viaje más rápido.',
    'En el cerebro humano hay unos ochenta y seis mil millones de neuronas.',
  ],
  synapse: [
    'La sinapsis es la unión funcional entre dos neuronas.',
    'En la sinapsis química la neurona presináptica libera neurotransmisores.',
    'Los neurotransmisores se unen a receptores de la neurona postsináptica.',
    'La acetilcolina y la dopamina son dos neurotransmisores importantes.',
  ],
  potential: [
    'El potencial de reposo de la neurona es de unos menos setenta milivoltios.',
    'Cuando la neurona se despolariza por encima del umbral se dispara el potencial de acción.',
    'El potencial de acción sigue la ley del todo o nada.',
    'Después viene el periodo refractario, en el que la neurona no puede dispararse otra vez.',
  ],
};
/** The planted cases (the Jest test checks each reaches Claude's input). */
export const TEMA2_PLANTED = {
  /** Tema 1's definition, said again: a repeat (1:30). */
  repeated: 'Os recuerdo de la clase pasada: la conducta es todo lo que hace un organismo y que podemos observar.',
  /** About a part of Tema 1: a repeat that becomes a comment ("this will be on the exam") (07:00). */
  examOnTema1: 'Y lo repito porque entra seguro en el examen: las cinco preguntas de la Psicobiología del tema anterior.',
  /** Corrects Tema 1: an Update callout (11:00). */
  correction: 'Una corrección de la semana pasada: dije que Darwin explicó la selección natural él solo, pero en realidad la propusieron a la vez Darwin y Wallace en 1858.',
};
const EXAM_PHRASE = 'Esto también entra en el examen: la ley del todo o nada del potencial de acción.';

const segmentText = (i: number): string => {
  if (i === 3) return TEMA2_PLANTED.repeated;
  if (i === 14) return TEMA2_PLANTED.examOnTema1;
  if (i === 22) return TEMA2_PLANTED.correction;
  if (i === 33) return EXAM_PHRASE;
  const pool = i < 13 ? NEURONA.neuron : i < 26 ? NEURONA.synapse : NEURONA.potential;
  return [0, 1, 2].map((k) => pool[(i + k) % pool.length]).join(' ');
};
const text = (t: string) => ({ type: 'text', text: t });

/** The fixture's files. */
export function syntheticTema2Fixture() {
  return {
    lecture: { title: 'Tema 2 · La neurona y la sinapsis', language: 'es', durationMs: 20 * MIN, date: '2026-11-07', courseName: 'Psicobiología (check)', lectureNumber: 2, professor: 'Dra. Ruiz' },
    courseSettings: { subjectType: 'science' as const, examFormat: 'multiple_choice' as const, summaryLanguage: null, sliders: null },
    transcript: Array.from({ length: 40 }, (_, i) => ({ startMs: i * 30_000, endMs: (i + 1) * 30_000, text: segmentText(i) })),
    notes: [
      { id: 't2-h1', tMs: 30_000, text: 'La neurona', content: { type: 'heading', attrs: { level: 2, blockId: 't2-h1' }, content: [text('La neurona')] } },
      { id: 't2-p1', tMs: 2 * MIN, text: 'soma, dendritas, axón (+ mielina)', content: { type: 'paragraph', attrs: { blockId: 't2-p1' }, content: [{ ...text('soma, dendritas, axón'), marks: [{ type: 'bold' }] }, text(' (+ mielina)')] } },
      { id: 't2-p2', tMs: 7 * MIN + 20_000, text: '5 preguntas → examen!!', content: { type: 'paragraph', attrs: { blockId: 't2-p2' }, content: [text('5 preguntas → examen!!')] } },
      { id: 't2-p3', tMs: 11 * MIN + 10_000, text: 'Darwin Y Wallace (1858)', content: { type: 'paragraph', attrs: { blockId: 't2-p3' }, content: [text('Darwin Y Wallace (1858)')] } },
      { id: 't2-p4', tMs: 15 * MIN, text: 'potencial de reposo −70 mV', content: { type: 'paragraph', attrs: { blockId: 't2-p4' }, content: [text('potencial de reposo −70 mV')] } },
    ],
    marks: [
      { id: 't2-mark-important', type: 'important' as const, level: 7, tMs: 5 * MIN, note: null },
      { id: 't2-mark-confused', type: 'confused' as const, level: 8, tMs: 17 * MIN, note: '¿periodo refractario?' },
      { id: 't2-mark-exam', type: 'exam' as const, level: 9, tMs: 16 * MIN + 40_000, note: 'todo o nada' },
    ],
    assistant: [] as { id: string; askedAtMs: number | null; windowStartMs: number | null; windowEndMs: number | null; question: string; answer: string }[],
    media: [] as { id: string; kind: 'photo' | 'slides'; tMs: number | null; file: string; name?: string }[],
    request: {
      sliders: { startingPoint: 2, length: 5, depth: 6, examples: 5, visuals: 4, examFocus: 5, selfTest: 5, language: 4, extraResources: 6, followMarks: 7 },
      resources: { slides: false, photos: false, assistant: true },
    },
  };
}
