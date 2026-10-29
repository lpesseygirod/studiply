/**
 * describe.ts
 * The chart in words, for screen readers (the SVG's <desc>) and for the alt
 * text of exported pictures: type and title, axes, every series' values (up
 * to 20 each), the highest and lowest, and anything left out. Labels are
 * written in full here even when the drawing shortens them.
 */

import type { PreparedChart, PreparedSeries } from './data';
import { formatNumber } from './svg';
import type { ChartType } from './types';

export const TYPE_NAMES: Record<ChartType, string> = {
  bar: 'Bar chart',
  line: 'Line chart',
  pie: 'Pie chart',
  scatter: 'Scatter plot',
};

/** Values read out per series before "and N more". */
export const LISTED_VALUES = 20;

const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

export function percent(share: number): string {
  const pct = share * 100;
  if (pct > 0 && pct < 1) return 'under 1%';
  return `${Math.round(pct)}%`;
}

function list(items: string[]): string {
  const shown = items.slice(0, LISTED_VALUES);
  const more = items.length - shown.length;
  return shown.join('; ') + (more > 0 ? `; and ${more} more` : '');
}

function describeSeries(p: PreparedChart, s: PreparedSeries): string {
  const intro = p.labelled ? `${s.name}. ` : '';
  if (s.points.length === 0) return `${intro}No values.`;
  const values =
    p.type === 'scatter'
      ? s.points.map((pt) => `(${pt.xText}, ${formatNumber(pt.y)})`)
      : s.points.map((pt) => `${pt.xText}: ${formatNumber(pt.y)}`);
  const parts = [`${intro}${sentence(list(values))}`];
  if (s.points.length > 1) {
    if (p.type === 'scatter') {
      const xs = s.points.map((pt) => pt.x as number);
      const ys = s.points.map((pt) => pt.y);
      parts.push(
        `x from ${formatNumber(Math.min(...xs))} to ${formatNumber(Math.max(...xs))}, ` +
          `y from ${formatNumber(Math.min(...ys))} to ${formatNumber(Math.max(...ys))}.`,
      );
    } else {
      const hi = s.points.reduce((a, b) => (b.y > a.y ? b : a));
      const lo = s.points.reduce((a, b) => (b.y < a.y ? b : a));
      parts.push(`Highest ${formatNumber(hi.y)} (${hi.xText}), lowest ${formatNumber(lo.y)} (${lo.xText}).`);
    }
  }
  return parts.join(' ');
}

export function describePrepared(p: PreparedChart): string {
  const parts = [sentence(p.title ? `${TYPE_NAMES[p.type]}: ${p.title}` : TYPE_NAMES[p.type])];
  if (p.type !== 'pie') {
    if (p.xLabel) parts.push(sentence(`X axis: ${p.xLabel}`));
    if (p.yLabel) parts.push(sentence(`Y axis: ${p.yLabel}`));
  }
  if (p.empty) {
    parts.push(sentence(p.emptyText));
  } else if (p.type === 'pie') {
    parts.push(`${p.slices.length === 1 ? '1 slice' : `${p.slices.length} slices`}, total ${formatNumber(p.total)}.`);
    parts.push(sentence(list(p.slices.map((s) => `${s.name}: ${formatNumber(s.value)} (${percent(s.share)})`))));
  } else {
    if (p.series.length > 1) parts.push(`${p.series.length} series.`);
    for (const s of p.series) parts.push(describeSeries(p, s));
  }
  for (const note of p.notes) parts.push(sentence(note));
  return parts.join(' ');
}
