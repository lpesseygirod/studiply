/**
 * counts.ts
 * Word and character count (step 4.7), as Google Docs counts them, for the
 * whole document and for the selection:
 *   - a word is a run of text between spaces (or em / en dashes) with at
 *     least one letter or digit in it: "well-known" and "3,5" are one word
 *     each, "—" or "-" alone none;
 *   - characters are counted with and without spaces; line breaks between
 *     paragraphs aren't characters.
 * Chips and formulas count as a space between words (they aren't text).
 * The document's count is kept per document version, so moving the cursor
 * costs nothing (the iPhone gets it with every change of the editor).
 */

import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorState } from '@tiptap/pm/state';

export interface TextCounts {
  words: number;
  characters: number;
  charactersNoSpaces: number;
}

export interface Counts extends TextCounts {
  /** The selection's, when words are selected; else null. */
  selection: TextCounts | null;
}

const WORD = /[\p{L}\p{N}]/u;
const SEPARATORS = /[\s–—]+/u;

/** The counts of a piece of text (paragraphs separated by line breaks). */
export function countText(text: string): TextCounts {
  const words = text.split(SEPARATORS).filter((w) => WORD.test(w)).length;
  const chars = [...text.replace(/\n/g, '')];
  return { words, characters: chars.length, charactersNoSpaces: chars.filter((ch) => !/\s/u.test(ch)).length };
}

/** The text between two positions, paragraphs on lines, chips and formulas as spaces. */
const textOf = (doc: PMNode, from: number, to: number) => doc.textBetween(from, to, '\n', ' ');

const cache = new WeakMap<PMNode, TextCounts>();

/** The whole document's counts (kept for this version of the document). */
export function documentCounts(doc: PMNode): TextCounts {
  let counts = cache.get(doc);
  if (!counts) {
    counts = countText(textOf(doc, 0, doc.content.size));
    cache.set(doc, counts);
  }
  return counts;
}

/** The document's counts and the selection's. */
export function counts(state: EditorState): Counts {
  const { from, to, empty } = state.selection;
  const selection = empty ? null : countText(textOf(state.doc, from, to));
  return { ...documentCounts(state.doc), selection: selection && selection.characters > 0 ? selection : null };
}

/** "1,234 words · 6,789 characters", or "12 of 1,234 words · 60 of 6,789 characters" with a selection. */
export function countsLine(c: Counts, locale = 'en-GB'): string {
  const n = (x: number) => x.toLocaleString(locale);
  const words = (x: number) => (x === 1 ? 'word' : 'words');
  const chars = (x: number) => (x === 1 ? 'character' : 'characters');
  if (c.selection) {
    return `${n(c.selection.words)} of ${n(c.words)} ${words(c.words)} · ${n(c.selection.characters)} of ${n(c.characters)} ${chars(c.characters)}`;
  }
  return `${n(c.words)} ${words(c.words)} · ${n(c.characters)} ${chars(c.characters)}`;
}
