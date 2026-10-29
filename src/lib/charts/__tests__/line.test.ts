// Line charts: line styles and markers per series, names at the line ends, gaps, numeric x.
import { renderChart } from '..';
import { DASHES } from '../styles';
import { MINUS } from '../svg';
import { assertWellFormed, elements, pathNumbers, texts } from '../test-utils/svgAssert';
import type { ChartSpec } from '../types';

const gdp = (name: string, ys: number[]) => ({ name, points: ys.map((y, i) => ({ x: 2007 + i, y })) });

const spec: ChartSpec = {
  type: 'line',
  title: 'GDP fell in 2009',
  xLabel: 'Year',
  yLabel: 'GDP growth (%)',
  series: [
    gdp('Euro area', [3, 0.4, -4.5, 2.1]),
    gdp('United States', [2, 0.1, -2.6, 2.7]),
    gdp('Japan', [1.7, -1.2, -5.7, 4.1]),
    gdp('China', [14.2, 9.7, 9.4, 10.6]),
  ],
};

const lines = (svg: string) => elements(svg, 'path').filter((p) => p.attrs.fill === 'none');

describe('line chart', () => {
  it('draws one line per series, each with its own style', () => {
    const svg = renderChart(spec);
    assertWellFormed(svg);
    const drawn = lines(svg);
    expect(drawn).toHaveLength(4);
    expect(drawn.map((l) => l.attrs['stroke-dasharray'] ?? '')).toEqual([...DASHES]);
    expect(new Set(drawn.map((l) => l.attrs.stroke)).size).toBe(4);
  });

  it('gives each series its own marker shape', () => {
    const svg = renderChart(spec);
    expect(elements(svg, 'circle').length).toBeGreaterThan(0);
    expect(elements(svg, 'rect').length).toBeGreaterThan(1); // background + squares
    // Triangles and diamonds are paths with fill (not the lines).
    const shapes = elements(svg, 'path').filter((p) => p.attrs.fill !== 'none' && /Z$/.test(p.attrs.d));
    expect(shapes.length).toBeGreaterThanOrEqual(2 * 5);
  });

  it('names every line at its end, not in a legend', () => {
    const shown = texts(renderChart(spec));
    for (const name of ['Euro area', 'United States', 'Japan', 'China']) expect(shown).toContain(name);
  });

  it('puts labels in the order of the line ends, without overlapping', () => {
    const svg = renderChart(spec);
    const label = (name: string) => elements(svg, 'text').find((_, i) => texts(svg)[i] === name);
    const ys = ['China', 'Japan', 'United States', 'Euro area'].map((n) => Number(label(n)?.attrs.y));
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(12);
  });

  it('puts numeric x values on a number line, written as years', () => {
    const shown = texts(renderChart(spec));
    expect(shown).toEqual(expect.arrayContaining(['2007', '2010', `${MINUS}5`]));
    expect(shown).not.toContain('2,007');
  });

  it('spaces numeric x values by their value', () => {
    const svg = renderChart({ type: 'line', title: '', series: [{ name: '', points: [0, 1, 10].map((x) => ({ x, y: x })) }] });
    const xs = pathNumbers(lines(svg)[0].attrs.d).filter((_, i) => i % 2 === 0);
    expect(xs[2] - xs[1]).toBeGreaterThan((xs[1] - xs[0]) * 5);
  });

  it('breaks the line where a category has no value', () => {
    const svg = renderChart({
      type: 'line',
      title: '',
      series: [
        { name: 'A', points: ['W1', 'W2', 'W3', 'W4'].map((x) => ({ x, y: 1 })) },
        { name: 'B', points: ['W1', 'W2', 'W4'].map((x) => ({ x, y: 2 })) },
      ],
    });
    const [, b] = lines(svg);
    expect(b.attrs.d.match(/M/g)).toHaveLength(2);
  });

  it('draws a single value as a marker with its name', () => {
    const svg = renderChart({ type: 'line', title: '', series: [{ name: 'Only', points: [{ x: 'Mon', y: 5 }] }] });
    assertWellFormed(svg);
    expect(elements(svg, 'circle').length).toBeGreaterThanOrEqual(1);
    expect(texts(svg)).toEqual(expect.arrayContaining(['Only', 'Mon']));
  });

  it('does not name a single unnamed line', () => {
    const svg = renderChart({ type: 'line', title: 'Sales', series: [{ name: '', points: [{ x: 'a', y: 1 }, { x: 'b', y: 2 }] }] });
    expect(texts(svg)).not.toContain('Series 1');
  });

  it('keeps markers only at the end of long series', () => {
    const svg = renderChart({ type: 'line', title: '', series: [{ name: '', points: Array.from({ length: 100 }, (_, x) => ({ x, y: x % 7 })) }] });
    expect(elements(svg, 'circle')).toHaveLength(1);
  });

  it('wraps a long series name', () => {
    const svg = renderChart({
      type: 'line',
      title: '',
      series: [{ name: 'Tutorial sessions with a very long name indeed', points: [{ x: 'a', y: 1 }, { x: 'b', y: 2 }] }],
    });
    assertWellFormed(svg);
    expect(svg).toMatch(/<tspan/);
  });
});
