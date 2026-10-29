/**
 * key.ts
 * The row of series names above a bar chart or scatter plot, each after a
 * swatch drawn like its marks (fill pattern, marker shape), so it reads in
 * black and white. Rows wrap; one series needs no key (the title names it).
 */

import type { PreparedChart, PreparedSeries } from './data';
import { lineHeight, type Frame } from './frame';
import { el, ellipsize, esc, textWidth } from './svg';
import { ChartFont } from './theme';

export const SWATCH = 12;

/** Draws a series' swatch centred on (cx, cy). */
export type Swatch = (s: PreparedSeries, cx: number, cy: number) => string;

export function drawKey(f: Frame, p: PreparedChart, swatch: Swatch): { parts: string[]; height: number } {
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
    parts.push(
      swatch(s, x + SWATCH / 2, cy),
      el('text', { x: x + SWATCH + 6, y: cy + ChartFont.label * 0.35, 'font-size': ChartFont.label, fill: f.theme.text }, esc(name)),
    );
    x += w;
  }
  return { parts, height: (row + 1) * lh + 4 };
}
