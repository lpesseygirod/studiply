/**
 * A synthetic past exam (step 9.1b-2) for the quiz evaluation (scripts/eval-quizzes.ts): a Psicobiología
 * exam from an earlier year, as a text document of the course (so reading it needs no photos-and-PDFs
 * permission). 12 questions: 8 multiple choice with 4 options, 2 true/false, 2 short answers. A quiz
 * made with it should copy its format (that mix, 4 options, short stems in Spanish) and never its
 * questions: they ask about other things than the synthetic lectures on purpose, and the stems are
 * checked as never copied (the advisor's decision, 2 Nov: past exams give the format only).
 * TypeScript (not .mjs) so both Deno and Jest import it.
 */

const MC = [
  ['¿Qué estructura conecta los dos hemisferios cerebrales?', ['El cuerpo calloso', 'El cerebelo', 'El bulbo raquídeo', 'El hipotálamo']],
  ['¿Qué lóbulo procesa principalmente la visión?', ['El occipital', 'El frontal', 'El temporal', 'El parietal']],
  ['¿Qué método mide la actividad eléctrica del cerebro?', ['El electroencefalograma', 'La resonancia magnética', 'La tomografía', 'La biopsia']],
  ['¿Qué hormona regula el ciclo de sueño y vigilia?', ['La melatonina', 'La insulina', 'El cortisol', 'La oxitocina']],
  ['¿Qué parte del sistema nervioso controla las respuestas de lucha o huida?', ['El simpático', 'El parasimpático', 'El somático', 'El entérico']],
  ['¿Qué estudia la neuropsicología?', ['La relación entre cerebro y funciones cognitivas', 'Las rocas', 'Las estrellas', 'Los mercados']],
  ['¿Cuál es la unidad básica de la herencia?', ['El gen', 'La neurona', 'La sinapsis', 'El axón']],
  ['¿Qué técnica permite ver la estructura del cerebro sin cirugía?', ['La resonancia magnética', 'El electromiograma', 'La biopsia', 'La autopsia']],
] as const;
const TF = ['El cerebelo participa en la coordinación del movimiento.', 'La médula espinal forma parte del sistema nervioso periférico.'];
const SHORT = ['Explique brevemente qué es la plasticidad cerebral.', 'Defina qué es un neurotransmisor.'];

/** The 3 stems a format read copies word for word (checked as never copied into a quiz). */
export const PAST_EXAM_STEMS = [MC[0][0], MC[1][0], SHORT[0]];

/** What reading its format should give. */
export const PAST_EXAM_EXPECTED = { questionCount: 12, types: { multiple_choice: 8, true_false: 2, short_answer: 2 }, optionsPerQuestion: 4 };

const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

/** The exam as the document's notes tab (editor JSON). */
export function syntheticPastExam() {
  const lines: ReturnType<typeof p>[] = [p('Examen de Psicobiología · Convocatoria de junio 2025'), p('Responda a todas las preguntas.')];
  let n = 1;
  for (const [stem, options] of MC) {
    lines.push(p(`${n++}. ${stem}`));
    options.forEach((o, i) => lines.push(p(`${'abcd'[i]}) ${o}`)));
  }
  for (const s of TF) lines.push(p(`${n++}. Verdadero o falso: ${s}`));
  for (const s of SHORT) lines.push(p(`${n++}. ${s}`));
  return { title: 'Examen Psicobiología junio 2025', content: { type: 'doc', content: lines } };
}
