/**
 * summary-extend.ts
 * Step 7.9, Extend and Merge (the approved plan): the lecture being added is written by the 7.4
 * generate call (or the 7.6 parts over 60 min) with the existing summary in its prompt, so Claude sees
 * both at once and writes only what is new. Its answer has two more lists, as JSON in one string field
 * (summary-schema.ts EXTEND_FIELD: the grammar limit): `alreadyCovered` (a repeat about an existing part
 * → a Studiply comment there) and `corrections` (→ an Update callout). Imported by summary-pipeline.ts and summary-combine.ts; no Deno
 * or network code (Jest runs it).
 */

import { proseOf, tagSafe } from './summary-checks.ts';
import type { StoredSummary } from './summary-pipeline.ts';
import { EXTEND_FIELD } from './summary-schema.ts';
import { ExtendLists as ExtendListsAnswer } from './summary-zod.ts';

/** A block of the summary the lecture is added to: its id in the target document, its section, its words. */
export interface Anchor {
  id: string;
  label: string;
  text: string;
}

export interface ExtendContext {
  /** Every block of the existing summary (the target document's ids). */
  anchors: Anchor[];
  /** The lecture added (its number in the course). */
  lecture: { number: number | null; title: string };
}

export type AlreadyCovered = { anchor: string; quote: string; note: string; t: string };
export type Correction = { anchor: string; said: string; t: string };
export interface ExtendLists {
  alreadyCovered: AlreadyCovered[];
  corrections: Correction[];
}

/** The existing summary's words sent at most (a long unit; about 20k tokens). Each block whole up to 400 words. */
export const EXISTING_SUMMARY_MAX_WORDS = 15_000;
const BLOCK_MAX_WORDS = 400;

/** The rules added to the generate call's system prompt. */
export function extendRules(x: ExtendContext): string {
  const n = x.lecture.number ? `Lecture ${x.lecture.number}` : 'the next lecture';
  return [
    '',
    `Extending a summary: the student already has a summary of the earlier lecture(s), in <existing-summary> (one line per block: id | section | its words). This lecture (${n}) is added to it, and NOTHING may be repeated:`,
    '- sections: only what is NEW in this lecture. Leave out what the existing summary already says (the same definition, idea, list or example said again, even in other words).',
    '- extend: a JSON object written as a string (like a block\'s data), exactly {"alreadyCovered":[…],"corrections":[…]}:',
    '  - alreadyCovered: one item {"anchor","quote","note","t"} for each thing this lecture says again about a part already there: the professor recalling or repeating it, another example of the same idea, or saying it will be on the exam. anchor: the id of that existing block, exactly as in <existing-summary>; quote: a few words of that block, copied exactly; note: what was said this time, in one short sentence in the summary\'s language (e.g. "la profesora dijo que entra en el examen"); t: when (mm:ss).',
    '  - corrections: one item {"anchor","said","t"} for each correction or change of something the existing summary says ("last week I said X, actually…"). anchor: the block corrected; said: the correction, in one sentence; t: when. A correction goes only here, not in a section.',
    '  - Every field a string; [] when there is nothing to put in a list.',
    "- The student's notes and marks follow the rules above as always (every note line in a fromNotes block, every mark in markChips), also when what they are about is already covered.",
    '- glossary, self-test and flashcards: only terms and questions the existing summary doesn\'t have. Takeaways and examSignals: this lecture\'s own.',
  ].join('\n');
}

const words = (t: string) => t.split(/\s+/).filter(Boolean);

/**
 * A stored summary's blocks as anchors, by their place in it ("s2-b4"; "exam" for its exam signals):
 * what scripts/eval-summaries.ts sends. The app sends its document's own block ids instead
 * (src/lib/summaryCombine.ts anchorsOf / unitAnchors); the words are the same.
 */
export function summaryAnchors(s: StoredSummary): Anchor[] {
  const out: Anchor[] = [];
  ((s.sections ?? []) as { heading: string; blocks: Record<string, unknown>[] }[]).forEach((sec, si) => {
    sec.blocks.forEach((b, bi) => {
      const text = proseOf(b.type === 'fromNotes' ? { notes: ((b.notes ?? []) as { text: string }[]).map((n) => n.text) } : b).join(' ').replace(/\s+/g, ' ').trim();
      if (text) out.push({ id: `s${si}-b${bi}`, label: sec.heading, text });
    });
  });
  const signals = ((s.examSignals ?? []) as { text: string }[]).map((e) => e.text).join(' · ');
  if (signals) out.push({ id: 'exam', label: 'Exam signals', text: signals });
  return out;
}

/** The existing summary for the user content: every block, whole (each up to 400 words), up to the cap. */
export function existingSummaryText(anchors: Anchor[]): { text: string; blocks: number; words: number; left: number } {
  let budget = EXISTING_SUMMARY_MAX_WORDS;
  const lines: string[] = [];
  for (const a of anchors) {
    const w = words(a.text.replace(/\s+/g, ' '));
    const text = w.length > BLOCK_MAX_WORDS ? `${w.slice(0, BLOCK_MAX_WORDS).join(' ')} …` : w.join(' ');
    const n = Math.min(w.length, BLOCK_MAX_WORDS);
    if (n > budget) break;
    budget -= n;
    lines.push(`${a.id} | ${tagSafe(a.label)} | ${tagSafe(text)}`);
  }
  return {
    text: ['<existing-summary>', lines.join('\n') || '(empty)', '</existing-summary>'].join('\n'),
    blocks: lines.length,
    words: EXISTING_SUMMARY_MAX_WORDS - budget,
    left: anchors.length - lines.length,
  };
}

/**
 * Extend's two lists taken out of a generate answer (whole or a part): its `extend` string holds their
 * JSON (summary-schema.ts EXTEND_FIELD); the rest is the usual answer, read by parseSummary / parsePart
 * as always. Null when the answer isn't JSON or `extend` isn't the two lists.
 */
export function takeExtendLists(text: string): { rest: string; lists: ExtendLists } | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { [EXTEND_FIELD]: packed, ...rest } = value as Record<string, unknown>;
  if (typeof packed !== 'string') return null;
  let inner: unknown;
  try {
    inner = JSON.parse(packed);
  } catch {
    return null;
  }
  const lists = ExtendListsAnswer.safeParse(inner);
  return lists.success ? { rest: JSON.stringify(rest), lists: lists.data } : null;
}
