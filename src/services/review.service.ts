/**
 * review.service.ts
 * The review screen's data (step 9.1): the due flashcards and the Quiz me decks, a rating, a card
 * deleted, the counts.
 *
 * - The laptop reads Supabase and writes a rating at once (review_card: the later review wins).
 * - The iPhone reads its own copy (flashcards, review_schedule, summaries, files, courses: the
 *   library download keeps them, lib/cache/pull), so Review works offline. A rating is written there
 *   and queued (`review_card`, one per card: its latest rating), and sent when it can be.
 */

import { serviceError } from '../lib/cloudRows';
import { cacheEnabled, markClean, readRows, saveLocalRow, type CacheableRow } from '../lib/cache/store';
import { requestPull } from '../lib/cache/library';
import { isOffline } from '../lib/connectivity';
import { enqueue, registerSyncHandler, syncEnabled } from '../lib/sync';
import { supabase } from '../lib/supabase';
import { deckMarks, dueDeck, dueTodayCount, quizDecks, reviewedTodayCount, withState, type CardRow, type CourseRow, type FileRow, type QuizDeck, type ReviewCard, type ScheduleRow, type SummaryRow } from '../lib/review/deck';
import { nextReview, type Grade, type ReviewState } from '../lib/review/schedule';

export type { QuizDeck, ReviewCard } from '../lib/review/deck';

interface Rows {
  schedules: ScheduleRow[];
  cards: CardRow[];
  files: FileRow[];
  courses: CourseRow[];
  summaries: SummaryRow[];
}

const SCHEDULE_COLUMNS = 'id, user_id, flashcard_id, file_id, due_at, interval_days, ease, reps, last_grade, last_reviewed_at, updated_at';

/** Everything the review screen reads: the iPhone's copy (brought up to date first when online), else Supabase. */
async function readAll(): Promise<Rows> {
  if (cacheEnabled) {
    // Fresh when Review opens (a card saved a minute ago, a review made on the laptop).
    if (!isOffline()) await requestPull(true).catch(() => {});
    const [schedules, cards, files, courses, summaries] = await Promise.all([
      readRows<ScheduleRow>('review_schedule'),
      readRows<CardRow>('flashcards'),
      readRows<FileRow>('files'),
      readRows<CourseRow>('courses'),
      readRows<SummaryRow>('summaries'),
    ]);
    return { schedules, cards, files, courses, summaries };
  }
  const [schedules, cards, files, courses, summaries] = await Promise.all([
    supabase.from('review_schedule').select(SCHEDULE_COLUMNS).not('flashcard_id', 'is', null),
    supabase.from('flashcards').select('id, front, back, kind, file_id, course_id, deleted_at').is('deleted_at', null),
    supabase.from('files').select('id, title, course_id, deleted_at'),
    supabase.from('courses').select('id, name'),
    supabase.from('summaries').select('id, file_id, status, result, created_at').eq('status', 'done'),
  ]);
  for (const r of [schedules, cards, files, courses, summaries]) if (r.error) throw serviceError(r.error, 'Could not load your review.');
  return {
    schedules: (schedules.data ?? []) as ScheduleRow[],
    cards: (cards.data ?? []) as CardRow[],
    files: (files.data ?? []) as FileRow[],
    courses: (courses.data ?? []) as CourseRow[],
    summaries: (summaries.data ?? []) as SummaryRow[],
  };
}

export interface ReviewData {
  cards: ReviewCard[];
  /** "From your marks: …" for the cards (one lecture's), else ''. */
  cardsMarks: string;
  quiz: QuizDeck[];
  dueToday: number;
  reviewedToday: number;
}

/** The due cards, the Quiz me decks and the counts. */
export async function loadReview(now: Date = new Date()): Promise<ReviewData> {
  const rows = await readAll();
  const cards = dueDeck(rows.schedules, rows.cards, rows.files, rows.courses, now);
  return {
    cards,
    cardsMarks: deckMarks(cards, rows.summaries),
    quiz: quizDecks(rows.summaries, rows.files, rows.courses, cards.map((c) => c.fileId)),
    dueToday: dueTodayCount(rows.schedules, rows.cards, now),
    reviewedToday: reviewedTodayCount(rows.schedules, now),
  };
}

/** Review today on the iPhone offline: from its copy (null without one). */
export async function cachedDueCount(now: Date = new Date()): Promise<number | null> {
  if (!cacheEnabled) return null;
  const [schedules, cards] = await Promise.all([readRows<ScheduleRow>('review_schedule'), readRows<CardRow>('flashcards')]);
  return dueTodayCount(schedules, cards, now);
}

interface ReviewPayload {
  flashcardId: string;
  scheduleId: string;
  state: ReviewState;
}

async function sendReview(p: ReviewPayload): Promise<void> {
  const s = p.state;
  const { error } = await supabase.rpc('review_card', {
    p_flashcard_id: p.flashcardId,
    p_due_at: s.dueAt,
    p_interval_days: s.intervalDays,
    p_ease: s.ease,
    p_reps: s.reps,
    p_grade: s.lastGrade ?? 'good',
    p_reviewed_at: s.lastReviewedAt ?? new Date().toISOString(),
  });
  if (error) throw serviceError(error, 'Could not save the review.');
}

/** A rating: the card's next review, written (laptop) or kept here and queued (iPhone). */
export async function rateCard(card: ReviewCard, grade: Grade, now: Date = new Date()): Promise<ReviewState> {
  const state = nextReview(card.state, grade, now);
  const payload: ReviewPayload = { flashcardId: card.id, scheduleId: card.schedule.id, state };
  if (syncEnabled) {
    await saveLocalRow('review_schedule', withState(card.schedule, state, now) as unknown as CacheableRow);
    await enqueue<ReviewPayload>({ kind: 'review_card', key: `review:${card.id}`, payload });
  } else {
    await sendReview(payload);
  }
  return state;
}

registerSyncHandler<ReviewPayload>('review_card', {
  run: async (p) => {
    await sendReview(p);
    // Sent (or a later review was there): the next download may replace the copy here.
    await markClean('review_schedule', p.scheduleId);
  },
  // Two ratings of a card waiting: the later one (it was computed from the earlier).
  merge: (earlier, later) => ((later.state.lastReviewedAt ?? '') >= (earlier.state.lastReviewedAt ?? '') ? later : earlier),
});

/** Delete card (in the trash: out of review); Undo takes it back. Needs a connection. */
export async function deleteCard(cardId: string): Promise<() => Promise<void>> {
  const { error } = await supabase.from('flashcards').update({ deleted_at: new Date().toISOString() }).eq('id', cardId);
  if (error) throw serviceError(error, 'Could not delete the card.');
  return async () => {
    const { error: undoError } = await supabase.from('flashcards').update({ deleted_at: null }).eq('id', cardId);
    if (undoError) throw serviceError(undoError, 'Could not restore the card.');
  };
}
