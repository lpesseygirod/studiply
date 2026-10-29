/**
 * index.ts
 * Studiply's chart drawing (step 4.7d; reused by the summary's charts in
 * 8.2): a chart spec in, an SVG string out. Plain TypeScript, no DOM, so the
 * same drawing works in the app, the editor's WebView and the PDF.
 *
 * Follows SUMMARY-SPEC "Graphs and visuals": lines and pie slices are named
 * on the chart, not in a legend (bars and scatter points get a key above the
 * plot); lines differ by style and marker, bars and slices by pattern,
 * points by shape, so it prints in black and white; the SVG carries a text
 * description for screen readers.
 */

import { drawBar } from './bar';
import { prepare, type PreparedChart } from './data';
import { describePrepared, TYPE_NAMES } from './describe';
import { emptyState, finish, makeFrame, type Frame } from './frame';
import { drawLine } from './line';
import { drawPie } from './pie';
import { drawScatter } from './scatter';
import { hashId } from './svg';
import type { ChartSpec, ChartType, RenderOptions } from './types';

export type { ChartMode, ChartPoint, ChartSeries, ChartSpec, ChartType, RenderOptions } from './types';
export { MAX_SERIES } from './theme';
export { MAX_SLICES } from './data';

const DRAW: Record<ChartType, (f: Frame, p: PreparedChart) => string[]> = {
  bar: drawBar,
  line: drawLine,
  pie: drawPie,
  scatter: drawScatter,
};

function chartId(spec: ChartSpec, options: RenderOptions): string {
  const prefix = (options.idPrefix ?? '').replace(/[^A-Za-z0-9_-]/g, '');
  if (prefix) return /^[A-Za-z]/.test(prefix) ? prefix : `c${prefix}`;
  return `chart-${hashId(JSON.stringify([spec, options.theme ?? 'light', options.width, options.height]))}`;
}

/**
 * The chart as an SVG string. Throws only for an unknown chart type; bad
 * values are left out and noted on the chart.
 */
export function renderChart(spec: ChartSpec, options: RenderOptions = {}): string {
  const p = prepare(spec);
  const f = makeFrame(p, options, chartId(spec, options));
  const body = p.empty ? [emptyState(f, p.emptyText)] : DRAW[p.type](f, p);
  return finish(f, p.title || TYPE_NAMES[p.type], describePrepared(p), body);
}

/** The chart in words: the SVG's description, also for alt text in exports. */
export function describeChart(spec: ChartSpec): string {
  return describePrepared(prepare(spec));
}
