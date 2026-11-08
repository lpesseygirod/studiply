/**
 * The faults planted in the hand-made good quiz (quiz-good-answer.ts) by `npm run eval:quizzes --
 * --faults` (step 9.1b-2), each with how the checks must catch it; and a batch answer run through the
 * checks as the quiz function does (checkQuestion, duplicates, faithfulness, then a verify call that
 * finds nothing it was sent: "added"). Shared by the Deno harness (with the synthetic lecture's own
 * sources) and Jest (src/lib/__tests__/quizFaults.test.ts), so the planted faults are tested free on
 * every `npm run check`. TypeScript (not .mjs) so both Deno and Jest import it.
 */

import { applyQuizVerdicts, checkQuestion, dropDuplicates, quizFaithfulness, type CheckContext, type QuizQuestion } from '../../supabase/functions/_shared/quiz-checks.ts';
import type { RawQuestion } from '../../supabase/functions/_shared/quiz-zod.ts';
import type { Sources } from '../../supabase/functions/_shared/summary-checks.ts';

export type Outcome = { failed: { slot: number; reasons: string[] }[]; dropped: { slot: number; reasons: string[] }[]; kept: QuizQuestion[] };

/** A batch answer through the checks, then a verify call that finds nothing it was sent ("added"). */
export function evaluateAnswer(answer: RawQuestion[], ctx: CheckContext, src: Sources): Outcome {
  const failed: Outcome['failed'] = [];
  const ok: QuizQuestion[] = [];
  for (const raw of answer) {
    const c = checkQuestion(raw, ctx);
    if (c.ok) ok.push(c.question);
    else failed.push({ slot: c.slot, reasons: c.reasons });
  }
  const dedup = dropDuplicates(ok);
  const f = quizFaithfulness(dedup.kept, src);
  const verified = applyQuizVerdicts(dedup.kept, f.unverified, f.unverified.map((u) => ({ id: u.id, verdict: 'added', replacement: '' })), ctx.language);
  return { failed, dropped: [...dedup.dropped, ...verified.dropped], kept: verified.kept };
}

export type QuizFault = { name: string; plant: (a: RawQuestion[], ctx: CheckContext) => void; caught: (o: Outcome) => boolean };

const reason = (o: Outcome, slot: number, text: string) => [...o.failed, ...o.dropped].some((f) => f.slot === slot && f.reasons.some((r) => r.includes(text)));
const data = (a: RawQuestion[], i: number) => JSON.parse(a[i].data);

export const QUIZ_FAULTS: QuizFault[] = [
  { name: 'a type not its slot’s', plant: (a) => void Object.assign(a[0], { type: 'true_false', data: JSON.stringify({ correct: true }) }), caught: (o) => reason(o, 1, 'the slot is multiple_choice') },
  { name: 'an exam question outside its span', plant: (a) => void (a[1].source.t = '5:00'), caught: (o) => reason(o, 2, 'not from its exam span') },
  { name: 'a source time past the lecture’s end', plant: (a) => void (a[2].source.t = '35:00'), caught: (o) => reason(o, 3, 'after L1’s end') },
  { name: 'an unknown F#', plant: (a) => void (a[3].source = { ref: 'F7', t: '', page: 1 }), caught: (o) => reason(o, 4, 'unknown source F7') },
  { name: 'a page past the PDF’s end', plant: (a) => void (a[0].source = { ref: 'F1', t: '', page: 13 }), caught: (o) => reason(o, 1, 'page 13 is not in F1') },
  { name: 'multiple choice with 3 options', plant: (a) => void (a[0].data = JSON.stringify({ ...data(a, 0), options: data(a, 0).options.slice(0, 3) })), caught: (o) => reason(o, 1, '3 options (4 expected)') },
  { name: 'multiple choice with the same option twice', plant: (a) => void (a[0].data = JSON.stringify({ ...data(a, 0), options: ['La conducta', 'la conducta', 'c', 'd'] })), caught: (o) => reason(o, 1, 'options repeated') },
  { name: 'a numeric tolerance of 0', plant: (a) => void (a[6].data = JSON.stringify({ ...data(a, 6), tolerance: 0 })), caught: (o) => reason(o, 7, 'tolerance must be above 0') },
  {
    name: 'a right answer not in the material (dropped)',
    plant: (a) => void (a[3].data = JSON.stringify({ ...data(a, 3), modelAnswer: 'Que hay 98765 especies.' })),
    caught: (o) => reason(o, 4, 'isn’t supported by the material') && !o.kept.some((q) => q.slot === 4),
  },
  {
    name: 'an explanation number not in the material (moved to Added context)',
    plant: (a) => void (a[0].explanation = `${a[0].explanation} Darwin lo publicó en 1872.`),
    caught: (o) => o.kept.some((q) => q.slot === 1 && q.addedContext.includes('1872') && !q.explanation.includes('1872')),
  },
  { name: 'the same question twice', plant: (a) => void (a[2].prompt = a[0].prompt), caught: (o) => reason(o, 3, 'the same question twice') },
  {
    name: 'a question in English in a Spanish quiz',
    plant: (a) => void Object.assign(a[3], { prompt: 'What is the difference between phylogeny and ontogeny according to the professor in this lecture?', explanation: 'She compared them in the last part of the class.' }),
    caught: (o) => reason(o, 4, 'written in en'),
  },
  { name: 'a past exam’s question copied', plant: (a) => void (a[0].prompt = '¿Qué estructura conecta los dos hemisferios cerebrales?'), caught: (o) => reason(o, 1, 'copies a past exam’s question') },
];
