// Preparing a spec: what is drawn, what is left out, and the notes that say so.
import { MAX_SLICES, prepare } from '../data';
import { MAX_SERIES } from '../theme';
import type { ChartSpec } from '../types';

const series = (name: string, ys: unknown[]) => ({ name, points: ys.map((y, i) => ({ x: `C${i + 1}`, y: y as number })) });

describe('prepare', () => {
  it('cleans names and gives unnamed series a name', () => {
    const p = prepare({ type: 'bar', title: '  Rates \n rise ', series: [series('', [1]), series(' B ', [2])] });
    expect(p.title).toBe('Rates rise');
    expect(p.series.map((s) => s.name)).toEqual(['Series 1', 'B']);
    expect(p.series.map((s) => s.named)).toEqual([false, true]);
    expect(p.labelled).toBe(true);
  });

  it('does not label a single unnamed series', () => {
    expect(prepare({ type: 'line', title: '', series: [series('', [1, 2])] }).labelled).toBe(false);
    expect(prepare({ type: 'line', title: '', series: [series('Sales', [1, 2])] }).labelled).toBe(true);
  });

  it(`draws up to ${MAX_SERIES} series and notes the rest`, () => {
    const p = prepare({ type: 'line', title: '', series: Array.from({ length: 6 }, (_, i) => series(`S${i}`, [i])) });
    expect(p.series).toHaveLength(MAX_SERIES);
    expect(p.notes).toContain('+2 series not shown');
  });

  it('leaves out values that are not numbers, and reads numbers typed as text', () => {
    const p = prepare({ type: 'bar', title: '', series: [series('A', [1, NaN, '3', 'x', Infinity, null])] });
    expect(p.series[0].points.map((pt) => pt.y)).toEqual([1, 3]);
    expect(p.notes).toContain("Left out: 4 values that aren't a number");
  });

  it('keeps categories in order of first appearance across series', () => {
    const p = prepare({
      type: 'bar',
      title: '',
      series: [
        { name: 'A', points: [{ x: 'b', y: 1 }, { x: 'c', y: 1 }] },
        { name: 'B', points: [{ x: 'a', y: 1 }, { x: 'b', y: 1 }] },
      ],
    });
    expect(p.categories.map((c) => c.text)).toEqual(['b', 'c', 'a']);
  });

  it('keeps a category used twice in one series as two places', () => {
    const p = prepare({ type: 'bar', title: '', series: [{ name: 'A', points: [{ x: 'Q1', y: 1 }, { x: 'Q1', y: 2 }] }] });
    expect(p.categories.map((c) => c.text)).toEqual(['Q1', 'Q1']);
    expect(new Set(p.categories.map((c) => c.key)).size).toBe(2);
  });

  it('names empty categories by position', () => {
    const p = prepare({ type: 'bar', title: '', series: [{ name: 'A', points: [{ x: '', y: 1 }, { x: '  ', y: 2 }] }] });
    expect(p.categories.map((c) => c.text)).toEqual(['#1', '#2']);
  });

  it('uses a number line for lines whose x values are all numbers, sorted', () => {
    const p = prepare({ type: 'line', title: '', series: [{ name: 'A', points: [{ x: 2010, y: 1 }, { x: 2008, y: 2 }] }] });
    expect(p.numericX).toBe(true);
    expect(p.series[0].points.map((pt) => pt.x)).toEqual([2008, 2010]);
    expect(p.series[0].points[0].xText).toBe('2008');
  });

  it('keeps lines with text x values as categories', () => {
    const p = prepare({ type: 'line', title: '', series: [{ name: 'A', points: [{ x: 'W2', y: 1 }, { x: 'W1', y: 2 }] }] });
    expect(p.numericX).toBe(false);
    expect(p.categories.map((c) => c.text)).toEqual(['W2', 'W1']);
  });

  it('is empty without series, points or numbers', () => {
    for (const spec of [
      { type: 'bar', title: '', series: [] },
      { type: 'line', title: '', series: [{ name: 'A', points: [] }] },
      { type: 'bar', title: '' } as unknown as ChartSpec,
      { type: 'line', title: '', series: [series('A', [NaN])] },
    ] as ChartSpec[]) {
      const p = prepare(spec);
      expect(p.empty).toBe(true);
      expect(p.emptyText).toBe('No data yet');
    }
  });

  it('rejects an unknown chart type', () => {
    expect(() => prepare({ type: 'donut', title: '', series: [] } as unknown as ChartSpec)).toThrow('Unknown chart type');
  });
});

describe('prepare (pie)', () => {
  it('shares out positive values and notes the ones left out', () => {
    const p = prepare({ type: 'pie', title: '', series: [series('A', [30, 10, 0, -5, 60])] });
    expect(p.slices.map((s) => s.value)).toEqual([30, 10, 60]);
    expect(p.slices.map((s) => s.share)).toEqual([0.3, 0.1, 0.6]);
    expect(p.total).toBe(100);
    expect(p.notes).toContain('Left out: 2 values that are zero or negative (a pie needs positive values)');
  });

  it('draws only the first series', () => {
    const p = prepare({ type: 'pie', title: '', series: [series('A', [1]), series('B', [2])] });
    expect(p.series).toHaveLength(1);
    expect(p.notes).toContain('+1 series not shown (a pie shows one series)');
  });

  it(`groups the smallest slices into "Other" past ${MAX_SLICES}`, () => {
    const values = [5, 50, 4, 40, 3, 30, 2, 20, 1, 10];
    const p = prepare({ type: 'pie', title: '', series: [series('A', values)] });
    expect(p.slices).toHaveLength(MAX_SLICES);
    // The 7 largest stay in their order, then Other.
    expect(p.slices.map((s) => s.value)).toEqual([5, 50, 4, 40, 30, 20, 10, 3 + 2 + 1]);
    expect(p.slices[7]).toMatchObject({ name: 'Other', grouped: 3 });
    expect(p.notes).toContain('"Other" groups the 3 smallest slices');
  });

  it('says so when nothing is positive', () => {
    const p = prepare({ type: 'pie', title: '', series: [series('A', [0, -1])] });
    expect(p.empty).toBe(true);
    expect(p.emptyText).toBe('No positive values to draw');
  });
});

describe('prepare (scatter)', () => {
  it('needs numeric x values', () => {
    const p = prepare({
      type: 'scatter',
      title: '',
      series: [{ name: 'A', points: [{ x: 1, y: 1 }, { x: '2.5', y: 2 }, { x: 'abc', y: 3 }] }],
    });
    expect(p.series[0].points.map((pt) => pt.x)).toEqual([1, 2.5]);
    expect(p.notes).toContain("Left out: 1 point whose x isn't a number");
  });
});
