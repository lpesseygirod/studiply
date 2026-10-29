/**
 * line.ts
 * Line chart: one line per series, told apart by line style (solid, dashed,
 * dotted, dash-dot) and marker shape as well as colour, each named at its
 * end. A gap in a categorical series breaks its line rather than joining
 * across the missing value.
 */

import { cartesian } from './cartesian';
import type { PreparedChart } from './data';
import { drawEndLabels, endLabelWidth, type EndLabel } from './endLabels';
import { PAD, type Frame } from './frame';
import { DASHES, MARKERS, marker } from './styles';
import { el, n } from './svg';

/** Above this many points a series shows only its last marker. */
const MARKERS_UP_TO = 24;
const MARKER_SIZE = 8;

export function drawLine(f: Frame, p: PreparedChart): string[] {
  const drawn = p.series.filter((s) => s.points.length > 0);
  const names = p.labelled ? drawn.map((s) => s.name) : [];
  const catIndex = new Map(p.categories.map((c, i) => [c.key, i]));
  const c = cartesian(f, p, {
    yValues: drawn.flatMap((s) => s.points.map((pt) => pt.y)),
    includeZero: false,
    x: p.numericX
      ? { kind: 'linear', values: drawn.flatMap((s) => s.points.map((pt) => pt.x as number)) }
      : { kind: 'category', labels: p.categories.map((cat) => cat.text), points: true },
    rightWidth: names.length > 0 ? endLabelWidth(f, names) - PAD / 2 : 0,
    topExtra: 0,
    insetTop: 0,
    insetBottom: 0,
  });

  // The zero line goes under the lines here.
  const out = [...c.grid, ...c.axis];
  const labels: EndLabel[] = [];
  for (const s of drawn) {
    const color = f.theme.series[s.index];
    const pts = s.points
      .map((pt) => ({ pt, pos: p.numericX ? (pt.x as number) : (catIndex.get(pt.key) ?? 0) }))
      .sort((a, b) => a.pos - b.pos);
    const joined = pts.map(({ pos }, i) => i > 0 && (p.numericX || pos - pts[i - 1].pos === 1));
    let d = '';
    pts.forEach(({ pt, pos }, i) => {
      d += `${joined[i] ? 'L' : 'M'}${n(c.x(pos))} ${n(c.y(pt.y))}`;
    });
    out.push(
      el('path', {
        d,
        fill: 'none',
        stroke: color,
        'stroke-width': 2,
        'stroke-dasharray': DASHES[s.index % DASHES.length],
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      }),
    );
    // A point joined to neither neighbour is only visible as its marker.
    const withMarkers =
      pts.length <= MARKERS_UP_TO ? pts : pts.filter((_, i) => i === pts.length - 1 || (!joined[i] && !joined[i + 1]));
    for (const { pt, pos } of withMarkers) {
      out.push(
        marker(MARKERS[s.index % MARKERS.length], c.x(pos), c.y(pt.y), MARKER_SIZE, {
          fill: color,
          stroke: f.theme.background,
          'stroke-width': 2,
        }),
      );
    }
    const last = pts[pts.length - 1];
    labels.push({ name: s.name, seriesIndex: s.index, x: c.x(last.pos), y: c.y(last.pt.y) });
  }
  if (names.length > 0) out.push(...drawEndLabels(f, labels, c.plot.top, c.plot.bottom));
  return out;
}
