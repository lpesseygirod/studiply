/**
 * quiz-input.ts
 * What the quiz calculator (quiz-plan.ts) is given for the lectures and files chosen: the
 * New quiz panel computes it for its preview, and the quiz function computes it again from
 * its own reads, with these same rules, so the server never trusts the app's plan. Moved here from
 * src/lib/quiz/panel.ts (which re-exports it). Without imports but types, so the app and Jest use it.
 */

import type { PastExamFormat, QuizPlanInput, QuizSliders } from './quiz-plan.ts';
import type { QuizSettings } from './quiz-settings.ts';

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
  /** Questions to the assistant with a window (each an implicit Confused, as in the summary calculator). */
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

/** What the calculator is given; `pastExam`: the past exams' formats merged (quiz-plan.ts mergeFormats), when read. */
export function planInputFor(m: QuizMaterial, s: QuizSettings, pastExam: PastExamFormat | null = null): QuizPlanInput {
  const chosen = chosenLectures(m, s);
  return {
    sliders: s.sliders,
    types: s.choices.types,
    pastExam,
    hasCalculations: hasCalculations(m, chosen),
    lectures: chosen.map((l) => ({ id: l.id, durationMs: l.durationMs })),
    flaggedSpans: chosen.reduce((n, l) => n + (l.hasSummary ? l.examSignals : l.examMarks), 0),
    weakSpots: chosen.reduce((n, l) => n + l.confusedMarks + l.assistantWindows, 0),
    pendingWrong: pendingWrong(m.questions, m.answers, [...chosen.map((l) => l.id), ...s.resources.fileIds]).length,
    wrongComeBack: s.choices.wrongComeBack,
  };
}
