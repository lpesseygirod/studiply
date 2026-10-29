// The chart module's building blocks: colours, SVG text, numbers, scales, label spreading.
import { contrast } from '../../../theme/contrast';
import { mix } from '../color';
import { spreadLabels } from '../labels';
import { linear, niceTicks } from '../scale';
import { el, ellipsize, esc, formatNumber, hashId, MINUS, n, textWidth, toNumber, wrapText } from '../svg';
import { chartTheme, MARK_CONTRAST, MAX_SERIES } from '../theme';

describe('theme', () => {
  it.each(['light', 'dark'] as const)('%s: series colours stand out from the background (3:1)', (mode) => {
    const t = chartTheme(mode);
    expect(t.series).toHaveLength(MAX_SERIES);
    for (const c of t.series) expect(contrast(c, t.background)).toBeGreaterThanOrEqual(MARK_CONTRAST);
  });

  it.each(['light', 'dark'] as const)('%s: text and axis labels are readable (4.5:1)', (mode) => {
    const t = chartTheme(mode);
    expect(contrast(t.text, t.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.textMuted, t.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.axis, t.background)).toBeGreaterThanOrEqual(MARK_CONTRAST);
  });

  it('series colours are all different and differ between light and dark', () => {
    const light = chartTheme('light');
    const dark = chartTheme('dark');
    expect(new Set(light.series).size).toBe(MAX_SERIES);
    expect(new Set(dark.series).size).toBe(MAX_SERIES);
    expect(dark.background).not.toBe(light.background);
    expect(dark.series).not.toEqual(light.series);
  });

  it('pattern tints are lighter than their series in light mode and darker in dark mode', () => {
    for (const mode of ['light', 'dark'] as const) {
      const t = chartTheme(mode);
      t.tints.forEach((tint, i) => {
        expect(contrast(tint, t.background)).toBeLessThan(contrast(t.series[i], t.background));
      });
    }
  });
});

describe('mix', () => {
  it('blends two colours', () => {
    expect(mix('#000000', '#FFFFFF', 1)).toBe('#000000');
    expect(mix('#000000', '#FFFFFF', 0)).toBe('#FFFFFF');
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  });

  it('rejects anything but #RRGGBB', () => {
    expect(() => mix('red', '#FFFFFF', 0.5)).toThrow();
  });
});

describe('svg text', () => {
  it('escapes markup and drops characters XML forbids', () => {
    expect(esc(`<script>"a" & 'b'</script>\u0007`)).toBe('&lt;script&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/script&gt;');
  });

  it('writes elements with rounded numbers and no empty attributes', () => {
    expect(el('rect', { x: 1.23456, y: -0.001, fill: 'a"b', stroke: undefined, class: '' })).toBe(
      '<rect x="1.23" y="0" fill="a&quot;b"/>',
    );
    expect(el('text', { x: 0 }, 'hi')).toBe('<text x="0">hi</text>');
    expect(n(-0.004)).toBe('0');
  });

  it('measures longer text as wider', () => {
    expect(textWidth('MMMM', 12)).toBeGreaterThan(textWidth('iiii', 12));
    expect(textWidth('abc', 24)).toBeCloseTo(textWidth('abc', 12) * 2);
  });

  it('wraps text into lines that fit, cutting with … past maxLines', () => {
    const lines = wrapText('The quick brown fox jumps over the lazy dog again and again', 80, 12, 2);
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(textWidth(line, 12)).toBeLessThanOrEqual(80);
    expect(lines[1].endsWith('…')).toBe(true);
    expect(wrapText('short', 80, 12)).toEqual(['short']);
    expect(wrapText('', 80, 12)).toEqual([]);
  });

  it('breaks a word too long for one line', () => {
    const lines = wrapText('Antidisestablishmentarianism', 60, 12);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe('Antidisestablishmentarianism');
  });

  it('ellipsizes only when needed', () => {
    expect(ellipsize('short', 100, 12)).toBe('short');
    const cut = ellipsize('a very long label that will not fit', 60, 12);
    expect(cut.endsWith('…')).toBe(true);
    expect(textWidth(cut, 12)).toBeLessThanOrEqual(60);
  });

  it('hashes the same text to the same id', () => {
    expect(hashId('abc')).toBe(hashId('abc'));
    expect(hashId('abc')).not.toBe(hashId('abd'));
    expect(hashId('abc')).toMatch(/^[0-9a-z]+$/);
  });
});

describe('numbers', () => {
  it('formats values for labels', () => {
    expect(formatNumber(12)).toBe('12');
    expect(formatNumber(12.5)).toBe('12.5');
    expect(formatNumber(1 / 3)).toBe('0.33');
    expect(formatNumber(2007)).toBe('2007');
    expect(formatNumber(12500)).toBe('12,500');
    expect(formatNumber(1250000)).toBe('1.25M');
    expect(formatNumber(3e9)).toBe('3B');
    expect(formatNumber(-4)).toBe(`${MINUS}4`);
    expect(formatNumber(-0.001, 2)).toBe(`${MINUS}0.001`);
    expect(formatNumber(-0)).toBe('0');
    expect(formatNumber(0.0042)).toBe('0.0042');
  });

  it('reads numbers typed as text', () => {
    expect(toNumber(3)).toBe(3);
    expect(toNumber(' 4.5 ')).toBe(4.5);
    expect(toNumber(`${MINUS}2`)).toBe(-2);
    expect(toNumber('1e3')).toBe(1000);
    expect(toNumber('abc')).toBeNull();
    expect(toNumber('12 apples')).toBeNull();
    expect(toNumber(NaN)).toBeNull();
    expect(toNumber(Infinity)).toBeNull();
    expect(toNumber(null)).toBeNull();
  });
});

describe('niceTicks', () => {
  it('covers the range on round steps', () => {
    const t = niceTicks(0, 87);
    expect(t.ticks).toEqual([0, 20, 40, 60, 80, 100]);
    expect(t.decimals).toBe(0);
  });

  it('handles negative ranges and decimals', () => {
    expect(niceTicks(-3.2, 4.1).ticks).toEqual([-4, -2, 0, 2, 4, 6]);
    const small = niceTicks(0, 0.9);
    expect(small.ticks).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(small.decimals).toBe(1);
  });

  it('widens a flat range', () => {
    expect(niceTicks(0, 0).ticks).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    const one = niceTicks(5, 5);
    expect(one.min).toBeLessThan(5);
    expect(one.max).toBeGreaterThan(5);
    const neg = niceTicks(-5, -5);
    expect(neg.min).toBeLessThan(-5);
    expect(neg.max).toBeGreaterThan(-5);
  });

  it('survives a range that is not finite', () => {
    expect(niceTicks(NaN, Infinity).ticks.length).toBeGreaterThan(1);
  });

  it('never writes -0', () => {
    for (const t of niceTicks(-1, 1).ticks) expect(Object.is(t, -0)).toBe(false);
  });
});

describe('linear', () => {
  it('maps values to pixels, flipped for the y axis', () => {
    const y = linear(0, 100, 300, 100);
    expect(y(0)).toBe(300);
    expect(y(100)).toBe(100);
    expect(y(50)).toBe(200);
    expect(linear(5, 5, 0, 10)(5)).toBe(0);
  });
});

describe('spreadLabels', () => {
  it('leaves labels that do not overlap where they are', () => {
    expect(spreadLabels([{ y: 10, height: 10 }, { y: 50, height: 10 }], 0, 100)).toEqual([10, 50]);
  });

  it('pushes overlapping labels apart, keeping their order', () => {
    const [a, b, c] = spreadLabels(
      [
        { y: 50, height: 10 },
        { y: 51, height: 10 },
        { y: 49, height: 10 },
      ],
      0,
      100,
    );
    expect(c).toBeLessThan(a);
    expect(a).toBeLessThan(b);
    expect(a - c).toBeGreaterThanOrEqual(12);
    expect(b - a).toBeGreaterThanOrEqual(12);
  });

  it('keeps labels inside the range', () => {
    const ys = spreadLabels(
      [
        { y: 98, height: 10 },
        { y: 99, height: 10 },
      ],
      0,
      100,
    );
    expect(Math.max(...ys) + 5).toBeLessThanOrEqual(100);
    const top = spreadLabels([{ y: -20, height: 10 }], 0, 100);
    expect(top[0] - 5).toBeGreaterThanOrEqual(0);
  });
});
