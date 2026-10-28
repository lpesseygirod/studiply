/**
 * @jest-environment jsdom
 */
// Tables (step 4.5) on a real editor: insert, rows and columns, header row,
// cell colour, and a pasted cell's shading.
import { Editor, type JSONContent } from '@tiptap/core';

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
