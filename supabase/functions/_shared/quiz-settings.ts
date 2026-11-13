/**
 * quiz-settings.ts
 * What the New quiz panel saves in `quizzes.settings`: the 10 sliders, the choices
 * (BUILD-PLAN "Create a quiz": question types, time limit, language, when answers show,
 * explanations, hints, grading, wrong answers coming back), what the quiz covers and what goes
 * with it. The quiz function reads it back. Without imports but quiz-plan.ts's types, so
 * the app and Jest use the same file.
 */

import { DEFAULT_TYPES, QUESTION_TYPES, QUIZ_SLIDER_KEYS, type QuestionType, type QuizSliders } from './quiz-plan.ts';

export type TimeLimit = { kind: 'none' } | { kind: 'total'; minutes: number } | { kind: 'perQuestion'; seconds: number };
export type Grading = { kind: 'score' } | { kind: 'passFail'; threshold: number };

export interface QuizChoices {
  types: QuestionType[];
  timeLimit: TimeLimit;
  /** null: the course's (the lectures' own language). */
  language: string | null;
  answers: 'afterEach' | 'atEnd';
  /** Explanations with a link to the moment in the recording. */
  explanations: boolean;
  hints: boolean;
  grading: Grading;
  wrongComeBack: boolean;
}

export const DEFAULT_CHOICES: QuizChoices = {
  types: DEFAULT_TYPES,
  timeLimit: { kind: 'none' },
  language: null,
  answers: 'afterEach',
  explanations: true,
  hints: true,
  grading: { kind: 'score' },
  wrongComeBack: true,
};

/** The other languages offered (code, name); the course's comes first in the panel. */
export const QUIZ_LANGUAGES: readonly (readonly [string, string])[] = [
  ['es', 'Spanish'],
  ['en', 'English'],
  ['ca', 'Catalan'],
  ['fr', 'French'],
  ['de', 'German'],
  ['it', 'Italian'],
  ['pt', 'Portuguese'],
];

export const SETTINGS_VERSION = 1;

export interface QuizSettings {
  version: typeof SETTINGS_VERSION;
  sliders: QuizSliders;
  choices: QuizChoices;
  /** What it covers: the whole course, or the lectures chosen (in teaching order). */
  topic: { wholeCourse: boolean; lectureIds: string[] };
  /** My notes and marks always; the lectures' summaries, slides and photos when ticked; files added. */
  resources: { notes: true; summaries: boolean; lectureMedia: boolean; fileIds: string[] };
  /** Example quizzes or past exams: they set the format only (the advisor's decision, 2 Nov). */
  pastExamIds: string[];
}

/**
 * A quiz still "generating" with no news this long is shown as taking too long, and the
 * quiz function may claim it again (Try again). The function's run stops by itself at 150 s.
 */
export const QUIZ_STALE_MS = 5 * 60_000;

export const MAX_PASS_THRESHOLD = 100;
export const LIMIT_MINUTES = { min: 1, max: 300 } as const;
export const LIMIT_SECONDS = { min: 10, max: 1800 } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ids = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string' && UUID.test(x));
const whole = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** Why these settings can't be saved, or null (the panel's Create, and the server again). */
export function settingsProblem(s: QuizSettings): string | null {
  if (s.version !== SETTINGS_VERSION) return 'Unknown settings version.';
  if (!QUIZ_SLIDER_KEYS.every((k) => whole(s.sliders?.[k], 1, 10))) return 'Each slider is a whole number from 1 to 10.';
  const c = s.choices;
  if (!c || !Array.isArray(c.types) || !c.types.length || !c.types.every((t) => (QUESTION_TYPES as readonly string[]).includes(t))) return 'Pick at least one question type.';
  if (c.timeLimit.kind === 'total' && !whole(c.timeLimit.minutes, LIMIT_MINUTES.min, LIMIT_MINUTES.max)) return `The time limit is ${LIMIT_MINUTES.min}–${LIMIT_MINUTES.max} minutes.`;
  if (c.timeLimit.kind === 'perQuestion' && !whole(c.timeLimit.seconds, LIMIT_SECONDS.min, LIMIT_SECONDS.max)) return `The time per question is ${LIMIT_SECONDS.min}–${LIMIT_SECONDS.max} seconds.`;
  if (c.language !== null && !/^[a-z]{2,3}$/.test(c.language)) return 'Unknown language.';
  if (c.grading.kind === 'passFail' && !whole(c.grading.threshold, 1, MAX_PASS_THRESHOLD)) return 'The pass mark is 1–100 %.';
  if (!ids(s.topic?.lectureIds) || !s.topic.lectureIds.length) return 'Pick at least one lecture.';
  if (!ids(s.resources?.fileIds) || !ids(s.pastExamIds)) return 'Unknown file.';
  return null;
}
