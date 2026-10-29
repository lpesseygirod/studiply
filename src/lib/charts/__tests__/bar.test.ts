// Bar charts: bars from zero, patterns per series, values, the key, negatives.
import { describeChart, renderChart } from '..';
import { barPath } from '../bar';
import { MINUS } from '../svg';
import { chartTheme } from '../theme';
import { assertWellFormed, elements, pathNumbers, texts } from '../test-utils/svgAssert';
import type { ChartSpec } from '../types';

const brands: ChartSpec = {
  type: 'bar',
  title: 'Brand A leads the market',
  xLabel: 'Brand',
  yLabel: 'Share (%)',
  series: [{ name: '', points: ['A', 'B', 'C', 'D', 'E'].map((x, i) => ({ x, y: [31, 22, 15, 11, 8][i] })) }],
};

const years = (name: string, ys: number[]) => ({ name, points: ys.map((y, i) => ({ x: String(2019 + i), y })) });

/** The bars: paths whose fill is a series colour or pattern. */
const bars = (svg: string) => elements(svg, 'path').filter((p) => p.attrs.fill && p.attrs.fill !== 'none');

/** A bar path is M x base V … Q x end …: its baseline and data-end y. */
const extent = (d: string) => {
  const nums = pathNumbers(d);
  return { base: nums[1], end: nums[4] };
};

describe('bar chart', () => {
  it('draws one bar per value, with values, axis labels and categories', () => {
    const svg = renderChart(brands);
    assertWellFormed(svg);
    expect(bars(svg)).toHaveLength(5);
    const shown = texts(svg);
    for (const t of ['Brand A leads the market', 'Brand', 'Share (%)', 'A', 'E', '31', '8']) expect(shown).toContain(t);
  });

  it('makes taller bars for larger values, all from the same baseline', () => {
    const svg = renderChart(brands);
    const heights = bars(svg).map((b) => extent(b.attrs.d).base - extent(b.attrs.d).end);
    expect(heights).toEqual([...heights].sort((a, b) => b - a));
    expect(heights[0] / heights[4]).toBeCloseTo(31 / 8, 1);
    const bases = bars(svg).map((b) => extent(b.attrs.d).base);
    expect(new Set(bases).size).toBe(1);
  });

  it('a single series has no key and a solid fill', () => {
    const svg = renderChart(brands);
    expect(elements(svg, 'pattern')).toHaveLength(0);
    expect(bars(svg)[0].attrs.fill).toBe(chartTheme('light').series[0]);
  });

  it('tells series apart by pattern as well as colour, with a key', () => {
    const svg = renderChart({
      type: 'bar',
      title: 'Investment by country',
      series: [years('Germany', [12, 9]), years('France', [8, 6]), years('Italy', [5, 3]), years('Spain', [3, 1])],
    });
    assertWellFormed(svg);
    const fills = [...new Set(bars(svg).map((b) => b.attrs.fill))];
    expect(fills).toHaveLength(4);
    expect(fills[0]).toMatch(/^#/);
    for (const f of fills.slice(1)) expect(f).toMatch(/^url\(#chart-[\w-]+-fill-\d-\w+\)$/);
    expect(elements(svg, 'pattern')).toHaveLength(3);
    // Key: a swatch and a name per series.
    const shown = texts(svg);
    for (const name of ['Germany', 'France', 'Italy', 'Spain']) expect(shown).toContain(name);
  });

  it('notes series past the fourth', () => {
    const svg = renderChart({ type: 'bar', title: '', series: [1, 2, 3, 4, 5, 6].map((i) => years(`S${i}`, [i])) });
    expect(bars(svg)).toHaveLength(4);
    expect(texts(svg)).toContain('+2 series not shown');
  });

  it('draws negative values down from the zero line, value below', () => {
    const svg = renderChart({ type: 'bar', title: '', series: [years('A', [5, -3])] });
    assertWellFormed(svg);
    const [up, down] = bars(svg).map((b) => extent(b.attrs.d));
    const base = up.base;
    expect(down.base).toBe(base);
    expect(up.end).toBeLessThan(base);
    expect(down.end).toBeGreaterThan(base);
    expect((down.end - base) / (base - up.end)).toBeCloseTo(3 / 5, 1);
    expect(texts(svg)).toContain(`${MINUS}3`);
    // The zero line is drawn at the baseline.
    const zero = elements(svg, 'line').find((l) => l.attrs.stroke === chartTheme('light').axis);
    expect(Number(zero?.attrs.y1)).toBeCloseTo(base, 1);
  });

  it('draws all-negative bars with zero at the top', () => {
    const svg = renderChart({ type: 'bar', title: '', series: [years('A', [-5, -10])] });
    assertWellFormed(svg);
    expect(texts(svg)).toEqual(expect.arrayContaining(['0', `${MINUS}10`]));
  });

  it('draws a single value', () => {
    const svg = renderChart({ type: 'bar', title: 'Only one', series: [years('A', [7])] });
    assertWellFormed(svg);
    expect(bars(svg)).toHaveLength(1);
    expect(texts(svg)).toContain('7');
  });

  it('draws zeros as no bar but still writes the value', () => {
    const svg = renderChart({ type: 'bar', title: '', series: [years('A', [0, 0])] });
    assertWellFormed(svg);
    expect(bars(svg)).toHaveLength(0);
    expect(texts(svg).filter((t) => t === '0').length).toBeGreaterThanOrEqual(2);
  });

  it('leaves values off when bars are too narrow for them', () => {
    const many = { type: 'bar', title: '', series: [years('A', Array.from({ length: 40 }, (_, i) => 100000 + i))] } as ChartSpec;
    const shown = texts(renderChart(many, { width: 320 }));
    expect(shown).not.toContain('100,039');
  });

  it('tilts or shortens long category labels and keeps the full text in the description', () => {
    const long = 'Faculty of Law, Criminal Justice and Public Administration';
    const spec: ChartSpec = {
      type: 'bar',
      title: '',
      series: [{ name: '', points: [long, 'Arts', 'Medicine', 'Biology', 'Theology and Religious Studies'].map((x, i) => ({ x, y: i + 1 })) }],
    };
    const svg = renderChart(spec);
    assertWellFormed(svg);
    expect(svg).toMatch(/rotate\(-45 /);
    expect(texts(svg).some((t) => t.startsWith('Faculty of') && t.endsWith('…'))).toBe(true);
    expect(describeChart(spec)).toContain(long);
  });
});

describe('barPath', () => {
  it('rounds the data end and stays flat on the baseline', () => {
    const d = barPath(10, 20, 100, 40);
    expect(d).toMatch(/^M10 100V44Q10 40 14 40H26Q30 40 30 44V100Z$/);
  });

  it('rounds the bottom of a bar that goes down', () => {
    expect(barPath(10, 20, 100, 160)).toMatch(/^M10 100V156Q10 160 14 160/);
  });

  it('keeps the rounding inside short and thin bars', () => {
    const nums = pathNumbers(barPath(0, 2, 100, 99) ?? '');
    expect(extent(barPath(0, 2, 100, 99) ?? '')).toEqual({ base: 100, end: 99 });
    // The straight side (V) stops between the base and the end; the corners span at most half the width.
    expect(nums[2]).toBeGreaterThanOrEqual(99);
    expect(nums[2]).toBeLessThanOrEqual(100);
    expect(nums[5]).toBeLessThanOrEqual(1);
  });

  it('draws nothing for a zero-height bar', () => {
    expect(barPath(0, 10, 100, 100)).toBeNull();
  });
});
