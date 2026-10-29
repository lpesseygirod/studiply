/**
 * @jest-environment jsdom
 */
// The formula library and its formula cards (step 4.7c): every formula
// draws, search finds them (Spanish names too), a card goes in with its
// legend, stays editable, leaves and goes like a callout, and copies.
import { Editor, type JSONContent } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import katex from 'katex';

import { studiplyExtensions } from '../bridges';
import { runFormat } from '../format';
import { FORMULA_GROUPS, FORMULA_LIBRARY, searchFormulas } from '../formulas/library';

let editor: Editor;
afterEach(() => editor?.destroy());
const p = (text: string): JSONContent => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] });
const open = (content: JSONContent[]) => {
  editor = new Editor({ extensions: studiplyExtensions(), content: { type: 'doc', content } });
};
const blocks = (): JSONContent[] => editor.getJSON().content ?? [];
const key = (k: string) => editor.view.someProp('handleKeyDown', (f) => f(editor.view, new KeyboardEvent('keydown', { key: k })));
const text = (n: JSONContent | undefined): string => (n?.content ?? []).map((c) => c.text ?? (c.type === 'inlineMath' ? `[${c.attrs?.latex}]` : '')).join('');

describe('the library', () => {
  it.each(FORMULA_LIBRARY.map((e) => [e.name, e]))('%s: the formula and every legend symbol draw; each symbol is in the formula', (_name, e) => {
    expect(() => katex.renderToString(e.latex, { displayMode: true, throwOnError: true })).not.toThrow();
    for (const item of e.legend) {
      expect(() => katex.renderToString(item.symbol, { throwOnError: true })).not.toThrow();
      expect(e.latex).toContain(item.symbol);
    }
    expect(FORMULA_GROUPS).toContain(e.group);
  });

  it('ids are unique; every group is used', () => {
    expect(new Set(FORMULA_LIBRARY.map((e) => e.id)).size).toBe(FORMULA_LIBRARY.length);
    expect(new Set(FORMULA_LIBRARY.map((e) => e.group))).toEqual(new Set(FORMULA_GROUPS));
  });

  it.each([
    ['annuity', ['annuity']],
    ['VAN', ['npv']],
    ['wacc', ['wacc']],
    ['TIR', ['irr']],
    ['prestamo', ['annuity']],
    ['valor actual', ['present-value', 'npv']],
    ['cost of capital', ['wacc', 'capm']],
    ['desviacion', ['standard-deviation']],
    ['varianza', ['sample-variance', 'covariance']],
    ['intervalo de confianza', ['confidence-interval']],
    ['PIB', ['gdp', 'gdp-deflator', 'gdp-growth', 'okun']],
    ['IPC', ['inflation-rate']],
    ['curva de phillips', ['phillips-curve']],
    ['taylor', ['taylor-rule', 'taylor-series']],
    ['regla de la cadena', ['chain-rule']],
    ['barrow', ['fundamental-theorem']],
    ['hopital', ['lhopital']],
    ['xyzzy', []],
  ])('"%s" finds %j', (query, ids) => {
    expect(searchFormulas(query).map((e) => e.id)).toEqual(ids);
  });

  it('an empty search shows everything', () => {
    expect(searchFormulas('  ')).toHaveLength(FORMULA_LIBRARY.length);
  });
});

describe('formula cards', () => {
  it('go in after the line, with the title, the formula and the legend; an id and origin student', () => {
    open([p('Antes')]);
    editor.commands.focus('end');
    expect(runFormat(editor, { type: 'formulaCard', id: 'npv' })).toBe(true);
    const b = blocks();
    expect(b.map((n) => n.type)).toEqual(['paragraph', 'formulaCard', 'paragraph']);
    const card = b[1];
    expect(card.attrs).toMatchObject({ title: 'Net present value (NPV)', origin: 'student' });
    expect(typeof card.attrs?.blockId).toBe('string');
    expect(card.content?.[0]).toMatchObject({ type: 'blockMath', attrs: { latex: FORMULA_LIBRARY.find((e) => e.id === 'npv')!.latex } });
    expect(text(card.content?.[1])).toBe('[\\mathit{NPV}] net present value · [C_{0}] initial investment · [C_{t}] cash flow in year t · [r] discount rate · [T] last year');
    // The cursor waits on the line after the card.
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
    expect(editor.state.selection.$from.depth).toBe(1);
  });

  it('take the place of an empty line', () => {
    open([p('')]);
    editor.commands.focus('end');
    runFormat(editor, { type: 'formulaCard', id: 'capm' });
    expect(blocks().map((n) => n.type)).toEqual(['formulaCard', 'paragraph']);
  });

  it('an unknown id puts nothing in', () => {
    open([p('Antes')]);
    expect(runFormat(editor, { type: 'formulaCard', id: 'nope' })).toBe(false);
    expect(blocks().map((n) => n.type)).toEqual(['paragraph']);
  });

  it('editing the formula keeps the legend', () => {
    open([p('')]);
    editor.commands.focus('end');
    runFormat(editor, { type: 'formulaCard', id: 'present-value' });
    let math = -1;
    editor.state.doc.descendants((n, pos) => {
      if (n.type.name === 'blockMath') math = pos;
    });
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, math)));
    runFormat(editor, { type: 'formula', action: 'set', latex: '\\mathit{PV} = \\frac{100}{1.05^{3}}', display: true });
    const card = blocks()[0];
    expect(card.content?.[0].attrs?.latex).toBe('\\mathit{PV} = \\frac{100}{1.05^{3}}');
    expect(text(card.content?.[1])).toContain('[\\mathit{FV}] future value');
  });

  it('Enter on an empty last legend line leaves the card; Backspace in an empty card takes it away', () => {
    open([{ type: 'formulaCard', attrs: { title: 'Present value' }, content: [{ type: 'blockMath', attrs: { latex: 'x' } }, p('Leyenda'), p('')] }]);
    const end = editor.state.doc.child(0).nodeSize - 2;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, end)));
    key('Enter');
    expect(blocks().map((n) => n.type)).toEqual(['formulaCard', 'paragraph']);
    expect(blocks()[0].content).toHaveLength(2);
    expect(editor.state.selection.$from.depth).toBe(1);

    // Its only legend line empty: Enter still leaves, the card keeps the line.
    open([{ type: 'formulaCard', attrs: { title: 'Present value' }, content: [{ type: 'blockMath', attrs: { latex: 'x' } }, p('')] }]);
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, editor.state.doc.child(0).nodeSize - 2)));
    key('Enter');
    expect(blocks().map((n) => n.type)).toEqual(['formulaCard', 'paragraph']);
    expect(blocks()[0].content).toHaveLength(2);

    open([{ type: 'formulaCard', attrs: { title: '' }, content: [{ type: 'blockMath', attrs: { latex: '' } }, p('')] }, p('Después')]);
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, editor.state.doc.child(0).nodeSize - 2)));
    key('Backspace');
    expect(blocks().map((n) => n.type)).toEqual(['paragraph', 'paragraph']);
  });

  it('HTML: what is copied comes back the same', () => {
    open([p('')]);
    editor.commands.focus('end');
    runFormat(editor, { type: 'formulaCard', id: 'wacc' });
    const before = blocks()[0];
    const html = editor.getHTML();
    expect(html).toContain('data-formula-card');
    expect(html).toContain('data-title="WACC"');
    editor.commands.setContent(html);
    const after = blocks()[0];
    expect(after.type).toBe('formulaCard');
    expect(after.attrs?.title).toBe('WACC');
    expect(after.content?.[0].attrs?.latex).toBe(before.content?.[0].attrs?.latex);
    expect(text(after.content?.[1])).toBe(text(before.content?.[1]));
  });

  it('in a callout, the card goes inside it', () => {
    open([{ type: 'callout', attrs: { kind: 'exam' }, content: [p('Entra en el examen')] }]);
    editor.commands.setTextSelection(4);
    runFormat(editor, { type: 'formulaCard', id: 'perpetuity' });
    const b = blocks();
    expect(b.map((n) => n.type)).toEqual(['callout']);
    expect(b[0].content?.map((n) => n.type)).toEqual(['paragraph', 'formulaCard', 'paragraph']);
  });
});
