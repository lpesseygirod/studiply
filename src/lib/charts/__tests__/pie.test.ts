// Pie charts: slices, eight distinct fills, outside labels with share and value, "Other", left-out values.
import { renderChart } from '..';
import { shareText, slicePath } from '../pie';
import { assertWellFormed, descOf, elements, texts } from '../test-utils/svgAssert';
import type { ChartSpec } from '../types';

const pie = (values: number[], names?: string[]): ChartSpec => ({
  type: 'pie',
  title: 'Budget',
  series: [{ name: 'Budget', points: values.map((y, i) => ({ x: names?.[i] ?? `Part ${i + 1}`, y })) }],
});

const slices = (svg: string) => elements(svg, 'path').filter((p) => /A[\d.]+ [\d.]+ 0 [01] 1/.test(p.attrs.d));

describe('pie chart', () => {
  it('draws a slice per value with its name, share and value', () => {
    const svg = renderChart(pie([62, 23, 15], ['Staff', 'Buildings', 'Equipment']));
    assertWellFormed(svg);
    expect(slices(svg)).toHaveLength(3);
    expect(texts(svg)).toEqual(expect.arrayContaining(['Staff', '62% (62)', 'Buildings', '23% (23)', 'Equipment', '15% (15)']));
    expect(descOf(svg)).toContain('3 slices, total 100. Staff: 62 (62%); Buildings: 23 (23%); Equipment: 15 (15%).');
  });

  it('gives each of eight slices its own fill (colour + pattern)', () => {
    const svg = renderChart(pie([8, 7, 6, 5, 4, 3, 2, 1]));
    const fills = slices(svg).map((s) => s.attrs.fill);
    expect(new Set(fills).size).toBe(8);
    expect(elements(svg, 'pattern')).toHaveLength(7);
  });

  it('separates slices with a gap in the background colour', () => {
    const svg = renderChart(pie([1, 1]), { theme: 'dark' });
    const bg = elements(svg, 'rect').find((r) => r.attrs.width === '640')?.attrs.fill;
    for (const s of slices(svg)) expect(s.attrs.stroke).toBe(bg);
  });

  it('draws a single value as a full circle', () => {
    const svg = renderChart(pie([5], ['All']));
    assertWellFormed(svg);
    expect(slices(svg)).toHaveLength(0);
    expect(elements(svg, 'circle')).toHaveLength(1);
    expect(texts(svg)).toEqual(expect.arrayContaining(['All', '100% (5)']));
  });

  it('groups the smallest slices into "Other" past eight and says so', () => {
    const svg = renderChart(pie([340, 210, 150, 90, 60, 45, 30, 12, 8, 3]));
    assertWellFormed(svg);
    expect(slices(svg)).toHaveLength(8);
    expect(texts(svg)).toEqual(expect.arrayContaining(['Other', '"Other" groups the 3 smallest slices']));
  });

  it('leaves out zero and negative values and says so', () => {
    const svg = renderChart(pie([5, 0, -3, 5]));
    assertWellFormed(svg);
    expect(slices(svg)).toHaveLength(2);
    expect(texts(svg)).toContain('Left out: 2 values that are zero or negative (a pie needs positive values)');
  });

  it('says there is nothing to draw when no value is positive', () => {
    const svg = renderChart(pie([-1, 0]));
    assertWellFormed(svg);
    expect(texts(svg)).toContain('No positive values to draw');
    expect(descOf(svg)).toContain('No positive values to draw.');
  });

  it('ignores axis labels and extra series, with a note', () => {
    const svg = renderChart({
      type: 'pie',
      title: '',
      xLabel: 'X',
      yLabel: 'Y',
      series: [pie([1, 2]).series[0], { name: 'More', points: [{ x: 'a', y: 1 }] }],
    });
    expect(texts(svg)).not.toContain('X');
    expect(texts(svg)).toContain('+1 series not shown (a pie shows one series)');
  });

  it('keeps labels on each side from overlapping', () => {
    const svg = renderChart(pie([50, 1, 1, 1, 1, 1, 1, 1]));
    const named = elements(svg, 'text').filter((t) => t.attrs['font-weight']);
    for (const anchor of ['start', 'end']) {
      const ys = named
        .filter((t) => t.attrs['text-anchor'] === anchor)
        .map((t) => Number(t.attrs.y))
        .sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(24);
    }
  });

  it('wraps long slice names', () => {
    const svg = renderChart(pie([1, 2], ['Research equipment and laboratory supplies', 'Staff']));
    assertWellFormed(svg);
    expect(svg).toMatch(/<tspan[^>]*>Research equipment/);
  });
});

describe('shareText', () => {
  it('rounds, and shows tiny shares as <1%', () => {
    expect(shareText(0.336)).toBe('34%');
    expect(shareText(1)).toBe('100%');
    expect(shareText(0.004)).toBe('<1%');
  });
});

describe('slicePath', () => {
  it('uses the large arc only past half the circle', () => {
    expect(slicePath(0, 0, 10, 0, Math.PI / 2)).toBe('M0 0L10 0A10 10 0 0 1 0 10Z');
    expect(slicePath(0, 0, 10, 0, Math.PI * 1.5)).toContain('A10 10 0 1 1');
  });
});
