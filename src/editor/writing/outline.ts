/**
 * outline.ts
 * The outline of a document's headings (step 4.7), to jump around: Title,
 * Heading 1, Heading 2 and Subheading, in the order of the text, with
 * their level; "it follows as I write": the current one is the section the
 * cursor is in (the last heading at or before it). Kept per document
 * version, as the counts.
 */

import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorState } from '@tiptap/pm/state';

import { TITLE } from '../schema/blocks';

export interface OutlineHeading {
  /** 0 Title, 1 Heading 1, 2 Heading 2, 3 Subheading. */
  level: number;
  text: string;
  /** Where the heading starts in the document. */
  pos: number;
}

export interface Outline {
  headings: OutlineHeading[];
  /** The heading whose section the cursor is in; -1 before the first. */
  current: number;
}

const cache = new WeakMap<PMNode, OutlineHeading[]>();

/** The document's headings, in order (empty ones left out). */
export function headingsOf(doc: PMNode): OutlineHeading[] {
  let list = cache.get(doc);
  if (list) return list;
  list = [];
  const found = list;
  doc.descendants((node, pos) => {
    if (node.type.name === TITLE || node.type.name === 'heading') {
      const text = node.textContent.trim();
      if (text) found.push({ level: node.type.name === TITLE ? 0 : Math.min(3, Number(node.attrs.level) || 1), text, pos });
      return false;
    }
    // Headings sit in the document or in boxes (callouts), never inside a paragraph.
    return !node.isTextblock;
  });
  cache.set(doc, list);
  return list;
}

/** The heading whose section holds `pos`: the last one starting at or before it. */
export function currentHeading(headings: OutlineHeading[], pos: number): number {
  let current = -1;
  for (let i = 0; i < headings.length && headings[i].pos <= pos; i++) current = i;
  return current;
}

export function outline(state: EditorState): Outline {
  const headings = headingsOf(state.doc);
  return { headings, current: currentHeading(headings, state.selection.from) };
}
