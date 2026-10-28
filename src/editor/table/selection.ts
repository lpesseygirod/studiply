import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import { NodeSelection, type EditorState } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';

/**
 * The table the selection is in (step 4.5): a cursor or text inside one
 * table, cells selected in it, or the table itself selected. Not a
 * selection that only passes through a table (select all), where the table
 * commands can't act. `cell`: the cell the selection starts in.
 */
export function selectedTable(state: EditorState): { table: PMNode; pos: number; cell: PMNode | null } | null {
  const { selection } = state;
  if (selection instanceof NodeSelection && selection.node.type.name === 'table') return { table: selection.node, pos: selection.from, cell: null };
  const around = ($pos: ResolvedPos) => {
    let cell: PMNode | null = null;
    for (let d = $pos.depth; d > 0; d--) {
      const node = $pos.node(d);
      if (!cell && (node.type.name === 'tableCell' || node.type.name === 'tableHeader')) cell = node;
      if (node.type.name === 'table') return { table: node, pos: $pos.before(d), cell };
    }
    return null;
  };
  const from = around(selection.$from);
  const to = around(selection.$to);
  if (!from || !to || from.pos !== to.pos) return null;
  const cell = selection instanceof CellSelection ? selection.$anchorCell.nodeAfter : from.cell;
  return { ...from, cell };
}
