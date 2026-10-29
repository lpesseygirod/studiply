/**
 * @jest-environment jsdom
 */
// Graphs the student builds (step 4.7d): the data's limits and how numbers
// are read; the block put in, changed and taken out; copy and paste; what
// crosses to the iPhone. The drawing is the charts module's (its own tests).
import { Editor, type JSONContent } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';

import { studiplyExtensions } from '../bridges';
import { formatState, runFormat } from '../format';
import { commaDecimals, graphDescription, graphMarkup } from '../graph/charts';
import { cleanGraph, MAX_ROWS, NEW_GRAPH, planGraph, readNumber, usesDecimalComma, type GraphData } from '../graph/data';
import { LANG_EVENT } from '../schema/graph';

let editor: Editor;
afterEach(() => editor?.destroy());
const p = (text: string): JSONContent => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] });
const open = (content: JSONContent[]) => {
  editor = new Editor({ extensions: studiplyExtensions(), content: { type: 'doc', content } });
};
const blocks = (): JSONContent[] => editor.getJSON().content ?? [];
const graph = (data: Partial<GraphData> = {}): JSONContent => ({ type: 'graph', attrs: { ...NEW_GRAPH, ...data } });

describe('the data', () => {
  it.each([
    ['3', 3],
    ['3,5', 3.5],
    ['3.5', 3.5],
    ['-2', -2],
    ['1 200', 1200],
    ['1.200,50', 1200.5],
    ['1,200.50', 1200.5],
    ['', null],
    ['abc', null],
    ['3,', 3],
    ['-', null],
  ])('"%s" reads as %p', (cell, n) => expect(readNumber(cell)).toBe(n));

  it('keeps within the limits: 1–3 series, 50 rows, 60 characters, a known type', () => {
    const g = cleanGraph({ kind: 'donut', series: ['a', 'b', 'c', 'd'], rows: Array.from({ length: 80 }, () => ['x'.repeat(100), '1', '2', '3', '4']) });
    expect(g.kind).toBe('bar');
    expect(g.series).toEqual(['a', 'b', 'c']);
    expect(g.rows).toHaveLength(MAX_ROWS);
    expect(g.rows[0]).toHaveLength(4);
    expect(g.rows[0][0]).toHaveLength(60);
    expect(cleanGraph(null).series).toEqual(['Series 1']);
    expect(cleanGraph({ series: [], rows: [['a']] }).rows[0]).toEqual(['a', '']);
  });

  it('scatter: a row whose X is not a number is left out, and said', () => {
    const plan = planGraph(cleanGraph({ kind: 'scatter', series: ['Precio'], rows: [['1', '10'], ['dos', '20'], ['3', '30'], ['', '']] }));
    expect(plan.spec.labels).toEqual(['1', '3']);
    expect(plan.spec.series[0].values).toEqual([10, 30]);
    expect(plan.notes).toEqual(['1 row skipped: X must be a number.']);
  });

  it('pie: the first series only, and negative numbers are said', () => {
    const plan = planGraph(cleanGraph({ kind: 'pie', series: ['A', 'B'], rows: [['x', '5', '1'], ['y', '-2', '1']] }));
    expect(plan.spec.series).toEqual([{ name: 'A', values: [5, -2] }]);
    expect(plan.notes).toEqual(['Pie uses the first series.', 'Pie leaves out negative numbers.']);
  });

  it('nothing to draw until there is a number', () => {
    expect(planGraph(cleanGraph({ rows: [['a', ''], ['b', 'x']] })).drawable).toBe(false);
    expect(planGraph(NEW_GRAPH).drawable).toBe(true);
  });

  it('the drawing and its description never throw, whatever the cells', () => {
    const odd = planGraph(cleanGraph({ title: '<b>"x"</b>', rows: [['<script>', '1e309'], ['', '']] })).spec;
    expect(typeof graphMarkup(odd, 400)).toBe('string');
    expect(graphDescription(planGraph(cleanGraph({ title: 'Ventas', kind: 'line' })).spec)).toContain('Ventas');
  });
});

describe('decimals with a comma (Lea, 29 Oct)', () => {
  it('when a number was typed with one, or the document is in Spanish', () => {
    const typed = cleanGraph({ rows: [['T1', '18,5'], ['T2', '9']] });
    const plain = cleanGraph({ rows: [['T1', '18.5'], ['T2', '1,200.5']] });
    expect(usesDecimalComma(typed, 'en')).toBe(true);
    expect(usesDecimalComma(plain, 'en')).toBe(false);
    expect(usesDecimalComma(plain, 'es')).toBe(true);
    expect(usesDecimalComma(plain, 'es-ES')).toBe(true);
    expect(usesDecimalComma(cleanGraph({ rows: [['Grupo 1,2', '5']] }), null)).toBe(false);
  });

  it('only the drawing’s text changes, never its coordinates', () => {
    const svg = '<svg viewBox="0 0 420.5 252"><text x="12.5" y="3.25">18.5</text><text>12,000</text><text>1,234.75 €</text><text>2019</text><title>Peak 8.4 in 2022</title></svg>';
    expect(commaDecimals(svg)).toBe('<svg viewBox="0 0 420.5 252"><text x="12.5" y="3.25">18,5</text><text>12.000</text><text>1.234,75 €</text><text>2019</text><title>Peak 8,4 in 2022</title></svg>');
  });

  it('a graph redraws with commas when its page turns Spanish', () => {
    open([graph({ title: 'Ventas', rows: [['T1', '18.5'], ['T2', '9']] })]);
    const text = () => [...editor.view.dom.querySelectorAll('.studiply-graph-art svg text')].map((t) => t.textContent).join(' ');
    expect(text()).toContain('18.5');
    editor.view.dom.setAttribute('lang', 'es');
    document.dispatchEvent(new Event(LANG_EVENT));
    expect(text()).toContain('18,5');
    expect(text()).not.toContain('18.5');
  });
});

describe('the graph block', () => {
  it('goes in after the line as the example, selected, with its form asked for; an id and origin student', () => {
    open([p('Antes')]);
    editor.commands.focus('end');
    expect(runFormat(editor, { type: 'graph', action: 'insert' })).toBe(true);
    const b = blocks();
    expect(b.map((n) => n.type)).toEqual(['paragraph', 'graph', 'paragraph']);
    expect(b[1].attrs).toMatchObject({ kind: 'bar', series: ['Series 1'], origin: 'student' });
    expect(typeof b[1].attrs?.blockId).toBe('string');
    const s = formatState(editor);
    expect(s.graph).toEqual(NEW_GRAPH);
    expect(s.graphRequest?.pos).toBe(editor.state.selection.from);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
  });

  it('its data changes (cleaned) and it stays selected; Delete takes it out', () => {
    open([p(''), p('Después')]);
    editor.commands.focus('start');
    runFormat(editor, { type: 'graph', action: 'insert' });
    const next: GraphData = { ...NEW_GRAPH, kind: 'line', title: 'Ventas', series: ['2025', '2026'], rows: [['T1', '3', '4'], ['T2', '5', '6']] };
    expect(runFormat(editor, { type: 'graph', action: 'set', graph: next })).toBe(true);
    expect(formatState(editor).graph).toEqual(next);
    expect(blocks()[0].attrs).toMatchObject({ kind: 'line', title: 'Ventas', rows: [['T1', '3', '4'], ['T2', '5', '6']] });
    runFormat(editor, { type: 'graph', action: 'delete' });
    expect(blocks().some((n) => n.type === 'graph')).toBe(false);
  });

  it('the iPhone only gets a graph’s data while it is selected', () => {
    open([graph(), p('Texto')]);
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, editor.state.doc.content.size - 2)));
    expect(formatState(editor).graph).toBeNull();
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)));
    expect(formatState(editor).graph?.rows).toHaveLength(3);
  });

  it('HTML: what is copied comes back the same, with a description', () => {
    const data = { kind: 'scatter' as const, title: 'Precio y demanda', xLabel: 'Precio', yLabel: 'Demanda', series: ['Demanda'], rows: [['1', '10'], ['2', '8']] };
    open([graph(data)]);
    const html = editor.getHTML();
    expect(html).toContain('data-graph=');
    expect(html).toContain('<figcaption>Scatter plot: Precio y demanda');
    editor.commands.setContent(html);
    expect(blocks()[0]).toMatchObject({ type: 'graph', attrs: data });
  });

  it('a graph that never was valid is cleaned when it comes in', () => {
    open([{ type: 'graph', attrs: { kind: 'radar', series: 'nope', rows: [['a', 1]] } }]);
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)));
    expect(formatState(editor).graph).toMatchObject({ kind: 'bar', series: ['Series 1'], rows: [['a', '1']] });
  });

  it('draws the charts module’s SVG, its own title and description for screen readers; two graphs never share ids', () => {
    open([graph({ title: 'Ventas' }), graph({ kind: 'line', title: 'Ventas' })]);
    const svgs = [...editor.view.dom.querySelectorAll('.studiply-graph-art svg')];
    expect(svgs).toHaveLength(2);
    expect(svgs[0].getAttribute('role')).toBe('img');
    expect(svgs[0].querySelector('title')?.textContent).toBe('Ventas');
    const ids = svgs.map((svg) => svg.querySelector('title')?.id);
    expect(new Set(ids).size).toBe(2);
    // A change redraws it.
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)));
    runFormat(editor, { type: 'graph', action: 'set', graph: { ...NEW_GRAPH, kind: 'pie', title: 'Cuota' } });
    expect(editor.view.dom.querySelector('.studiply-graph-art svg title')?.textContent).toBe('Cuota');
  });

  it('in a callout, the graph goes inside it', () => {
    open([{ type: 'callout', attrs: { kind: 'example' }, content: [p('Ejemplo')] }]);
    editor.commands.setTextSelection(4);
    runFormat(editor, { type: 'graph', action: 'insert' });
    expect(blocks()[0].content?.map((n) => n.type)).toEqual(['paragraph', 'graph', 'paragraph']);
  });
});
