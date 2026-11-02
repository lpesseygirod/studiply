/**
 * When a flashcard comes back (step 9.1): a small SM-2-like rule on review_schedule's columns
 * (interval in days, ease, reps), with the four ratings of the review screen (desktop-08,
 * iphone-10). Pure, so both devices and the offline queue give the same dates.
 *
 * - Again: back in 1 minute (in the same session); the card starts over (reps 0, interval 0), its
 *   ease 0.20 lower.
 * - A new card (or one started over): Hard 1 day, Good 3 days, Easy 7 days (the mockup's labels).
 * - After that: Hard the interval × 1.2 (at least a day more), Good × ease, Easy × ease × 1.3.
 * - Ease: Hard −0.15, Good unchanged, Easy +0.15; never under 1.3. Intervals are whole days (at
 *   most 365), due at the same time of day as the review.
 * The day 1 / 3 / 7 / 21 lecture reminders are step 9.2's (review_schedule's file rows).
 */

export type Grade = 'again' | 'hard' | 'good' | 'easy';
export const GRADES: Grade[] = ['again', 'hard', 'good', 'easy'];
export const GRADE_LABELS: Record<Grade, string> = { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' };

export interface ReviewState {
  dueAt: string;
  intervalDays: number;
  ease: number;
  reps: number;
  lastGrade: Grade | null;
  lastReviewedAt: string | null;
}

export const START_EASE = 2.5;
export const MIN_EASE = 1.3;
export const MAX_DAYS = 365;
const MINUTE = 60_000;
const DAY = 86_400_000;
/** A new card's first intervals (days). */
const FIRST: Record<Exclude<Grade, 'again'>, number> = { hard: 1, good: 3, easy: 7 };
const EASE_STEP: Record<Grade, number> = { again: -0.2, hard: -0.15, good: 0, easy: 0.15 };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The card's next review after this rating. */
export function nextReview(s: Pick<ReviewState, 'intervalDays' | 'ease' | 'reps'>, grade: Grade, now: Date): ReviewState {
  const ease = round2(Math.max(MIN_EASE, (Number.isFinite(s.ease) && s.ease > 0 ? s.ease : START_EASE) + EASE_STEP[grade]));
  const base = { ease, lastGrade: grade, lastReviewedAt: now.toISOString() };
  if (grade === 'again') return { ...base, intervalDays: 0, reps: 0, dueAt: new Date(now.getTime() + MINUTE).toISOString() };
  const interval = Math.max(0, s.intervalDays || 0);
  const fresh = s.reps <= 0 || interval <= 0;
  const raw = fresh
    ? FIRST[grade]
    : grade === 'hard'
      ? Math.max(interval * 1.2, interval + 1)
      : grade === 'good'
        ? interval * s.ease
        : interval * s.ease * 1.3;
  const days = Math.min(MAX_DAYS, Math.max(1, Math.round(raw)));
  return { ...base, intervalDays: days, reps: Math.max(0, s.reps) + 1, dueAt: new Date(now.getTime() + days * DAY).toISOString() };
}

/** What a rating button says under its name: "1 min", "1 day", "3 days". */
export function intervalLabel(s: Pick<ReviewState, 'intervalDays' | 'ease' | 'reps'>, grade: Grade, now: Date): string {
  if (grade === 'again') return '1 min';
  const days = nextReview(s, grade, now).intervalDays;
  return days === 1 ? '1 day' : `${days} days`;
}
