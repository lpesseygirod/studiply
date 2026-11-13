/**
 * @jest-environment jsdom
 */
// Formulas on a real editor: put in, changed as the student
// types (it stays selected), inline ↔ display, removed, done; JSON and HTML
// round trips; a click asks for the editor; KaTeX draws it.
import { Editor, type JSONContent } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';

import { studiplyExtensions } from '../bridges';
import { formatState, runFormat } from '../format';
import { FORMULA_EVENT } from '../schema/formula';

const COMPOUND = 'A = P\\left(1 + \\frac{r}{n}\\right)^{nt}';

let editor: Editor;
afterEach(() => editor?.destroy());

function open(content: JSONContent[] = [{ type: 'paragraph', content: [{ type: 'text', text: 'Interés: ' }] }]) {
  editor = new Editor({ extensions: studiplyExtensions(), content: { type: 'doc', content } });
  return editor;
}
const set = (latex: string, display = false) => runFormat(editor, { type: 'formula', action: 'set', latex, display });
const blocks = () => editor.getJSON().content ?? [];
const inlineOf = (block: JSONContent | undefined) => (block?.content ?? []).filter((n) => n.type === 'inlineMath');

describe('formulas', () => {
  it('puts the compound-interest formula where the cursor is, inline, and keeps it selected', () => {
    open();
    editor.commands.setTextSelection(10);
    set(COMPOUND);
    expect(inlineOf(blocks()[0])).toEqual([{ type: 'inlineMath', attrs: { latex: COMPOUND } }]);
    expect(formatState(editor).formula).toEqual({ latex: COMPOUND, display: false });
  });

  it('typing changes the same formula (the text is the preview), not a new one each time', () => {
    open();
    editor.commands.setTextSelection(10);
    set('A');
    set('A =');
    set('A = P');
    expect(inlineOf(blocks()[0]).map((n) => n.attrs?.latex)).toEqual(['A = P']);
  });

  it('inline ↔ display: the formula becomes a block of its own, and back', () => {
    open([{ type: 'paragraph' }]);
    set(COMPOUND);
    set(COMPOUND, true);
    expect(blocks().filter((b) => b.type === 'blockMath')).toEqual([expect.objectContaining({ attrs: expect.objectContaining({ latex: COMPOUND }) })]);
    expect(formatState(editor).formula).toEqual({ latex: COMPOUND, display: true });
    expect(blocks().flatMap(inlineOf)).toEqual([]);
    set(COMPOUND, false);
    expect(blocks().some((b) => b.type === 'blockMath')).toBe(false);
    expect(blocks().flatMap(inlineOf)).toHaveLength(1);
  });

  it('a display formula is a block with its own id (it merges and versions like the others)', () => {
    open([{ type: 'paragraph' }]);
    set('E = mc^2', true);
    const block = blocks().find((b) => b.type === 'blockMath');
    expect(block?.attrs?.blockId).toEqual(expect.any(String));
  });

  it('done: the cursor goes after it; an empty formula goes away', () => {
    open();
    editor.commands.setTextSelection(10);
    set('x^2');
    runFormat(editor, { type: 'formula', action: 'done' });
    expect(formatState(editor).formula).toBeNull();
    expect(editor.state.selection.from).toBe(11);
    set('y');
    set('');
    runFormat(editor, { type: 'formula', action: 'done' });
    expect(inlineOf(blocks()[0]).map((n) => n.attrs?.latex)).toEqual(['x^2']);
  });

  it('a display formula at the end leaves a line to type in after it; Done goes there', async () => {
    open([{ type: 'paragraph', content: [{ type: 'text', text: 'Tabla:' }] }, { type: 'paragraph' }]);
    editor.commands.setTextSelection(9);
    set('E = mc^2', true);
    // The room paragraph comes from a plugin a moment later (as after a table).
    await new Promise((r) => setTimeout(r, 0));
    expect(blocks().map((b) => b.type)).toEqual(['paragraph', 'blockMath', 'paragraph']);
    runFormat(editor, { type: 'formula', action: 'done' });
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
    expect(editor.state.selection.from).toBeGreaterThan(9);
    // The toolbar's state reads fine there.
    expect(() => formatState(editor)).not.toThrow();
  });

  it('remove deletes the selected formula', () => {
    open();
    editor.commands.setTextSelection(10);
    set('x^2');
    runFormat(editor, { type: 'formula', action: 'remove' });
    expect(inlineOf(blocks()[0])).toEqual([]);
  });

  it('JSON and HTML keep the LaTeX (copied into another document, it is the same formula)', () => {
    open([
      { type: 'paragraph', content: [{ type: 'text', text: 'a ' }, { type: 'inlineMath', attrs: { latex: COMPOUND } }] },
      { type: 'blockMath', attrs: { latex: '\\int_{a}^{b} f(x)\\,dx' } },
    ]);
    const other = new Editor({ extensions: studiplyExtensions(), content: editor.getHTML() });
    const json = other.getJSON().content ?? [];
    expect(inlineOf(json[0])[0]?.attrs?.latex).toBe(COMPOUND);
    expect(json.find((b) => b.type === 'blockMath')?.attrs?.latex).toBe('\\int_{a}^{b} f(x)\\,dx');
    other.destroy();
  });

  it('KaTeX draws it; LaTeX that is not valid shows as text instead of breaking the page', () => {
    open([{ type: 'paragraph', content: [{ type: 'inlineMath', attrs: { latex: COMPOUND } }, { type: 'inlineMath', attrs: { latex: '\\frac{' } }] }]);
    const rendered = editor.view.dom.querySelectorAll('[data-type="inline-math"]');
    expect(rendered).toHaveLength(2);
    expect(rendered[0].querySelector('.katex')).not.toBeNull();
    expect(rendered[1].textContent).toContain('\\frac{');
  });

  it('a click on a formula selects it and asks for its editor (laptop: an event; iPhone: the request in the state)', () => {
    open([{ type: 'paragraph', content: [{ type: 'text', text: 'a ' }, { type: 'inlineMath', attrs: { latex: 'x^2' } }] }]);
    const events: unknown[] = [];
    editor.view.dom.addEventListener(FORMULA_EVENT, (e) => events.push((e as CustomEvent).detail));
    let nodePos = -1;
    editor.state.doc.descendants((n, pos) => {
      if (n.type.name === 'inlineMath') nodePos = pos;
    });
    const node = editor.state.doc.nodeAt(nodePos)!;
    const before = formatState(editor).formulaRequest;
    const handled = editor.view.someProp('handleClickOn', (f) => f(editor.view, nodePos, node, nodePos, new MouseEvent('click'), true));
    expect(handled).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(formatState(editor).formula).toEqual({ latex: 'x^2', display: false });
    expect(formatState(editor).formulaRequest?.id).not.toBe(before?.id);
    expect(events).toHaveLength(1);
  });

  it('read only (a version preview): a click does nothing', () => {
    open([{ type: 'paragraph', content: [{ type: 'inlineMath', attrs: { latex: 'x^2' } }] }]);
    editor.setEditable(false);
    const node = editor.state.doc.nodeAt(1)!;
    expect(editor.view.someProp('handleClickOn', (f) => f(editor.view, 1, node, 1, new MouseEvent('click'), true))).toBeFalsy();
  });
});
