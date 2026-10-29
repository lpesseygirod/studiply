/**
 * @jest-environment jsdom
 */
// Typing shortcuts (after test C): "- ", "1. ", "[] ", "# ", "> ", $$…$$
// and the Markdown marks work in Studiply's editor (Tiptap 3.32's own runner
// gave up on every one, as the block plugin stamps each edit), the block
// keeps its id and becomes the student's, and Backspace right after gives
// back what was typed.
import { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';

import { studiplyExtensions } from '../bridges';

let editor: Editor;
afterEach(() => editor?.destroy());

const open = (text = '') => {
  editor = new Editor({
    extensions: studiplyExtensions(),
    content: { type: 'doc', content: [{ type: 'paragraph', attrs: { blockId: 'b1', origin: 'ai' }, content: text ? [{ type: 'text', text }] : [] }] },
  });
  editor.commands.focus('end');
};
// Typing as the keyboard does: each character through the text handlers, else inserted.
const type = (text: string) => {
  for (const ch of text) {
    const { from, to } = editor.state.selection;
    const handled = editor.view.someProp('handleTextInput', (f) => f(editor.view, from, to, ch, () => editor.state.tr.insertText(ch, from, to)));
    if (!handled) editor.view.dispatch(editor.state.tr.insertText(ch, from, to));
  }
};
const key = (k: string, mods: KeyboardEventInit = {}) =>
  editor.view.someProp('handleKeyDown', (f) => f(editor.view, new KeyboardEvent('keydown', { key: k, ...mods })));
const first = (): PMNode => editor.state.doc.child(0);
const blocks = () => editor.getJSON().content ?? [];

describe('typing shortcuts', () => {
  it.each([
    ['- ', 'bulletList'],
    ['* ', 'bulletList'],
    ['1. ', 'orderedList'],
    ['[] ', 'taskList'],
    ['[x] ', 'taskList'],
    ['> ', 'blockquote'],
  ])('"%s" at the start of a line → %s', (typed, block) => {
    open();
    type(typed);
    expect(first().type.name).toBe(block);
    expect(first().textContent).toBe('');
    type('Hola');
    expect(first().textContent).toBe('Hola');
  });

  it('"3. " starts a numbered list at 3; "[x] " a checked item', () => {
    open();
    type('3. ');
    expect(first().attrs.start).toBe(3);
    editor.commands.setContent({ type: 'doc', content: [{ type: 'paragraph' }] });
    editor.commands.focus('end');
    type('[x] ');
    expect(first().child(0).attrs.checked).toBe(true);
  });

  it('# / ## / ### → Heading 1, Heading 2, Subheading; #### stays text', () => {
    for (const [typed, level] of [['# ', 1], ['## ', 2], ['### ', 3]] as const) {
      open();
      type(typed);
      expect(first().type.name).toBe('heading');
      expect(first().attrs.level).toBe(level);
    }
    open();
    type('#### ');
    expect(first().type.name).toBe('paragraph');
    expect(first().textContent).toBe('#### ');
  });

  it('only at the start of a line: "a - b" stays text', () => {
    open('a');
    type(' - b');
    expect(first().type.name).toBe('paragraph');
    expect(first().textContent).toBe('a - b');
  });

  it("the block keeps its id and becomes the student's, with a time", () => {
    open();
    type('# ');
    expect(first().attrs.blockId).toBe('b1');
    expect(first().attrs.origin).toBe('student');
    expect(typeof first().attrs.editedAt).toBe('number');
  });

  it('Backspace right after gives back what was typed; not once more is typed', () => {
    open();
    type('- ');
    expect(first().type.name).toBe('bulletList');
    key('Backspace');
    expect(first().type.name).toBe('paragraph');
    expect(first().textContent).toBe('- ');

    open();
    type('$x^2$');
    expect(blocks()[0].content).toEqual([{ type: 'inlineMath', attrs: { latex: 'x^2' } }]);
    key('Backspace');
    expect(first().textContent).toBe('$x^2$');

    // Typing on in between: Backspace no longer takes the shortcut back (it deletes, as the browser does).
    open();
    type('# Tema');
    key('Backspace');
    expect(first().type.name).toBe('heading');
    expect(first().textContent).toBe('Tema');
  });

  it('Undo takes the shortcut back, leaving the text typed before it', () => {
    open();
    type('-');
    type(' ');
    expect(first().type.name).toBe('bulletList');
    editor.commands.undo();
    expect(first().type.name).toBe('paragraph');
    expect(first().textContent).toBe('-');
  });

  it('$$x^2$$ alone on a line: a display formula, a new line after it for the cursor', () => {
    open();
    type('$$x^2$$');
    expect(blocks().map((b) => b.type)).toEqual(['blockMath', 'paragraph']);
    expect(blocks()[0].attrs?.latex).toBe('x^2');
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
    expect(editor.state.selection.from).toBe(first().nodeSize + 1);
    type('y');
    expect(editor.state.doc.child(1).textContent).toBe('y');
  });

  it('$$x$$ in a sentence: an inline formula', () => {
    open('El área es ');
    type('$$\\pi r^2$$');
    expect(blocks()[0].content).toEqual([
      { type: 'text', text: 'El área es ' },
      { type: 'inlineMath', attrs: { latex: '\\pi r^2' } },
    ]);
  });

  it('$…$ as before: money stays text', () => {
    open();
    type('Cuesta $5 and $10');
    expect(first().textContent).toBe('Cuesta $5 and $10');
  });

  it('**bold**, *italic*, ~~strike~~, ==highlight==; 2*3*4 stays text', () => {
    open();
    type('Es **muy** importante');
    const runs = (blocks()[0].content ?? []) as { text: string; marks?: { type: string }[] }[];
    expect(runs.map((r) => [r.text, (r.marks ?? []).map((m) => m.type).join()])).toEqual([
      ['Es ', ''],
      ['muy', 'bold'],
      [' importante', ''],
    ]);
    for (const [typed, mark] of [['*a*', 'italic'], ['~~a~~', 'strike'], ['==a==', 'highlight']] as const) {
      open();
      type(`x ${typed}`);
      const last = (blocks()[0].content ?? []).at(-1) as { text: string; marks?: { type: string }[] };
      expect(last.text).toBe('a');
      expect(last.marks?.[0].type).toBe(mark);
    }
    open();
    type('2*3*4');
    expect(first().textContent).toBe('2*3*4');
  });

  it('applied once: one change for the typed space and the list', () => {
    open();
    const seen: number[] = [];
    editor.on('transaction', ({ transaction }) => {
      if (transaction.docChanged && !transaction.getMeta('appendedTransaction')) seen.push(transaction.steps.length);
    });
    type('- ');
    // "-" typed, then the space and the list together.
    expect(seen).toHaveLength(2);
    expect(first().type.name).toBe('bulletList');
  });
});
