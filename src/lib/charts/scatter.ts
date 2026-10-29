/**
 * scatter.ts
 * Scatter plot: numeric x and y axes padded so no point sits on the edge,
 * one marker shape per series (circle, square, triangle, diamond) ringed in
 * the background colour so overlapping points stay apart. Several series are
 * named in a key above the plot: labels beside the points would cross the
 * other series' clouds.
 */

import { cartesian } from './cartesian';
import type { PreparedChart } from './data';
import type { Frame } from './frame';
import { drawKey, SWATCH } from './key';
import { MARKERS, marker } from './styles';

const MARKER_SIZE = 10;

/** `values` plus a margin of 4 % of their range on each side. */
function padded(values: number[]): number[] {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.04;
  return [...values, lo - pad, hi + pad];
}

export function drawScatter(f: Frame, p: PreparedChart): string[] {
  const k = drawKey(f, p, (s, cx, cy) =>
    marker(MARKERS[s.index % MARKERS.length], cx, cy, SWATCH, { fill: f.theme.series[s.index] }),
  );
  const drawn = p.series.filter((s) => s.points.length > 0);
  const c = cartesian(f, p, {
    yValues: padded(drawn.flatMap((s) => s.points.map((pt) => pt.y))),
    includeZero: false,
    x: { kind: 'linear', values: padded(drawn.flatMap((s) => s.points.map((pt) => pt.x as number))) },
    rightWidth: 0,
    topExtra: k.height,
    insetTop: 0,
    insetBottom: 0,
  });

  const out = [...c.grid, ...c.axis, ...k.parts];
  for (const s of drawn) {
    for (const pt of s.points) {
      out.push(
        marker(MARKERS[s.index % MARKERS.length], c.x(pt.x as number), c.y(pt.y), MARKER_SIZE, {
          fill: f.theme.series[s.index],
          stroke: f.theme.background,
          'stroke-width': 1,
        }),
      );
    }
  }
  return out;
}
