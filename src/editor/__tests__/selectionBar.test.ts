/**
 * @jest-environment jsdom
 */
// The selection bar (after test B): for selected words only (not an empty
// cursor, cells, a photo or a formula); its Comment and Link reach the
// device (an event on the laptop, the format state on the iPhone).
import { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';

import { studiplyExtensions } from '../bridges';
import { formatState, runFormat } from '../format';
import { selectionBarKey, showsSelectionBar } from '../format/selectionBar';

let editor: Editor;
afterEach(() => editor?.destroy());

const open = () => {
  editor = new Editor({
    extensions: studiplyExtensions(),
    content: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'La conducta humana' }, { type: 'inlineMath', attrs: { latex: 'x^2' } }] },
        { type: 'image', attrs: { src: 'https://example.com/a.png' } },
        { type: 'paragraph' },
      ],
    },
  });
};

describe('selection bar', () => {
  it('shows for selected words; not for a cursor, spaces, a photo or a formula', () => {
    open();
    editor.commands.setTextSelection({ from: 4, to: 12 });
    expect(showsSelectionBar(editor)).toBe(true);
    editor.commands.setTextSelection(4);
    expect(showsSelectionBar(editor)).toBe(false);
    let photo = -1;
    let formula = -1;
    editor.state.doc.descendants((n, pos) => {
      if (n.type.name === 'image') photo = pos;
      if (n.type.name === 'inlineMath') formula = pos;
    });
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, photo)));
    expect(showsSelectionBar(editor)).toBe(false);
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, formula)));
    expect(showsSelectionBar(editor)).toBe(false);
  });

  it('not for cells selected in a table (the table bar is there)', () => {
    open();
    editor.commands.setTextSelection(1);
    runFormat(editor, { type: 'table', action: 'insert', rows: 2, cols: 2 });
    let first = -1;
    let last = -1;
    editor.state.doc.descendants((n, pos) => {
      if (n.type.name === 'tableCell') {
        if (first < 0) first = pos;
        last = pos;
      }
    });
    editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, first, last)));
    expect(showsSelectionBar(editor)).toBe(false);
  });

  it('a press on Comment or Link is in the format state for the iPhone (a new id each time)', () => {
    open();
    expect(formatState(editor).selectionRequest).toBeNull();
    editor.view.dispatch(editor.state.tr.setMeta(selectionBarKey, { id: 1, button: 'comment' }));
    expect(formatState(editor).selectionRequest).toEqual({ id: 1, button: 'comment' });
    editor.view.dispatch(editor.state.tr.setMeta(selectionBarKey, { id: 2, button: 'link' }));
    expect(formatState(editor).selectionRequest).toEqual({ id: 2, button: 'link' });
  });
});
