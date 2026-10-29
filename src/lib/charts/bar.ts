/**
 * bar.ts
 * Bar chart: bars grouped by category, starting at zero (negative values go
 * down from the zero line), the data end rounded. Series are told apart by
 * fill pattern (solid, diagonal, dots, back-diagonal) as well as colour,
 * named in a key above the plot when there are several (one series is named
 * by the title); values are written
 * on the bars when they fit.
 */

import { cartesian } from './cartesian';
import type { PreparedChart } from './data';
import { fillFor, lineHeight, type Frame } from './frame';
import { el, ellipsize, esc, formatNumber, groupFromFor, n, textWidth } from './svg';
import { ChartFont } from './theme';

const RADIUS = 4;
const BAR_GAP = 2;
const SWATCH = 12;

/** A bar from the baseline to `yEnd`, rounded at the data end only. */
export function barPath(x: number, w: number, yBase: number, yEnd: number): string | null {
  const h = Math.abs(yEnd - yBase);
  if (h < 0.5 || w <= 0) return null;
  const r = Math.min(RADIUS, w / 2, h);
  const dir = yEnd < yBase ? 1 : -1; // 1: bar goes up
  return (
    `M${n(x)} ${n(yBase)}V${n(yEnd + dir * r)}` +
    `Q${n(x)} ${n(yEnd)} ${n(x + r)} ${n(yEnd)}H${n(x + w - r)}` +
    `Q${n(x + w)} ${n(yEnd)} ${n(x + w)} ${n(yEnd + dir * r)}V${n(yBase)}Z`
  );
}

/** Swatch + name per series, in rows that wrap; drawn above the plot. */
function key(f: Frame, p: PreparedChart): { parts: string[]; height: number } {
  if (p.series.length < 2) return { parts: [], height: 0 };
  const lh = lineHeight(ChartFont.label) + 4;
  const parts: string[] = [];
  let x = f.area.left;
  let row = 0;
  for (const s of p.series) {
    const name = ellipsize(s.name, 180, ChartFont.label);
    const w = SWATCH + 6 + textWidth(name, ChartFont.label) + 16;
    if (x > f.area.left && x + w > f.area.right) {
      x = f.area.left;
      row++;
    }
    const cy = f.area.top + row * lh + lh / 2 - 2;
    const fill = fillFor(f, s.index);
    parts.push(
      el('rect', {
        x,
        y: cy - SWATCH / 2,
        width: SWATCH,
        height: SWATCH,
        rx: 2,
        fill: fill.fill,
        stroke: fill.patterned ? fill.color : undefined,
        'stroke-width': fill.patterned ? 1 : undefined,
      }),
      el(
        'text',
        { x: x + SWATCH + 6, y: cy + ChartFont.label * 0.35, 'font-size': ChartFont.label, fill: f.theme.text },
        esc(name),
      ),
    );
    x += w;
  }
  return { parts, height: (row + 1) * lh + 4 };
}

export function drawBar(f: Frame, p: PreparedChart): string[] {
  const values = p.series.flatMap((s) => s.points.map((pt) => pt.y));
  const hasNegative = values.some((v) => v < 0);
  const k = key(f, p);
  const valueRoom = ChartFont.tick + 6;
  const c = cartesian(f, p, {
    yValues: values,
    includeZero: true,
    x: { kind: 'category', labels: p.categories.map((cat) => cat.text) },
    rightWidth: 0,
    topExtra: k.height,
    insetTop: valueRoom,
    insetBottom: hasNegative ? valueRoom : 0,
  });

  const count = p.series.length;
  const group = c.band * (count > 1 ? 0.8 : 0.6);
  const barWidth = Math.max(1, (group - (count - 1) * BAR_GAP) / count);
  const catIndex = new Map(p.categories.map((cat, i) => [cat.key, i]));
  const zero = c.y(0);

  // Values are written only if every one fits over its bar.
  const groupFrom = groupFromFor(values);
  const valueText = (v: number) => formatNumber(v, 2, groupFrom);
  const showValues = values.every((v) => textWidth(valueText(v), ChartFont.tick) <= barWidth + BAR_GAP + 2);

  const bars: string[] = [];
  const texts: string[] = [];
  for (const s of p.series) {
    const fill = fillFor(f, s.index);
    for (const pt of s.points) {
      const i = catIndex.get(pt.key) ?? 0;
      const x = c.x(i) - group / 2 + s.index * (barWidth + BAR_GAP);
      const yEnd = c.y(pt.y);
      const d = barPath(x, barWidth, zero, yEnd);
      if (d) {
        bars.push(
          el('path', {
            d,
            fill: fill.fill,
            stroke: fill.patterned ? fill.color : undefined,
            'stroke-width': fill.patterned ? 1.25 : undefined,
          }),
        );
      }
      if (showValues) {
        const below = pt.y < 0;
        texts.push(
          el(
            'text',
            {
              x: x + barWidth / 2,
              y: below ? yEnd + ChartFont.tick + 3 : yEnd - 4,
              'text-anchor': 'middle',
              'font-size': ChartFont.tick,
              fill: f.theme.textMuted,
            },
            esc(valueText(pt.y)),
          ),
        );
      }
    }
  }
  return [...c.grid, ...k.parts, ...bars, ...c.axis, ...texts];
}
