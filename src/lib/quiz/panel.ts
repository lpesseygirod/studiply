/**
 * panel.ts
 * The New quiz panel's rules without React (step 9.1b): what the calculator is given for the lectures
 * and files chosen, the questions answered wrong before that come back, the counts line, the
 * quiz's title. Jest: src/lib/__tests__/quizPanel.test.ts.
 */

import type { QuizPlanInput, QuizSliders } from '../../../supabase/functions/_shared/quiz-plan';
import type { QuizSettings } from '../../../supabase/functions/_shared/quiz-settings';

export interface MaterialLecture {
  id: string;
  title: string;
  folderId: string | null;
  durationMs: number;
  hasTranscript: boolean;
  hasSummary: boolean;
  /** The summary's exam signals (the professor's phrases and her Exam marks). */
  examSignals: number;
  marks: number;
  examMarks: number;
  confusedMarks: number;
  /** Questions to the assistant with a window (each an implicit Confused, 7.2). */
  assistantWindows: number;
  /** From its summary: the material has calculations (true), has none (false), or no summary (null). */
  calculations: boolean | null;
}

export interface MaterialFile {
  id: string;
  title: string;
  kind: string;
}

export interface MaterialQuestion {
  id: string;
  fromQuestionId: string | null;
  sourceFileId: string | null;
}

export interface MaterialAnswer {
  questionId: string;
  verdict: string;
  answeredAt: string;
}

/** Everything the panel shows for one course. */
export interface QuizMaterial {
  courseId: string;
  courseName: string;
  subjectType: string | null;
  /** The course's quiz defaults (Save as course default), else every slider 5 and Number of questions 2. */
  defaults: QuizSliders;
  folders: { id: string; name: string }[];
  /** In teaching order (as recorded). */
  lectures: MaterialLecture[];
  /** The course's other files: PDFs, photos, documents, unit summaries, exam packs. */
  files: MaterialFile[];
  /** The course's earlier quiz questions and answers (for the wrong ones that come back). */
  questions: MaterialQuestion[];
  answers: MaterialAnswer[];
}

/** Subjects whose lectures calculate (course_settings.subject_type). */
const CALCULATING_SUBJECTS = ['math', 'finance', 'science', 'programming'];

/** A summary's modules that mean numbers to calculate with. */
export const CALCULATING_MODULES = ['formula', 'workedExample', 'keyFigures'];

/**
 * Whether Calculations means anything here: a calculating subject, or a chosen lecture's summary with
 * formulas or worked examples. Unknown (no subject, no summary) counts as yes, so nothing is greyed by guess.
 */
export function hasCalculations(m: Pick<QuizMaterial, 'subjectType'>, chosen: MaterialLecture[]): boolean {
  if (m.subjectType && CALCULATING_SUBJECTS.includes(m.subjectType)) return true;
  if (chosen.some((l) => l.calculations === true)) return true;
  return !m.subjectType && chosen.every((l) => l.calculations === null);
}

/**
 * Questions answered wrong or partly whose latest answer (of any copy) is still wrong or partly, and
 * that came from these files (lectures or resources). The originals' ids, oldest question order.
 */
export function pendingWrong(questions: MaterialQuestion[], answers: MaterialAnswer[], fileIds: readonly string[]): string[] {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const latest = new Map<string, MaterialAnswer>();
  for (const a of answers) {
    const q = byId.get(a.questionId);
    if (!q) continue;
    const original = q.fromQuestionId ?? q.id;
    const seen = latest.get(original);
    if (!seen || a.answeredAt > seen.answeredAt) latest.set(original, a);
  }
  const files = new Set(fileIds);
  return questions
    .filter((q) => !q.fromQuestionId)
    .filter((q) => q.sourceFileId && files.has(q.sourceFileId))
    .filter((q) => ['wrong', 'partly'].includes(latest.get(q.id)?.verdict ?? ''))
    .map((q) => q.id);
}

export const chosenLectures = (m: QuizMaterial, s: Pick<QuizSettings, 'topic'>): MaterialLecture[] => m.lectures.filter((l) => s.topic.lectureIds.includes(l.id));

/** What the calculator is given (the server computes it again from its own reads in 9.1b-2). */
export function planInputFor(m: QuizMaterial, s: QuizSettings): QuizPlanInput {
  const chosen = chosenLectures(m, s);
  return {
    sliders: s.sliders,
    types: s.choices.types,
    // The past exam's format is read in 9.1b-2; until then it doesn't change the plan.
    pastExam: null,
    hasCalculations: hasCalculations(m, chosen),
    lectures: chosen.map((l) => ({ id: l.id, durationMs: l.durationMs })),
    flaggedSpans: chosen.reduce((n, l) => n + (l.hasSummary ? l.examSignals : l.examMarks), 0),
    weakSpots: chosen.reduce((n, l) => n + l.confusedMarks + l.assistantWindows, 0),
    pendingWrong: pendingWrong(m.questions, m.answers, [...chosen.map((l) => l.id), ...s.resources.fileIds]).length,
    wrongComeBack: s.choices.wrongComeBack,
  };
}

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
