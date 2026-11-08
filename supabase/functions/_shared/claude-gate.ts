/**
 * claude-gate.ts
 * The checks before anything reaches Anthropic (readyForClaude in anthropic.ts), in order, without
 * Deno or network code so Jest runs them (step 7.9: an Exam pack, a Unit summary and Extend go
 * through them too, and count for the daily limit). After "signed in":
 * server has a key → valid body → own lecture (or, with `fileId`, own document; step 9.1b-2, with
 * `quizId`, own quiz) → consent → under today's limit.
 */

import { CLAUDE_LIMIT_OPERATIONS, DAILY_CLAUDE_LIMIT_USD } from './claude.ts';

export type GateRefusal = { ok: false; status: number; code: string; error: string };

export interface GateDeps<T> {
  hasKey: boolean;
  body: unknown;
  validate: (body: unknown) => { ok: true; value: T } | { ok: false; status: number; code: string; error: string };
  ownFile: (fileId: string) => Promise<unknown>;
  ownLecture: (lectureId: string) => Promise<unknown>;
  /** Step 9.1b-2: a quiz of hers, not in the Trash (needed only by a body with `quizId`). */
  ownQuiz?: (quizId: string) => Promise<unknown>;
  hasConsent: () => Promise<boolean>;
  /** Today's cost of these operations (ai_usage, the user's own rows). */
  spentToday: (operations: readonly string[]) => Promise<number>;
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

  // A quiz (step 9.1b-2); a document of any kind (step 6.3, Ask Claude on a selection; 7.9 a Unit
  // summary or Exam pack, 9.1b-2 a past exam); else a lecture.
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

  if ((await d.spentToday(CLAUDE_LIMIT_OPERATIONS)) >= DAILY_CLAUDE_LIMIT_USD) {
    d.log('daily_limit', { lectureId });
    return { ok: false, status: 429, code: 'daily_limit', error: 'You have reached today’s limit for the assistant and summaries. Try again tomorrow.' };
  }
  return { ok: true, value: valid.value };
}
