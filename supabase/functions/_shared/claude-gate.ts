/**
 * claude-gate.ts
 * The checks before anything reaches Anthropic (readyForClaude in anthropic.ts), in order, without
 * Deno or network code so Jest runs them (an Exam pack, a Unit summary and Extend go
 * through them too, and count for the daily limit). After "signed in":
 * server has a key → valid body → own lecture (or, with `fileId`, own document; with
 * `quizId`, own quiz) → consent → under today's limit → (an extra only) under the
 * 30-day extras allowance.
 *
 * Each request is paid in credits (summaries, writing a quiz) or an extra (the assistant,
 * grading, a past exam's format). Each kind has its own daily guard ($3 / $1); only extras meet the
 * allowance (429 extras_limit). Recording, transcription and anything paid never meet it.
 */

import {
  DAILY_CLAUDE_LIMIT_USD,
  DAILY_EXTRAS_LIMIT_USD,
  EXTRAS_DAILY_MESSAGE,
  EXTRAS_LIMIT_MESSAGE,
  EXTRAS_OPERATIONS,
  PAID_OPERATIONS,
  type ClaudeUse,
} from './claude.ts';

export type GateRefusal = { ok: false; status: number; code: string; error: string; resetsAt?: string | null };

export interface GateDeps<T> {
  hasKey: boolean;
  body: unknown;
  validate: (body: unknown) => { ok: true; value: T } | { ok: false; status: number; code: string; error: string };
  /** What the validated request is (each function knows its own). */
  useOf: (value: T) => ClaudeUse;
  ownFile: (fileId: string) => Promise<unknown>;
  ownLecture: (lectureId: string) => Promise<unknown>;
  /** A quiz of hers, not in the Trash (needed only by a body with `quizId`). */
  ownQuiz?: (quizId: string) => Promise<unknown>;
  hasConsent: () => Promise<boolean>;
  /** Today's cost of these operations (ai_usage, the user's own rows). */
  spentToday: (operations: readonly string[]) => Promise<number>;
  /** Her extras allowance now (extras_allowance(), her own rows); asked for extras only. */
  extrasLeft: () => Promise<{ left: number; resetsAt: string | null }>;
  log: (event: string, details: Record<string, unknown>) => void;
}

export async function claudeGate<T extends { lectureId: string; fileId?: string | null; quizId?: string | null }>(d: GateDeps<T>): Promise<{ ok: true; value: T } | GateRefusal> {
  if (!d.hasKey) {
    d.log('not_configured', {});
    return { ok: false, status: 500, code: 'not_configured', error: 'The study assistant is not set up on the server yet.' };
  }
  const valid = d.validate(d.body);
  if (!valid.ok) return valid;
  const { lectureId, fileId, quizId } = valid.value;

  // A quiz; a document of any kind (Ask Claude on a selection; a Unit
  // summary or Exam pack; a past exam); else a lecture.
  if (quizId) {
    if (!d.ownQuiz || !(await d.ownQuiz(quizId))) return { ok: false, status: 404, code: 'quiz_not_found', error: 'That quiz was not found.' };
  } else if (fileId) {
    if (!(await d.ownFile(fileId))) return { ok: false, status: 404, code: 'file_not_found', error: 'That document was not found.' };
  } else if (!(await d.ownLecture(lectureId))) {
    return { ok: false, status: 404, code: 'lecture_not_found', error: 'That lecture was not found.' };
  }

  // Consent to send notes and transcripts to Anthropic (Apple 5.1.2(i))
  if (!(await d.hasConsent())) {
    return { ok: false, status: 403, code: 'consent_required', error: 'Allow the study assistant and summaries in Settings before Studiply sends your class to Anthropic.' };
  }

  // Each kind has its own daily guard: what credits pay for $3, the extras $1.
  const use = d.useOf(valid.value);
  if (use === 'paid') {
    if ((await d.spentToday(PAID_OPERATIONS)) >= DAILY_CLAUDE_LIMIT_USD) {
      d.log('daily_limit', { lectureId, use });
      return { ok: false, status: 429, code: 'daily_limit', error: 'You have reached today’s limit for summaries and quizzes. Try again tomorrow.' };
    }
    return { ok: true, value: valid.value };
  }
  if ((await d.spentToday(EXTRAS_OPERATIONS)) >= DAILY_EXTRAS_LIMIT_USD) {
    d.log('daily_limit', { lectureId, use });
    return { ok: false, status: 429, code: 'daily_limit', error: EXTRAS_DAILY_MESSAGE };
  }
  // The 30-day allowance: a little for everyone active, more for each lecture recorded.
  const extras = await d.extrasLeft();
  if (!(extras.left > 0)) {
    d.log('extras_limit', { lectureId });
    return { ok: false, status: 429, code: 'extras_limit', error: EXTRAS_LIMIT_MESSAGE, resetsAt: extras.resetsAt };
  }
  return { ok: true, value: valid.value };
}
