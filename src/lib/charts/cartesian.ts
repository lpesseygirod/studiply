/**
 * cartesian.ts
 * The plot area and axes of bar, line and scatter charts: y ticks on round
 * numbers with a light grid, a stronger line at zero, x categories (wrapped,
 * or tilted when crowded) or a numeric x axis, and the axis labels.
 */

import type { PreparedChart } from './data';
import { lineHeight, type Box, type Frame } from './frame';
import { linear, niceTicks } from './scale';
import { el, ellipsize, esc, formatNumber, groupFromFor, n, textLines, textWidth, wrapText } from './svg';
import { ChartFont } from './theme';

/**
 * Categories sit in the middle of equal bands (bars), or as points from one
 * edge of the plot to the other (lines).
 */
export type XAxis = { kind: 'category'; labels: string[]; points?: boolean } | { kind: 'linear'; values: number[] };

export interface CartesianOptions {
  yValues: number[];
  /** Bars always start at zero. */
  includeZero: boolean;
  x: XAxis;
  /** Room kept right of the plot (line-end labels). */
  rightWidth: number;
  /** Room kept above the plot (the bar chart's key). */
  topExtra: number;
  /** Space inside the plot above the top tick / below the bottom tick (bar value labels). */
  insetTop: number;
  insetBottom: number;
}

export interface Cartesian {
  plot: Box;
  y: (v: number) => number;
  /** Category index → centre, or value → position. */
  x: (v: number) => number;
  /** Width of one category (0 on a numeric axis). */
  band: number;
  /** Drawn behind the marks. */
  grid: string[];
  /** Drawn over the marks (the zero line). */
  axis: string[];
}

/** Longest a tilted category label gets. */
const TILTED_MAX = 110;
const SIN45 = Math.SQRT1_2;

export function cartesian(f: Frame, p: PreparedChart, o: CartesianOptions): Cartesian {
  const { theme, area } = f;
  const tickLh = lineHeight(ChartFont.tick);
  const labelLh = lineHeight(ChartFont.label);

  const yv = o.includeZero ? [...o.yValues, 0] : o.yValues;
  const yt = niceTicks(Math.min(...yv), Math.max(...yv));
  const yTexts = yt.ticks.map((t) => formatNumber(t, yt.decimals, groupFromFor(yt.ticks)));
  const tickWidth = Math.max(...yTexts.map((t) => textWidth(t, ChartFont.tick)));

  const left = area.left + (p.yLabel ? labelLh + 4 : 0) + tickWidth + 8;
  const right = Math.max(left + 40, area.right - o.rightWidth);
  const plotWidth = right - left;

  // The x axis decides how much height its labels need.
  let xHeight: number;
  let drawX: (top: number, bottom: number) => string[];
  let x: (v: number) => number;
  let band = 0;

  if (o.x.kind === 'category') {
    const labels = o.x.labels;
    const count = Math.max(1, labels.length);
    band = plotWidth / count;
    const inset = Math.min(band / 2, 24);
    const step = count > 1 ? (plotWidth - 2 * inset) / (count - 1) : 0;
    const centre = o.x.points
      ? (i: number) => (count > 1 ? left + inset + step * i : left + plotWidth / 2)
      : (i: number) => left + band * (i + 0.5);
    x = centre;
    const tilted = band < 30 || labels.some((l) => wrapText(l, band - 6, ChartFont.tick).length > 2);
    // When labels can't all fit, write every k-th one.
    const every = tilted ? Math.max(1, Math.ceil(tickLh / (band * SIN45))) : 1;
    if (!tilted) {
      const lines = labels.map((l) => wrapText(l, band - 6, ChartFont.tick, 2));
      xHeight = Math.max(1, ...lines.map((ls) => ls.length)) * tickLh + 8;
      drawX = (_top, bottom) =>
        lines.map((ls, i) =>
          textLines(ls, centre(i), bottom + 6 + ChartFont.tick, tickLh, {
            'text-anchor': 'middle',
            'font-size': ChartFont.tick,
            fill: theme.textMuted,
          }),
        );
    } else {
      // Tilted labels end under their category and run down-left; the first
      // ones are shortened so they don't leave the chart.
      const texts = labels.map((l, i) => ellipsize(l, Math.min(TILTED_MAX, (centre(i) - 4) / SIN45), ChartFont.tick));
      const longest = Math.max(0, ...texts.map((t) => textWidth(t, ChartFont.tick)));
      xHeight = longest * SIN45 + ChartFont.tick + 12;
      drawX = (_top, bottom) =>
        texts.flatMap((t, i) => {
          if (i % every !== 0) return [];
          const cx = centre(i) + ChartFont.tick * 0.35;
          const cy = bottom + 10;
          return [
            el(
              'text',
              {
                x: cx,
                y: cy,
                'text-anchor': 'end',
                transform: `rotate(-45 ${n(cx)} ${n(cy)})`,
                'font-size': ChartFont.tick,
                fill: theme.textMuted,
              },
              esc(t),
            ),
          ];
        });
    }
  } else {
    const values = o.x.values;
    const xt = niceTicks(Math.min(...values), Math.max(...values));
    const xs = linear(xt.min, xt.max, left, right);
    x = xs;
    const texts = xt.ticks.map((t) => formatNumber(t, xt.decimals, groupFromFor(xt.ticks)));
    const spacing = plotWidth / Math.max(1, xt.ticks.length - 1);
    const widest = Math.max(...texts.map((t) => textWidth(t, ChartFont.tick)));
    const every = Math.max(1, Math.ceil((widest + 8) / spacing));
    xHeight = tickLh + 8;
    drawX = (top, bottom) =>
      xt.ticks.flatMap((t, i) => [
        el('line', { x1: xs(t), x2: xs(t), y1: top, y2: bottom, stroke: theme.grid, 'stroke-width': 1 }),
        ...(i % every === 0
          ? [
              el(
                'text',
                { x: xs(t), y: bottom + 6 + ChartFont.tick, 'text-anchor': 'middle', 'font-size': ChartFont.tick, fill: theme.textMuted },
                esc(texts[i]),
              ),
            ]
          : []),
      ]);
  }

  const xLabelHeight = p.xLabel ? labelLh + 4 : 0;
  const top = area.top + o.topExtra + ChartFont.tick / 2;
  const bottom = Math.max(top + 40, area.bottom - xHeight - xLabelHeight);
  const y = linear(yt.min, yt.max, bottom - o.insetBottom, top + o.insetTop);
  const plot = { left, right, top, bottom };

  const grid: string[] = [];
  yt.ticks.forEach((t, i) => {
    grid.push(el('line', { x1: left, x2: right, y1: y(t), y2: y(t), stroke: theme.grid, 'stroke-width': 1 }));
    grid.push(
      el(
        'text',
        { x: left - 8, y: y(t) + ChartFont.tick * 0.35, 'text-anchor': 'end', 'font-size': ChartFont.tick, fill: theme.textMuted },
        esc(yTexts[i]),
      ),
    );
  });
  grid.push(...drawX(top, bottom));

  if (p.yLabel) {
    const cx = area.left + ChartFont.label;
    const cy = (top + bottom) / 2;
    grid.push(
      el(
        'text',
        {
          x: cx,
          y: cy,
          'text-anchor': 'middle',
          transform: `rotate(-90 ${n(cx)} ${n(cy)})`,
          'font-size': ChartFont.label,
          'font-weight': ChartFont.labelWeight,
          fill: theme.text,
        },
        esc(ellipsize(p.yLabel, bottom - top, ChartFont.label)),
      ),
    );
  }
  if (p.xLabel) {
    grid.push(
      el(
        'text',
        {
          x: (left + right) / 2,
          y: area.bottom - 4,
          'text-anchor': 'middle',
          'font-size': ChartFont.label,
          'font-weight': ChartFont.labelWeight,
          fill: theme.text,
        },
        esc(ellipsize(p.xLabel, right - left, ChartFont.label)),
      ),
    );
  }

  // The zero line when zero is on the axis, otherwise the bottom edge.
  const zeroY = yt.min <= 0 && yt.max >= 0 ? y(0) : y(yt.min);
  const axis = [el('line', { x1: left, x2: right, y1: zeroY, y2: zeroY, stroke: theme.axis, 'stroke-width': 1 })];

  return { plot, y, x, band, grid, axis };
}
