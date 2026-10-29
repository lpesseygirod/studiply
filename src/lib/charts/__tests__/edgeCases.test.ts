// Edge cases across all chart types: odd data never breaks the SVG, and labels stay inside the chart.
import { renderChart } from '..';
import { textWidth } from '../svg';
import { ChartFont } from '../theme';
import { assertWellFormed, elements, textBlocks, texts } from '../test-utils/svgAssert';
import type { ChartSpec, ChartType } from '../types';

const TYPES: ChartType[] = ['bar', 'line', 'pie', 'scatter'];

/** A small seeded generator, so the random charts are the same on every run. */
function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const ODD_VALUES: unknown[] = [0, -0, -1, 1e-9, -1e12, 3.5e9, NaN, Infinity, -Infinity, '12', 'abc', null, undefined, 42];
const ODD_TEXT = ['', ' ', 'A', '<b>&"\'', 'Ünïcødé ✓', '漢字のラベル', 'x'.repeat(200), 'Word '.repeat(40), '\u0007bell'];

function randomSpec(type: ChartType, next: () => number): ChartSpec {
  const pick = <T,>(xs: T[]) => xs[Math.floor(next() * xs.length)];
  const value = () => (next() < 0.3 ? pick(ODD_VALUES) : Math.round((next() - 0.4) * 1000) / 10);
  const seriesCount = Math.floor(next() * 7);
  return {
    type,
    title: pick(ODD_TEXT),
    xLabel: pick(ODD_TEXT),
    yLabel: pick(ODD_TEXT),
    series: Array.from({ length: seriesCount }, () => ({
      name: pick(ODD_TEXT),
      points: Array.from({ length: Math.floor(next() * 30) }, (_, i) => ({
        x: (next() < 0.5 ? i : next() < 0.5 ? pick(ODD_TEXT) : value()) as string | number,
        y: value() as number,
      })),
    })),
  };
}

describe('random and odd data', () => {
  it.each(TYPES)('%s: 200 random charts are all well-formed, with no NaN or Infinity', (type) => {
    const next = random(type.length * 7919);
    for (let i = 0; i < 200; i++) {
      const spec = randomSpec(type, next);
      const width = 240 + Math.floor(next() * 800);
      let svg = '';
      expect(() => {
        svg = renderChart(spec, { width, height: 200 + Math.floor(next() * 400), theme: next() < 0.5 ? 'light' : 'dark' });
      }).not.toThrow();
      expect(() => assertWellFormed(svg)).not.toThrow();
      expect(svg).not.toMatch(/NaN|Infinity/);
    }
  });
});

describe.each(TYPES)('%s edge cases', (type) => {
  const numeric = type === 'scatter' || type === 'line';

  it('draws a single value', () => {
    const svg = renderChart({ type, title: 'One', series: [{ name: 'Only', points: [{ x: numeric ? 1 : 'a', y: 5 }] }] });
    assertWellFormed(svg);
    expect(texts(svg)).not.toContain('No data yet');
  });

  it('draws only negative numbers', () => {
    const svg = renderChart({
      type,
      title: '',
      series: [{ name: '', points: [-3, -10, -0.5].map((y, i) => ({ x: numeric ? i : `C${i}`, y })) }],
    });
    assertWellFormed(svg);
    if (type === 'pie') expect(texts(svg)).toContain('No positive values to draw');
    else expect(texts(svg).some((t) => t.startsWith('−'))).toBe(true);
  });

  it('draws mixed positive and negative numbers', () => {
    const svg = renderChart({
      type,
      title: '',
      series: [{ name: '', points: [-3, 10, -0.5, 4].map((y, i) => ({ x: numeric ? i : `C${i}`, y })) }],
    });
    assertWellFormed(svg);
    expect(svg).not.toMatch(/NaN/);
  });

  it('draws all-equal values', () => {
    const svg = renderChart({ type, title: '', series: [{ name: '', points: [4, 4, 4].map((y, i) => ({ x: numeric ? i : `C${i}`, y })) }] });
    assertWellFormed(svg);
    expect(svg).not.toMatch(/NaN|Infinity/);
  });

  it('draws very large and very small numbers', () => {
    for (const ys of [
      [1.2e9, 3.4e9],
      [0.0012, 0.0031],
    ]) {
      const svg = renderChart({ type, title: '', series: [{ name: '', points: ys.map((y, i) => ({ x: numeric ? i : `C${i}`, y })) }] });
      assertWellFormed(svg);
      expect(svg).not.toMatch(/NaN|e[-+]\d/);
    }
  });

  it('keeps long labels inside a phone-width chart', () => {
    const long = 'An extremely long label that a student might type into the table';
    const width = 320;
    const svg = renderChart(
      {
        type,
        title: long,
        xLabel: long,
        yLabel: long,
        series: [long, 'Short'].map((name, s) => ({
          name,
          points: [long, 'B', 'C'].map((x, i) => ({ x: numeric ? i : x, y: i + s + 1 })),
        })),
      },
      { width, height: 300 },
    );
    assertWellFormed(svg);
    // Every horizontal line of text stays between the edges (by the width estimate).
    for (const t of textBlocks(svg).filter((b) => !b.attrs.transform)) {
      const x = Number(t.attrs.x);
      const size = Number(t.attrs['font-size']);
      for (const line of t.lines) {
        const w = textWidth(line, size);
        const [from, to] =
          t.attrs['text-anchor'] === 'end' ? [x - w, x] : t.attrs['text-anchor'] === 'middle' ? [x - w / 2, x + w / 2] : [x, x + w];
        // The line in the result names the text that sticks out.
        expect([line, from >= 0 && to <= width]).toEqual([line, true]);
      }
    }
  });
});

describe('many categories', () => {
  const months = Array.from({ length: 60 }, (_, i) => `Month ${i + 1}`);

  it('tilts and thins out crowded category labels', () => {
    const svg = renderChart({ type: 'line', title: '', series: [{ name: '', points: months.map((x, i) => ({ x, y: i })) }] });
    assertWellFormed(svg);
    const tilted = elements(svg, 'text').filter((t) => t.attrs.transform?.startsWith('rotate(-45'));
    expect(tilted.length).toBeGreaterThan(5);
    expect(tilted.length).toBeLessThan(60);
  });

  it('draws narrow bars without value labels', () => {
    const svg = renderChart({ type: 'bar', title: '', series: [{ name: '', points: months.map((x, i) => ({ x, y: i + 1 })) }] }, { width: 400 });
    assertWellFormed(svg);
    expect(elements(svg, 'path').length).toBe(60);
    // 59 is a value, not an axis tick.
    expect(texts(svg)).not.toContain('59');
  });
});

describe('text sizes', () => {
  it('uses the app type scale', () => {
    const sizes = new Set(elements(renderChart({ type: 'bar', title: 'T', xLabel: 'x', series: [{ name: '', points: [{ x: 'a', y: 1 }] }] }), 'text').map((t) => Number(t.attrs['font-size'])));
    for (const s of sizes) expect([ChartFont.title, ChartFont.label, ChartFont.tick]).toContain(s);
  });
});
