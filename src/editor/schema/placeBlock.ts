import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorState, Transaction } from '@tiptap/pm/state';

/**
 * Where an inserted box goes (formula cards since 4.7c, graphs since 4.7d):
 * after the cursor's line, or in place of an empty one; at the top level, or
 * inside the callout the cursor is in; after a selected block (a photo, a
 * display formula). A line to type on follows it. Returns where it went.
 */
export function placeBlock(state: EditorState, tr: Transaction, node: PMNode): { at: number; end: number } {
  const { $from } = state.selection;
  // The nearest place a box may go: the document, or the callout the cursor is in.
  let d = $from.depth - 1;
  while (d > 0 && $from.node(d).type.name !== 'callout') d--;
  const line = $from.node(d + 1);
  let at: number;
  if ($from.depth === 0) {
    at = state.selection.to;
    tr.insert(at, node);
  } else if (line.isTextblock && line.content.size === 0) {
    at = $from.before(d + 1);
    tr.replaceWith(at, $from.after(d + 1), node);
  } else {
    at = $from.after(d + 1);
    tr.insert(at, node);
  }
  const end = at + node.nodeSize;
  if (!tr.doc.resolve(end).nodeAfter?.isTextblock) tr.insert(end, state.schema.nodes.paragraph.create());
  return { at, end };
}
