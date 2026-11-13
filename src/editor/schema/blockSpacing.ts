import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { gapCursor } from '@tiptap/pm/gapcursor';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';

import { SYSTEM_META } from './blockMeta';

/**
 * Room to type around tables (test A: "I can't type after a table
 * at the end of the document"), on both devices:
 *
 * - After a table there is always a block to type in, and the document never
 *   ends with a table, photo or page break: an empty paragraph is added when
 *   one is missing (also when the student deletes it, as in Google Docs).
 *   Its id is fixed (`<id>-after`), so two devices that both add it to an
 *   older document make the same block and the merge keeps one.
 * - The gap cursor: ↑/← from a table's first cell (or a click above it) when
 *   nothing comes before, ↓/→ past the last; typing there makes a line.
 * - Enter at the very start of a table's first cell, when nothing to type in
 *   comes before the table, adds an empty line above it (the iPhone has no
 *   arrow keys).
 */

/** Blocks the student can't type after or around without help. */
const NEEDS_ROOM_AFTER = ['table', 'image', 'pageBreak', 'blockMath'];
const TYPABLE = ['paragraph', 'heading', 'title', 'bulletList', 'orderedList', 'taskList', 'blockquote'];

const key = new PluginKey('studiplyBlockSpacing');

/** Where an empty paragraph is missing: after a table, or at the end after a table, photo or page break. */
export function missingRoom(doc: PMNode): { pos: number; id: string | null }[] {
  const missing: { pos: number; id: string | null }[] = [];
  doc.forEach((node, offset, index) => {
    const next = index + 1 < doc.childCount ? doc.child(index + 1) : null;
    const needs = next ? node.type.name === 'table' && !TYPABLE.includes(next.type.name) : NEEDS_ROOM_AFTER.includes(node.type.name);
    if (needs) missing.push({ pos: offset + node.nodeSize, id: typeof node.attrs.blockId === 'string' ? node.attrs.blockId : null });
  });
  return missing;
}

function addRoom(state: EditorState): Transaction | null {
  const missing = missingRoom(state.doc);
  if (!missing.length) return null;
  const { paragraph } = state.schema.nodes;
  const tr = state.tr;
  // From the end, so earlier positions stay right.
  for (const { pos, id } of [...missing].reverse()) {
    tr.insert(pos, paragraph.create(id ? { blockId: `${id}-after`, editedAt: null } : null));
  }
  // Not the student's edit: not in Undo, and the block keeps no edit time.
  return tr.setMeta(SYSTEM_META, true).setMeta('addToHistory', false);
}

/** Enter at the start of a table's first cell with nothing to type in before the table: a line above. */
function lineAboveTable(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  const { selection } = state;
  if (!selection.empty) return false;
  const { $from } = selection;
  if ($from.parentOffset !== 0) return false;
  // The cursor's textblock must be the first thing in the table's first cell.
  let tableDepth = -1;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'table') {
      tableDepth = d;
      break;
    }
    if ($from.index(d - 1) !== 0) return false;
  }
  if (tableDepth !== 1) return false;
  const index = $from.index(0);
  const before = index > 0 ? state.doc.child(index - 1) : null;
  if (before && TYPABLE.includes(before.type.name)) return false;
  if (dispatch) {
    const at = $from.before(1);
    const tr = state.tr.insert(at, state.schema.nodes.paragraph.create());
    dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView());
  }
  return true;
}

export const BlockSpacing = Extension.create({
  name: 'blockSpacing',
  priority: 1000,

  onCreate() {
    // Content given at creation never went through a transaction.
    const tr = addRoom(this.editor.state);
    if (tr) this.editor.view.dispatch(tr);
  },

  addKeyboardShortcuts() {
    return { Enter: () => lineAboveTable(this.editor.state, this.editor.view.dispatch) };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        appendTransaction: (transactions, _old, state) => (transactions.some((tr) => tr.docChanged) ? addRoom(state) : null),
      }),
      gapCursor(),
    ];
  },
});
