/**
 * @jest-environment jsdom
 */
// Comments on a real editor: add on the selected words, edit,
// resolve and reopen, delete, select; several on the same words; JSON and
// HTML keep them; they travel with their block when two devices merge.
import { Editor, type JSONContent } from '@tiptap/core';

import { studiplyExtensions } from '../bridges';
import { makeDocEdit, mergeDocEdit } from '../docBlocks';
import { formatState, runFormat } from '../format';
import { COMMENT_CLICK_EVENT, COMMENT_EVENT, listComments } from '../schema/comments';
import type { DocJSON } from '../types';

let editor: Editor;
afterEach(() => editor?.destroy());

const TEXT = 'La conducta humana es compleja';
function open(content: JSONContent[] = [{ type: 'paragraph', content: [{ type: 'text', text: TEXT }] }]) {
  editor = new Editor({ extensions: studiplyExtensions(), content: { type: 'doc', content } });
  return editor;
}
// "conducta" is 4..12 in the text, 5..13 in the document.
const selectConducta = () => editor.commands.setTextSelection({ from: 4, to: 12 });
const comments = () => listComments(editor.state.doc);
const add = (id: string, text: string) => runFormat(editor, { type: 'comment', action: 'add', id, text });

describe('comments', () => {
  it('a comment on the selected words: listed with the words it is about, and the text keeps its words', () => {
    open();
    selectConducta();
    expect(formatState(editor).canComment).toBe(true);
    add('c1', '¿Qué autores?');
    expect(comments()).toEqual([expect.objectContaining({ id: 'c1', text: '¿Qué autores?', resolved: false, quote: 'conducta', from: 4, to: 12 })]);
    expect(comments()[0].createdAt).toBeGreaterThan(0);
    expect(editor.getText()).toBe(TEXT);
    expect(formatState(editor).comments).toHaveLength(1);
  });

  it('nothing selected, or only spaces: no comment', () => {
    open();
    editor.commands.setTextSelection(3);
    expect(formatState(editor).canComment).toBe(false);
    expect(add('c1', 'x')).toBe(false);
    selectConducta();
    expect(add('c1', '   ')).toBe(false);
    expect(comments()).toEqual([]);
  });

  it('the cursor in commented text: the format state has that comment (the iPhone shows its button)', () => {
    open();
    selectConducta();
    add('c1', 'Nota');
    editor.commands.setTextSelection(7);
    expect(formatState(editor).comment).toMatchObject({ id: 'c1', text: 'Nota' });
    editor.commands.setTextSelection(20);
    expect(formatState(editor).comment).toBeNull();
  });

  it('edit, resolve, reopen, delete', () => {
    open();
    selectConducta();
    add('c1', 'Nota');
    runFormat(editor, { type: 'comment', action: 'edit', id: 'c1', text: 'Nota corregida' });
    expect(comments()[0].text).toBe('Nota corregida');
    runFormat(editor, { type: 'comment', action: 'resolve', id: 'c1', resolved: true });
    expect(comments()[0].resolved).toBe(true);
    // Resolved text keeps a faint mark.
    expect(editor.getHTML()).toContain('studiply-comment resolved');
    runFormat(editor, { type: 'comment', action: 'resolve', id: 'c1', resolved: false });
    expect(comments()[0].resolved).toBe(false);
    runFormat(editor, { type: 'comment', action: 'delete', id: 'c1' });
    expect(comments()).toEqual([]);
    expect(editor.getText()).toBe(TEXT);
  });

  it('select puts the selection on its words', () => {
    open();
    selectConducta();
    add('c1', 'Nota');
    editor.commands.setTextSelection(1);
    runFormat(editor, { type: 'comment', action: 'select', id: 'c1' });
    expect(editor.state.selection).toMatchObject({ from: 4, to: 12 });
  });

  it('two comments on overlapping words stay two', () => {
    open();
    selectConducta();
    add('c1', 'Uno');
    editor.commands.setTextSelection({ from: 4, to: 19 });
    add('c2', 'Dos');
    expect(comments().map((c) => [c.id, c.quote])).toEqual([
      ['c1', 'conducta'],
      ['c2', 'conducta humana'],
    ]);
    runFormat(editor, { type: 'comment', action: 'delete', id: 'c1' });
    expect(comments().map((c) => [c.id, c.quote])).toEqual([['c2', 'conducta humana']]);
  });

  it('typing at the edge of commented words does not extend the comment', () => {
    open();
    selectConducta();
    add('c1', 'Nota');
    editor.commands.setTextSelection(12);
    editor.commands.insertContent('s');
    expect(comments()[0].quote).toBe('conducta');
  });

  it('JSON and HTML keep the comment (copied into another document, it is the same)', () => {
    open();
    selectConducta();
    add('c1', 'Nota "con comillas" & más');
    runFormat(editor, { type: 'comment', action: 'resolve', id: 'c1', resolved: true });
    const other = new Editor({ extensions: studiplyExtensions(), content: editor.getHTML() });
    expect(listComments(other.state.doc)).toEqual([expect.objectContaining({ id: 'c1', text: 'Nota "con comillas" & más', resolved: true, quote: 'conducta' })]);
    other.destroy();
    const json = editor.getJSON();
    const again = new Editor({ extensions: studiplyExtensions(), content: json });
    expect(listComments(again.state.doc)[0]).toMatchObject({ id: 'c1', resolved: true });
    again.destroy();
  });

  it('travels with its block: a comment added on one device merges into the server copy', () => {
    open();
    // As a document is opened: loaded with its blocks' ids.
    editor.commands.loadDoc({
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { blockId: 'a' }, content: [{ type: 'text', text: TEXT }] },
        { type: 'paragraph', attrs: { blockId: 'b' }, content: [{ type: 'text', text: 'Otro párrafo' }] },
      ],
    });
    const base = editor.getJSON() as DocJSON;
    selectConducta();
    add('c1', 'Nota');
    const next = editor.getJSON() as DocJSON;
    const edit = makeDocEdit({ id: 'e1', device: 'laptop', base, next, now: Date.now() })!;
    // Only the commented block changed.
    expect(Object.keys(edit.changes)).toEqual(['a']);
    const merged = mergeDocEdit(base, edit).doc;
    const check = new Editor({ extensions: studiplyExtensions(), content: merged });
    expect(listComments(check.state.doc)).toEqual([expect.objectContaining({ id: 'c1', text: 'Nota', quote: 'conducta' })]);
    check.destroy();
  });

  // jsdom isn't a Mac, so ⌘ (Mod) is Ctrl here.
  it('⌘⌥M asks the laptop for the composer; a click on commented text says which comment', () => {
    open();
    selectConducta();
    add('c1', 'Nota');
    const asked: unknown[] = [];
    const clicked: unknown[] = [];
    editor.view.dom.addEventListener(COMMENT_EVENT, () => asked.push(true));
    editor.view.dom.addEventListener(COMMENT_CLICK_EVENT, (e) => clicked.push((e as CustomEvent).detail));
    editor.view.someProp('handleKeyDown', (f) => f(editor.view, new KeyboardEvent('keydown', { key: 'm', code: 'KeyM', ctrlKey: true, altKey: true })));
    expect(asked.length).toBeGreaterThan(0);
    editor.view.someProp('handleClick', (f) => f(editor.view, 7, new MouseEvent('click', { clientX: 10, clientY: 20 })));
    expect(clicked).toEqual([{ ids: ['c1'], x: 10, y: 32 }]);
  });
});
