// Scatter plots: a marker per point, a shape per series, the key, numeric axes, left-out points.
import { renderChart } from '..';
import { MINUS } from '../svg';
import { assertWellFormed, descOf, elements, texts } from '../test-utils/svgAssert';
import type { ChartSpec } from '../types';

const heights: ChartSpec = {
  type: 'scatter',
  title: 'Taller students weigh more',
  xLabel: 'Height (cm)',
  yLabel: 'Weight (kg)',
  series: [
    { name: 'Women', points: [155, 160, 165, 170].map((x, i) => ({ x, y: [50, 54, 58, 64][i] })) },
    { name: 'Men', points: [170, 175, 180].map((x, i) => ({ x, y: [70, 75, 80][i] })) },
  ],
};

/** Markers of the plot: circles and squares with the thin background ring. */
const markers = (svg: string, tag: 'circle' | 'rect') => elements(svg, tag).filter((m) => m.attrs['stroke-width'] === '1');

describe('scatter plot', () => {
  it('draws a marker per point, a different shape per series', () => {
    const svg = renderChart(heights);
    assertWellFormed(svg);
    expect(markers(svg, 'circle')).toHaveLength(4);
    expect(markers(svg, 'rect')).toHaveLength(3);
  });

  it('names several series in a key, with axis labels', () => {
    const shown = texts(renderChart(heights));
    expect(shown).toEqual(expect.arrayContaining(['Women', 'Men', 'Height (cm)', 'Weight (kg)']));
  });

  it('has no key for one series', () => {
    const svg = renderChart({ ...heights, series: [heights.series[0]] });
    expect(texts(svg)).not.toContain('Women');
  });

  it('places points by value on both axes', () => {
    const svg = renderChart({ type: 'scatter', title: '', series: [{ name: '', points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }] });
    const [a, b] = markers(svg, 'circle').map((m) => ({ x: Number(m.attrs.cx), y: Number(m.attrs.cy) }));
    expect(b.x).toBeGreaterThan(a.x);
    expect(b.y).toBeLessThan(a.y);
  });

  it('handles negative values on both axes', () => {
    const svg = renderChart({ type: 'scatter', title: '', series: [{ name: '', points: [{ x: -2, y: -3 }, { x: 8, y: 6 }] }] });
    assertWellFormed(svg);
    expect(texts(svg)).toEqual(expect.arrayContaining([`${MINUS}5`, '0']));
  });

  it('keeps every point off the plot edge', () => {
    const svg = renderChart({ type: 'scatter', title: '', series: [{ name: '', points: [{ x: 0, y: 0 }, { x: 100, y: 100 }] }] });
    const lines = elements(svg, 'line');
    const gridXs = lines.filter((l) => l.attrs.x1 === l.attrs.x2).map((l) => Number(l.attrs.x1));
    const xs = markers(svg, 'circle').map((m) => Number(m.attrs.cx));
    expect(Math.min(...xs)).toBeGreaterThan(Math.min(...gridXs));
    expect(Math.max(...xs)).toBeLessThan(Math.max(...gridXs));
  });

  it('draws one point', () => {
    const svg = renderChart({ type: 'scatter', title: '', series: [{ name: '', points: [{ x: 3, y: 4 }] }] });
    assertWellFormed(svg);
    expect(markers(svg, 'circle')).toHaveLength(1);
    expect(descOf(svg)).toContain('(3, 4).');
  });

  it('draws identical points without breaking the axes', () => {
    const svg = renderChart({ type: 'scatter', title: '', series: [{ name: '', points: [{ x: 5, y: 5 }, { x: 5, y: 5 }] }] });
    assertWellFormed(svg);
    expect(svg).not.toMatch(/NaN|Infinity/);
  });

  it('reads x values typed as text and leaves out the rest, with a note', () => {
    const svg = renderChart({
      type: 'scatter',
      title: '',
      series: [{ name: '', points: [{ x: '1.5', y: 2 }, { x: 'tall', y: 3 }, { x: 4, y: 5 }] }],
    });
    expect(markers(svg, 'circle')).toHaveLength(2);
    expect(texts(svg)).toContain("Left out: 1 point whose x isn't a number");
  });

  it('describes each series with its range', () => {
    expect(descOf(renderChart(heights))).toContain('Women. (155, 50); (160, 54); (165, 58); (170, 64). x from 155 to 170, y from 50 to 64.');
  });
});
