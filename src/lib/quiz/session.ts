/**
 * session.ts
 * Taking a quiz (step 9.1b-3) without React: an attempt's question order, the order match pairs and
 * put-in-order steps are shown in, where an attempt resumes, the time left, the keys on the laptop,
 * the score as the database trigger computes it, the questions left unanswered. Jest: quizSession.test.ts.
 */

import { seededShuffle } from '../../../supabase/functions/_shared/quiz-shuffle';
import type { QuizQuestionType, QuizResponse, Verdict } from '../../../supabase/functions/_shared/quiz-grade';

export interface TakeQuestion {
  id: string;
  quiz_id: string;
  position: number;
  type: QuizQuestionType;
  prompt: string;
  data: Record<string, unknown>;
  answer_text: string;
  explanation: string;
  hint: string;
  added_context: string;
  source_file_id: string | null;
  source_ms: number | null;
  source_page: number | null;
  mark_id: string | null;
  focus: string;
  difficulty: string;
}

export interface AttemptRow {
  id: string;
  user_id: string;
  quiz_id: string;
  status: 'in_progress' | 'finished';
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  grading: 'score' | 'pass_fail';
  pass_threshold: number;
  max_points: number;
  points: number;
  score: number;
  passed: boolean | null;
  created_at?: string;
  updated_at?: string;
}

export interface AnswerRow {
  id: string;
  user_id: string;
  attempt_id: string;
  question_id: string;
  response: QuizResponse | null;
  verdict: Verdict | 'pending';
  points: number;
  reason: string;
  graded_by: 'code' | 'ai' | 'student' | null;
  original_verdict: Verdict | null;
  hint_used: boolean;
  time_ms: number | null;
  answered_at: string;
  updated_at?: string;
}

/** An attempt's questions in its own order (a new one for each attempt: Take again; the same on resume). */
export function attemptOrder(questions: TakeQuestion[], attemptId: string): TakeQuestion[] {
  return seededShuffle([...questions].sort((a, b) => a.position - b.position), attemptId);
}

/**
 * The order a question's right-hand items (match pairs) or steps (put in order) are shown in: shuffled,
 * fixed per question (the quiz's and the question's ids), never the right order itself when it can be
 * anything else. The stored order is the right one (9.1b-2): graded against it.
 */
export function shownOrder(question: Pick<TakeQuestion, 'id' | 'quiz_id' | 'type' | 'data'>): number[] {
  const n = question.type === 'match_pairs' ? ((question.data.pairs as unknown[]) ?? []).length : question.type === 'order_steps' ? ((question.data.steps as unknown[]) ?? []).length : 0;
  const order = seededShuffle(Array.from({ length: n }, (_, i) => i), `${question.quiz_id}:${question.id}`);
  // Shown as stored, the answer would be on screen: turned by one.
  return n > 1 && order.every((k, i) => k === i) ? [...order.slice(1), order[0]] : order;
}

/**
 * A quiz's attempts for its row in the list: the one in progress (Resume) and the latest finished one
 * (its score and Results: Lea's decision 3, no attempts browser).
 */
export function latestAttempts(attempts: AttemptRow[]): { resume: AttemptRow | null; last: AttemptRow | null } {
  const newest = (status: AttemptRow['status']) =>
    attempts.filter((a) => a.status === status).sort((a, b) => (b.finished_at ?? b.started_at).localeCompare(a.finished_at ?? a.started_at))[0] ?? null;
  return { resume: newest('in_progress'), last: newest('finished') };
}

/** Where an attempt goes on: its first question without an answer (all answered: the end). */
export function resumeIndex(order: TakeQuestion[], answers: Map<string, AnswerRow>): number {
  const i = order.findIndex((q) => !answers.has(q.id));
  return i === -1 ? order.length : i;
}

/** The questions an attempt left unanswered (written as wrong when it finishes: Lea's decision 1). */
export const unanswered = (order: TakeQuestion[], answers: Map<string, AnswerRow>) => order.filter((q) => !answers.has(q.id));

/** Milliseconds left until `deadline` (never below 0). */
export const msLeft = (deadline: number, now: number) => Math.max(0, deadline - now);

/** "12:30 left" */
export function leftText(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} left`;
}

/** "6:40", "1:02:03" */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/**
 * The option a key chooses on the laptop: A–D (or more) or 1–9, for multiple choice; for true/false
 * A or 1 is True, B or 2 False. Null: not an option key.
 */
export function keyChoice(key: string, options: number): number | null {
  const k = key.toLowerCase();
  const i = /^[a-z]$/.test(k) ? k.charCodeAt(0) - 97 : /^[1-9]$/.test(k) ? Number(k) - 1 : -1;
  return i >= 0 && i < options ? i : null;
}

/** The score as the database trigger computes it (quiz_attempt_score): points, out of 10 with one decimal, passed. */
export function attemptScore(answers: Iterable<Pick<AnswerRow, 'points'>>, a: Pick<AttemptRow, 'max_points' | 'grading' | 'pass_threshold'>): { points: number; score: number; passed: boolean | null } {
  let points = 0;
  for (const x of answers) points += Number(x.points) || 0;
  const score = a.max_points > 0 ? Math.min(10, Math.round((points * 10) / a.max_points * 10) / 10) : 0;
  const passed = a.grading === 'pass_fail' && a.max_points > 0 ? (points * 100) / a.max_points >= a.pass_threshold : null;
  return { points, score, passed };
}

/** "7.5 / 10", or "Passed · 72 % (pass at 60 %)" / "Not passed · 40 % (pass at 60 %)". */
export function scoreLine(a: Pick<AttemptRow, 'max_points' | 'grading' | 'pass_threshold'>, s: { points: number; score: number; passed: boolean | null }): string {
  if (a.grading === 'pass_fail') {
    const pct = a.max_points > 0 ? Math.round((s.points * 100) / a.max_points) : 0;
    return `${s.passed ? 'Passed' : 'Not passed'} · ${pct} % (pass at ${a.pass_threshold} %)`;
  }
  return `${s.score.toLocaleString('en', { maximumFractionDigits: 1 })} / 10`;
}

/** ✓ Right, ½ Partly, ✗ Wrong, or not graded yet. */
export const VERDICT_WORDS: Record<AnswerRow['verdict'], { mark: string; word: string }> = {
  correct: { mark: '✓', word: 'Right' },
  partly: { mark: '½', word: 'Partly' },
  wrong: { mark: '✗', word: 'Wrong' },
  pending: { mark: '…', word: 'Grading' },
};

/** "Changed by you (was: Wrong)" for a grade she changed; null otherwise. */
export function changedLine(a: Pick<AnswerRow, 'graded_by' | 'original_verdict'>): string | null {
  if (a.graded_by !== 'student') return null;
  return a.original_verdict ? `Changed by you (was: ${VERDICT_WORDS[a.original_verdict].word})` : 'Graded by you';
}

/** A draft response that says nothing yet (Check stays off until there is something). */
export function hasDraft(type: QuizQuestionType, r: QuizResponse | null): boolean {
  if (!r) return false;
  if ('text' in r) return !!r.text.trim();
  if ('blanks' in r) return r.blanks.some((b) => b.trim());
  if ('matches' in r) return r.matches.some((m) => m !== null);
  if ('order' in r) return type === 'order_steps';
  return 'choice' in r || 'value' in r;
}
