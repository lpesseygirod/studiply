/**
 * @jest-environment jsdom
 */
// Room to type around tables (test A): a paragraph after every
// table and at the end, the same on two devices, Enter above a table at the
// top, and the gap cursor.
import { Editor, type JSONContent } from '@tiptap/core';
import { GapCursor } from '@tiptap/pm/gapcursor';
import { TextSelection } from '@tiptap/pm/state';

import { studiplyExtensions } from '../bridges';
import { makeDocEdit, mergeDocEdit } from '../docBlocks';
import { runFormat } from '../format';
import type { DocJSON } from '../types';
import '../../test-utils/clipboardEvent';

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach((e) => e.destroy()));

/** An editor with `content`, after Tiptap's create event (a tick later), as in the app. */
const open = async (content: JSONContent) => {
  const editor = new Editor({ extensions: studiplyExtensions(), content });
  editors.push(editor);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return editor;
};
const types = (editor: Editor) => (editor.getJSON().content ?? []).map((n) => n.type);
const para = (text = '') => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] });
const cell = (text: string) => ({ type: 'tableCell', content: [para(text)] });
const table = (attrs: object = {}) => ({ type: 'table', attrs, content: [{ type: 'tableRow', content: [cell('a1'), cell('a2')] }, { type: 'tableRow', content: [cell('b1'), cell('b2')] }] });

describe('a paragraph after tables', () => {
  it('leaves a line to type in after a table inserted on a blank last line', async () => {
    const editor = await open({ type: 'doc', content: [para()] });
    editor.commands.focus('end');
    runFormat(editor, { type: 'table', action: 'insert', rows: 2, cols: 2 });
    expect(types(editor)).toEqual(['table', 'paragraph']);
    // The cursor is in the first cell; the end of the document is the paragraph after.
    expect(editor.state.selection.$from.node(-1).type.name).toBe('tableCell');
    editor.commands.focus('end');
    editor.commands.insertContent('Después');
    expect(editor.state.doc.child(1).textContent).toBe('Después');
  });

  it('adds it to a document given ending with a table, with an id from the table', async () => {
    const editor = await open({ type: 'doc', content: [para('Antes'), table({ blockId: 't1' })] });
    expect(types(editor)).toEqual(['paragraph', 'table', 'paragraph']);
    expect(editor.getJSON().content?.[2].attrs?.blockId).toBe('t1-after');
  });

  it('puts it back when the student deletes it', async () => {
    const editor = await open({ type: 'doc', content: [para('Antes'), table({ blockId: 't1' })] });
    const end = editor.state.doc.content.size;
    editor.view.dispatch(editor.state.tr.delete(end - 2, end));
    expect(types(editor)).toEqual(['paragraph', 'table', 'paragraph']);
  });

  it('adds one between two tables, none before a heading, and one after a photo or page break at the end', async () => {
    expect(types(await open({ type: 'doc', content: [table(), table(), { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Tema' }] }] }))).toEqual(['table', 'paragraph', 'table', 'heading']);
    expect(types(await open({ type: 'doc', content: [para('x'), { type: 'pageBreak' }] }))).toEqual(['paragraph', 'pageBreak', 'paragraph']);
  });

  it('is not in Undo', async () => {
    const editor = await open({ type: 'doc', content: [para('Antes')] });
    editor.commands.focus('end');
    runFormat(editor, { type: 'table', action: 'insert', rows: 2, cols: 2 });
    editor.commands.undo();
    expect(types(editor)).not.toContain('table');
  });

  it('is the same block on two devices, so merging their edits keeps one', async () => {
    const server: DocJSON = { type: 'doc', content: [{ ...para('Antes'), attrs: { blockId: 'p1' } }, table({ blockId: 't1' })] };
    const iphone = (await open(server)).getJSON() as DocJSON;
    const laptop = (await open(server)).getJSON() as DocJSON;
    const fromLaptop = makeDocEdit({ id: 'e1', device: 'laptop', base: server, next: laptop, now: 1 })!;
    const afterLaptop = mergeDocEdit(server, fromLaptop).doc;
    const fromIphone = makeDocEdit({ id: 'e2', device: 'iphone', base: server, next: iphone, now: 2 })!;
    const merged = mergeDocEdit(afterLaptop, fromIphone).doc;
    expect((merged.content ?? []).map((b) => b.attrs?.blockId)).toEqual(['p1', 't1', 't1-after']);
  });
});

describe('a line above a table at the top', () => {
  const pressEnter = (editor: Editor) =>
    editor.view.someProp('handleKeyDown', (f) => f(editor.view, new KeyboardEvent('keydown', { key: 'Enter' })));

  it('Enter at the start of the first cell adds an empty line above, with the cursor in it', async () => {
    const editor = await open({ type: 'doc', content: [table()] });
    editor.commands.setTextSelection(4);
    expect(editor.state.selection.$from.parentOffset).toBe(0);
    pressEnter(editor);
    expect(types(editor)).toEqual(['paragraph', 'table', 'paragraph']);
    expect(editor.state.selection.from).toBe(1);
  });

  it('leaves Enter alone inside the cell text, or when a line already comes before', async () => {
    const editor = await open({ type: 'doc', content: [table()] });
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 5)));
    pressEnter(editor);
    expect(types(editor)).toEqual(['table', 'paragraph']);
    const withLine = await open({ type: 'doc', content: [para('Antes'), table()] });
    withLine.commands.setTextSelection(11);
    expect(withLine.state.selection.$from.node(-1).type.name).toBe('tableCell');
    pressEnter(withLine);
    expect(types(withLine)[0]).toBe('paragraph');
    expect(types(withLine).filter((t) => t === 'paragraph')).toHaveLength(2);
  });

  it('types a new line at the gap cursor before a table at the very top', async () => {
    const editor = await open({ type: 'doc', content: [table()] });
    editor.view.dispatch(editor.state.tr.setSelection(new GapCursor(editor.state.doc.resolve(0))));
    // The gap cursor's own input handling makes the paragraph; the browser then types the letter into it.
    editor.view.dom.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'T', cancelable: true }));
    editor.commands.insertContent('Título');
    expect(types(editor)[0]).toBe('paragraph');
    expect(editor.state.doc.child(0).textContent).toBe('Título');
  });
});
