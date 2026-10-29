/**
 * endLabels.ts
 * Series names in a column just right of the furthest line end (or
 * rightmost point), each at the height of its own, with the series' marker
 * so it matches in black and white. Labels are pushed apart when they would
 * overlap, and a thin leader joins a label to its point when they end up apart.
 */

import { lineHeight, type Frame } from './frame';
import { spreadLabels } from './labels';
import { MARKERS, marker } from './styles';
import { el, textLines, textWidth, wrapText } from './svg';
import { ChartFont } from './theme';

export interface EndLabel {
  name: string;
  seriesIndex: number;
  /** The point the label belongs to. */
  x: number;
  y: number;
}

const MARKER_SIZE = 9;
const GAP = 8;

function maxWidth(f: Frame): number {
  return Math.min(160, f.width * 0.25);
}

/** Room the labels need right of the plot. */
export function endLabelWidth(f: Frame, names: string[]): number {
  if (names.length === 0) return 0;
  const widths = names.flatMap((name) => wrapText(name, maxWidth(f), ChartFont.label, 2).map((l) => textWidth(l, ChartFont.label)));
  return GAP + MARKER_SIZE + 5 + Math.max(0, ...widths);
}

export function drawEndLabels(f: Frame, labels: EndLabel[], top: number, bottom: number): string[] {
  const lh = lineHeight(ChartFont.label);
  const lines = labels.map((l) => wrapText(l.name, maxWidth(f), ChartFont.label, 2));
  const ys = spreadLabels(
    labels.map((l, i) => ({ y: l.y, height: lines[i].length * lh })),
    top - ChartFont.tick / 2,
    bottom + ChartFont.tick / 2,
  );
  const x0 = Math.max(...labels.map((l) => l.x)) + GAP;
  return labels.flatMap((l, i) => {
    const color = f.theme.series[l.seriesIndex % f.theme.series.length];
    const y = ys[i];
    const out: string[] = [];
    if (Math.hypot(x0 - 2 - l.x, y - l.y) > 10) {
      out.push(el('line', { x1: l.x + 5, y1: l.y, x2: x0 - 2, y2: y, stroke: f.theme.textMuted, 'stroke-width': 0.75 }));
    }
    const markerX = x0 + MARKER_SIZE / 2 + 1;
    const firstLineY = y - ((lines[i].length - 1) * lh) / 2;
    out.push(marker(MARKERS[l.seriesIndex % MARKERS.length], markerX, firstLineY, MARKER_SIZE, { fill: color }));
    out.push(
      textLines(lines[i], x0 + MARKER_SIZE + 5, firstLineY + ChartFont.label * 0.35, lh, {
        'font-size': ChartFont.label,
        'font-weight': ChartFont.labelWeight,
        fill: f.theme.text,
      }),
    );
    return out;
  });
}
