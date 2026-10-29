import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { TextSelection, type EditorState } from '@tiptap/pm/state';

/**
 * Keys shared by Studiply's boxes (callouts since 4.6, formula cards since
 * 4.7c): Enter on an empty last line leaves the box, as in a list.
 */

/** The innermost `name` box around the cursor. */
export function boxAround(state: EditorState, name: string): { pos: number; depth: number; node: PMNode } | null {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === name) return { pos: $from.before(d), depth: d, node: $from.node(d) };
  }
  return null;
}

/**
 * Enter on an empty last line of a `name` box: the line goes and the cursor
 * is on a new line after the box. `keep` lines must stay (a formula card
 * keeps its formula and one legend line): with no line to spare, the box
 * stays as it is and the cursor still leaves when `leaveFull` is set.
 */
export function leaveBoxOnEmptyLast(editor: Editor, name: string, { keep = 1, leaveFull = false } = {}): boolean {
  const { state } = editor;
  const { $from, empty } = state.selection;
  const box = boxAround(state, name);
  if (!box || !empty) return false;
  const line = $from.parent;
  // The cursor's line is a line of the box itself (not in a list in it), its last, and empty.
  if ($from.depth !== box.depth + 1 || line.type.name !== 'paragraph' || line.content.size > 0 || $from.index(box.depth) !== box.node.childCount - 1) return false;
  const spare = box.node.childCount > keep;
  if (!spare && !leaveFull) return false;
  const tr = state.tr;
  if (spare) tr.delete($from.before(), $from.after());
  const after = tr.mapping.map(box.pos + box.node.nodeSize);
  tr.insert(after, state.schema.nodes.paragraph.create());
  tr.setSelection(TextSelection.create(tr.doc, after + 1));
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}
