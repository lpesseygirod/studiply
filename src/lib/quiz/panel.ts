/**
 * panel.ts
 * The New quiz panel's rules without React: the counts line, the quiz's title, the time
 * limit's start. What the calculator is given (and the wrong questions that come back) moved to
 * supabase/functions/_shared/quiz-input.ts, so the quiz function computes the same plan;
 * re-exported here. Jest: src/lib/__tests__/quizPanel.test.ts.
 */

import type { MaterialLecture, QuizMaterial } from '../../../supabase/functions/_shared/quiz-input';

export {
  CALCULATING_MODULES,
  chosenLectures,
  hasCalculations,
  pendingWrong,
  planInputFor,
  type MaterialAnswer,
  type MaterialFile,
  type MaterialLecture,
  type MaterialQuestion,
  type QuizMaterial,
} from '../../../supabase/functions/_shared/quiz-input';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "3 h 05 min", "45 min" */
export function durationText(ms: number): string {
  const minutes = Math.round(ms / 60000);
  const h = Math.floor(minutes / 60);
  return h ? `${h} h ${String(minutes % 60).padStart(2, '0')} min` : `${minutes} min`;
}

/** "Corporate Finance · 2 lectures · 3 h 05 min · 14 marks (4 Exam · 3 Confused)" */
export function countsLine(m: QuizMaterial, chosen: MaterialLecture[]): string {
  const marks = chosen.reduce((n, l) => n + l.marks, 0);
  const exam = chosen.reduce((n, l) => n + l.examMarks, 0);
  const confused = chosen.reduce((n, l) => n + l.confusedMarks, 0);
  const parts = [m.courseName, plural(chosen.length, 'lecture')];
  if (chosen.length) parts.push(durationText(chosen.reduce((n, l) => n + l.durationMs, 0)));
  parts.push(marks ? `${plural(marks, 'mark')} (${exam} Exam · ${confused} Confused)` : 'no marks');
  return parts.join(' · ');
}

/** "Corporate Finance · whole course", "Corporate Finance · Tema 1", "Corporate Finance · 3 lectures" (at most 200 characters). */
export function quizTitle(courseName: string, chosen: MaterialLecture[], wholeCourse: boolean): string {
  const topic = wholeCourse ? 'whole course' : chosen.length === 1 ? chosen[0].title : plural(chosen.length, 'lecture');
  const title = `${courseName} · ${topic}`;
  return title.length > 200 ? `${title.slice(0, 199)}…` : title;
}

/** The time limit's starting value: the calculator's estimate, up to the next 5 minutes. */
export const suggestedMinutes = (estimate: number): number => Math.max(5, Math.ceil(estimate / 5) * 5);
