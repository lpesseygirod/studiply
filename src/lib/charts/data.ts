/**
 * data.ts
 * Turns a chart spec into what gets drawn: cleaned names, the values that
 * are numbers, the categories in order, and a note for everything left out
 * (extra series, values that aren't numbers, non-positive pie slices,
 * small slices grouped into "Other"). The drawing and the description both
 * read this, so they always agree.
 */

import { MAX_SERIES } from './theme';
import { formatNumber, toNumber } from './svg';
import type { ChartSpec, ChartType } from './types';

/** Slices a pie draws; with more, the smallest are grouped into "Other". */
export const MAX_SLICES = 8;

export interface PreparedPoint {
  /** Category key: the label, plus its repeat count when a series uses it twice. */
  key: string;
  x: string | number;
  xText: string;
  y: number;
}

export interface PreparedSeries {
  name: string;
  /** False when the spec gave no name ("Series 1" is ours). */
  named: boolean;
  index: number;
  points: PreparedPoint[];
}

export interface Category {
  key: string;
  text: string;
}

export interface Slice {
  name: string;
  value: number;
  /** 0–1 of the total. */
  share: number;
  /** For "Other": how many slices it groups. */
  grouped?: number;
}

export interface PreparedChart {
  type: ChartType;
  title: string;
  xLabel: string;
  yLabel: string;
  series: PreparedSeries[];
  /** Categories across all series, in order of first appearance (bar, categorical line). */
  categories: Category[];
  /** The x axis is a number line (scatter, and lines whose x values are all numbers). */
  numericX: boolean;
  slices: Slice[];
  total: number;
  /** Shown under the chart and read out in the description. */
  notes: string[];
  empty: boolean;
  /** What the empty chart says. */
  emptyText: string;
  /** Series names are drawn (2+ series, or one the spec named). */
  labelled: boolean;
}

const clean = (s: unknown) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');

const plural = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

/** An x value as text; numbers without thousands separators below 10,000 (years). */
function xToText(x: unknown, position: number): string {
  if (typeof x === 'number') return formatNumber(x, 4);
  return clean(x) || `#${position + 1}`;
}

export function prepare(spec: ChartSpec): PreparedChart {
  const type = spec.type;
  if (!['bar', 'line', 'pie', 'scatter'].includes(type)) throw new Error(`Unknown chart type: ${String(type)}`);

  const all = Array.isArray(spec.series) ? spec.series : [];
  const limit = type === 'pie' ? 1 : MAX_SERIES;
  let notNumbers = 0;
  let xNotNumbers = 0;
  let allNumericX = true;

  const series: PreparedSeries[] = all.slice(0, limit).map((s, index) => {
    const name = clean(s?.name);
    const repeats = new Map<string, number>();
    const points: PreparedPoint[] = [];
    (Array.isArray(s?.points) ? s.points : []).forEach((p, i) => {
      const y = toNumber(p?.y);
      if (y === null) {
        notNumbers++;
        return;
      }
      let x: string | number = typeof p.x === 'number' ? p.x : clean(p.x);
      if (type === 'scatter') {
        const v = toNumber(p.x);
        if (v === null) {
          xNotNumbers++;
          return;
        }
        x = v;
      } else if (typeof p.x !== 'number' || !Number.isFinite(p.x)) {
        allNumericX = false;
      }
      const xText = xToText(x, i);
      const seen = repeats.get(xText) ?? 0;
      repeats.set(xText, seen + 1);
      points.push({ key: `${xText}\u0000${seen}`, x, xText, y });
    });
    return { name: name || `Series ${index + 1}`, named: name !== '', index, points };
  });

  const pointCount = series.reduce((sum, s) => sum + s.points.length, 0);
  const numericX = type === 'scatter' || (type === 'line' && allNumericX && pointCount > 0);
  if (numericX) for (const s of series) s.points.sort((a, b) => (a.x as number) - (b.x as number));

  const categories: Category[] = [];
  if (!numericX && type !== 'pie') {
    const seen = new Set<string>();
    for (const s of series)
      for (const p of s.points)
        if (!seen.has(p.key)) {
          seen.add(p.key);
          categories.push({ key: p.key, text: p.xText });
        }
  }

  const notes: string[] = [];
  const hidden = all.length - series.length;
  if (hidden > 0) notes.push(`+${plural(hidden, 'series', 'series')} not shown${type === 'pie' ? ' (a pie shows one series)' : ''}`);
  if (notNumbers > 0) notes.push(`Left out: ${plural(notNumbers, "value that isn't", "values that aren't")} a number`);
  if (xNotNumbers > 0) notes.push(`Left out: ${plural(xNotNumbers, 'point', 'points')} whose x isn't a number`);

  let slices: Slice[] = [];
  let total = 0;
  let nonPositive = 0;
  if (type === 'pie') {
    const points = series[0]?.points ?? [];
    const positive = points.filter((p) => p.y > 0);
    nonPositive = points.length - positive.length;
    let raw = positive.map((p) => ({ name: p.xText, value: p.y }) as Slice);
    if (raw.length > MAX_SLICES) {
      const keep = new Set(
        raw
          .map((s, i) => ({ s, i }))
          .sort((a, b) => b.s.value - a.s.value || a.i - b.i)
          .slice(0, MAX_SLICES - 1)
          .map(({ i }) => i),
      );
      const rest = raw.filter((_, i) => !keep.has(i));
      raw = raw.filter((_, i) => keep.has(i));
      raw.push({ name: 'Other', value: rest.reduce((sum, s) => sum + s.value, 0), share: 0, grouped: rest.length });
      notes.push(`"Other" groups the ${rest.length} smallest slices`);
    }
    total = raw.reduce((sum, s) => sum + s.value, 0);
    slices = raw.map((s) => ({ ...s, share: s.value / total }));
    if (nonPositive > 0) {
      notes.push(`Left out: ${plural(nonPositive, 'value that is', 'values that are')} zero or negative (a pie needs positive values)`);
    }
  }

  const empty = type === 'pie' ? slices.length === 0 : pointCount === 0;
  return {
    type,
    title: clean(spec.title),
    xLabel: clean(spec.xLabel),
    yLabel: clean(spec.yLabel),
    series,
    categories,
    numericX,
    slices,
    total,
    notes,
    empty,
    emptyText: empty && nonPositive > 0 ? 'No positive values to draw' : 'No data yet',
    labelled: series.length > 1 || series.some((s) => s.named),
  };
}
