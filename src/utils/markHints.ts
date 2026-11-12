import type { MarkKind } from '../editor/schema/markChip';

/**
 * The mark panel's words: each mark's question and the labels at
 * the slider's ends (DESIGN "While recording"), and the one-line hint of
 * what the level does in the summary (SUMMARY-SPEC "What each mark does":
 * low 1–3, mid 4–7, high 8–10, at the Follow my marks slider's default 7,
 * where a mark counts as set). Also the slider's arithmetic.
 */

export const MARK_LEVEL_DEFAULT = 5;

/**
 * Per mark: its name, question, the slider's end words (lower case, as DESIGN and the mockups write
 * them: "1 · a bit unsure") and the laptop note field's example (the mockup's is the lecture's own word).
 */
export const MARK_TEXT: Record<MarkKind, { name: string; glyph: string; question: string; low: string; high: string; noteExample: string }> = {
  important: { name: 'Important', glyph: '★', question: 'How important is this?', low: 'worth noting', high: 'key idea', noteExample: 'e.g. why it matters' },
  confused: { name: 'Confused', glyph: '?', question: 'How lost are you?', low: 'a bit unsure', high: 'completely lost', noteExample: 'e.g. what you didn’t follow' },
  exam: { name: 'Exam', glyph: '!', question: 'How likely on the exam?', low: 'maybe', high: 'certain', noteExample: 'e.g. what the professor said' },
};

/** The laptop's hint line goes on with this (docs/design desktop-01). */
export const MARK_HINT_LATER = 'You can change the level later by tapping the mark in your notes.';

export type MarkBand = 'low' | 'mid' | 'high';

export function markBand(level: number): MarkBand {
  return level <= 3 ? 'low' : level <= 7 ? 'mid' : 'high';
}

const HINTS: Record<MarkKind, Record<MarkBand, string>> = {
  important: {
    low: 'In the summary: a chip on its section.',
    mid: 'In the summary: the point is bolded in its section.',
    high: 'In the summary: in Key takeaways and the self-test.',
  },
  confused: {
    low: 'In the summary: a one-sentence clarification.',
    mid: 'In the summary: a “You were confused here” block, explained more simply.',
    high: 'In the summary: step by step, with an example and a practice question.',
  },
  exam: {
    low: 'In the summary: a chip on its section.',
    mid: 'In the summary: listed in Exam signals.',
    high: 'In the summary: Exam signals, a self-test question and a flashcard.',
  },
};

export function markHint(kind: MarkKind, level: number): string {
  return HINTS[kind][markBand(clampLevel(level))];
}

export function clampLevel(level: number): number {
  return Math.min(10, Math.max(1, Math.round(level)));
}

/** The level at `x` on a track `width` wide: ten equal stops, 1 at the left end, 10 at the right. */
export function levelAt(x: number, width: number): number {
  if (!(width > 0)) return MARK_LEVEL_DEFAULT;
  return clampLevel(1 + (Math.min(width, Math.max(0, x)) / width) * 9);
}

/** The level after a key on the slider, or null for a key it doesn't use. */
export function levelAfterKey(level: number, key: string): number | null {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return clampLevel(level + 1);
    case 'ArrowLeft':
    case 'ArrowDown':
      return clampLevel(level - 1);
    case 'Home':
      return 1;
    case 'End':
      return 10;
    default:
      return null;
  }
}
