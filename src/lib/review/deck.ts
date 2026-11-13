/**
 * The review screen's decks, built from rows as Supabase returns them (online) or as the
 * iPhone keeps them (offline): the same function both ways.
 *
 * - Flashcards: every live card whose review is due by `now`, the longest-waiting first (a new
 *   card is due when it was saved, so new cards come in the order they were saved).
 * - Quiz me: each document's newest finished summary with a self-test, the lectures whose cards are
 *   due first (in that order), then the others, newest summary first; its questions in summary order.
 * - "From your marks": the lecture's Exam and Confused marks, when the deck is one lecture's.
 */

import { marksOf, marksText, quizQuestions, type CardKind, type QuizQuestion } from './cards';
import type { Grade, ReviewState } from './schedule';

export interface ScheduleRow {
  id: string;
  user_id: string;
  flashcard_id: string | null;
  file_id?: string | null;
  due_at: string;
  interval_days: number;
  ease: number;
  reps: number;
  last_grade: string | null;
  last_reviewed_at: string | null;
  updated_at?: string;
}
export interface CardRow {
  id: string;
  front: string;
  back: string;
  kind: string | null;
  file_id: string | null;
  course_id: string | null;
  deleted_at: string | null;
}
export interface FileRow {
  id: string;
  title: string;
  course_id: string | null;
  deleted_at?: string | null;
}
export interface CourseRow {
  id: string;
  name: string;
}
export interface SummaryRow {
  id: string;
  file_id: string;
  status: string;
  result: unknown;
  created_at: string;
}

export interface ReviewCard {
  id: string;
  front: string;
  back: string;
  kind: CardKind;
  fileId: string | null;
  lecture: string | null;
  course: string | null;
  state: ReviewState;
  schedule: ScheduleRow;
}

const GRADE_SET = new Set(['again', 'hard', 'good', 'easy']);

export const stateOf = (r: ScheduleRow): ReviewState => ({
  dueAt: r.due_at,
  intervalDays: Number(r.interval_days) || 0,
  ease: Number(r.ease) || 2.5,
  reps: Number(r.reps) || 0,
  lastGrade: r.last_grade && GRADE_SET.has(r.last_grade) ? (r.last_grade as Grade) : null,
  lastReviewedAt: r.last_reviewed_at,
});

/** The schedule row after a rating (the iPhone keeps it until the server has it). */
export const withState = (r: ScheduleRow, s: ReviewState, now: Date): ScheduleRow => ({
  ...r,
  due_at: s.dueAt,
  interval_days: s.intervalDays,
  ease: s.ease,
  reps: s.reps,
  last_grade: s.lastGrade,
  last_reviewed_at: s.lastReviewedAt,
  updated_at: now.toISOString(),
});

const kindOf = (k: string | null): CardKind => (k === 'term' || k === 'question' ? k : 'card');

/** The cards due by `now`, the longest-waiting first. */
export function dueDeck(schedules: ScheduleRow[], cards: CardRow[], files: FileRow[], courses: CourseRow[], now: Date): ReviewCard[] {
  const cardById = new Map(cards.filter((c) => !c.deleted_at).map((c) => [c.id, c]));
  const fileById = new Map(files.map((f) => [f.id, f]));
  const courseById = new Map(courses.map((c) => [c.id, c]));
  return schedules
    .filter((s) => s.flashcard_id && cardById.has(s.flashcard_id) && Date.parse(s.due_at) <= now.getTime())
    .sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at) || a.id.localeCompare(b.id))
    .map((s) => {
      const c = cardById.get(s.flashcard_id!)!;
      const file = c.file_id ? fileById.get(c.file_id) : undefined;
      const courseId = c.course_id ?? file?.course_id ?? null;
      return {
        id: c.id,
        front: c.front,
        back: c.back,
        kind: kindOf(c.kind),
        fileId: c.file_id,
        lecture: file?.title ?? null,
        course: courseId ? (courseById.get(courseId)?.name ?? null) : null,
        state: stateOf(s),
        schedule: s,
      };
    });
}

/**
 * Live cards due by the end of `now`'s day: Review today's cards. Lectures are added by their plan
 * (lectures.ts dueLectures), never by their row's due_at.
 */
export function dueTodayCount(schedules: ScheduleRow[], cards: CardRow[], now: Date): number {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const live = new Set(cards.filter((c) => !c.deleted_at).map((c) => c.id));
  return schedules.filter((s) => s.flashcard_id && live.has(s.flashcard_id) && Date.parse(s.due_at) <= end.getTime()).length;
}

/** Cards reviewed since `now`'s midnight. */
export function reviewedTodayCount(schedules: ScheduleRow[], now: Date): number {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return schedules.filter((s) => s.flashcard_id && s.last_reviewed_at && Date.parse(s.last_reviewed_at) >= start.getTime()).length;
}

/** Each document's newest finished summary. */
export function newestSummaries(summaries: SummaryRow[]): Map<string, SummaryRow> {
  const out = new Map<string, SummaryRow>();
  for (const s of summaries) {
    if (s.status !== 'done' || !s.result || typeof s.result !== 'object') continue;
    const had = out.get(s.file_id);
    if (!had || s.created_at > had.created_at) out.set(s.file_id, s);
  }
  return out;
}

export interface QuizDeck {
  fileId: string;
  lecture: string;
  course: string | null;
  marks: string;
  questions: QuizQuestion[];
}

/** The Quiz me decks: the due cards' lectures first (their order), then the rest, newest summary first. */
export function quizDecks(summaries: SummaryRow[], files: FileRow[], courses: CourseRow[], dueOrder: (string | null)[]): QuizDeck[] {
  const newest = newestSummaries(summaries);
  const fileById = new Map(files.filter((f) => !f.deleted_at).map((f) => [f.id, f]));
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const rank = new Map<string, number>();
  dueOrder.forEach((id) => id && !rank.has(id) && rank.set(id, rank.size));
  return [...newest.values()]
    .filter((s) => fileById.has(s.file_id))
    .sort((a, b) => (rank.get(a.file_id) ?? Infinity) - (rank.get(b.file_id) ?? Infinity) || b.created_at.localeCompare(a.created_at))
    .map((s) => {
      const file = fileById.get(s.file_id)!;
      const result = s.result as Record<string, unknown>;
      return {
        fileId: s.file_id,
        lecture: file.title,
        course: file.course_id ? (courseById.get(file.course_id)?.name ?? null) : null,
        marks: marksText(marksOf(result)),
        questions: quizQuestions(result),
      };
    })
    .filter((d) => d.questions.length > 0);
}

/** "From your marks: …" for a flashcard session: only when all its cards are one lecture's. */
export function deckMarks(cards: ReviewCard[], summaries: SummaryRow[]): string {
  const files = new Set(cards.map((c) => c.fileId));
  if (files.size !== 1) return '';
  const [fileId] = [...files];
  const s = fileId ? newestSummaries(summaries).get(fileId) : undefined;
  return s ? marksText(marksOf(s.result as Record<string, unknown>)) : '';
}
