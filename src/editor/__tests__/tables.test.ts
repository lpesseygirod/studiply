/**
 * @jest-environment jsdom
 */
// Tables (step 4.5) on a real editor: insert, rows and columns, header row,
// cell colour, and a pasted cell's shading.
import { Editor, type JSONContent } from '@tiptap/core';
import { AllSelection, NodeSelection } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';

import { studiplyExtensions } from '../bridges';
import { formatState, runFormat, type TableAction } from '../format';
import '../../test-utils/clipboardEvent';

let editor: Editor;
afterEach(() => editor?.destroy());

const table = (): JSONContent => (editor.getJSON().content ?? []).find((n) => n.type === 'table')!;
const size = () => {
  const rows = table().content ?? [];
  return [rows.length, rows[0]?.content?.length ?? 0];
};
const act = (action: TableAction, extra: object = {}) => runFormat(editor, { type: 'table', action, ...extra });

function openWithTable(rows = 3, cols = 3) {
  editor = new Editor({ extensions: studiplyExtensions(), content: { type: 'doc', content: [{ type: 'paragraph' }] } });
  editor.commands.focus('start');
  act('insert', { rows, cols });
  // Into the first cell.
  editor.commands.setTextSelection(4);
}

describe('tables', () => {
  it('inserts a 3 × 3 table and reports the cursor is in it', () => {
    openWithTable();
    expect(size()).toEqual([3, 3]);
    expect(formatState(editor)).toMatchObject({ inTable: true, headerRow: false, cellColor: null });
  });

  it('adds and deletes rows and columns, then the whole table', () => {
    openWithTable(2, 2);
    act('rowBelow');
    act('columnRight');
    expect(size()).toEqual([3, 3]);
    act('rowAbove');
    act('columnLeft');
    expect(size()).toEqual([4, 4]);
    act('deleteRow');
    act('deleteColumn');
    expect(size()).toEqual([3, 3]);
    act('deleteTable');
    expect((editor.getJSON().content ?? []).some((n) => n.type === 'table')).toBe(false);
  });

  // Test A: "Delete table doesn't work". Every way of being in a table.
  const tablePos = () => {
    let at = -1;
    editor.state.doc.forEach((n, off) => {
      if (n.type.name === 'table' && at < 0) at = off;
    });
    return at;
  };
  /** Position of cell (row, col), just before it, in a table without merged cells. */
  const cellPos = (row: number, col: number) => {
    const t = editor.state.doc.nodeAt(tablePos())!;
    let pos = tablePos() + 1;
    for (let r = 0; r < row; r++) pos += t.child(r).nodeSize;
    pos += 1;
    for (let c = 0; c < col; c++) pos += t.child(row).child(c).nodeSize;
    return pos;
  };
  const select = (sel: (doc: typeof editor.state.doc) => import('@tiptap/pm/state').Selection) => editor.view.dispatch(editor.state.tr.setSelection(sel(editor.state.doc)));
  const gone = () => !(editor.getJSON().content ?? []).some((n) => n.type === 'table');

  it.each([
    ['the cursor in a cell', () => editor.commands.setTextSelection(cellPos(1, 1) + 2)],
    ['cells selected', () => select((d) => CellSelection.create(d, cellPos(0, 0), cellPos(1, 1)))],
    ['a whole row selected', () => select((d) => CellSelection.rowSelection(d.resolve(cellPos(1, 0))))],
    ['a whole column selected', () => select((d) => CellSelection.colSelection(d.resolve(cellPos(0, 2))))],
    ['the table itself selected', () => select((d) => NodeSelection.create(d, tablePos()))],
    ['after header row and a cell colour', () => {
      act('headerRow');
      act('cellColor', { color: '#D6E8FF' });
    }],
  ])('deletes the table with %s', (_, place) => {
    openWithTable();
    place();
    expect(formatState(editor).inTable).toBe(true);
    expect(act('deleteTable')).toBe(true);
    expect(gone()).toBe(true);
  });

  it('deletes every selected row, and every selected column', () => {
    openWithTable(4, 4);
    select((d) => CellSelection.create(d, cellPos(1, 0), cellPos(2, 0)));
    expect(act('deleteRow')).toBe(true);
    expect(size()).toEqual([2, 4]);
    select((d) => CellSelection.colSelection(d.resolve(cellPos(0, 1)), d.resolve(cellPos(0, 2))));
    expect(act('deleteColumn')).toBe(true);
    expect(size()).toEqual([2, 2]);
  });

  it('shows no table tools when the selection only passes through a table (select all)', () => {
    openWithTable();
    select((d) => new AllSelection(d));
    expect(formatState(editor).inTable).toBe(false);
  });

  it('turns the header row on and off', () => {
    openWithTable();
    act('headerRow');
    expect(formatState(editor).headerRow).toBe(true);
    expect(table().content?.[0].content?.every((c) => c.type === 'tableHeader')).toBe(true);
    act('headerRow');
    expect(formatState(editor).headerRow).toBe(false);
  });

  it('colours a cell and reads the colour back', () => {
    openWithTable();
    act('cellColor', { color: '#D6E8FF' });
    expect(formatState(editor).cellColor).toBe('#D6E8FF');
    expect(table().content?.[0].content?.[0].attrs?.backgroundColor).toBe('#D6E8FF');
    expect(editor.getHTML()).toContain('data-background="#D6E8FF"');
    act('cellColor', { color: null });
    expect(formatState(editor).cellColor).toBeNull();
  });

  it('keeps a pasted cell\'s shading as its colour, not as a highlight', () => {
    editor = new Editor({ extensions: studiplyExtensions(), content: { type: 'doc', content: [{ type: 'paragraph' }] } });
    editor.commands.focus('start');
    editor.view.pasteHTML('<table><tr><td style="background:#FFF2CC;border:solid windowtext 1pt"><p>Término</p></td><td><p>Def</p></td></tr></table>');
    const cell = table().content?.[0].content?.[0];
    expect(cell?.attrs?.backgroundColor).toBe('#FFF2CC');
    expect(JSON.stringify(cell)).not.toContain('highlight');
  });
});
