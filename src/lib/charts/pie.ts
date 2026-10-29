/**
 * pie.ts
 * Pie chart: slices clockwise from 12 o'clock in the student's order, each
 * with its own colour and pattern (eight distinct, so it prints in black and
 * white) and a 2 px gap between them. Every slice is named outside the pie
 * with its share and value, joined to it by a thin leader; labels on each
 * side are pushed apart so they don't overlap.
 */

import type { PreparedChart } from './data';
import { fillFor, lineHeight, type Frame } from './frame';
import { spreadLabels } from './labels';
import { el, esc, formatNumber, n, textLines, textWidth, wrapText } from './svg';
import { ChartFont } from './theme';

/** A share as a label: "34%", "<1%". */
export function shareText(share: number): string {
  const pct = share * 100;
  return pct > 0 && pct < 1 ? '<1%' : `${Math.round(pct)}%`;
}

/** The outline of a slice from angle a0 to a1 (radians, 0 = 3 o'clock, clockwise). */
export function slicePath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  return `M${n(cx)} ${n(cy)}L${n(x0)} ${n(y0)}A${n(r)} ${n(r)} 0 ${large} 1 ${n(x1)} ${n(y1)}Z`;
}

const LEADER = 10;
const LABEL_GAP = 6;

export function drawPie(f: Frame, p: PreparedChart): string[] {
  const { left, right, top, bottom } = f.area;
  const lh = lineHeight(ChartFont.label);
  const tickLh = lineHeight(ChartFont.tick);
  const maxLabel = Math.min(140, (right - left) * 0.24);

  const labels = p.slices.map((s) => {
    const lines = wrapText(s.name, maxLabel, ChartFont.label, 2);
    const detail = `${shareText(s.share)} (${formatNumber(s.value)})`;
    const width = Math.max(textWidth(detail, ChartFont.tick), ...lines.map((l) => textWidth(l, ChartFont.label)));
    return { lines, detail, width, height: lines.length * lh + tickLh };
  });
  const labelRoom = Math.min(maxLabel, Math.max(...labels.map((l) => l.width))) + LEADER + LABEL_GAP + 4;
  const r = Math.max(24, Math.min((right - left) / 2 - labelRoom, (bottom - top) / 2 - 8));
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;

  const out: string[] = [];
  const mids: number[] = [];
  let a0 = -Math.PI / 2;
  p.slices.forEach((s, i) => {
    const a1 = a0 + s.share * 2 * Math.PI;
    const fill = fillFor(f, i, i);
    const shape =
      p.slices.length === 1
        ? el('circle', { cx, cy, r, fill: fill.fill })
        : el('path', { d: slicePath(cx, cy, r, a0, a1), fill: fill.fill, stroke: f.theme.background, 'stroke-width': 2, 'stroke-linejoin': 'round' });
    out.push(shape);
    // A lone slice is named on the right.
    mids.push(p.slices.length === 1 ? 0 : (a0 + a1) / 2);
    a0 = a1;
  });

  // Labels on each side, spread apart, then drawn with their leaders.
  for (const side of [1, -1]) {
    const onSide = mids.map((m, i) => ({ m, i })).filter(({ m }) => (Math.cos(m) >= 0 ? 1 : -1) === side);
    const ys = spreadLabels(
      onSide.map(({ m, i }) => ({ y: cy + (r + LEADER) * Math.sin(m), height: labels[i].height })),
      top,
      bottom,
    );
    onSide.forEach(({ m, i }, k) => {
      const y = ys[k];
      const label = labels[i];
      const elbowX = cx + side * (r + LEADER);
      const textX = elbowX + side * LABEL_GAP;
      out.push(
        el('polyline', {
          points: `${n(cx + (r - 2) * Math.cos(m))},${n(cy + (r - 2) * Math.sin(m))} ${n(elbowX)},${n(y)} ${n(textX - side * 2)},${n(y)}`,
          fill: 'none',
          stroke: f.theme.textMuted,
          'stroke-width': 0.75,
        }),
      );
      const firstBaseline = y - label.height / 2 + ChartFont.label;
      const anchor = side === 1 ? 'start' : 'end';
      out.push(
        textLines(label.lines, textX, firstBaseline, lh, {
          'text-anchor': anchor,
          'font-size': ChartFont.label,
          'font-weight': ChartFont.labelWeight,
          fill: f.theme.text,
        }),
        el(
          'text',
          {
            x: textX,
            y: firstBaseline + (label.lines.length - 1) * lh + tickLh,
            'text-anchor': anchor,
            'font-size': ChartFont.tick,
            fill: f.theme.textMuted,
          },
          esc(label.detail),
        ),
      );
    });
  }
  return out;
}
