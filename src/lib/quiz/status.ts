/**
 * status.ts
 * Step 9.1b-2: what a quiz's row in Review → Quiz me says while it is written (the approved plan §1),
 * without React. "It took too long" is only shown here (the app never writes a quiz's status): Try
 * again works because the server claims a quiz left "generating" that long. Jest: quizStatus.test.ts.
 */

import { QUIZ_STALE_MS } from '../../../supabase/functions/_shared/quiz-settings';
import type { QuizListItem } from '../../services/quiz.service';

export interface QuizRowState {
  /** "25 questions · Writing your quiz…" */
  line: string;
  /** The smaller line under it, or null. */
  sub: string | null;
  /** The row's button besides Take: Start (saved, not started) or Try again (failed). */
  action: 'start' | 'retry' | null;
  /** Being written: the small spinner, and the list reads the row every 5 s. */
  writing: boolean;
  ready: boolean;
}

/** A failed quiz's code (quizzes.error, set by the quiz function) in plain words. */
export const FAILED_WORDS: Record<string, string> = {
  claude_failed: 'Claude couldn’t be reached',
  claude_rejected: 'The request was refused',
  refused: 'Claude declined this material',
  unreadable: 'The answer couldn’t be read',
  no_material: 'There was nothing to make questions from',
  stopped: 'Stopped: it was deleted while being written',
  consent_withdrawn: 'Stopped: AI was turned off in Settings',
  invalid_request: 'Its settings couldn’t be read',
  server_error: 'Something went wrong on the server',
  no_credits: 'No credits left: a quiz uses part of a credit',
};

/** Step 10.2-1: a quiz the server put back to "not started" (402 no_credits). */
export const NO_CREDITS_NOTE = FAILED_WORDS.no_credits;
/** Step 10.2-2: …and she has credits again (it never starts by itself: Start). */
export const CREDITS_AGAIN_QUIZ = 'You have credits again: start it now';

const questions = (n: number) => `${n} ${n === 1 ? 'question' : 'questions'}`;

export function quizRowState(q: Pick<QuizListItem, 'status' | 'questionCount' | 'requested' | 'error' | 'updatedAt' | 'note'>, now: number = Date.now()): QuizRowState {
  if (q.status === 'generating') {
    const stale = now - Date.parse(q.updatedAt) > QUIZ_STALE_MS;
    if (stale) return { line: 'Couldn’t be written', sub: 'It took too long', action: 'retry', writing: false, ready: false };
    return { line: `${questions(q.requested)} · Writing your quiz…`, sub: 'About 1–2 minutes, you can keep working', action: null, writing: true, ready: false };
  }
  if (q.status === 'ready') {
    const fewer = q.requested - q.questionCount;
    return fewer > 0
      ? { line: `${q.questionCount} of ${questions(q.requested)} · Ready`, sub: `${fewer} couldn’t be checked`, action: null, writing: false, ready: true }
      : { line: `${questions(q.questionCount)} · Ready`, sub: null, action: null, writing: false, ready: true };
  }
  if (q.status === 'failed') return { line: 'Couldn’t be written', sub: FAILED_WORDS[q.error ?? ''] ?? 'Please try again', action: 'retry', writing: false, ready: false };
  return { line: `${questions(q.requested)} · Saved · not started`, sub: q.note, action: 'start', writing: false, ready: false };
}
