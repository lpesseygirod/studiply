/**
 * @jest-environment jsdom
 */
// Formulas and graphs from a summary, on the two hand-made fixtures (src/test-utils/
// summary-calculus.json, summary-finance.json): each a `graph` block of its own kind (function, model,
// line, stacked bar, histogram) carrying its data; until the charts module draws a function or a model
// graph (docs/charts-work-order-8.2.md), its line stands in its place, never an empty or broken chart;
// stacked bars and histograms are drawn as bars meanwhile. Formula cards with their legends; photos in
// their sections. The graph block's new data cleaned; a function or model graph has no form.
import { Editor, type JSONContent } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';

import { studiplyExtensions } from '../../editor/bridges';
import { editorCss } from '../../editor/editorCss';
import { formatState } from '../../editor/format';
import { canDraw, graphDescription, graphMarkup, laterLine } from '../../editor/graph/charts';
import { cleanGraph, curveId, DEFAULT_RANGE, hasTable, MAX_EXPRESSION, planGraph, readNumber } from '../../editor/graph/data';
import { checkBlock, StoredSummaryShape } from '../../../supabase/functions/_shared/summary-zod';
import type { StoredSummary } from '../../../supabase/functions/_shared/summary-pipeline';
import { summaryKey, summaryToDoc, type SummaryDocJSON } from '../summaryDoc';
import calculus from '../../test-utils/summary-calculus.json';
import finance from '../../test-utils/summary-finance.json';

type N = JSONContent;
const CALC = calculus as unknown as StoredSummary;
const FIN = finance as unknown as StoredSummary;
const ID = '5b1d7e2c-4a3f-4c8e-9d6b-2e1f0a9b8c7d';
const textOf = (n: N): string => (n.text ?? '') + (n.content ?? []).map(textOf).join('');

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});
function load(content: SummaryDocJSON | N | string): Editor {
  editor = new Editor({ extensions: studiplyExtensions(), content });
  editor.state.doc.check();
  return editor;
}
/** Each section's blocks (by type, a graph by kind), in order. */
function bySection(doc: SummaryDocJSON): string[][] {
  const out: string[][] = [];
  for (const b of doc.content) {
    if (b.type === 'heading' && /-s\d+$/.test(String(b.attrs?.blockId))) out.push([]);
    else if (out.length && /-s\d+-b\d+/.test(String(b.attrs?.blockId))) out.at(-1)!.push(b.type === 'graph' ? `graph:${b.attrs?.kind}` : String(b.type));
  }
  return out;
}
const graphs = (doc: SummaryDocJSON) => doc.content.filter((b) => b.type === 'graph');

describe('the fixtures, as Claude writes them', () => {
  it.each([
    ['Calculus', CALC],
    ['Finance', FIN],
  ])('%s: the stored summary’s shape, and every block valid for its type (BLOCK_DATA)', (_name, s) => {
    const shape = StoredSummaryShape.safeParse(s);
    expect(shape.success ? [] : shape.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)).toEqual([]);
    for (const [si, sec] of (s.sections as { blocks: ({ type: string } & Record<string, unknown>)[] }[]).entries())
      for (const [bi, { type, ...fields }] of sec.blocks.entries()) {
        const checked = checkBlock(type as Parameters<typeof checkBlock>[0], fields, `$.sections[${si}].blocks[${bi}]`);
        expect(checked.ok ? [] : checked.errors).toEqual([]);
      }
  });
});

describe('Calculus (the build plan’s check: a function from the lecture plotted)', () => {
  const doc = summaryToDoc({ summary: CALC, summaryId: ID });

  it('each function plot a graph block of kind function, with its expression, range and marks, in its section; the photos in theirs', () => {
    expect(bySection(doc)).toEqual([
      ['paragraph', 'formulaCard', 'graph:function', 'image', 'paragraph'],
      ['paragraph', 'graph:function'],
      ['paragraph', 'graph:function', 'image', 'paragraph'],
    ]);
    expect(graphs(doc).map((g) => [g.attrs?.title, g.attrs?.func])).toEqual([
      ['La parábola corta el eje x en −2 y 2', { expression: 'x^2 - 4', xRange: [-5, 5], marks: ['roots', 'vertex'] }],
      ['El seno se anula en 0, π y 2π', { expression: 'sin(x)', xRange: [0, 6.2832], marks: ['roots', 'extrema'] }],
      ['1/x no está definida en x = 0', { expression: '1/x', xRange: [-5, 5], marks: [] }],
    ]);
    expect(graphs(doc).every((g) => g.attrs?.origin === 'ai' && String(g.attrs?.blockId).startsWith(summaryKey(ID)))).toBe(true);
    // The photo is hers (media), its caption Claude's words.
    const photo = doc.content.find((b) => b.type === 'image')!;
    expect(photo.attrs).toMatchObject({ src: 'media:photo-board-1', origin: 'media', alt: 'La parábola en la pizarra' });
  });

  it('valid for both editors; until the charts module draws functions, each shows its line in its place (no SVG, never empty)', () => {
    const e = load(doc);
    expect(e.getJSON().content!.filter((b) => b.type === 'graph').map((g) => g.attrs?.func?.expression)).toEqual(['x^2 - 4', 'sin(x)', '1/x']);
    const shown = [...e.view.dom.querySelectorAll('.studiply-graph')].map((f) => ({ svg: !!f.querySelector('svg'), line: f.querySelector('.studiply-graph-later')?.textContent }));
    expect(shown).toEqual([
      { svg: false, line: 'La parábola corta el eje x en −2 y 2: y = x^2 - 4 on [-5, 5] · drawn in a later update' },
      { svg: false, line: 'El seno se anula en 0, π y 2π: y = sin(x) on [0, 6.2832] · drawn in a later update' },
      { svg: false, line: '1/x no está definida en x = 0: y = 1/x on [-5, 5] · drawn in a later update' },
    ]);
    expect(editorCss()).toMatch(/\.studiply-graph-later \{ margin: 0; font-style: italic;/);
  });

  it('no form for a function plot (written again by regenerating): a click only selects it', () => {
    const e = load(doc);
    let pos = -1;
    e.state.doc.forEach((node, offset) => {
      if (pos < 0 && node.type.name === 'graph') pos = offset;
    });
    const node = e.state.doc.nodeAt(pos)!;
    const handled = e.view.someProp('handleClickOn', (f) => f(e.view, pos + 1, node, pos, new MouseEvent('click'), true));
    expect(handled).toBeFalsy();
    expect(formatState(e).graphRequest).toBeNull();
    e.view.dispatch(e.state.tr.setSelection(NodeSelection.create(e.state.doc, pos)));
    expect(formatState(e).graph).toMatchObject({ kind: 'function', func: { expression: 'x^2 - 4' } });
  });

  it('its HTML round-trips (copy and paste, the other device), with the function’s data and its line as the description', () => {
    const html = load(doc).getHTML();
    expect(html).toContain('<figcaption>La parábola corta el eje x en −2 y 2: y = x^2 - 4 on [-5, 5] · drawn in a later update</figcaption>');
    editor!.destroy();
    const back = (load(html).getJSON().content ?? []).filter((b) => b.type === 'graph');
    expect(back.map((g) => [g.attrs?.kind, g.attrs?.func])).toEqual(graphs(doc).map((g) => [g.attrs?.kind, g.attrs?.func]));
  });
});

describe('Finance (the build plan’s check: its formulas shown)', () => {
  const doc = summaryToDoc({ summary: FIN, summaryId: ID });
  const cards = doc.content.filter((b) => b.type === 'formulaCard');

  it('three formula cards: the formula, its legend (each symbol a formula, then its meaning), "When to use"', () => {
    expect(cards).toHaveLength(3);
    expect(cards.map((c) => c.attrs?.title)).toEqual(['Formula', 'Formula', 'Formula']);
    expect(cards.map((c) => c.content![0])).toEqual([
      { type: 'blockMath', attrs: { latex: 'VF = VA \\cdot (1 + r)^n' } },
      { type: 'blockMath', attrs: { latex: 'VA = \\frac{VF}{(1 + r)^n}' } },
      { type: 'blockMath', attrs: { latex: 'VAN = -I_0 + \\sum_{t=1}^{n} \\frac{F_t}{(1 + r)^t}' } },
    ]);
    const legend = cards[0].content![1];
    expect(legend.content!.filter((n) => n.type === 'inlineMath').map((n) => n.attrs?.latex)).toEqual(['VF', 'VA', 'r', 'n']);
    expect(textOf(legend)).toBe(' valor futuro ·  valor actual ·  tipo de interés por periodo ·  número de periodos');
    expect(cards.map((c) => textOf(c.content![2]))).toEqual([
      'When to use: Para saber cuánto valdrá una cantidad de hoy dentro de n periodos.',
      'When to use: Para saber cuánto vale hoy una cantidad que se cobrará en el futuro.',
      'When to use: Para decidir si se acepta una inversión: se acepta si VAN > 0.',
    ]);
  });

  it('the line and bar charts and the model graph in their sections; the professor’s “Demanda” is the template’s D', () => {
    expect(bySection(doc)).toEqual([
      ['paragraph', 'formulaCard', 'formulaCard', 'graph:line', 'image', 'paragraph'],
      ['paragraph', 'formulaCard', 'graph:bar'],
      ['paragraph', 'graph:model'],
    ]);
    const [line, bar, model] = graphs(doc);
    expect(line.attrs).toMatchObject({ xLabel: 'Año', yLabel: 'Valor (€)', series: ['VF'], rows: [['0', '1000'], ['1', '1050'], ['2', '1102.5'], ['3', '1157.63'], ['4', '1215.51'], ['5', '1276.28']] });
    expect(bar.attrs).toMatchObject({ series: ['VAN'], rows: [['A', '-120'], ['B', '340'], ['C', '-45'], ['D', '210'], ['E', '-10']] });
    expect(model.attrs).toMatchObject({ title: 'Si sube la demanda de préstamos, sube el tipo de interés', model: { template: 'supplyDemand', shifts: [{ curve: 'D', direction: 'right' }] } });
  });

  it('on the page: the data charts drawn (an SVG with its title and description), the model graph its line; the formulas typeset', () => {
    const e = load(doc);
    const [line, bar, model] = [...e.view.dom.querySelectorAll('.studiply-graph')];
    expect(line.querySelector('svg title')?.textContent).toBe('Al 5 % anual, 1.000 € se convierten en 1.276 € en cinco años');
    expect(line.querySelector('svg desc')?.textContent).toContain('Line chart');
    expect(bar.querySelector('svg desc')?.textContent).toContain('Bar chart: Solo los proyectos B y D tienen un VAN positivo');
    expect(model.querySelector('svg')).toBeNull();
    expect(model.querySelector('.studiply-graph-later')?.textContent).toBe('Si sube la demanda de préstamos, sube el tipo de interés (D → right) · drawn in a later update');
    expect(e.view.dom.querySelectorAll('.studiply-formula-card .katex').length).toBeGreaterThanOrEqual(3 + 4);
  });
});

describe('Lea, 6 Nov: a graph redrawn from a photo', () => {
  /** A summary of one section: a paragraph, a bar chart redrawn from photo p1 (one value read between gridlines), the photo. */
  const summary = (chart: Record<string, unknown> = {}, more: Record<string, unknown>[] = []): StoredSummary =>
    ({
      ...CALC,
      sections: [
        {
          heading: 'Ventas',
          timestamp: '4:00',
          cueQuestion: '',
          markChips: [],
          blocks: [
            { type: 'paragraph', text: 'Las ventas cayeron en 2021.', keyTerms: [] },
            { type: 'dataChart', chart: 'bar', title: 'Las ventas se recuperan tras 2021', xLabel: 'Año', yLabel: 'M€', series: [{ name: 'Ventas', points: [{ x: '2019', y: 12 }, { x: '2020', y: 7.5, approx: true }] }], timestamp: '4:00', fromPhoto: 'p1', ...chart },
            ...more,
            { type: 'capturedImage', imageId: 'p1', timestamp: '4:00', caption: 'La gráfica de la pizarra' },
          ],
        },
      ],
    }) as unknown as StoredSummary;
  const blocks = (doc: SummaryDocJSON) => doc.content.filter((b) => /-s0-b/.test(String(b.attrs?.blockId)));

  it('the chart, then the photo small (35 %, media), then the italic caption (ai); the photo not again full size', () => {
    const doc = summaryToDoc({ summary: summary(), summaryId: ID });
    expect(blocks(doc).map((b) => [b.type, b.attrs?.origin])).toEqual([
      ['paragraph', 'ai'],
      ['graph', 'ai'],
      ['image', 'media'],
      ['paragraph', 'ai'],
    ]);
    const [, chart, photo, caption] = blocks(doc);
    expect(chart.attrs).toMatchObject({ kind: 'bar', series: ['Ventas'], rows: [['2019', '12'], ['2020', '≈7.5']] });
    expect(photo.attrs).toMatchObject({ src: 'media:p1', width: 35, alt: 'La gráfica de la pizarra' });
    expect(caption.content).toEqual([{ type: 'text', text: 'Redrawn from your photo at 4:00 — check the values', marks: [{ type: 'italic' }] }]);
    expect(doc.content.filter((b) => b.type === 'image')).toHaveLength(1);
  });

  it('valid in the editor; the ≈ value is drawn as its number, kept as typed in the table', () => {
    const e = load(summaryToDoc({ summary: summary(), summaryId: ID }));
    const graph = e.getJSON().content!.find((b) => b.type === 'graph')!;
    expect(planGraph(cleanGraph(graph.attrs)).spec.series[0].values).toEqual([12, 7.5]);
    expect(e.getJSON().content!.find((b) => b.type === 'image')?.attrs).toMatchObject({ width: 35 });
    expect(e.view.dom.querySelector('.studiply-graph svg')).not.toBeNull();
  });

  it('pie and scatter charts are graph blocks of their kind', () => {
    for (const kind of ['pie', 'scatter']) {
      const doc = summaryToDoc({ summary: summary({ chart: kind, fromPhoto: '' }), summaryId: ID });
      expect(blocks(doc).find((b) => b.type === 'graph')?.attrs?.kind).toBe(kind);
    }
  });

  it('two graphs from one photo: the photo and caption once, after the second; a function plot from a photo keeps its line in its place', () => {
    const second = { type: 'functionPlot', expression: 'x^2 - 4', xRange: [-5, 5], mark: [], title: 'Parábola de la foto', fromPhoto: 'p1' };
    const doc = summaryToDoc({ summary: summary({}, [second]), summaryId: ID });
    expect(blocks(doc).map((b) => (b.type === 'graph' ? `graph:${b.attrs?.kind}` : b.type))).toEqual(['paragraph', 'graph:bar', 'graph:function', 'image', 'paragraph']);
    const shown = load(doc).view.dom.querySelectorAll('.studiply-graph-later');
    expect([...shown].map((n) => n.textContent)).toEqual(['Parábola de la foto: y = x^2 - 4 on [-5, 5] · drawn in a later update']);
  });

  it('not from a photo: as before (the photo full size with its caption)', () => {
    const doc = summaryToDoc({ summary: summary({ fromPhoto: '' }), summaryId: ID });
    expect(blocks(doc).map((b) => b.type)).toEqual(['paragraph', 'graph', 'image', 'paragraph']);
    expect(blocks(doc)[2].attrs).not.toHaveProperty('width');
    expect(textOf(blocks(doc)[3])).toBe('La gráfica de la pizarra');
  });

  it('readNumber reads ≈ and ~ as the number', () => {
    expect(['≈7.5', '≈ 7,5', '~12', '≈'].map(readNumber)).toEqual([7.5, 7.5, 12, null]);
  });
});

describe('the graph block’s new kinds (graph/data.ts, graph/charts.ts)', () => {
  it('a function’s data cleaned: its expression trimmed and capped, two finite numbers in order, known marks once', () => {
    const g = cleanGraph({ kind: 'function', title: 'f', func: { expression: `  ${'x'.repeat(300)} `, xRange: [5, -5], marks: ['roots', 'zeros', 'roots', 'vertex'] } });
    expect(g.func).toEqual({ expression: 'x'.repeat(MAX_EXPRESSION), xRange: DEFAULT_RANGE, marks: ['roots', 'vertex'] });
    expect(cleanGraph({ kind: 'function', func: { expression: 'sin(x)', xRange: ['-1,5', 2] } }).func?.xRange).toEqual([-1.5, 2]);
    expect(cleanGraph({ kind: 'function', func: { expression: 'x', xRange: [0, Infinity] } }).func?.xRange).toEqual(DEFAULT_RANGE);
    // Only a function carries one; another kind's stray data is dropped.
    expect(cleanGraph({ kind: 'bar', func: { expression: 'x' }, model: { template: 'islm' } })).not.toHaveProperty('func');
  });

  it('a model graph’s data cleaned: a known template; shifts of its own curves, once each, left or right', () => {
    const g = cleanGraph({ kind: 'model', model: { template: 'islm', shifts: [{ curve: 'IS', direction: 'right' }, { curve: 'IS', direction: 'left' }, { curve: 'D', direction: 'right' }, { curve: 'LM', direction: 'up' }] } });
    expect(g.model).toEqual({ template: 'islm', shifts: [{ curve: 'IS', direction: 'right' }] });
    expect(cleanGraph({ kind: 'model', model: { template: 'radar' } }).model).toEqual({ template: 'supplyDemand', shifts: [] });
  });

  it.each([
    ['supplyDemand', 'Demanda', 'D'],
    ['supplyDemand', 'la curva de oferta', 'S'],
    ['supplyDemand', "D'", 'D'],
    ['islm', 'IS', 'IS'],
    ['costCurves', 'CMg', 'MC'],
    ['costCurves', 'Coste total medio', 'ATC'],
    ['costCurves', 'CVMe', 'AVC'],
    ['normalCurve', 'la media', 'N'],
    ['supplyDemand', 'IS', null],
    ['islm', 'tipo de interés', null],
  ] as const)('%s: the curve “%s” is %p', (template, name, id) => expect(curveId(template, name)).toBe(id));

  it('which kinds the form edits: the table kinds (with stacked bars and histograms), not a function or a model graph', () => {
    expect(['bar', 'line', 'pie', 'scatter', 'stackedBar', 'histogram'].every((k) => hasTable(k as never))).toBe(true);
    expect(hasTable('function')).toBe(false);
    expect(hasTable('model')).toBe(false);
  });

  it('until the charts module has them: stacked bars and histograms drawn as bars, keeping their kind; a function or a model graph its line', () => {
    const rows = [['0–10', '3', '1'], ['10–20', '5', '2']];
    for (const kind of ['stackedBar', 'histogram'] as const) {
      const spec = planGraph(cleanGraph({ kind, title: 'Notas', series: ['A', 'B'], rows })).spec;
      expect(spec.kind).toBe(kind);
      expect(canDraw(spec)).toBe(true);
      expect(graphMarkup(spec, 600)).toMatch(/^<svg/);
      expect(graphDescription(spec)).toContain('Notas');
    }
    const fn = cleanGraph({ kind: 'function', title: 'Parábola', func: { expression: 'x^2 - 4', xRange: [-5, 5], marks: ['roots'] } });
    expect(canDraw(planGraph(fn).spec)).toBe(false);
    expect(graphMarkup(planGraph(fn).spec, 600)).toBe('');
    expect(graphDescription(planGraph(fn).spec, false, fn)).toBe(laterLine(fn));
    expect(laterLine(fn)).toBe('Parábola: y = x^2 - 4 on [-5, 5] · drawn in a later update');
    expect(laterLine(cleanGraph({ kind: 'model', model: { template: 'costCurves', shifts: [{ curve: 'MC', direction: 'left' }] } }))).toBe('Cost curves (MC → left) · drawn in a later update');
  });

  it('a stacked bar from a summary keeps its kind and opens the form like a bar', () => {
    const e = load({ type: 'doc', content: [{ type: 'graph', attrs: { kind: 'stackedBar', title: 'Gasto', xLabel: '', yLabel: '', series: ['A', 'B'], rows: [['2025', '1', '2']] } }] });
    const node = e.state.doc.nodeAt(0)!;
    expect(e.view.someProp('handleClickOn', (f) => f(e.view, 1, node, 0, new MouseEvent('click'), true))).toBe(true);
    expect(formatState(e).graph).toMatchObject({ kind: 'stackedBar', series: ['A', 'B'] });
    expect(e.view.dom.querySelector('.studiply-graph svg')).not.toBeNull();
  });
});
