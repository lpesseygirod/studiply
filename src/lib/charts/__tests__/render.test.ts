// What every chart shares: the accessible SVG, themes, ids, escaping, sizes, the empty state, the description.
import { describeChart, renderChart } from '..';
import { LISTED_VALUES } from '../describe';
import { chartTheme } from '../theme';
import { assertWellFormed, descOf, elements, texts, titleOf } from '../test-utils/svgAssert';
import type { ChartSpec, ChartType } from '../types';

const TYPES: ChartType[] = ['bar', 'line', 'pie', 'scatter'];

const sample = (type: ChartType): ChartSpec => ({
  type,
  title: 'Investment falls as rates rise',
  xLabel: 'Rate (%)',
  yLabel: 'Investment (bn €)',
  series: [
    { name: 'Firms', points: [1, 2, 3, 4].map((x) => ({ x, y: 20 - x * 3 })) },
    { name: 'Households', points: [1, 2, 3, 4].map((x) => ({ x, y: 12 - x * 2 })) },
  ],
});

describe.each(TYPES)('%s chart', (type) => {
  it('is a well-formed SVG image with a title and a description', () => {
    const svg = renderChart(sample(type));
    assertWellFormed(svg);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="640" height="400" viewBox="0 0 640 400" role="img"/);
    const [svgTag] = elements(svg, 'svg');
    const [titleId, descId] = svgTag.attrs['aria-labelledby'].split(' ');
    expect(svg).toContain(`<title id="${titleId}">`);
    expect(svg).toContain(`<desc id="${descId}">`);
    expect(titleOf(svg)).toBe('Investment falls as rates rise');
    expect(descOf(svg)).toBe(describeChart(sample(type)));
  });

  it('gives the same SVG for the same chart', () => {
    expect(renderChart(sample(type))).toBe(renderChart(sample(type)));
  });

  it('draws on the theme background in light and dark', () => {
    for (const mode of ['light', 'dark'] as const) {
      const svg = renderChart(sample(type), { theme: mode });
      const theme = chartTheme(mode);
      const background = elements(svg, 'rect').find((r) => r.attrs.width === '640' && r.attrs.height === '400');
      expect(background?.attrs.fill).toBe(theme.background);
      expect(svg).toContain(theme.series[0]);
      expect(elements(svg, 'text').every((t) => t.attrs.fill === theme.text || t.attrs.fill === theme.textMuted)).toBe(true);
    }
  });

  it('shows "No data yet" when empty', () => {
    const svg = renderChart({ type, title: 'Empty', series: [] });
    assertWellFormed(svg);
    expect(texts(svg)).toEqual(['Empty', 'No data yet']);
    expect(descOf(svg)).toContain('No data yet.');
  });

  it('escapes text so it can never break out of the SVG', () => {
    const evil = '<script>alert("x")</script> & \'quotes\'';
    const svg = renderChart({
      type,
      title: evil,
      xLabel: evil,
      yLabel: evil,
      series: [
        { name: evil, points: [{ x: type === 'scatter' ? 1 : evil, y: 3 }] },
        { name: 'B', points: [{ x: type === 'scatter' ? 2 : 'b', y: 4 }] },
      ],
    });
    assertWellFormed(svg);
    expect(svg).not.toContain('<script');
    expect(titleOf(svg)).toBe(evil);
  });

  it('wraps and shortens a long title, keeping it whole for screen readers', () => {
    const title = 'A very long takeaway title '.repeat(8).trim();
    const svg = renderChart({ ...sample(type), title });
    assertWellFormed(svg);
    expect(titleOf(svg)).toBe(title);
    expect(texts(svg)[0].endsWith('…')).toBe(true);
  });

  it('fits a phone-width chart', () => {
    const svg = renderChart(sample(type), { width: 320, height: 240 });
    assertWellFormed(svg);
    expect(svg).toContain('viewBox="0 0 320 240"');
  });
});

describe('ids', () => {
  it('differ between charts so several fit on one page', () => {
    const a = renderChart({ ...sample('bar'), title: 'A' });
    const b = renderChart({ ...sample('bar'), title: 'B' });
    const id = (svg: string) => elements(svg, 'title')[0].attrs.id;
    expect(id(a)).not.toBe(id(b));
    expect(id(renderChart(sample('bar'), { theme: 'dark' }))).not.toBe(id(renderChart(sample('bar'))));
  });

  it('use the given prefix, cleaned', () => {
    const svg = renderChart(sample('bar'), { idPrefix: 'block 42"<' });
    expect(elements(svg, 'title')[0].attrs.id).toBe('block42-title');
    expect(elements(svg, 'pattern')[0].attrs.id).toMatch(/^block42-fill-/);
    expect(elements(renderChart(sample('bar'), { idPrefix: '9' }), 'title')[0].attrs.id).toBe('c9-title');
  });
});

describe('sizes', () => {
  it('keeps a minimum size and ignores nonsense', () => {
    expect(renderChart(sample('line'), { width: 10, height: 10 })).toContain('viewBox="0 0 240 200"');
    expect(renderChart(sample('line'), { width: NaN })).toContain('width="640"');
  });
});

describe('describeChart', () => {
  it('reads out type, title, axes, series and their extremes', () => {
    const text = describeChart({
      type: 'bar',
      title: 'Brand A leads',
      xLabel: 'Brand',
      yLabel: 'Share (%)',
      series: [{ name: '', points: [{ x: 'A', y: 31 }, { x: 'B', y: 22 }, { x: 'C', y: -4 }] }],
    });
    expect(text).toBe(
      'Bar chart: Brand A leads. X axis: Brand. Y axis: Share (%). A: 31; B: 22; C: −4. Highest 31 (A), lowest −4 (C).',
    );
  });

  it('names series when there are several', () => {
    const text = describeChart(sample('line'));
    expect(text).toContain('2 series.');
    expect(text).toContain('Firms. 1: 17; 2: 14; 3: 11; 4: 8.');
  });

  it('does not double a full stop the title already has', () => {
    expect(describeChart({ type: 'line', title: 'Prices rose.', series: [] })).toBe('Line chart: Prices rose. No data yet.');
  });

  it('says "chart" without a title', () => {
    expect(describeChart({ type: 'scatter', title: '', series: [] })).toBe('Scatter plot. No data yet.');
  });

  it(`lists up to ${LISTED_VALUES} values per series`, () => {
    const text = describeChart({ type: 'bar', title: '', series: [{ name: '', points: Array.from({ length: 30 }, (_, i) => ({ x: `D${i}`, y: i })) }] });
    expect(text).toContain('D19: 19; and 10 more.');
    expect(text).not.toContain('D20: 20');
  });

  it('reads out the notes', () => {
    const text = describeChart({ type: 'bar', title: '', series: [{ name: 'A', points: [{ x: 'a', y: NaN }, { x: 'b', y: 1 }] }] });
    expect(text).toContain("Left out: 1 value that isn't a number.");
  });

  it('says when a series has no values', () => {
    const text = describeChart({ type: 'line', title: '', series: [{ name: 'A', points: [{ x: 'a', y: 1 }] }, { name: 'B', points: [] }] });
    expect(text).toContain('B. No values.');
  });
});
