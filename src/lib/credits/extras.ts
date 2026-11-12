/**
 * extras.ts
 * Step 10.2-1b (docs/reports/plan-10.2-1b.md; Lea, 12 Nov): the assistant & extras allowance in her
 * words, never in dollars. The server counts it (extras_allowance()) and alone refuses (429
 * extras_limit); this is only what she sees. Jest: creditsScreens.test.ts.
 */

/** The server's words at the limit (claude.ts EXTRAS_LIMIT_MESSAGE), shown before she asks too. */
export const EXTRAS_USED_UP = 'You’ve used the assistant for now. It grows with each lecture you record and frees up over 30 days.';

/** What's left, rounded down to 5 %: "62%"… "Less than 5%" near the end; null when used up. */
export function extrasPercent(left: number): string | null {
  if (!(left > 0)) return null;
  const pct = Math.floor((Math.min(1, left) * 100) / 5) * 5;
  return pct < 5 ? 'Less than 5%' : `${pct}%`;
}

/** Settings → Credits: "Assistant & extras: 60% left (it grows with each lecture you record)", or the used-up words. */
export function extrasLine(extras: { left: number } | null): string | null {
  if (!extras) return null;
  const pct = extrasPercent(extras.left);
  return pct ? `Assistant & extras: ${pct} left (it grows with each lecture you record)` : EXTRAS_USED_UP;
}

/**
 * Under a question (or an answer's Flashcards) refused for that reason: the assistant's own words for
 * nothing reaching Claude; why is said once, in the line above the composer.
 */
export const EXTRAS_NOT_SENT = 'Nothing was sent.';

/** The words for a refusal because the allowance is used up (429 extras_limit), else null: the caller's own. */
export function extrasRefusal(err: unknown): string | null {
  return (err as { code?: unknown } | null)?.code === 'extras_limit' ? EXTRAS_USED_UP : null;
}

/** New quiz, a past exam not read for this reason (its line; the Try again link stays). */
export const PAST_EXAM_EXTRAS_USED = 'Reading this exam uses your assistant allowance, which is used up for now.';

/** The allowance is used up (the assistant's chips and send wait; a refusal reads the store again). */
export const extrasUsedUp = (extras: { left: number } | null | undefined) => !!extras && !(extras.left > 0);
